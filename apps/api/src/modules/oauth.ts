import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { Router, type CookieOptions, type Request, type Response } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import type { Config } from '../config.js';
import type { Db } from '../db.js';
import { notFound } from '../lib/errors.js';
import { setSessionCookie } from '../middleware/auth.js';
import { authLimiter } from './auth.js';

// "Sign in with Google" using the OAuth 2.0 authorization code flow with PKCE.
// The code is exchanged server-side, so the browser never handles Google tokens and the
// result is the same HttpOnly session cookie as a password login.

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_ISSUERS = new Set(['https://accounts.google.com', 'accounts.google.com']);

const FLOW_COOKIE = 'ss_oauth';
const FLOW_TTL_SECONDS = 10 * 60;

const IdTokenClaims = z.object({
  iss: z.string(),
  aud: z.string(),
  sub: z.string().min(1).max(255),
  exp: z.number(),
  email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
  email_verified: z.boolean(),
  name: z.string().optional(),
});

/** Reasons shown to the user on the login page (?oauth_error=...). */
type OAuthError = 'cancelled' | 'invalid_state' | 'google_failed' | 'email_unverified' | 'email_exists';

class OAuthFailure extends Error {
  constructor(public readonly reason: OAuthError) {
    super(reason);
  }
}

const base64url = (buf: Buffer) => buf.toString('base64url');

function sameString(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function googleAuthRouter(db: Db, config: Config): Router {
  const router = Router();
  const limiter = authLimiter(config);
  const redirectUri = `${config.appUrl}/api/auth/google/callback`;

  // The state + PKCE verifier live in a short-lived signed cookie scoped to this router,
  // tying the callback to the browser that started the flow (CSRF / login-injection protection).
  const flowCookie: CookieOptions = {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: 'lax', // sent on Google's top-level redirect back to us
    path: '/api/auth/google',
  };

  router.use((_req, _res, next) => {
    if (!config.google) throw notFound('Google sign-in is not configured');
    next();
  });

  router.get('/', limiter, (_req, res) => {
    const google = config.google!;
    const state = base64url(randomBytes(32));
    const verifier = base64url(randomBytes(32));
    const challenge = base64url(createHash('sha256').update(verifier).digest());

    const flow = jwt.sign({ state, verifier }, config.jwtSecret, { algorithm: 'HS256', expiresIn: FLOW_TTL_SECONDS });
    res.cookie(FLOW_COOKIE, flow, { ...flowCookie, maxAge: FLOW_TTL_SECONDS * 1000 });

    const url = new URL(GOOGLE_AUTH_URL);
    url.search = new URLSearchParams({
      client_id: google.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      prompt: 'select_account',
    }).toString();
    res.redirect(302, url.toString());
  });

  router.get('/callback', limiter, async (req, res) => {
    res.clearCookie(FLOW_COOKIE, flowCookie);
    try {
      const userId = await completeSignIn(req);
      setSessionCookie(res, config, userId);
      res.redirect(302, `${config.appUrl}/`);
    } catch (err) {
      const reason = err instanceof OAuthFailure ? err.reason : 'google_failed';
      req.log.warn({ err, reason }, 'Google sign-in failed');
      redirectWithError(res, reason);
    }
  });

  function redirectWithError(res: Response, reason: OAuthError) {
    res.redirect(302, `${config.appUrl}/login?oauth_error=${reason}`);
  }

  async function completeSignIn(req: Request): Promise<number> {
    const google = config.google!;
    if (typeof req.query.error === 'string') throw new OAuthFailure('cancelled');
    const { code, state } = req.query;
    const flowToken: unknown = req.cookies?.[FLOW_COOKIE];
    if (typeof code !== 'string' || typeof state !== 'string' || typeof flowToken !== 'string') {
      throw new OAuthFailure('invalid_state');
    }

    let flow: { state: string; verifier: string };
    try {
      flow = jwt.verify(flowToken, config.jwtSecret, { algorithms: ['HS256'] }) as typeof flow;
    } catch {
      throw new OAuthFailure('invalid_state');
    }
    if (typeof flow.state !== 'string' || !sameString(flow.state, state)) throw new OAuthFailure('invalid_state');

    const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: google.clientId,
        client_secret: google.clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
        code_verifier: flow.verifier,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!tokenRes.ok) throw new OAuthFailure('google_failed');
    const { id_token: idToken } = (await tokenRes.json()) as { id_token?: unknown };
    if (typeof idToken !== 'string') throw new OAuthFailure('google_failed');

    // The ID token came straight from Google's token endpoint over TLS, so per OpenID Connect
    // Core §3.1.3.7 the TLS connection authenticates the issuer and the signature check may be
    // skipped. The claims below are still validated.
    const claims = IdTokenClaims.safeParse(jwt.decode(idToken));
    if (!claims.success) throw new OAuthFailure('google_failed');
    const c = claims.data;
    if (!GOOGLE_ISSUERS.has(c.iss) || c.aud !== google.clientId || c.exp * 1000 < Date.now()) {
      throw new OAuthFailure('google_failed');
    }
    if (!c.email_verified) throw new OAuthFailure('email_unverified');

    return findOrCreateUser(c.sub, c.email, c.name);
  }

  async function findOrCreateUser(googleSub: string, email: string, name: string | undefined): Promise<number> {
    const existing = await db.query<{ id: number }>('SELECT id FROM users WHERE google_sub = $1', [googleSub]);
    if (existing.rows[0]) return existing.rows[0].id;

    // An existing password account with this email is NOT linked automatically. SplitSmart doesn't
    // verify emails at sign-up, so anyone could have pre-registered this address with a password
    // they know; linking would let them into the Google user's account ("account pre-hijacking").
    const displayName = (name?.trim() || email.split('@')[0]!).slice(0, 100);
    try {
      const { rows } = await db.query<{ id: number }>(
        `INSERT INTO users (name, email, google_sub) VALUES ($1, $2, $3) RETURNING id`,
        [displayName, email, googleSub],
      );
      return rows[0]!.id;
    } catch (err) {
      if ((err as { code?: string }).code === '23505') throw new OAuthFailure('email_exists');
      throw err;
    }
  }

  return router;
}
