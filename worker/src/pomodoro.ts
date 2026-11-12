import type { Env } from './env';
import { sendPush, type DeviceSub } from './push';
import type { Message } from './reminders';
import { isDeviceId } from './validate';

/**
 * Margem do servidor: só envia depois de MARGIN_MS do fim, para não disputar com o app
 * (com o app na tela, ele toca o som e cancela a notificação logo no fim).
 */
export const MARGIN_MS = 10_000;
/** Se o envio falhar, tenta de novo até este tempo depois do fim; depois descarta. */
export const GIVE_UP_MS = 10 * 60_000;
/** A notificação não deve chegar muito depois (TTL do push). */
export const ALERT_TTL_S = 15 * 60;
/** Um pomodoro (estudo) dura no máximo 3 h. */
const MAX_AHEAD_MS = 3 * 60 * 60_000;

export interface PomodoroAlert {
  deviceId: string;
  endsAt: number;
  studyId?: number;
  coins: number;
}

export function parsePomodoroAlert(body: unknown, now: number): PomodoroAlert | null {
  if (typeof body !== 'object' || body === null) return null;
  const b = body as Record<string, unknown>;
  if (!isDeviceId(b.deviceId)) return null;
  if (typeof b.endsAt !== 'number' || !Number.isFinite(b.endsAt)) return null;
  // no passado (com uma folga pequena) ou longe demais: recusa
  if (b.endsAt < now - 60_000 || b.endsAt > now + MAX_AHEAD_MS) return null;
  if (b.studyId !== undefined && (!Number.isInteger(b.studyId) || (b.studyId as number) < 0))
    return null;
  const coins = b.coins ?? 0;
  if (!Number.isInteger(coins) || (coins as number) < 0 || (coins as number) > 999) return null;
  return {
    deviceId: b.deviceId,
    endsAt: Math.round(b.endsAt),
    studyId: b.studyId as number | undefined,
    coins: coins as number,
  };
}

export function pomodoroMessage(coins: number, studyId?: number): Message {
  return {
    title: 'Ema studia',
    // sempre uma notificação visível (o iOS não aceita push "silenciosa")
    body:
      coins > 0
        ? `Pomodoro finito! +${coins} monetine 🌻 Fai una pausa, Ema.`
        : 'Pomodoro finito! 🌻 Fai una pausa, Ema.',
    url: studyId != null ? `/#/studio/${studyId}` : '/#/',
    tag: 'pomodoro',
  };
}

export async function saveAlert(db: D1Database, a: PomodoroAlert, now: number) {
  await db
    .prepare(
      `INSERT INTO pomodoro_alerts (device_id, fire_at, study_id, coins, created_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(device_id) DO UPDATE SET fire_at = excluded.fire_at, study_id = excluded.study_id,
       coins = excluded.coins, created_at = excluded.created_at`,
    )
    .bind(a.deviceId, a.endsAt, a.studyId ?? null, a.coins, now)
    .run();
}

export async function deleteAlert(db: D1Database, deviceId: string) {
  await db.prepare('DELETE FROM pomodoro_alerts WHERE device_id = ?').bind(deviceId).run();
}

interface DueRow extends DeviceSub {
  device_id: string;
  fire_at: number;
  study_id: number | null;
  coins: number;
}

/** Cron (a cada minuto): envia as notificações de fim de pomodoro vencidas (fim + margem). */
export async function runPomodoroAlerts(env: Env, now: number, fetcher: typeof fetch = fetch) {
  const report = { due: 0, sent: 0, dropped: 0, errors: 0 };
  const rows = (
    await env.DB.prepare(
      `SELECT a.device_id, a.fire_at, a.study_id, a.coins, d.endpoint, d.p256dh, d.auth
       FROM pomodoro_alerts a LEFT JOIN devices d ON d.device_id = a.device_id
       WHERE a.fire_at <= ?`,
    )
      .bind(now - MARGIN_MS)
      .all<DueRow>()
  ).results;
  for (const r of rows) {
    report.due++;
    if (!r.endpoint || now - r.fire_at > GIVE_UP_MS) {
      await deleteAlert(env.DB, r.device_id); // sem assinatura ou velho demais
      report.dropped++;
      continue;
    }
    const res = await sendPush(
      env,
      r,
      pomodoroMessage(r.coins, r.study_id ?? undefined),
      ALERT_TTL_S,
      fetcher,
    );
    if (res === 'error') {
      report.errors++; // tenta no próximo minuto (até GIVE_UP_MS)
      continue;
    }
    // só apaga se ainda for o mesmo alarme (o app pode ter reagendado nesse meio-tempo)
    await env.DB.prepare('DELETE FROM pomodoro_alerts WHERE device_id = ? AND fire_at = ?')
      .bind(r.device_id, r.fire_at)
      .run();
    if (res === 'gone') {
      await env.DB.prepare(
        'UPDATE devices SET endpoint = NULL, p256dh = NULL, auth = NULL WHERE device_id = ?',
      )
        .bind(r.device_id)
        .run();
      report.dropped++;
    } else report.sent++;
  }
  return report;
}
