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

export const DEFAULT_SETTINGS: Omit<Settings, 'deviceId'> = {
  id: 1,
  coinsDay: 10,
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
  if (existing) return existing;
  const s: Settings = { ...DEFAULT_SETTINGS, deviceId: crypto.randomUUID() };
  await db.settings.put(s);
  try {
    await navigator.storage?.persist?.();
  } catch {
    /* sem suporte: segue sem persistência garantida */
  }
  return s;
}
