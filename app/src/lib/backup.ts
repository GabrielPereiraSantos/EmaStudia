import type { Settings } from '../db/types';

export const BACKUP_VERSION = 1;
export const MAX_BACKUP_BYTES = 10 * 1024 * 1024;
export const BACKUP_WARNING =
  'Il backup contiene le tue note e i tuoi studi: conservalo in un posto sicuro.';
export const BACKUP_REMINDER_DAYS = 14;

export const TABLES = [
  'studies',
  'planDays',
  'notes',
  'sessions',
  'quizzes',
  'coins',
  'rewards',
  'redemptions',
] as const;
export type TableName = (typeof TABLES)[number];

/** Campos do Settings que NÃO vão para o arquivo (segredo ou ligados ao aparelho). */
export const DEVICE_ONLY = [
  'accessCode',
  'deviceId',
  'welcomeDone',
  'lastDailyReplan',
  'lastBackupAt',
] as const;

export type BackupSettings = Omit<Settings, (typeof DEVICE_ONLY)[number]>;

export interface BackupFile {
  app: 'ema-studia';
  version: number;
  exportedAt: string;
  settings: BackupSettings;
  tables: Record<TableName, Record<string, unknown>[]>;
}

export function buildBackup(
  tables: Record<TableName, Record<string, unknown>[]>,
  settings: Settings,
  now: Date = new Date(),
): BackupFile {
  const safe: Partial<Settings> = { ...settings };
  for (const k of DEVICE_ONLY) delete safe[k];
  return {
    app: 'ema-studia',
    version: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    settings: safe as BackupSettings,
    tables,
  };
}

export const backupFileName = (now: Date = new Date()) =>
  `ema-studia-backup-${now.toLocaleDateString('sv')}.json`;

/** Passou de 14 dias (ou nunca fez) e há algo para guardar. */
export function backupDue(
  lastBackupAt: string | undefined,
  hasData: boolean,
  now: Date = new Date(),
): boolean {
  if (!hasData) return false;
  if (!lastBackupAt) return true;
  const t = Date.parse(lastBackupAt);
  return Number.isNaN(t) || now.getTime() - t > BACKUP_REMINDER_DAYS * 86_400_000;
}

// ---------- validação ----------
const DATE = /^\d{4}-\d{2}-\d{2}$/;
type Row = Record<string, unknown>;
const isObj = (v: unknown): v is Row => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown, max = 5000): v is string => typeof v === 'string' && v.length <= max;
const isDate = (v: unknown): v is string => typeof v === 'string' && DATE.test(v);
const isInt = (v: unknown, min = 0, max = 1_000_000): v is number =>
  Number.isInteger(v) && (v as number) >= min && (v as number) <= max;
const isBool = (v: unknown): v is boolean => typeof v === 'boolean';
const optStr = (v: unknown, max = 5000) => v === undefined || isStr(v, max);
const optInt = (v: unknown) => v === undefined || isInt(v);
const intArray = (v: unknown, max = 2000) =>
  Array.isArray(v) && v.length <= max && v.every((x) => isInt(x));
const level = (v: unknown) => v === 1 || v === 2 || v === 3;
const iso = (v: unknown) => typeof v === 'string' && !Number.isNaN(Date.parse(v));

const SAFE_URL = (u: unknown) => {
  if (typeof u !== 'string' || u.length > 2000) return false;
  try {
    const p = new URL(u);
    return p.protocol === 'http:' || p.protocol === 'https:';
  } catch {
    return false;
  }
};

const question = (q: unknown) =>
  isObj(q) &&
  isStr(q.question, 1500) &&
  Array.isArray(q.options) &&
  q.options.length === 4 &&
  q.options.every((o) => isStr(o, 600)) &&
  isInt(q.correctIndex, 0, 3) &&
  optStr(q.explanation, 3000) &&
  optStr(q.solution, 6000);

