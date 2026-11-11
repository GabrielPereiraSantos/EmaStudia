import type { PlanDay, Study } from '../db/types';
import { addDaysISO, daysBetween, weekdayOf, type ISODate } from '../lib/dates';
import {
  candidateDates,
  pagesDoneTotal,
  splitCandidates,
  todayRemaining,
  type PlanStudy,
} from './core';

export interface PaceResult {
  late: boolean;
  /** (a) ritmo real projeta término depois da prova; (b) páginas/dia > 25% acima do original. */
  reasons: ('ritmo' | 'carico')[];
  /** Dias de atraso projetado (null se o ritmo real é zero). */
  delayDays: number | null;
  realPace: number | null;
  newPerDay: number;
  basePerDay: number;
}

/** Último dia necessário, contando só os dias disponíveis a partir de `from`. */
export function projectFinish(
  remaining: number,
  pace: number,
  from: ISODate,
  weekdays: number[],
): ISODate | null {
  if (remaining <= 0) return addDaysISO(from, -1);
  if (pace <= 0 || weekdays.length === 0) return null;
  let need = Math.ceil(remaining / pace);
  let d = from;
  for (;;) {
    if (weekdays.includes(weekdayOf(d)) && --need === 0) return d;
    d = addDaysISO(d, 1);
  }
}

/** Dias depois da prova (terminar no próprio dia da prova = 1). */
export const delayAfterExam = (finish: ISODate, exam: ISODate) => daysBetween(exam, finish) + 1;

/** 6.5 — avaliação do ritmo (só projeção; não altera o plano). */
export function assessPace(
  study: PlanStudy & Pick<Study, 'basePagesPerDay'>,
  days: PlanDay[],
  today: ISODate,
): PaceResult {
  const total = study.pageEnd - study.pageStart + 1;
  const tomorrow = addDaysISO(today, 1);
  const remaining = Math.max(0, total - pagesDoneTotal(days) - todayRemaining(days, today));
  const futureStudio = splitCandidates(
    candidateDates(tomorrow, study.examDate, study.weekdays),
    study.reviewDays,
  ).studio;
  const newPerDay =
    remaining === 0
      ? 0
      : futureStudio.length
        ? Math.ceil(remaining / futureStudio.length)
        : Infinity;

  const last3 = days
    .filter((d) => d.kind === 'studio' && d.date < today)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 3);
  const realPace = last3.length === 3 ? last3.reduce((s, d) => s + d.pagesDone, 0) / 3 : null;

  const reasons: PaceResult['reasons'] = [];
  let delayDays: number | null = 0;

  if (realPace !== null && remaining > 0) {
    const fin = projectFinish(remaining, realPace, tomorrow, study.weekdays);
    if (fin === null || fin >= study.examDate) {
      reasons.push('ritmo');
      delayDays = fin === null ? null : delayAfterExam(fin, study.examDate);
    }
  }
  if (newPerDay > study.basePagesPerDay * 1.25) {
    reasons.push('carico');
    if (!reasons.includes('ritmo')) {
      const fin = projectFinish(remaining, study.basePagesPerDay, tomorrow, study.weekdays);
      delayDays = fin === null ? null : Math.max(0, delayAfterExam(fin, study.examDate));
    }
  }
  return {
    late: reasons.length > 0,
    reasons,
    delayDays: reasons.length ? delayDays : 0,
    realPace,
    newPerDay,
    basePerDay: study.basePagesPerDay,
  };
}
