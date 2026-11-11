/** Validação da entrada (nada de confiar no corpo da requisição). */

export interface ScheduleReminder {
  studyId: number;
  subject: string;
  time: string;
  dates: string[];
  /** Subconjunto de `dates` que são dias de ripasso. */
  reviewDates?: string[];
}

export interface SchedulePayload {
  deviceId: string;
  timezone: string;
  reminders: ScheduleReminder[];
  notes: Record<string, string[]>;
}

export interface SubscriptionPayload {
  deviceId: string;
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } };
}

export const LIMITS = {
  studies: 50,
  datesPerStudy: 400,
  subject: 60,
  notesPerStudy: 50,
  noteLength: 280,
  endpoint: 1000,
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const B64URL = /^[A-Za-z0-9_-]+={0,2}$/;

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
/** Tira caracteres de controle e espaços extras. */
const clean = (s: string) =>
  [...s]
    .map((ch) => {
      const n = ch.charCodeAt(0);
      return n < 32 || n === 127 ? ' ' : ch;
    })
    .join('')
    .trim();

export function isTimezone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export const isDeviceId = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);

export function parseSchedule(body: unknown): SchedulePayload | null {
  if (!isObj(body) || !isDeviceId(body.deviceId) || !isTimezone(body.timezone)) return null;
  if (!Array.isArray(body.reminders) || body.reminders.length > LIMITS.studies) return null;
  const reminders: ScheduleReminder[] = [];
  for (const r of body.reminders) {
    if (!isObj(r)) return null;
    const { studyId, subject, time, dates, reviewDates } = r;
    if (!Number.isInteger(studyId) || (studyId as number) < 0) return null;
    if (typeof subject !== 'string' || !clean(subject) || subject.length > LIMITS.subject)
      return null;
    if (typeof time !== 'string' || !TIME.test(time)) return null;
    if (!Array.isArray(dates) || dates.length > LIMITS.datesPerStudy) return null;
    if (!dates.every((d) => typeof d === 'string' && DATE.test(d))) return null;
    const review = reviewDates ?? [];
    if (!Array.isArray(review) || !review.every((d) => typeof d === 'string' && dates.includes(d)))
      return null;
    reminders.push({
      studyId: studyId as number,
      subject: clean(subject),
      time,
      dates: [...new Set(dates as string[])],
      reviewDates: review as string[],
    });
  }
  const notes: Record<string, string[]> = {};
  if (body.notes !== undefined) {
    if (!isObj(body.notes) || Object.keys(body.notes).length > LIMITS.studies) return null;
    for (const [k, v] of Object.entries(body.notes)) {
      if (!/^\d+$/.test(k) || !Array.isArray(v) || v.length > LIMITS.notesPerStudy) return null;
      if (!v.every((t) => typeof t === 'string' && t.length <= LIMITS.noteLength)) return null;
      const texts = (v as string[]).map(clean).filter(Boolean);
      if (texts.length) notes[k] = texts;
    }
  }
  return { deviceId: body.deviceId, timezone: body.timezone, reminders, notes };
}

export function parseSubscription(body: unknown): SubscriptionPayload | null {
  if (!isObj(body) || !isDeviceId(body.deviceId) || !isObj(body.subscription)) return null;
  const { endpoint, keys } = body.subscription;
  if (typeof endpoint !== 'string' || endpoint.length > LIMITS.endpoint) return null;
  try {
    if (new URL(endpoint).protocol !== 'https:') return null;
  } catch {
    return null;
  }
  if (!isObj(keys)) return null;
  const { p256dh, auth } = keys;
  if (typeof p256dh !== 'string' || typeof auth !== 'string') return null;
  if (!B64URL.test(p256dh) || !B64URL.test(auth) || p256dh.length > 200 || auth.length > 100)
    return null;
  return { deviceId: body.deviceId, subscription: { endpoint, keys: { p256dh, auth } } };
}