const CHECKS: Record<TableName, (r: Row) => boolean> = {
  studies: (r) =>
    isInt(r.id, 1) &&
    isStr(r.subject, 100) &&
    optStr(r.emoji, 16) &&
    isStr(r.colorKey, 20) &&
    isStr(r.topic, 200) &&
    ['esatte', 'umanistiche', 'biologiche', 'lingue'].includes(r.type as string) &&
    level(r.difficulty) &&
    level(r.priority) &&
    isInt(r.pageStart) &&
    isInt(r.pageEnd) &&
    Array.isArray(r.chapters) &&
    r.chapters.length <= 500 &&
    r.chapters.every((c) => isObj(c) && isInt(c.n) && isInt(c.startPage) && optStr(c.title, 200)) &&
    (r.splitMode === 'pagine' || r.splitMode === 'capitoli') &&
    isDate(r.startDate) &&
    isDate(r.examDate) &&
    intArray(r.weekdays, 7) &&
    typeof r.reminderTime === 'string' &&
    /^([01]\d|2[0-3]):[0-5]\d$/.test(r.reminderTime) &&
    isInt(r.reviewDays, 0, 365) &&
    Array.isArray(r.materials) &&
    r.materials.length <= 100 &&
    r.materials.every((m) => isObj(m) && isStr(m.title, 300) && SAFE_URL(m.url)) &&
    isStr(r.summary, 20000) &&
    isBool(r.archived) &&
    iso(r.createdAt) &&
    isInt(r.basePagesPerDay) &&
    Array.isArray(r.basePlan) &&
    r.basePlan.length <= 2000 &&
    r.basePlan.every((b) => isObj(b) && isDate(b.date) && isInt(b.pageFrom) && isInt(b.pages)) &&
    (r.paceSnoozedOn === undefined || isDate(r.paceSnoozedOn)),
  planDays: (r) =>
    isInt(r.id, 1) &&
    isInt(r.studyId, 1) &&
    isDate(r.date) &&
    (r.kind === 'studio' || r.kind === 'ripasso') &&
    optInt(r.pageFrom) &&
    optInt(r.pageTo) &&
    (r.chapters === undefined || intArray(r.chapters)) &&
    isInt(r.pagesDone) &&
    isBool(r.done),
  notes: (r) => isInt(r.id, 1) && isInt(r.studyId, 1) && isStr(r.text, 1000) && iso(r.createdAt),
  sessions: (r) =>
    isInt(r.id, 1) &&
    isInt(r.studyId, 1) &&
    isDate(r.date) &&
    iso(r.startedAt) &&
    isInt(r.durationSec, 0, 86_400) &&
    (r.mode === 'pomodoro' || r.mode === 'libero'),
  quizzes: (r) =>
    isInt(r.id, 1) &&
    isInt(r.studyId, 1) &&
    (r.kind === 'quiz' || r.kind === 'esercizi') &&
    isStr(r.key, 40) &&
    Array.isArray(r.questions) &&
    r.questions.length <= 20 &&
    r.questions.every(question) &&
    Array.isArray(r.answers) &&
    r.answers.length <= 20 &&
    r.answers.every((a) => isInt(a, 0, 3)) &&
    isInt(r.score, 0, 100) &&
    isInt(r.coinsAwarded) &&
    ['in-attesa', 'disponibile', 'completato'].includes(r.status as string) &&
    iso(r.createdAt),
  coins: (r) =>
    isInt(r.id, 1) &&
    isDate(r.date) &&
    isInt(r.amount, -1_000_000, 1_000_000) &&
    ['giorno', 'serie', 'quiz', 'premio'].includes(r.reason as string),
  rewards: (r) =>
    isInt(r.id, 1) &&
    isStr(r.name, 100) &&
    ['regalo', 'cuore', 'film', 'tazza', 'stella'].includes(r.icon as string) &&
    isInt(r.price, 1, 99999) &&
    isBool(r.repeatable) &&
    isBool(r.active),
  redemptions: (r) =>
    isInt(r.id, 1) && isInt(r.rewardId, 1) && isDate(r.date) && isInt(r.price, 1, 99999),
};

