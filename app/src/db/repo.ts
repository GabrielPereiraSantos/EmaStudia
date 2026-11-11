import { todayISO, type ISODate } from '../lib/dates';
import { initialPlan, replanFuture, type DraftDay } from '../plan/core';
import { rebalanceStudies } from '../plan/rebalance';
import { db } from './db';
import type { PlanDay, Session, Study } from './types';

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

/**
 * 6.5 — redistribuição confirmada pela Ema (Avviso di ritmo). Opcionalmente adiciona
 * um dia da semana ao estudo. Passado e hoje não mudam; depois roda o equilíbrio.
 */
export async function redistribute(id: number, today: ISODate = todayISO(), addWeekday?: number) {
  await db.transaction('rw', db.studies, db.planDays, async () => {
    const old = await db.studies.get(id);
    if (!old) return;
    const study: Study = addWeekday
      ? { ...old, weekdays: [...new Set([...old.weekdays, addWeekday])].sort() }
      : old;
    const days = await db.planDays.where('studyId').equals(id).toArray();
    const p = replanFuture(study, days, today);
    const studioCount = p.drafts.filter((d) => d.kind === 'studio').length;
    const remaining = p.basePlan.reduce((n, b) => n + b.pages, 0);
    await db.planDays
      .where('studyId')
      .equals(id)
      .filter((d) => d.date > today)
      .delete();
    await db.planDays.bulkAdd(toRows(id, p.drafts));
    await db.studies.put({
      ...study,
      basePlan: p.basePlan,
      // o novo ritmo vira a referência do alerta (6.5b)
      basePagesPerDay: studioCount ? Math.ceil(remaining / studioCount) : old.basePagesPerDay,
      paceSnoozedOn: today,
    });
  });
  await rebalanceAll(today);
}

/** "Lascia com'è": não mostrar o aviso de novo hoje. */
export async function snoozePace(id: number, today: ISODate = todayISO()) {
  await db.studies.update(id, { paceSnoozedOn: today });
}

/** Registra tempo (cronômetro ou manual). Conta igual para os 30 min. */
export async function addSession(
  studyId: number,
  date: ISODate,
  durationSec: number,
  mode: Session['mode'],
  manual = false,
  startedAt = new Date().toISOString(),
) {
  await db.sessions.add({
    studyId,
    date,
    startedAt,
    durationSec: Math.round(durationSec),
    mode,
    manual: manual || undefined,
  });
}

/** Progresso da tarefa do dia. Chegar ao total marca como feita. */
export async function setProgress(dayId: number, pagesDone: number) {
  const day = await db.planDays.get(dayId);
  if (!day) return;
  const total =
    day.kind === 'studio' && day.pageFrom != null && day.pageTo != null
      ? day.pageTo - day.pageFrom + 1
      : 0;
  const n = Math.max(0, Math.min(total, Math.round(pagesDone)));
  await db.planDays.update(dayId, { pagesDone: n, done: total > 0 && n >= total });
}

export async function markDone(dayId: number) {
  const day = await db.planDays.get(dayId);
  if (!day) return;
  if (day.kind === 'ripasso') {
    await db.planDays.update(dayId, { done: true });
    return;
  }
  const total = day.pageFrom != null && day.pageTo != null ? day.pageTo - day.pageFrom + 1 : 0;
  await db.planDays.update(dayId, { pagesDone: total, done: true });
}

export async function unmarkDone(dayId: number) {
  await db.planDays.update(dayId, { done: false, pagesDone: 0 });
}

export const setSummary = (studyId: number, summary: string) =>
  db.studies.update(studyId, { summary });

export const addNote = (studyId: number, text: string) =>
  db.notes.add({ studyId, text: text.trim(), createdAt: new Date().toISOString() });
export const updateNote = (id: number, text: string) => db.notes.update(id, { text: text.trim() });
export const deleteNote = (id: number) => db.notes.delete(id);

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
