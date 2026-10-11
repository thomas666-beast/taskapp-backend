CREATE TYPE message_type AS ENUM ('TEXT', 'IMAGE', 'AUDIO', 'FILE');

CREATE TABLE messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  sender_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        message_type NOT NULL DEFAULT 'TEXT',
  text        TEXT,
  file_url    TEXT,
  file_name   TEXT,
  file_size   BIGINT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  CHECK (
    (type = 'TEXT'  AND text IS NOT NULL AND file_url IS NULL) OR
    (type <> 'TEXT' AND file_url IS NOT NULL AND text IS NULL)
  )
);

CREATE INDEX idx_messages_task ON messages(task_id, created_at ASC);
