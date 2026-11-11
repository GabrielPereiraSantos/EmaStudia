import { describe, expect, it } from 'vitest';
import type { Settings } from '../db/types';
import {
  backupDue,
  BACKUP_VERSION,
  buildBackup,
  clampSetting,
  parseBackup,
  TABLES,
  type TableName,
} from './backup';

const settings: Settings = {
  id: 1,
  coinsDay: 10,
  coinsStreak: 30,
  coinsCorrect: 5,
  pomodoroWork: 25,
  pomodoroBreak: 5,
  defaultReminder: '19:00',
  notifications: true,
  includeNotes: true,
  accessCode: 'SEGRETO',
  deviceId: '3f2b8c1e-1a2b-4c3d-9e8f-001122334455',
  welcomeDone: true,
  lastBackupAt: '2026-11-01T10:00:00Z',
  lastDailyReplan: '2026-11-10',
};
const study = {
  id: 1,
  subject: 'Fisica',
  colorKey: 'fisica',
  topic: 'Cinematica',
  type: 'esatte',
  difficulty: 2,
  priority: 3,
  pageStart: 1,
  pageEnd: 50,
  chapters: [{ n: 1, startPage: 1, title: 'Moto' }],
  splitMode: 'capitoli',
  startDate: '2026-11-10',
  examDate: '2026-11-20',
  weekdays: [1, 2, 3],
  reminderTime: '19:00',
  reviewDays: 2,
  materials: [{ title: 'Video', url: 'https://example.com/v' }],
  summary: 'riassunto',
  archived: false,
  createdAt: '2026-11-10T10:00:00Z',
  basePagesPerDay: 10,
  basePlan: [{ date: '2026-11-11', pageFrom: 1, pages: 10 }],
};
const tables = (): Record<TableName, Record<string, unknown>[]> => ({
  studies: [study],
  planDays: [
    {
      id: 1,
      studyId: 1,
      date: '2026-11-11',
      kind: 'studio',
      pageFrom: 1,
      pageTo: 10,
      pagesDone: 4,
      done: false,
    },
  ],
  notes: [{ id: 1, studyId: 1, text: 'v = s/t', createdAt: '2026-11-10T10:00:00Z' }],
  sessions: [
    {
      id: 1,
      studyId: 1,
      date: '2026-11-11',
      startedAt: '2026-11-11T10:00:00Z',
      durationSec: 1800,
      mode: 'libero',
      manual: true,
    },
  ],
  quizzes: [
    {
      id: 1,
      studyId: 1,
      kind: 'quiz',
      key: 'cap:1',
      questions: [{ question: 'Q?', options: ['a', 'b', 'c', 'd'], correctIndex: 1 }],
      answers: [1],
      score: 1,
      coinsAwarded: 5,
      status: 'completato',
      source: 'gemini',
      createdAt: '2026-11-12T10:00:00Z',
    },
  ],
  coins: [{ id: 1, date: '2026-11-11', amount: 10, reason: 'giorno' }],
  rewards: [{ id: 1, name: 'Gelato', icon: 'cuore', price: 50, repeatable: true, active: true }],
  redemptions: [{ id: 1, rewardId: 1, date: '2026-11-12', price: 50 }],
});
const make = () =>
  JSON.parse(JSON.stringify(buildBackup(tables(), settings, new Date('2026-11-13T10:00:00Z'))));

describe('backup: ida e volta', () => {
  it('não leva o código de acesso nem o aparelho', () => {
    const json = JSON.stringify(buildBackup(tables(), settings));
    expect(json).not.toMatch(/SEGRETO|accessCode|deviceId|3f2b8c1e/);
    expect(json).toContain('"version":' + BACKUP_VERSION);
  });
  it('um backup gerado é aceito e traz tudo de volta', () => {
    const r = parseBackup(JSON.stringify(make()));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    for (const t of TABLES) expect(r.backup.tables[t]).toEqual(tables()[t]);
    expect(r.backup.settings).toMatchObject({
      coinsDay: 10,
      pomodoroWork: 25,
      defaultReminder: '19:00',
      notifications: true,
    });
    expect('accessCode' in r.backup.settings).toBe(false);
  });
});

describe('backup: arquivos inválidos', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bad = (mut: (b: Record<string, any>) => void) => {
    const b = make();
    mut(b);
    return parseBackup(JSON.stringify(b));
  };
  it('não é JSON / não é do app', () => {
    expect(parseBackup('ciao')).toMatchObject({ ok: false });
    expect(parseBackup('{"a":1}')).toMatchObject({ ok: false });
    expect(bad((b) => (b.app = 'altro'))).toMatchObject({ ok: false });
  });
  it('versão mais nova → mensagem pedindo para atualizar', () => {
    const r = bad((b) => (b.version = 99));
    expect(!r.ok && r.error).toMatch(/versione più nuova/);
  });
  it('tabela faltando, linha estragada ou id repetido', () => {
    expect(bad((b) => delete b.tables.coins)).toMatchObject({ ok: false });
    expect(bad((b) => (b.tables.studies[0].examDate = '20/11/2026'))).toMatchObject({ ok: false });
    expect(bad((b) => (b.tables.studies[0].type = 'magia'))).toMatchObject({ ok: false });
    expect(bad((b) => b.tables.coins.push({ ...b.tables.coins[0] }))).toMatchObject({ ok: false });
  });
  it('link de material perigoso é recusado', () => {
    expect(
      bad((b) => (b.tables.studies[0].materials[0].url = 'javascript:alert(1)')),
    ).toMatchObject({ ok: false });
  });
  it('plano que aponta para estudo inexistente', () => {
    expect(bad((b) => (b.tables.planDays[0].studyId = 99))).toMatchObject({ ok: false });
  });
  it('valores das moedinhas fora do limite', () => {
    expect(bad((b) => (b.settings.coinsDay = 5000))).toMatchObject({ ok: false });
  });
  it('arquivo gigante', () => {
    expect(parseBackup('x'.repeat(10 * 1024 * 1024 + 1))).toMatchObject({ ok: false });
  });
});

describe('lembrete de backup (14 dias)', () => {
  const now = new Date('2026-11-20T12:00:00Z');
  it('nunca fez backup e já tem dados → avisa; sem dados → não', () => {
    expect(backupDue(undefined, true, now)).toBe(true);
    expect(backupDue(undefined, false, now)).toBe(false);
  });
  it('mais de 14 dias → avisa; 14 ou menos → não', () => {
    expect(backupDue('2026-11-05T11:00:00Z', true, now)).toBe(true); // 15 dias
    expect(backupDue('2026-11-06T12:00:00Z', true, now)).toBe(false); // exatamente 14 dias
    expect(backupDue('2026-11-18T12:00:00Z', true, now)).toBe(false);
  });
});

describe('limites das configurações', () => {
  it('prende os valores no intervalo', () => {
    expect(clampSetting('coinsDay', -3)).toBe(0);
    expect(clampSetting('coinsDay', 5000)).toBe(999);
    expect(clampSetting('pomodoroWork', 0)).toBe(1);
    expect(clampSetting('pomodoroBreak', 2.6)).toBe(3);
    expect(clampSetting('coinsStreak', NaN)).toBe(0);
  });
});
