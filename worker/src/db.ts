import type { ReminderRow } from './reminders';
import type { SchedulePayload, SubscriptionPayload } from './validate';

/** D1 aceita no máximo 100 parâmetros por consulta: inserções em blocos. */
const MAX_PARAMS = 100;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function saveSubscription(db: D1Database, p: SubscriptionPayload, now: number) {
  await db
    .prepare(
      `INSERT INTO devices (device_id, endpoint, p256dh, auth, updated_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(device_id) DO UPDATE SET endpoint = excluded.endpoint, p256dh = excluded.p256dh,
       auth = excluded.auth, updated_at = excluded.updated_at`,
    )
    .bind(
      p.deviceId,
      p.subscription.endpoint,
      p.subscription.keys.p256dh,
      p.subscription.keys.auth,
      now,
    )
    .run();
}

/**
 * Substitui a agenda do aparelho. Lembretes já enviados ficam marcados (não reenviar
 * no mesmo dia mesmo se a agenda chegar de novo).
 */
export async function saveSchedule(db: D1Database, p: SchedulePayload, now: number) {
  const stmts: D1PreparedStatement[] = [
    db
      .prepare(
        `INSERT INTO devices (device_id, timezone, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(device_id) DO UPDATE SET timezone = excluded.timezone, updated_at = excluded.updated_at`,
      )
      .bind(p.deviceId, p.timezone, now),
    db.prepare('DELETE FROM reminders WHERE device_id = ? AND sent_at IS NULL').bind(p.deviceId),
    db.prepare('DELETE FROM notes WHERE device_id = ?').bind(p.deviceId),
  ];

  const rows = p.reminders.flatMap((r) =>
    r.dates.map((date) => [
      p.deviceId,
      r.studyId,
      r.subject,
      date,
      r.time,
      r.reviewDates?.includes(date) ? 'ripasso' : 'studio',
    ]),
  );
  for (const part of chunk(rows, Math.floor(MAX_PARAMS / 6))) {
    stmts.push(
      db
        .prepare(
          `INSERT INTO reminders (device_id, study_id, subject, date, time, kind) VALUES ${part.map(() => '(?, ?, ?, ?, ?, ?)').join(', ')}
           ON CONFLICT(device_id, study_id, date) DO UPDATE SET subject = excluded.subject, time = excluded.time, kind = excluded.kind`,
        )
        .bind(...part.flat()),
    );
  }
  const noteRows = Object.entries(p.notes).map(([studyId, texts]) => [
    p.deviceId,
    Number(studyId),
    JSON.stringify(texts),
  ]);
  for (const part of chunk(noteRows, Math.floor(MAX_PARAMS / 3))) {
    stmts.push(
      db
        .prepare(
          `INSERT INTO notes (device_id, study_id, texts) VALUES ${part.map(() => '(?, ?, ?)').join(', ')}`,
        )
        .bind(...part.flat()),
    );
  }
  await db.batch(stmts);
}

export async function deleteDevice(db: D1Database, deviceId: string) {
  await db.batch([
    db.prepare('DELETE FROM reminders WHERE device_id = ?').bind(deviceId),
    db.prepare('DELETE FROM notes WHERE device_id = ?').bind(deviceId),
    db.prepare('DELETE FROM pomodoro_alerts WHERE device_id = ?').bind(deviceId),
    db.prepare('DELETE FROM devices WHERE device_id = ?').bind(deviceId),
  ]);
}

export interface DeviceRow {
  device_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  timezone: string;
}

export async function getDevice(db: D1Database, deviceId: string) {
  return db
    .prepare(
      'SELECT device_id, endpoint, p256dh, auth, timezone FROM devices WHERE device_id = ? AND endpoint IS NOT NULL',
    )
    .bind(deviceId)
    .first<DeviceRow>();
}

export async function devicesWithPush(db: D1Database) {
  const r = await db
    .prepare(
      'SELECT device_id, endpoint, p256dh, auth, timezone FROM devices WHERE endpoint IS NOT NULL',
    )
    .all<DeviceRow>();
  return r.results;
}

export async function pendingReminders(db: D1Database, deviceId: string, date: string) {
  const r = await db
    .prepare('SELECT * FROM reminders WHERE device_id = ? AND date = ? AND sent_at IS NULL')
    .bind(deviceId, date)
    .all<ReminderRow>();
  return r.results;
}

export async function notesOf(db: D1Database, deviceId: string): Promise<Record<string, string[]>> {
  const r = await db
    .prepare('SELECT study_id, texts FROM notes WHERE device_id = ?')
    .bind(deviceId)
    .all<{ study_id: number; texts: string }>();
  const out: Record<string, string[]> = {};
  for (const row of r.results) {
    try {
      const v = JSON.parse(row.texts);
      if (Array.isArray(v)) out[String(row.study_id)] = v.filter((t) => typeof t === 'string');
    } catch {
      /* ignora nota corrompida */
    }
  }
  return out;
}

export async function markSent(
  db: D1Database,
  rows: Pick<ReminderRow, 'device_id' | 'study_id' | 'date'>[],
  now: number,
) {
  if (!rows.length) return;
  await db.batch(
    rows.map((r) =>
      db
        .prepare(
          'UPDATE reminders SET sent_at = ? WHERE device_id = ? AND study_id = ? AND date = ?',
        )
        .bind(now, r.device_id, r.study_id, r.date),
    ),
  );
}

/** Assinatura expirada (404/410): apaga do D1. */
export async function dropSubscription(db: D1Database, deviceId: string) {
  await db
    .prepare('UPDATE devices SET endpoint = NULL, p256dh = NULL, auth = NULL WHERE device_id = ?')
    .bind(deviceId)
    .run();
}

export async function cleanupOld(db: D1Database, beforeDate: string) {
  await db.prepare('DELETE FROM reminders WHERE date < ?').bind(beforeDate).run();
}
