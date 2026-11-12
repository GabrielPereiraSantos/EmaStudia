-- Notificação de fim do pomodoro (uma por aparelho: só há um cronômetro por vez).
CREATE TABLE IF NOT EXISTS pomodoro_alerts (
  device_id   TEXT PRIMARY KEY,
  fire_at     INTEGER NOT NULL,   -- fim do estudo (epoch ms)
  study_id    INTEGER,
  coins       INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS pomodoro_alerts_fire ON pomodoro_alerts (fire_at);
