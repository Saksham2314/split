import type { CookieOptions, Request, RequestHandler, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { Config } from '../config.js';
import { unauthorized } from '../lib/errors.js';

declare module 'express-serve-static-core' {
  interface Request {
    /** Set by requireAuth once the session cookie has been verified. */
    userId?: number;
  }
}

export const SESSION_COOKIE = 'ss_session';

// The JWT is stored in an HttpOnly cookie: the browser sends it automatically,
// but page JavaScript can't read it, so an XSS bug can't steal the session.
function cookieOptions(config: Config): CookieOptions {
  return {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: 'lax',
    path: '/api',
  };
}

export function setSessionCookie(res: Response, config: Config, userId: number): void {
  const token = jwt.sign({}, config.jwtSecret, {
    algorithm: 'HS256',
    subject: String(userId),
    expiresIn: config.jwtExpiresInSeconds,
  });
  res.cookie(SESSION_COOKIE, token, { ...cookieOptions(config), maxAge: config.jwtExpiresInSeconds * 1000 });
}

export function clearSessionCookie(res: Response, config: Config): void {
  res.clearCookie(SESSION_COOKIE, cookieOptions(config));
}

export function requireAuth(config: Config): RequestHandler {
  return (req, _res, next) => {
    const token: unknown = req.cookies?.[SESSION_COOKIE];
    if (typeof token !== 'string') throw unauthorized();
    try {
      // Pinning the algorithm stops "alg: none" and algorithm-confusion attacks.
      const payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
      const userId = Number(typeof payload === 'object' ? payload.sub : NaN);
      if (!Number.isSafeInteger(userId) || userId <= 0) throw new Error('bad subject');
      req.userId = userId;
    } catch {
      throw unauthorized('Session expired or invalid');
    }
    next();
  };
}

/** The authenticated user's id. Only call this behind requireAuth. */
export function currentUserId(req: Request): number {
  if (req.userId === undefined) throw unauthorized();
  return req.userId;
}
