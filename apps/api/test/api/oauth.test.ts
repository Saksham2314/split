import { createHash, randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.js';
import { loadConfig } from '../../src/config.js';
import { app as appWithoutGoogle, db, registerUser } from './helpers.js';

const CLIENT_ID = 'test-client.apps.googleusercontent.com';
const config = loadConfig({
  NODE_ENV: 'test',
  DATABASE_URL: 'unused',
  JWT_SECRET: 'test-secret-that-is-at-least-32-characters-long',
  AUTH_RATE_LIMIT: '1000',
  LOG_LEVEL: 'silent',
  APP_URL: 'http://app.test',
  GOOGLE_CLIENT_ID: CLIENT_ID,
  GOOGLE_CLIENT_SECRET: 'test-client-secret',
});
const app = createApp(config, db);

afterAll(() => db.end());
afterEach(() => vi.restoreAllMocks());

/** Starts the flow and returns the agent (holding the flow cookie) plus the params sent to Google. */
async function startFlow() {
  const agent = request.agent(app);
  const res = await agent.get('/api/auth/google');
  expect(res.status).toBe(302);
  return { agent, google: new URL(res.headers.location!) };
}

/** Makes Google's token endpoint return an ID token with these claims. */
function stubGoogle(claims: Record<string, unknown>) {
  const idToken = jwt.sign(
    { iss: 'https://accounts.google.com', aud: CLIENT_ID, email_verified: true, ...claims },
    'google-signs-this-not-us',
    { expiresIn: 300 },
  );
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ id_token: idToken }));
}

describe('Google sign-in', () => {
  it('reports which providers are configured', async () => {
    expect((await request(app).get('/api/auth/providers')).body).toEqual({ google: true });
    expect((await request(appWithoutGoogle).get('/api/auth/providers')).body).toEqual({ google: false });
    expect((await request(appWithoutGoogle).get('/api/auth/google')).status).toBe(404);
  });

  it('redirects to Google with state and a PKCE S256 challenge', async () => {
    const { google } = await startFlow();
    expect(google.origin + google.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    const p = google.searchParams;
    expect(p.get('client_id')).toBe(CLIENT_ID);
    expect(p.get('redirect_uri')).toBe('http://app.test/api/auth/google/callback');
    expect(p.get('scope')).toBe('openid email profile');
    expect(p.get('code_challenge_method')).toBe('S256');
    expect(p.get('state')).toMatch(/^[\w-]{43}$/);
  });

  it('creates an account, sends the PKCE verifier and logs the user in', async () => {
    const { agent, google } = await startFlow();
    const email = `g-${randomUUID()}@gmail.com`;
    const fetchMock = stubGoogle({ sub: randomUUID(), email, name: 'Gita' });

    const cb = await agent.get('/api/auth/google/callback').query({ code: 'abc', state: google.searchParams.get('state') });
    expect(cb.status).toBe(302);
    expect(cb.headers.location).toBe('http://app.test/');
    expect(String(cb.headers['set-cookie'])).toMatch(/ss_session=.*HttpOnly/i);

    const sent = new URLSearchParams(String(fetchMock.mock.calls[0]![1]!.body));
    const verifier = sent.get('code_verifier')!;
    expect(createHash('sha256').update(verifier).digest('base64url')).toBe(google.searchParams.get('code_challenge'));
    expect(sent.get('code')).toBe('abc');

    const me = await agent.get('/api/auth/me');
    expect(me.body.user).toMatchObject({ name: 'Gita', email });
  });

  it('logs the same Google account into the same user next time', async () => {
    const sub = randomUUID();
    const email = `again-${randomUUID()}@gmail.com`;
    const ids: number[] = [];
    for (let i = 0; i < 2; i++) {
      const { agent, google } = await startFlow();
      stubGoogle({ sub, email });
      await agent.get('/api/auth/google/callback').query({ code: 'c', state: google.searchParams.get('state') });
      ids.push((await agent.get('/api/auth/me')).body.user.id);
      vi.restoreAllMocks();
    }
    expect(ids[0]).toBe(ids[1]);
  });

  it('rejects a callback whose state does not match the browser that started the flow', async () => {
    const { agent } = await startFlow();
    const fetchMock = stubGoogle({ sub: 'x', email: 'x@gmail.com' });
    const cb = await agent.get('/api/auth/google/callback').query({ code: 'abc', state: 'forged' });
    expect(cb.headers.location).toBe('http://app.test/login?oauth_error=invalid_state');
    expect(fetchMock).not.toHaveBeenCalled();

    // No flow cookie at all (e.g. an attacker-crafted link)
    const bare = await request(app).get('/api/auth/google/callback').query({ code: 'abc', state: 'forged' });
    expect(bare.headers.location).toBe('http://app.test/login?oauth_error=invalid_state');
  });

  it('rejects ID tokens for another client or with an unverified email', async () => {
    for (const [claims, reason] of [
      [{ aud: 'someone-else' }, 'google_failed'],
      [{ email_verified: false }, 'email_unverified'],
    ] as const) {
      const { agent, google } = await startFlow();
      stubGoogle({ sub: randomUUID(), email: `${randomUUID()}@gmail.com`, ...claims });
      const cb = await agent.get('/api/auth/google/callback').query({ code: 'c', state: google.searchParams.get('state') });
      expect(cb.headers.location).toBe(`http://app.test/login?oauth_error=${reason}`);
      expect(String(cb.headers['set-cookie'])).not.toMatch(/ss_session=[^;]/);
      vi.restoreAllMocks();
    }
  });

  it('does not take over an existing password account with the same email', async () => {
    const victim = await registerUser('Pre');
    const { agent, google } = await startFlow();
    stubGoogle({ sub: randomUUID(), email: victim.email });
    const cb = await agent.get('/api/auth/google/callback').query({ code: 'c', state: google.searchParams.get('state') });
    expect(cb.headers.location).toBe('http://app.test/login?oauth_error=email_exists');
    expect((await agent.get('/api/auth/me')).status).toBe(401);
  });

  it('handles the user cancelling on Google', async () => {
    const { agent } = await startFlow();
    const cb = await agent.get('/api/auth/google/callback').query({ error: 'access_denied' });
    expect(cb.headers.location).toBe('http://app.test/login?oauth_error=cancelled');
  });
});