const SETTINGS_RANGES: Record<string, [number, number]> = {
  coinsDay: [0, 999],
  coinsStreak: [0, 999],
  coinsCorrect: [0, 999],
  pomodoroWork: [1, 180],
  pomodoroBreak: [0, 60],
};

export type ParseResult = { ok: true; backup: BackupFile } | { ok: false; error: string };

const BAD_FORMAT = 'Questo file non è un backup di Ema studia valido.';

/** Valida o arquivo antes de tocar em qualquer dado. */
export function parseBackup(text: string): ParseResult {
  if (text.length > MAX_BACKUP_BYTES)
    return { ok: false, error: 'Il file è troppo grande per essere un backup.' };
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: BAD_FORMAT };
  }
  if (!isObj(data) || data.app !== 'ema-studia' || !isObj(data.tables) || !isObj(data.settings))
    return { ok: false, error: BAD_FORMAT };
  if (!isInt(data.version, 1, 1000)) return { ok: false, error: BAD_FORMAT };
  if (data.version > BACKUP_VERSION)
    return {
      ok: false,
      error:
        'Questo backup è stato creato da una versione più nuova dell’app. Aggiorna l’app e riprova.',
    };

  const tables = {} as BackupFile['tables'];
  for (const name of TABLES) {
    const rows = (data.tables as Row)[name];
    if (!Array.isArray(rows) || rows.length > 100_000) return { ok: false, error: BAD_FORMAT };
    const seen = new Set<number>();
    for (const r of rows) {
      if (!isObj(r) || !CHECKS[name](r) || seen.has(r.id as number))
        return { ok: false, error: BAD_FORMAT };
      seen.add(r.id as number);
    }
    tables[name] = rows as Row[];
  }
  const s = data.settings as Row;
  for (const [k, [min, max]] of Object.entries(SETTINGS_RANGES))
    if (!isInt(s[k], min, max)) return { ok: false, error: BAD_FORMAT };
  if (typeof s.defaultReminder !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(s.defaultReminder))
    return { ok: false, error: BAD_FORMAT };
  if (!isBool(s.notifications) || !isBool(s.includeNotes)) return { ok: false, error: BAD_FORMAT };

  // os planos precisam apontar para estudos que existem
  const studyIds = new Set(tables.studies.map((r) => r.id as number));
  const orphan = (['planDays', 'notes', 'sessions', 'quizzes'] as const).some((t) =>
    tables[t].some((r) => !studyIds.has(r.studyId as number)),
  );
  if (orphan) return { ok: false, error: BAD_FORMAT };

  return {
    ok: true,
    backup: {
      app: 'ema-studia',
      version: data.version,
      exportedAt: typeof data.exportedAt === 'string' ? data.exportedAt : '',
      settings: {
        id: 1,
        coinsDay: s.coinsDay as number,
        coinsStreak: s.coinsStreak as number,
        coinsCorrect: s.coinsCorrect as number,
        pomodoroWork: s.pomodoroWork as number,
        pomodoroBreak: s.pomodoroBreak as number,
        defaultReminder: s.defaultReminder,
        notifications: s.notifications as boolean,
        includeNotes: s.includeNotes as boolean,
      },
      tables,
    },
  };
}

/** Limites dos valores editáveis em Impostazioni. */
export const SETTING_LIMITS = {
  coinsDay: { min: 0, max: 999, step: 1 },
  coinsStreak: { min: 0, max: 999, step: 5 },
  coinsCorrect: { min: 0, max: 999, step: 1 },
  pomodoroWork: { min: 1, max: 180, step: 5 },
  pomodoroBreak: { min: 0, max: 60, step: 1 },
} as const;

export function clampSetting(key: keyof typeof SETTING_LIMITS, value: number): number {
  const { min, max } = SETTING_LIMITS[key];
  return Math.min(max, Math.max(min, Math.round(Number.isFinite(value) ? value : min)));
}
