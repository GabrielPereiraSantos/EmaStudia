import type { CoinEntry, PlanDay, Redemption, Reward, Session, Study } from '../db/types';
import { addDaysISO, type ISODate } from '../lib/dates';
import { STUDIED_SEC } from './study';

export interface CoinRules {
  coinsPomodoro: number;
  coinsStreak: number;
  coinsCorrect: number;
}

export const STREAK_CYCLE = 7;

/** Datas em que a soma de TODOS os estudos chega a 30 min (cronômetro e tempo manual contam igual). */
export function studiedDates(sessions: Pick<Session, 'date' | 'durationSec'>[]): Set<ISODate> {
  const secs = new Map<ISODate, number>();
  for (const s of sessions) secs.set(s.date, (secs.get(s.date) ?? 0) + s.durationSec);
  return new Set([...secs].filter(([, n]) => n >= STUDIED_SEC).map(([d]) => d));
}

/** Datas com algum estudo programado (só estudos ativos). */
export function scheduledDates(
  days: Pick<PlanDay, 'studyId' | 'date'>[],
  studies: Pick<Study, 'id' | 'archived'>[],
): Set<ISODate> {
  const active = new Set(studies.filter((s) => !s.archived).map((s) => s.id));
  return new Set(days.filter((d) => active.has(d.studyId)).map((d) => d.date));
}

export interface StreakResult {
  /** Dias estudados seguidos até hoje (hoje só entra se já estudou; hoje em aberto não quebra). */
  current: number;
  /** Datas em que a sequência chegou a um múltiplo de 7. */
  bonusDates: ISODate[];
}

/**
 * Sequência: dia estudado soma 1; dia com estudo programado e sem 30 min (já terminado) zera;
 * dia sem nenhum estudo programado não quebra (nem soma, se não estudou).
 */
export function computeStreak(
  studied: Set<ISODate>,
  scheduled: Set<ISODate>,
  today: ISODate,
): StreakResult {
  const all = [...studied, ...scheduled].filter((d) => d <= today).sort();
  if (all.length === 0) return { current: 0, bonusDates: [] };
  let streak = 0;
  const bonusDates: ISODate[] = [];
  for (let d = all[0]; d <= today; d = addDaysISO(d, 1)) {
    if (studied.has(d)) {
      streak++;
      if (streak % STREAK_CYCLE === 0) bonusDates.push(d);
    } else if (scheduled.has(d) && d < today) {
      streak = 0;
    }
  }
  return { current: streak, bonusDates };
}

/** Posição na barra "5 di 7": 0 sem sequência; 1–7 depois (7 logo ao completar). */
export const streakInCycle = (streak: number) =>
  streak === 0 ? 0 : ((streak - 1) % STREAK_CYCLE) + 1;

/**
 * Novas entradas do extrato pela sequência: +coinsStreak a cada 7 dias estudados seguidos
 * (dia estudado = 30 min somando todos os estudos). O dia em si NÃO rende moedas: quem rende
 * é cada pomodoro completo (veja pomodoroAward).
 *
 * Antes: +coinsDay uma vez por dia estudado e +coinsStreak a cada 7 dias
 * seguidos. Idempotente (não repete o que já está no extrato) e nunca remove nada:
 * ela nunca perde moedas, só deixa de ganhar.
 */
export function computeAwards(
  sessions: Pick<Session, 'date' | 'durationSec'>[],
  scheduled: Set<ISODate>,
  existing: Pick<CoinEntry, 'date' | 'reason'>[],
  rules: Pick<CoinRules, 'coinsStreak'>,
  today: ISODate,
): CoinEntry[] {
  const has = new Set(existing.map((e) => `${e.reason}:${e.date}`));
  const studied = studiedDates(sessions);
  const out: CoinEntry[] = [];
  for (const date of computeStreak(studied, scheduled, today).bonusDates) {
    if (!has.has(`serie:${date}`)) out.push({ date, amount: rules.coinsStreak, reason: 'serie' });
  }
  return out;
}

export const balanceOf = (entries: Pick<CoinEntry, 'amount'>[]) =>
  entries.reduce((n, e) => n + e.amount, 0);

export const canRedeem = (balance: number, reward: Pick<Reward, 'price' | 'active'>) =>
  reward.active && balance >= reward.price;

/** Resultado de resgatar (função pura): novo extrato + prêmio atualizado, ou o motivo da recusa. */
export function redeem(
  balance: number,
  reward: Reward,
  date: ISODate,
):
  | { ok: true; entry: CoinEntry; redemption: Omit<Redemption, 'id'>; reward: Reward }
  | { ok: false; reason: 'gone' | 'poor' } {
  if (!reward.active) return { ok: false, reason: 'gone' };
  if (balance < reward.price) return { ok: false, reason: 'poor' };
  return {
    ok: true,
    entry: { date, amount: -reward.price, reason: 'premio' },
    redemption: { rewardId: reward.id!, date, price: reward.price },
    reward: { ...reward, active: reward.repeatable },
  };
}

/** "Circa X pomodori": preço / moedinhas por pomodoro completo. */
export const pomodorosFor = (price: number, coinsPomodoro: number) =>
  coinsPomodoro > 0 ? Math.max(1, Math.ceil(price / coinsPomodoro)) : 0;

/** Referência única de um pomodoro (não credita duas vezes o mesmo). */
export const pomodoroRef = (sessionStart: string, index: number) => `pomo:${sessionStart}:${index}`;

/**
 * Moedinhas dos pomodoros completos ainda não creditados: +coinsPomodoro por pomodoro de
 * estudo completo. Modo Libero e "Aggiungi tempo" não passam por aqui (não rendem moedas).
 */
export function pomodoroAwards(
  sessionStart: string,
  completed: number,
  alreadyAwarded: number,
  existingRefs: Set<string>,
  coinsPomodoro: number,
  dateOf: (index: number) => string,
): CoinEntry[] {
  if (coinsPomodoro <= 0) return [];
  const out: CoinEntry[] = [];
  for (let k = alreadyAwarded; k < completed; k++) {
    const ref = pomodoroRef(sessionStart, k);
    if (!existingRefs.has(ref))
      out.push({ date: dateOf(k), amount: coinsPomodoro, reason: 'pomodoro', ref });
  }
  return out;
}
