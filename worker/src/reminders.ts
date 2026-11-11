/** Lógica pura das notificações: hora local, lembretes vencidos, texto e TTL. */

export const LATE_WINDOW_MIN = 120;

export interface ReminderRow {
  device_id: string;
  study_id: number;
  subject: string;
  date: string;
  time: string;
  kind: 'studio' | 'ripasso';
  sent_at: number | null;
}

export interface LocalNow {
  date: string;
  minutes: number;
  seconds: number;
}

/** Data e hora locais no fuso da Ema. */
export function localNow(timezone: string, nowMs: number): LocalNow {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(nowMs));
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  const h = Number(get('hour')) % 24;
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    minutes: h * 60 + Number(get('minute')),
    seconds: Number(get('second')),
  };
}

export const toMinutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

/** Vencido: hoje (no fuso dela), já passou do horário e no máximo 2 h de atraso. */
export function isDue(r: Pick<ReminderRow, 'date' | 'time' | 'sent_at'>, now: LocalNow): boolean {
  if (r.sent_at != null || r.date !== now.date) return false;
  const late = now.minutes - toMinutes(r.time);
  return late >= 0 && late <= LATE_WINDOW_MIN;
}

/**
 * TTL do push: não entregar depois do fim da janela de 2 h do lembrete mais cedo
 * do grupo, nem depois da meia-noite local.
 */
export function ttlSeconds(times: string[], now: LocalNow): number {
  const earliest = Math.min(...times.map(toMinutes));
  const limitMin = Math.min(earliest + LATE_WINDOW_MIN, 24 * 60);
  const left = (limitMin - now.minutes) * 60 - now.seconds;
  return Math.max(60, left);
}

export function joinIt(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} e ${items[items.length - 1]}`;
}

export interface Message {
  title: string;
  body: string;
  url: string;
  tag: string;
}

/** Texto em italiano. Vários estudos no mesmo horário viram uma notificação só. */
export function buildMessage(
  items: Pick<ReminderRow, 'study_id' | 'subject' | 'kind'>[],
  notesByStudy: Record<string, string[]>,
  random: () => number = Math.random,
): Message {
  const studio = items.filter((i) => i.kind === 'studio');
  const ripasso = items.filter((i) => i.kind === 'ripasso');
  const notes = items.flatMap((i) => notesByStudy[String(i.study_id)] ?? []);
  const note = notes.length ? notes[Math.floor(random() * notes.length) % notes.length] : null;

  let body: string;
  if (studio.length) {
    body =
      `Oggi si studia ${joinIt(studio.map((i) => i.subject))}! ` +
      (note ? `Ricorda: ${note}` : 'Ce la fai, Ema.');
    if (ripasso.length)
      body += ` E oggi è giorno di ripasso di ${joinIt(ripasso.map((i) => i.subject))}.`;
  } else {
    body =
      `Oggi è giorno di ripasso di ${joinIt(ripasso.map((i) => i.subject))}` +
      (note ? `. Ricorda: ${note}` : '');
  }
  const single = items.length === 1;
  return {
    title: 'Ema studia',
    body,
    url: single ? `/#/studio/${items[0].study_id}` : '/#/',
    tag: single ? `studio-${items[0].study_id}` : 'oggi',
  };
}

export const TEST_MESSAGE: Message = {
  title: 'Ema studia',
  body: 'Ciao Ema! Questa è una notifica di prova. Le notifiche funzionano.',
  url: '/#/',
  tag: 'prova',
};
