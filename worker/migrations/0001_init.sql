-- Só o necessário para as notificações (seção 9). Nada de dados pessoais além disso.
CREATE TABLE IF NOT EXISTS devices (
  device_id   TEXT PRIMARY KEY,
  endpoint    TEXT,
  p256dh      TEXT,
  auth        TEXT,
  timezone    TEXT NOT NULL DEFAULT 'Europe/Rome',
  updated_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS reminders (
  device_id  TEXT NOT NULL,
  study_id   INTEGER NOT NULL,
  subject    TEXT NOT NULL,
  date       TEXT NOT NULL,      -- yyyy-MM-dd no fuso dela
  time       TEXT NOT NULL,      -- HH:MM
  kind       TEXT NOT NULL,      -- 'studio' | 'ripasso'
  sent_at    INTEGER,
  PRIMARY KEY (device_id, study_id, date)
);
CREATE INDEX IF NOT EXISTS reminders_pending ON reminders (sent_at, date);

CREATE TABLE IF NOT EXISTS notes (
  device_id  TEXT NOT NULL,
  study_id   INTEGER NOT NULL,
  texts      TEXT NOT NULL,      -- JSON: string[]
  PRIMARY KEY (device_id, study_id)
);
