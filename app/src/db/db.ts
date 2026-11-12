import Dexie, { type EntityTable } from 'dexie';
import type {
  CoinEntry,
  Note,
  PlanDay,
  Quiz,
  Redemption,
  Reward,
  Session,
  Settings,
  Study,
} from './types';

export class EmaDB extends Dexie {
  studies!: EntityTable<Study, 'id'>;
  planDays!: EntityTable<PlanDay, 'id'>;
  notes!: EntityTable<Note, 'id'>;
  sessions!: EntityTable<Session, 'id'>;
  quizzes!: EntityTable<Quiz, 'id'>;
  coins!: EntityTable<CoinEntry, 'id'>;
  rewards!: EntityTable<Reward, 'id'>;
  redemptions!: EntityTable<Redemption, 'id'>;
  settings!: EntityTable<Settings, 'id'>;

  constructor() {
    super('ema-studia');
    this.version(1).stores({
      studies: '++id, archived, examDate',
      planDays: '++id, studyId, date, [studyId+date]',
      notes: '++id, studyId',
      sessions: '++id, studyId, date, [studyId+date]',
      quizzes: '++id, studyId, status',
      coins: '++id, date',
      rewards: '++id',
      redemptions: '++id, rewardId',
      settings: 'id',
    });
  }
}

export const db = new EmaDB();

/** Moedinhas por pomodoro (com o valor antigo como reserva, para quem ainda não migrou). */
export const coinsPerPomodoro = (s: Partial<Settings> | undefined): number =>
  typeof s?.coinsPomodoro === 'number'
    ? s.coinsPomodoro
    : typeof s?.coinsDay === 'number'
      ? s.coinsDay
      : 10;

export const DEFAULT_SETTINGS: Omit<Settings, 'deviceId'> = {
  id: 1,
  coinsPomodoro: 10,
  coinsStreak: 30,
  coinsCorrect: 5,
  pomodoroWork: 25,
  pomodoroBreak: 5,
  defaultReminder: '19:00',
  notifications: true,
  includeNotes: true,
  accessCode: '',
};

/** Primeira abertura: cria as Impostazioni e pede armazenamento persistente. */
export async function ensureSettings(): Promise<Settings> {
  const existing = await db.settings.get(1);
  if (existing) {
    // migração: o valor "por dia estudado" vira o valor "por pomodoro completo"
    if (typeof existing.coinsPomodoro !== 'number') {
      const coinsPomodoro = coinsPerPomodoro(existing);
      await db.settings.update(1, { coinsPomodoro });
      return { ...existing, coinsPomodoro };
    }
    return existing;
  }
  const s: Settings = { ...DEFAULT_SETTINGS, deviceId: crypto.randomUUID() };
  await db.settings.put(s);
  try {
    await navigator.storage?.persist?.();
  } catch {
    /* sem suporte: segue sem persistência garantida */
  }
  return s;
}
