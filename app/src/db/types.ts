import type { ColorKey } from '../lib/colors';
import type { ISODate } from '../lib/dates';

export type StudyType = 'esatte' | 'umanistiche' | 'biologiche' | 'lingue';
export type Level = 1 | 2 | 3;
export type SplitMode = 'pagine' | 'capitoli';

export interface Chapter {
  n: number;
  title?: string;
  startPage: number;
}

export interface Part {
  index: number;
  total: number;
}

/** Entrada do plano individual (antes do equilíbrio) para dias futuros. */
export interface BaseEntry {
  date: ISODate;
  pageFrom: number;
  pages: number;
  chapters?: number[];
  part?: Part;
}

export interface Study {
  id?: number;
  subject: string;
  emoji?: string;
  colorKey: ColorKey;
  topic: string;
  type: StudyType;
  difficulty: Level;
  priority: Level;
  pageStart: number;
  pageEnd: number;
  chapters: Chapter[];
  splitMode: SplitMode;
  startDate: ISODate;
  examDate: ISODate;
  /** 1 = lunedì … 7 = domenica */
  weekdays: number[];
  reminderTime: string;
  reviewDays: number;
  materials: { title: string; url: string }[];
  summary: string;
  archived: boolean;
  createdAt: string;
  /** Páginas/dia do plano original (alerta de ritmo, 6.5b). */
  basePagesPerDay: number;
  /** Plano individual dos dias futuros, ponto de partida do equilíbrio (6.4). */
  basePlan: BaseEntry[];
  /** Dia em que a Ema dispensou o Avviso di ritmo (não mostrar de novo no mesmo dia). */
  paceSnoozedOn?: ISODate;
}

export interface PlanDay {
  id?: number;
  studyId: number;
  date: ISODate;
  kind: 'studio' | 'ripasso';
  pageFrom?: number;
  pageTo?: number;
  chapters?: number[];
  part?: Part;
  /** Faixa que não cobre capítulos inteiros (depois do equilíbrio). */
  partial?: boolean;
  pagesDone: number;
  done: boolean;
}

export interface Note {
  id?: number;
  studyId: number;
  text: string;
  createdAt: string;
}

export interface Session {
  id?: number;
  studyId: number;
  date: ISODate;
  startedAt: string;
  durationSec: number;
  mode: 'pomodoro' | 'libero';
  /** Tempo registrado à mão ("Aggiungi tempo"); conta igual ao do cronômetro. */
  manual?: boolean;
}

export interface Quiz {
  id?: number;
  studyId: number;
  kind: 'quiz' | 'esercizi';
  chapter?: number;
  questions: unknown[];
  answers: number[];
  score: number;
  coinsAwarded: number;
  status: 'disponibile' | 'completato';
  createdAt: string;
}

export interface CoinEntry {
  id?: number;
  date: ISODate;
  amount: number;
  reason: 'giorno' | 'serie' | 'quiz' | 'premio';
}

export interface Reward {
  id?: number;
  name: string;
  icon: 'regalo' | 'cuore' | 'film' | 'tazza' | 'stella';
  price: number;
  repeatable: boolean;
  active: boolean;
}

export interface Redemption {
  id?: number;
  rewardId: number;
  date: ISODate;
  price: number;
}

export interface Settings {
  id: 1;
  coinsDay: number;
  coinsStreak: number;
  coinsCorrect: number;
  pomodoroWork: number;
  pomodoroBreak: number;
  defaultReminder: string;
  notifications: boolean;
  includeNotes: boolean;
  accessCode: string;
  deviceId: string;
  lastBackupAt?: string;
  /** Último dia em que o plano foi refeito na primeira abertura. */
  lastDailyReplan?: ISODate;
}
