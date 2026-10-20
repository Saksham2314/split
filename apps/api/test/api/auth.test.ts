import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { app, db, registerUser } from './helpers.js';

afterAll(() => db.end());

describe('health', () => {
  it('reports the API and database as healthy', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', database: 'ok' });
  });
});

describe('auth', () => {
  it('registers, sets an HttpOnly session cookie and never returns the password hash', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Asha', email: `Asha.${Date.now()}@Example.com`, password: 'longenough123' });
    expect(res.status).toBe(201);
    expect(res.body.user.email).toMatch(/^asha\.\d+@example\.com$/); // normalised to lower case
    expect(JSON.stringify(res.body)).not.toMatch(/password/i);
    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toMatch(/ss_session=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
  });

  it('rejects a duplicate email regardless of case', async () => {
    const email = `dup.${Date.now()}@example.com`;
    await request(app).post('/api/auth/register').send({ name: 'A', email, password: 'longenough123' });
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'B', email: email.toUpperCase(), password: 'longenough123' });
    expect(res.status).toBe(409);
  });

  it('validates registration input', async () => {
    const res = await request(app).post('/api/auth/register').send({ name: '', email: 'nope', password: 'short' });
    expect(res.status).toBe(400);
    expect(res.body.error.details.map((d: { path: string }) => d.path).sort()).toEqual(['email', 'name', 'password']);
  });

  it('logs in with the right password and rejects the wrong one with the same message as an unknown email', async () => {
    const email = `login.${Date.now()}@example.com`;
    await request(app).post('/api/auth/register').send({ name: 'L', email, password: 'longenough123' });

    const ok = await request(app).post('/api/auth/login').send({ email, password: 'longenough123' });
    expect(ok.status).toBe(200);

    const wrong = await request(app).post('/api/auth/login').send({ email, password: 'wrong-password' });
    const unknown = await request(app).post('/api/auth/login').send({ email: `x${email}`, password: 'whatever1' });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body).toEqual(unknown.body);
  });

  it('protects routes and supports /me and logout', async () => {
    expect((await request(app).get('/api/auth/me')).status).toBe(401);
    expect((await request(app).get('/api/groups')).status).toBe(401);

    const user = await registerUser('Me');
    const me = await user.agent.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.user.id).toBe(user.id);

    expect((await user.agent.post('/api/auth/logout')).status).toBe(204);
    expect((await user.agent.get('/api/auth/me')).status).toBe(401);
  });

  it('rejects a tampered session token', async () => {
    const res = await request(app).get('/api/auth/me').set('Cookie', 'ss_session=eyJhbGciOiJub25lIn0.e30.');
    expect(res.status).toBe(401);
  });
});
