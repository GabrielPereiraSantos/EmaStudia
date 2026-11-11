import type { Study } from '../db/types';
import { addDaysISO, type ISODate } from '../lib/dates';
import { balanceLoad, type BalanceStudy } from './balance';
import { candidateDates, rebuildFromCounts, splitCandidates, type DraftDay } from './core';

/**
 * Aplica o equilíbrio (6.4) aos planos individuais (basePlan) de todos os estudos ativos,
 * só a partir de amanhã. Devolve os novos dias de studio futuros por estudo.
 */
export function rebalanceStudies(studies: Study[], today: ISODate): Map<number, DraftDay[]> {
  const tomorrow = addDaysISO(today, 1);
  const active = studies.filter((s) => !s.archived && s.id != null);
  const meta: BalanceStudy[] = active.map((s) => ({
    id: s.id!,
    priority: s.priority,
    difficulty: s.difficulty,
    examDate: s.examDate,
    dates: splitCandidates(candidateDates(tomorrow, s.examDate, s.weekdays), s.reviewDays).studio,
  }));
  const tasks = active.flatMap((s) =>
    s.basePlan
      .filter((b) => b.date > today)
      .map((b) => ({ studyId: s.id!, date: b.date, pages: b.pages })),
  );
  const balanced = balanceLoad(meta, tasks);
  const out = new Map<number, DraftDay[]>();
  for (const s of active) {
    const counts = balanced.filter((t) => t.studyId === s.id);
    out.set(
      s.id!,
      rebuildFromCounts({ ...s, basePlan: s.basePlan.filter((b) => b.date > today) }, counts),
    );
  }
  return out;
}
