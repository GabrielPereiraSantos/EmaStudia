import type { PlanDay, Session, Study } from '../db/types';
import { addDaysISO, maxISO, weekdayOf, type ISODate } from '../lib/dates';
import { candidateDates, splitCandidates } from './core';
import { assessPace } from './pace';

/** Um dia conta como estudado com 30 min ou mais (6.6). */
export const STUDIED_SEC = 30 * 60;

/** Soma de segundos por data (cronômetro e tempo manual contam igual). */
export function secondsByDate(
  sessions: Pick<Session, 'date' | 'durationSec'>[],
): Map<ISODate, number> {
  const m = new Map<ISODate, number>();
  for (const s of sessions) m.set(s.date, (m.get(s.date) ?? 0) + s.durationSec);
  return m;
}

export type Face = 'happy' | 'sad' | 'future';

/** Carinha: feliz ≥ 30 min; triste em dia passado sem 30 min; tracejada no futuro (e hoje, ainda em aberto). */
export function faceFor(date: ISODate, today: ISODate, seconds: number): Face {
  if (seconds >= STUDIED_SEC) return 'happy';
  return date < today ? 'sad' : 'future';
}

/** Soma de todos os estudos num dia (usada nas moedinhas e no aviso do "Fatto"). */
export const totalSeconds = (sessions: Pick<Session, 'date' | 'durationSec'>[], date: ISODate) =>
  sessions.filter((s) => s.date === date).reduce((a, s) => a + s.durationSec, 0);

const NAMES: Record<number, { name: string; art: 'il' | 'la' }> = {
  1: { name: 'lunedì', art: 'il' },
  2: { name: 'martedì', art: 'il' },
  3: { name: 'mercoledì', art: 'il' },
  4: { name: 'giovedì', art: 'il' },
  5: { name: 'venerdì', art: 'il' },
  6: { name: 'sabato', art: 'il' },
  7: { name: 'domenica', art: 'la' },
};

export const addWeekdayLabel = (wd: number) => `Aggiungi ${NAMES[wd].art} ${NAMES[wd].name}`;
export const weekdayName = (wd: number) => NAMES[wd].name;

/**
 * "Aggiungi il sabato": um dia da semana que ela não marcou e que tenha ao menos uma data
 * a partir de amanhã, antes da prova e antes dos dias de ripasso. Ordem: sab, dom, seg…
 */
export function addableWeekday(
  study: Pick<Study, 'startDate' | 'examDate' | 'weekdays' | 'reviewDays'>,
  today: ISODate,
): number | null {
  const from = maxISO(study.startDate, addDaysISO(today, 1));
  const cands = candidateDates(from, study.examDate, study.weekdays);
  const { ripasso } = splitCandidates(cands, study.reviewDays);
  const limit = ripasso.length ? ripasso[0] : study.examDate;
  const dates: ISODate[] = [];
  for (let d = from; d < limit; d = addDaysISO(d, 1)) dates.push(d);
  for (const wd of [6, 7, 1, 2, 3, 4, 5]) {
    if (!study.weekdays.includes(wd) && dates.some((d) => weekdayOf(d) === wd)) return wd;
  }
  return null;
}

/** Páginas por dia no plano se esse dia da semana fosse adicionado. */
export function perDayWith(study: Study, days: PlanDay[], today: ISODate, wd: number): number {
  return assessPace({ ...study, weekdays: [...study.weekdays, wd] }, days, today).newPerDay;
}

/** Último dia de studio possível (para "fino al …"). */
export function lastStudioDate(study: Study, today: ISODate): ISODate | null {
  const from = maxISO(study.startDate, addDaysISO(today, 1));
  const { studio } = splitCandidates(
    candidateDates(from, study.examDate, study.weekdays),
    study.reviewDays,
  );
  return studio.length ? studio[studio.length - 1] : null;
}
