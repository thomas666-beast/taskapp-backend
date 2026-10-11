CREATE TABLE worker_profiles (
  user_id     UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  description TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_worker_profiles_updated ON worker_profiles(updated_at DESC);
