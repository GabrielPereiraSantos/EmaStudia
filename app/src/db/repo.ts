import { todayISO, type ISODate } from '../lib/dates';
import { initialPlan, replanFuture, type DraftDay } from '../plan/core';
import { rebalanceStudies } from '../plan/rebalance';
import { db } from './db';
import type { PlanDay, Study } from './types';

export type StudyInput = Omit<
  Study,
  'id' | 'createdAt' | 'archived' | 'summary' | 'basePagesPerDay' | 'basePlan'
>;

const toRows = (studyId: number, drafts: DraftDay[]): PlanDay[] =>
  drafts.map((d) => ({ ...d, studyId, pagesDone: 0, done: false }));

const tables = () => [db.studies, db.planDays, db.notes, db.sessions, db.quizzes];

/**
 * 6.4 — refaz o equilíbrio de todos os estudos ativos a partir de amanhã.
 * Dias passados, hoje e dias de ripasso não mudam.
 */
export async function rebalanceAll(today: ISODate = todayISO()): Promise<void> {
  await db.transaction('rw', db.studies, db.planDays, async () => {
    const studies = await db.studies.toArray();
    const result = rebalanceStudies(studies, today);
    for (const [studyId, drafts] of result) {
      await db.planDays
        .where('studyId')
        .equals(studyId)
        .filter((d) => d.date > today && d.kind === 'studio')
        .delete();
      await db.planDays.bulkAdd(toRows(studyId, drafts));
    }
  });
}

export async function createStudy(input: StudyInput, today: ISODate = todayISO()): Promise<number> {
  const { drafts, basePlan, basePagesPerDay } = initialPlan(input, today);
  const id = await db.transaction('rw', db.studies, db.planDays, async () => {
    const id = (await db.studies.add({
      ...input,
      summary: '',
      archived: false,
      createdAt: new Date().toISOString(),
      basePagesPerDay,
      basePlan,
    })) as number;
    await db.planDays.bulkAdd(toRows(id, drafts));
    return id;
  });
  await rebalanceAll(today);
  return id;
}

/** Edição: mantém passado e hoje; refaz o resto (ou tudo, se ainda não começou). */
export async function updateStudy(id: number, input: StudyInput, today: ISODate = todayISO()) {
  await db.transaction('rw', db.studies, db.planDays, async () => {
    const old = await db.studies.get(id);
    if (!old) return;
    const days = await db.planDays.where('studyId').equals(id).toArray();
    const started = days.some((d) => d.date <= today);
    const next: Study = { ...old, ...input };
    if (!started) {
      const p = initialPlan(next, today);
      await db.planDays.where('studyId').equals(id).delete();
      await db.planDays.bulkAdd(toRows(id, p.drafts));
      await db.studies.put({ ...next, basePlan: p.basePlan, basePagesPerDay: p.basePagesPerDay });
    } else {
      const kept = days.filter((d) => d.date <= today);
      const p = replanFuture(next, kept, today);
      const studioCount = p.drafts.filter((d) => d.kind === 'studio').length;
      const remaining = p.basePlan.reduce((s, b) => s + b.pages, 0);
      await db.planDays
        .where('studyId')
        .equals(id)
        .filter((d) => d.date > today)
        .delete();
      await db.planDays.bulkAdd(toRows(id, p.drafts));
      await db.studies.put({
        ...next,
        basePlan: p.basePlan,
        basePagesPerDay: studioCount ? Math.ceil(remaining / studioCount) : old.basePagesPerDay,
      });
    }
  });
  await rebalanceAll(today);
}

/** 6.5 — redistribuição confirmada pela Ema (usada pelo Avviso di ritmo). */
export async function redistribute(id: number, today: ISODate = todayISO()) {
  await db.transaction('rw', db.studies, db.planDays, async () => {
    const study = await db.studies.get(id);
    if (!study) return;
    const days = await db.planDays.where('studyId').equals(id).toArray();
    const p = replanFuture(study, days, today);
    await db.planDays
      .where('studyId')
      .equals(id)
      .filter((d) => d.date > today)
      .delete();
    await db.planDays.bulkAdd(toRows(id, p.drafts));
    await db.studies.update(id, { basePlan: p.basePlan });
  });
  await rebalanceAll(today);
}

export async function setArchived(id: number, archived: boolean, today: ISODate = todayISO()) {
  await db.studies.update(id, { archived });
  await rebalanceAll(today);
}

export async function deleteStudy(id: number, today: ISODate = todayISO()) {
  await db.transaction('rw', tables(), async () => {
    await db.studies.delete(id);
    await db.planDays.where('studyId').equals(id).delete();
    await db.notes.where('studyId').equals(id).delete();
    await db.sessions.where('studyId').equals(id).delete();
    await db.quizzes.where('studyId').equals(id).delete();
  });
  await rebalanceAll(today);
}
