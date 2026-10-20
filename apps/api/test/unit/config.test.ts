import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config.js';

const base = { DATABASE_URL: 'postgres://x', JWT_SECRET: 'a'.repeat(32) };

describe('loadConfig', () => {
  it('treats blank optional variables (as Docker Compose passes them) as not set', () => {
    expect(loadConfig({ ...base, GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '' }).google).toBeNull();
  });

  it('enables Google only when both id and secret are present', () => {
    expect(loadConfig({ ...base, GOOGLE_CLIENT_ID: 'id' }).google).toBeNull();
    expect(loadConfig({ ...base, GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 's' }).google).toEqual({ clientId: 'id', clientSecret: 's' });
  });

  it('fails fast with a readable message', () => {
    expect(() => loadConfig({ DATABASE_URL: 'x', JWT_SECRET: 'short' })).toThrow(/JWT_SECRET must be at least 32 characters/);
  });
});
