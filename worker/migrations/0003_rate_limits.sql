-- Limite simples por minuto (seção 10): uma linha por (balde, minuto).
CREATE TABLE IF NOT EXISTS rate_limits (
  bucket  TEXT NOT NULL,
  window  INTEGER NOT NULL,   -- minuto (epoch / 60000)
  count   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket, window)
);
