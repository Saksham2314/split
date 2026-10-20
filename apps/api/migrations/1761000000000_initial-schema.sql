-- Up Migration

-- Users. Email uniqueness is case-insensitive via an index on lower(email).
CREATE TABLE users (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email         TEXT NOT NULL CHECK (char_length(email) BETWEEN 3 AND 254),
  name          TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_lower_key ON users (lower(email));

CREATE TABLE groups (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name       TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
  created_by BIGINT NOT NULL REFERENCES users (id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Membership is the basis of all authorization: you can only touch groups you're in.
CREATE TABLE group_members (
  group_id  BIGINT NOT NULL REFERENCES groups (id) ON DELETE CASCADE,
  user_id   BIGINT NOT NULL REFERENCES users (id),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, user_id)
);
CREATE INDEX group_members_user_id_idx ON group_members (user_id);

-- Amounts are integer paise. The composite foreign keys to group_members make the
-- database itself reject a payer or share-holder who isn't a member of that group.
CREATE TABLE expenses (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  group_id     BIGINT NOT NULL REFERENCES groups (id) ON DELETE CASCADE,
  description  TEXT NOT NULL CHECK (char_length(description) BETWEEN 1 AND 200),
  amount_paise BIGINT NOT NULL CHECK (amount_paise > 0),
  paid_by      BIGINT NOT NULL,
  spent_on     DATE NOT NULL DEFAULT CURRENT_DATE,
  created_by   BIGINT NOT NULL REFERENCES users (id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (group_id, paid_by) REFERENCES group_members (group_id, user_id)
);
CREATE INDEX expenses_group_id_idx ON expenses (group_id, spent_on DESC, id DESC);

CREATE TABLE expense_shares (
  expense_id  BIGINT NOT NULL REFERENCES expenses (id) ON DELETE CASCADE,
  group_id    BIGINT NOT NULL,
  user_id     BIGINT NOT NULL,
  share_paise BIGINT NOT NULL CHECK (share_paise >= 0),
  PRIMARY KEY (expense_id, user_id),
  FOREIGN KEY (group_id, user_id) REFERENCES group_members (group_id, user_id)
);

-- A settlement is a real-world payment: from_user paid to_user.
CREATE TABLE settlements (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  group_id     BIGINT NOT NULL REFERENCES groups (id) ON DELETE CASCADE,
  from_user    BIGINT NOT NULL,
  to_user      BIGINT NOT NULL,
  amount_paise BIGINT NOT NULL CHECK (amount_paise > 0),
  created_by   BIGINT NOT NULL REFERENCES users (id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (from_user <> to_user),
  FOREIGN KEY (group_id, from_user) REFERENCES group_members (group_id, user_id),
  FOREIGN KEY (group_id, to_user) REFERENCES group_members (group_id, user_id)
);
CREATE INDEX settlements_group_id_idx ON settlements (group_id, created_at DESC);

-- Down Migration

DROP TABLE settlements;
DROP TABLE expense_shares;
DROP TABLE expenses;
DROP TABLE group_members;
DROP TABLE groups;
DROP TABLE users;
