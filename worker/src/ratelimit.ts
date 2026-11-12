/** Limite por minuto, guardado no D1. Devolve a contagem do minuto depois de contar esta requisição. */
export async function hit(db: D1Database, bucket: string, nowMs: number): Promise<number> {
  const window = Math.floor(nowMs / 60_000);
  const row = await db
    .prepare(
      `INSERT INTO rate_limits (bucket, window, count) VALUES (?, ?, 1)
       ON CONFLICT(bucket, window) DO UPDATE SET count = count + 1
       RETURNING count`,
    )
    .bind(bucket, window)
    .first<{ count: number }>();
  return row?.count ?? 1;
}

export async function cleanupRateLimits(db: D1Database, nowMs: number) {
  await db
    .prepare('DELETE FROM rate_limits WHERE window < ?')
    .bind(Math.floor(nowMs / 60_000) - 10)
    .run();
}

/** Limites por minuto (por origem de rede). */
export const LIMITS_PER_MINUTE = {
  schedule: 20,
  subscription: 10,
  test: 5,
  /** Agendar/cancelar a notificação de fim do pomodoro (iniciar, pausar, retomar…). */
  pomodoro: 30,
  /** Tentativas com código de acesso errado (contra adivinhação). */
  badCode: 10,
} as const;
