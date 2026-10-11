CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username      VARCHAR(24) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role          VARCHAR(10) NOT NULL DEFAULT 'USER'
                CHECK (role IN ('USER', 'WORKER', 'ADMIN')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_users_role ON users(role);
