import { describe, expect, it } from 'vitest';
import type { Note, PlanDay, Study } from '../db/types';
import { isIOS } from './device';
import { buildSchedule } from './schedule';

const study = (o: Partial<Study>): Study => ({
  id: 1,
  subject: 'Fisica',
  colorKey: 'fisica',
  topic: 'Cinematica',
  type: 'esatte',
  difficulty: 2,
  priority: 2,
  pageStart: 1,
  pageEnd: 50,
  chapters: [],
  splitMode: 'pagine',
  startDate: '2026-11-10',
  examDate: '2026-11-20',
  weekdays: [1, 2, 3, 4, 5],
  reminderTime: '19:00',
  reviewDays: 1,
  materials: [],
  summary: 'segreto',
  archived: false,
  createdAt: '',
  basePagesPerDay: 10,
  basePlan: [],
  ...o,
});
const day = (o: Partial<PlanDay>): PlanDay => ({
  studyId: 1,
  date: '2026-11-12',
  kind: 'studio',
  pagesDone: 0,
  done: false,
  ...o,
});
const settings = {
  deviceId: '3f2b8c1e-1a2b-4c3d-9e8f-001122334455',
  notifications: true,
  includeNotes: true,
};
const today = '2026-11-12';

describe('agenda mínima enviada ao Worker', () => {
  const days = [
    day({ date: '2026-11-11' }), // passado: não vai
    day({ date: '2026-11-12' }),
    day({ date: '2026-11-13', done: true }), // já feito: não precisa lembrar
    day({ date: '2026-11-19', kind: 'ripasso' }),
  ];
  const notes: Note[] = [{ id: 1, studyId: 1, text: 'v = s / t', createdAt: '' }];

  it('só matéria, datas futuras, horário e notas', () => {
    const p = buildSchedule([study({})], days, notes, settings, today, 'Europe/Rome');
    expect(p).toEqual({
      deviceId: settings.deviceId,
      timezone: 'Europe/Rome',
      reminders: [
        {
          studyId: 1,
          subject: 'Fisica',
          time: '19:00',
          dates: ['2026-11-12', '2026-11-19'],
          reviewDates: ['2026-11-19'],
        },
      ],
      notes: { '1': ['v = s / t'] },
    });
    // nada de resumo, argomento ou páginas
    expect(JSON.stringify(p)).not.toMatch(/segreto|Cinematica|pageStart/);
  });
  it('"Includi le note" desligado não manda as notas', () => {
    expect(
      buildSchedule(
        [study({})],
        days,
        notes,
        { ...settings, includeNotes: false },
        today,
        'Europe/Rome',
      ).notes,
    ).toEqual({});
  });
  it('"Notifiche" desligado manda agenda vazia', () => {
    const p = buildSchedule(
      [study({})],
      days,
      notes,
      { ...settings, notifications: false },
      today,
      'Europe/Rome',
    );
    expect(p.reminders).toEqual([]);
    expect(p.notes).toEqual({});
  });
  it('estudo arquivado ou com prova passada fica de fora', () => {
    expect(
      buildSchedule([study({ archived: true })], days, notes, settings, today, 'Europe/Rome')
        .reminders,
    ).toEqual([]);
    expect(
      buildSchedule(
        [study({ examDate: '2026-11-11' })],
        days,
        notes,
        settings,
        today,
        'Europe/Rome',
      ).reminders,
    ).toEqual([]);
  });
});

describe('detecção do iPhone/iPad', () => {
  it('iPhone e iPad (que se apresenta como Mac com toque)', () => {
    expect(
      isIOS({
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)',
        platform: 'iPhone',
        maxTouchPoints: 5,
      }),
    ).toBe(true);
    expect(
      isIOS({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        platform: 'MacIntel',
        maxTouchPoints: 5,
      }),
    ).toBe(true);
    expect(
      isIOS({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        platform: 'MacIntel',
        maxTouchPoints: 0,
      }),
    ).toBe(false);
    expect(
      isIOS({
        userAgent: 'Mozilla/5.0 (Linux; Android 14)',
        platform: 'Linux armv8l',
        maxTouchPoints: 5,
      }),
    ).toBe(false);
  });
});
