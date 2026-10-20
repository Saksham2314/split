import { z } from 'zod';

// Docker Compose passes unset optional variables as "", which should mean "not configured".
const optionalString = z.preprocess((v) => (v === '' ? undefined : v), z.string().min(1).optional());

// All configuration comes from environment variables (12-factor app).
// Parsing them once at startup means a missing or malformed value crashes
// the process immediately with a clear message instead of failing later.
const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN_SECONDS: z.coerce.number().int().positive().default(12 * 60 * 60),
  // Cookies get the Secure flag in production (HTTPS only). Overridable for local prod-like runs.
  COOKIE_SECURE: z.enum(['true', 'false']).optional(),
  // Number of reverse proxies in front of the app (Caddy = 1). Needed for correct client IPs.
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  // Max login/register attempts per client IP per 15 minutes (brute-force protection).
  AUTH_RATE_LIMIT: z.coerce.number().int().positive().default(20),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  // Public origin the browser uses (Vite in dev, Caddy in production). OAuth redirects are built from it.
  APP_URL: z.url().default('http://localhost:5173'),
  // "Sign in with Google" is enabled only when both are set (Google Cloud Console → OAuth client).
  GOOGLE_CLIENT_ID: optionalString,
  GOOGLE_CLIENT_SECRET: optionalString,
});

export type Config = ReturnType<typeof loadConfig>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${problems}`);
  }
  const e = parsed.data;
  return {
    env: e.NODE_ENV,
    port: e.PORT,
    databaseUrl: e.DATABASE_URL,
    jwtSecret: e.JWT_SECRET,
    jwtExpiresInSeconds: e.JWT_EXPIRES_IN_SECONDS,
    cookieSecure: e.COOKIE_SECURE ? e.COOKIE_SECURE === 'true' : e.NODE_ENV === 'production',
    trustProxy: e.TRUST_PROXY,
    authRateLimit: e.AUTH_RATE_LIMIT,
    logLevel: e.LOG_LEVEL,
    appUrl: e.APP_URL.replace(/\/+$/, ''),
    google:
      e.GOOGLE_CLIENT_ID && e.GOOGLE_CLIENT_SECRET
        ? { clientId: e.GOOGLE_CLIENT_ID, clientSecret: e.GOOGLE_CLIENT_SECRET }
        : null,
  };
}
