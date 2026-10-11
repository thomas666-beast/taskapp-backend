CREATE TYPE task_status AS ENUM (
  'OPEN',
  'WORKER_CONFIRMED',
  'COMPLETED',
  'CANCELLED'
);

CREATE TABLE tasks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  worker_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title         VARCHAR(120) NOT NULL,
  status        task_status NOT NULL DEFAULT 'OPEN',
  rating        SMALLINT CHECK (rating IS NULL OR rating BETWEEN 1 AND 5),
  worker_confirmed_at TIMESTAMPTZ,
  user_confirmed_at   TIMESTAMPTZ,
  auto_confirm_at     TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at     TIMESTAMPTZ,
  CHECK (user_id <> worker_id)
);

CREATE INDEX idx_tasks_user     ON tasks(user_id, created_at DESC);
CREATE INDEX idx_tasks_worker   ON tasks(worker_id, created_at DESC);
CREATE INDEX idx_tasks_status   ON tasks(status);
CREATE INDEX idx_tasks_auto_confirm ON tasks(auto_confirm_at)
  WHERE auto_confirm_at IS NOT NULL AND user_confirmed_at IS NULL;
