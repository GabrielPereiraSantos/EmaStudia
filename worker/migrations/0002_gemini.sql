-- Contador diário de uso do Gemini (seção 8.2). Um dia = data local da Ema.
CREATE TABLE IF NOT EXISTS gemini_usage (
  day    TEXT PRIMARY KEY,
  count  INTEGER NOT NULL DEFAULT 0
);
