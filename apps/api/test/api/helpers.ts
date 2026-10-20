import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { loadConfig } from '../../src/config.js';
import { createPool } from '../../src/db.js';
import { TEST_DATABASE_URL } from './globalSetup.js';

export const config = loadConfig({
  NODE_ENV: 'test',
  DATABASE_URL: TEST_DATABASE_URL,
  JWT_SECRET: 'test-secret-that-is-at-least-32-characters-long',
  AUTH_RATE_LIMIT: '1000',
  LOG_LEVEL: 'silent',
});
export const db = createPool(config.databaseUrl);
export const app = createApp(config, db);

export interface TestUser {
  id: number;
  name: string;
  email: string;
  /** A Supertest agent that keeps this user's session cookie between requests. */
  agent: ReturnType<typeof request.agent>;
}

/** Registers a fresh user with a unique email and returns a logged-in agent. */
export async function registerUser(name: string): Promise<TestUser> {
  const agent = request.agent(app);
  const email = `${name.toLowerCase()}-${randomUUID()}@example.com`;
  const res = await agent.post('/api/auth/register').send({ name, email, password: 'correct horse battery' });
  if (res.status !== 201) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { ...res.body.user, agent };
}
