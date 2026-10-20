import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import type { Config } from '../config.js';
import type { Db } from '../db.js';
import { conflict, unauthorized } from '../lib/errors.js';
import { parse } from '../lib/validate.js';
import { clearSessionCookie, currentUserId, requireAuth, setSessionCookie } from '../middleware/auth.js';

// Cost factor 12 ≈ a few hundred ms per hash: negligible for one login,
// very expensive for an attacker trying billions of guesses offline.
const BCRYPT_COST = 12;

const email = z.string().trim().toLowerCase().pipe(z.email().max(254));
// bcrypt only uses the first 72 bytes of a password, so longer input is rejected.
const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .refine((p) => Buffer.byteLength(p, 'utf8') <= 72, 'Password must be at most 72 bytes');

const RegisterBody = z.object({ name: z.string().trim().min(1).max(100), email, password });
const LoginBody = z.object({ email, password: z.string().min(1).max(200) });

interface UserRow {
  id: number;
  name: string;
  email: string;
}

/** Per-IP brute-force protection shared by every sign-in route. */
export function authLimiter(config: Config) {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: config.authRateLimit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: { message: 'Too many attempts, try again later' } },
  });
}

export function authRouter(db: Db, config: Config): Router {
  const router = Router();
  const limiter = authLimiter(config);

  // A precomputed hash used when the email doesn't exist, so a failed login takes the
  // same time either way and response timing can't reveal which emails are registered.
  const dummyHash = bcrypt.hashSync('timing-equaliser-not-a-real-password', BCRYPT_COST);

  router.post('/register', limiter, async (req, res) => {
    const body = parse(RegisterBody, req.body);
    const passwordHash = await bcrypt.hash(body.password, BCRYPT_COST);
    try {
      const { rows } = await db.query<UserRow>(
        `INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3)
         RETURNING id, name, email`,
        [body.name, body.email, passwordHash],
      );
      const user = rows[0]!;
      setSessionCookie(res, config, user.id);
      res.status(201).json({ user });
    } catch (err) {
      if ((err as { code?: string }).code === '23505') throw conflict('Email is already registered');
      throw err;
    }
  });

  router.post('/login', limiter, async (req, res) => {
    const body = parse(LoginBody, req.body);
    const { rows } = await db.query<UserRow & { password_hash: string | null }>(
      'SELECT id, name, email, password_hash FROM users WHERE lower(email) = $1',
      [body.email],
    );
    const found = rows[0];
    const ok = await bcrypt.compare(body.password, found?.password_hash ?? dummyHash);
    if (!found || !ok) throw unauthorized('Invalid email or password');

    setSessionCookie(res, config, found.id);
    res.json({ user: { id: found.id, name: found.name, email: found.email } });
  });

  // Lets the login page show only the sign-in options this server has configured.
  router.get('/providers', (_req, res) => {
    res.json({ google: config.google !== null });
  });

  router.post('/logout', (_req, res) => {
    clearSessionCookie(res, config);
    res.status(204).end();
  });

  router.get('/me', requireAuth(config), async (req, res) => {
    const { rows } = await db.query<UserRow>('SELECT id, name, email FROM users WHERE id = $1', [
      currentUserId(req),
    ]);
    if (!rows[0]) throw unauthorized('Session user no longer exists');
    res.json({ user: rows[0] });
  });

  return router;
}
