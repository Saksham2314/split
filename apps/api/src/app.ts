import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import type { Config } from './config.js';
import type { Db } from './db.js';
import { notFound } from './lib/errors.js';
import { requireAuth } from './middleware/auth.js';
import { errorHandler } from './middleware/errorHandler.js';
import { authRouter } from './modules/auth.js';
import { groupsRouter } from './modules/groups.js';
import { googleAuthRouter } from './modules/oauth.js';

/**
 * Builds the Express app without starting a server. Dependencies (config, DB pool)
 * are passed in, so tests can create an app against a test database and drive it
 * with Supertest without opening a real network port.
 */
export function createApp(config: Config, db: Db): express.Express {
  const app = express();

  // Behind Caddy, the client's real IP is in X-Forwarded-For. Trusting exactly
  // `trustProxy` hops prevents clients from spoofing their IP (which the rate limiter uses).
  app.set('trust proxy', config.trustProxy);
  app.disable('x-powered-by');

  app.use(
    pinoHttp({
      level: config.logLevel,
      // Never write session tokens to the logs.
      redact: ['req.headers.cookie', 'res.headers["set-cookie"]'],
      autoLogging: { ignore: (req) => req.url?.startsWith('/api/health') ?? false },
    }),
  );
  app.use(helmet());
  app.use(express.json({ limit: '20kb' }));
  app.use(cookieParser());

  // Liveness: the process is up. Readiness: it can also reach the database.
  // Docker / the deploy script use these to decide whether a new release is healthy.
  app.get('/api/health/live', (_req, res) => {
    res.json({ status: 'ok' });
  });
  app.get('/api/health', async (req, res) => {
    try {
      await db.query('SELECT 1');
      res.json({ status: 'ok', database: 'ok' });
    } catch (err) {
      req.log.error({ err }, 'health check: database unreachable');
      res.status(503).json({ status: 'error', database: 'unreachable' });
    }
  });

  app.use('/api/auth/google', googleAuthRouter(db, config));
  app.use('/api/auth', authRouter(db, config));
  app.use('/api/groups', requireAuth(config), groupsRouter(db));

  app.use('/api', () => {
    throw notFound('Route not found');
  });
  app.use(errorHandler);

  return app;
}
