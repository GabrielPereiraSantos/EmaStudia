import { todayISO, type ISODate } from '../lib/dates';
import {
  draftPages,
  hasStartedToday,
  initialPlan,
  replanFuture,
  type DraftDay,
} from '../plan/core';
import { assessPace } from '../plan/pace';
import { balanceOf, computeAwards, redeem, scheduledDates } from '../plan/coins';
import { rebalanceStudies } from '../plan/rebalance';
import { db, DEFAULT_SETTINGS } from './db';
import type { PlanDay, Reward, Session, Study } from './types';

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

/**
 * Refaz o plano do estudo (6.5) com a regra de páginas consecutivas. Dentro de uma transação.
 * Devolve o ritmo (páginas/dia) do plano novo, ou null se nada foi refeito.
 */
async function replanTx(study: Study, today: ISODate): Promise<number | null> {
  const id = study.id!;
  if (study.examDate <= today) return null;
  const days = await db.planDays.where('studyId').equals(id).toArray();
  const sessionsToday = await db.sessions.where('[studyId+date]').equals([id, today]).count();
  const started = hasStartedToday(days, today, sessionsToday > 0);
  const p = replanFuture(study, days, today, started);
  await db.planDays
    .where('studyId')
    .equals(id)
    .filter((d) => (started ? d.date > today : d.date >= today))
    .delete();
  await db.planDays.bulkAdd(toRows(id, p.drafts));
  await db.studies.put({ ...study, basePlan: p.basePlan });
  const studio = p.drafts.filter((d) => d.kind === 'studio');
  const pages = studio.reduce((n, d) => n + draftPages(d), 0);
  return studio.length ? Math.ceil(pages / studio.length) : null;
}

/** Edição: se o estudo ainda não começou, refaz tudo; senão mantém o passado e replaneja. */
export async function updateStudy(id: number, input: StudyInput, today: ISODate = todayISO()) {
  await db.transaction('rw', db.studies, db.planDays, db.sessions, async () => {
    const old = await db.studies.get(id);
    if (!old) return;
    const days = await db.planDays.where('studyId').equals(id).toArray();
    const next: Study = { ...old, ...input };
    if (!days.some((d) => d.date <= today)) {
      const p = initialPlan(next, today);
      await db.planDays.where('studyId').equals(id).delete();
      await db.planDays.bulkAdd(toRows(id, p.drafts));
      await db.studies.put({ ...next, basePlan: p.basePlan, basePagesPerDay: p.basePagesPerDay });
    } else {
      const perDay = await replanTx(next, today);
      if (perDay) await db.studies.update(id, { basePagesPerDay: perDay });
    }
  });
  await rebalanceAll(today);
}

/**
 * Avviso di ritmo: "Ridistribuisci" / "Aggiungi [dia]". Refaz o plano (com o dia extra,
 * se for o caso) e o novo ritmo vira a referência do alerta.
 */
export async function redistribute(id: number, today: ISODate = todayISO(), addWeekday?: number) {
  await db.transaction('rw', db.studies, db.planDays, db.sessions, async () => {
    const old = await db.studies.get(id);
    if (!old) return;
    const study: Study = addWeekday
      ? { ...old, weekdays: [...new Set([...old.weekdays, addWeekday])].sort() }
      : old;
    const perDay = await replanTx(study, today);
    await db.studies.update(id, {
      weekdays: study.weekdays,
      paceSnoozedOn: today,
      ...(perDay ? { basePagesPerDay: perDay } : {}),
    });
  });
  await rebalanceAll(today);
}

/** Refaz o plano de um estudo depois de uma mudança de progresso (6.5: "a cada mudança"). */
export async function replanStudy(id: number, today: ISODate = todayISO()) {
  await db.transaction('rw', db.studies, db.planDays, db.sessions, async () => {
    const study = await db.studies.get(id);
    if (study && !study.archived) await replanTx(study, today);
  });
  await rebalanceAll(today);
}

/**
 * Primeira abertura do dia: para cada estudo que ela ainda não começou hoje, o plano parte
 * de hoje (a tarefa de hoje começa na primeira página não feita; o atraso se distribui).
 */
export async function dailyReplan(today: ISODate = todayISO()) {
  const settings = await db.settings.get(1);
  if (!settings || settings.lastDailyReplan === today) return;
  await db.transaction('rw', db.studies, db.planDays, db.sessions, db.settings, async () => {
    for (const s of await db.studies.filter((x) => !x.archived).toArray()) await replanTx(s, today);
    await db.settings.update(1, { lastDailyReplan: today });
  });
  await rebalanceAll(today);
}

/** "Lascia com'è": aceita o novo ritmo como referência (o plano não muda). */
export async function acceptNewPace(id: number, today: ISODate = todayISO()) {
  const study = await db.studies.get(id);
  if (!study) return;
  const days = await db.planDays.where('studyId').equals(id).toArray();
  const pace = assessPace(study, days, today);
  await db.studies.update(id, {
    paceSnoozedOn: today,
    ...(Number.isFinite(pace.newPerDay) && pace.newPerDay > 0
      ? { basePagesPerDay: pace.newPerDay }
      : {}),
  });
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
  await awardCoins();
}

/**
 * Concede as moedinhas (seção 7): +10 por dia estudado (30 min somando todos os estudos),
 * +30 a cada 7 dias seguidos. Idempotente; chamado ao salvar tempo e ao abrir o app.
 */
export async function awardCoins(today: ISODate = todayISO()) {
  await db.transaction(
    'rw',
    db.sessions,
    db.planDays,
    db.studies,
    db.coins,
    db.settings,
    async () => {
      const [sessions, days, studies, coins, settings] = await Promise.all([
        db.sessions.toArray(),
        db.planDays.toArray(),
        db.studies.toArray(),
        db.coins.toArray(),
        db.settings.get(1),
      ]);
      const rules = settings ?? DEFAULT_SETTINGS;
      const awards = computeAwards(sessions, scheduledDates(days, studies), coins, rules, today);
      if (awards.length) await db.coins.bulkAdd(awards);
    },
  );
}

export async function saveReward(
  input: Pick<Reward, 'name' | 'icon' | 'price' | 'repeatable'>,
  id?: number,
) {
  if (id) await db.rewards.update(id, input);
  else await db.rewards.add({ ...input, active: true });
}

/** Remove da loja; o registro fica só para o histórico de resgates. */
export const removeReward = (id: number) => db.rewards.update(id, { active: false, removed: true });

export async function redeemReward(
  id: number,
  today: ISODate = todayISO(),
): Promise<'ok' | 'poor' | 'gone'> {
  return db.transaction('rw', db.rewards, db.coins, db.redemptions, async () => {
    const reward = await db.rewards.get(id);
    if (!reward) return 'gone';
    const r = redeem(balanceOf(await db.coins.toArray()), reward, today);
    if (!r.ok) return r.reason;
    await db.coins.add(r.entry);
    await db.redemptions.add(r.redemption);
    await db.rewards.put(r.reward);
    return 'ok';
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
  await replanStudy(day.studyId);
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
  await replanStudy(day.studyId);
}

export async function unmarkDone(dayId: number) {
  const day = await db.planDays.get(dayId);
  await db.planDays.update(dayId, { done: false, pagesDone: 0 });
  if (day) await replanStudy(day.studyId);
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
