import { describe, expect, it } from 'vitest';
import { validateStudy, type StudyDraft } from './validateStudy';

const ok: StudyDraft = {
  subject: 'Fisica',
  type: 'esatte',
  pageStart: 1,
  pageEnd: 50,
  chapters: [],
  splitMode: 'pagine',
  startDate: '2026-11-16',
  examDate: '2026-11-30',
  weekdays: [1, 3, 5],
  reviewDays: 2,
  materials: [],
};
const T = '2026-11-11';

describe('validazione Nuovo studio', () => {
  it('accetta uno studio valido', () => expect(validateStudy(ok, T)).toEqual([]));
  it('pagina finale ≥ iniziale', () =>
    expect(validateStudy({ ...ok, pageEnd: 0 }, T)).toHaveLength(1));
  it('esame dopo inizio', () =>
    expect(validateStudy({ ...ok, examDate: ok.startDate }, T)).toHaveLength(1));
  it('almeno un giorno', () => expect(validateStudy({ ...ok, weekdays: [] }, T)).toHaveLength(1));
  it('giorni insufficienti', () => {
    const e = validateStudy({ ...ok, examDate: '2026-11-19', reviewDays: 2 }, T);
    expect(e[0]).toMatch(/solo 2 giorni/);
  });
  it('capitoli richiesti in modalità capitoli', () =>
    expect(validateStudy({ ...ok, splitMode: 'capitoli' }, T)).toHaveLength(1));
  it('link solo http(s)', () =>
    expect(
      validateStudy({ ...ok, materials: [{ title: 'x', url: 'javascript:alert(1)' }] }, T),
    ).toHaveLength(1));
});
