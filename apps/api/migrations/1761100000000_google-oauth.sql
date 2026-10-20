-- Up Migration

-- Users who sign in with Google have no password. `google_sub` is Google's stable account id
-- (the ID token's `sub`); emails can change, so the account is matched on this, never on email alone.
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE users ADD COLUMN google_sub TEXT UNIQUE;
-- Every account must have at least one way to sign in.
ALTER TABLE users ADD CONSTRAINT users_has_login_method CHECK (password_hash IS NOT NULL OR google_sub IS NOT NULL);

-- Down Migration

ALTER TABLE users DROP CONSTRAINT users_has_login_method;
ALTER TABLE users DROP COLUMN google_sub;
-- Fails (on purpose) while Google-only accounts exist, rather than silently deleting them.
ALTER TABLE users ALTER COLUMN password_hash SET NOT NULL;
