import { describe, expect, it } from 'vitest';
import type { PlanDay, Study } from '../db/types';
import { chatGptPrompt, parsePasted, quizzesDue, scoreQuiz, studioFinished } from './quizzes';

const study = (o: Partial<Study> = {}): Study => ({
  id: 1,
  subject: 'Storia',
  colorKey: 'storia',
  topic: 'Rivoluzione francese',
  type: 'umanistiche',
  difficulty: 2,
  priority: 2,
  pageStart: 1,
  pageEnd: 100,
  chapters: [
    { n: 1, startPage: 1 },
    { n: 2, startPage: 41, title: 'Il Terrore' },
    { n: 3, startPage: 71 },
  ],
  splitMode: 'pagine',
  startDate: '2026-11-10',
  examDate: '2026-11-25',
  weekdays: [1, 2, 3, 4, 5],
  reminderTime: '19:00',
  reviewDays: 2,
  materials: [],
  summary: '',
  archived: false,
  createdAt: '',
  basePagesPerDay: 10,
  basePlan: [],
  ...o,
});
const days = (done: number, ripasso: string | null = '2026-11-23'): PlanDay[] => [
  {
    id: 1,
    studyId: 1,
    date: '2026-11-10',
    kind: 'studio',
    pageFrom: 1,
    pageTo: 100,
    pagesDone: done,
    done: done >= 100,
  },
  {
    id: 3,
    studyId: 1,
    date: '2026-11-20',
    kind: 'studio',
    pageFrom: 1,
    pageTo: 100,
    pagesDone: 0,
    done: false,
  },
  ...(ripasso
    ? [{ id: 2, studyId: 1, date: ripasso, kind: 'ripasso' as const, pagesDone: 0, done: false }]
    : []),
];
const T = '2026-11-12';
const q = (i: number) => ({
  question: `D${i}?`,
  options: ['a', 'b', 'c', 'd'],
  correctIndex: i % 4,
  explanation: '',
});

describe('8.1 quando gerar', () => {
  it('modo pagine: quiz quando o progresso passa a última página do capítulo', () => {
    expect(quizzesDue(study(), days(39), [], T)).toEqual([]);
    const due = quizzesDue(study(), days(40), [], T);
    expect(due).toEqual([
      { key: 'cap:1', kind: 'quiz', chapter: { n: 1, title: undefined, from: 1, to: 40 } },
    ]);
    expect(quizzesDue(study(), days(75), [], T).map((d) => d.key)).toEqual(['cap:1', 'cap:2']);
  });
  it('modo capitoli: a tarefa do capítulo concluída (páginas feitas) gera o quiz', () => {
    const due = quizzesDue(study({ splitMode: 'capitoli' }), days(70), [], T);
    expect(due.map((d) => d.key)).toEqual(['cap:1', 'cap:2']);
    expect(due[1].chapter).toMatchObject({ n: 2, title: 'Il Terrore', from: 41, to: 70 });
  });
  it('nunca gera de novo o mesmo quiz', () => {
    expect(quizzesDue(study(), days(75), [{ key: 'cap:1' }], T).map((d) => d.key)).toEqual([
      'cap:2',
    ]);
  });
  it('não exata sem capítulos: um quiz sobre o argomento no fim dos dias de studio', () => {
    const s = study({ chapters: [] });
    expect(quizzesDue(s, days(60), [], T)).toEqual([]);
    expect(quizzesDue(s, days(100), [], T)).toEqual([
      { key: 'studio', kind: 'quiz', pages: { from: 1, to: 100 } },
    ]);
  });
  it('ripasso chegou com páginas faltando: só o que ela já estudou (página inicial até a última feita)', () => {
    const s = study({ chapters: [] });
    expect(quizzesDue(s, days(60), [], '2026-11-23')).toEqual([
      { key: 'studio', kind: 'quiz', pages: { from: 1, to: 60 } },
    ]);
    const ex = study({ type: 'esatte', pageStart: 12 });
    // pageStart 12 + 30 feitas → última feita = 41
    expect(quizzesDue(ex, days(30), [], '2026-11-23')).toEqual([
      { key: 'esercizi', kind: 'esercizi', pages: { from: 12, to: 41 } },
    ]);
  });
  it('0 dias de ripasso: o gatilho é o último dia de studio ou terminar as páginas, o que vier primeiro', () => {
    const s = study({ chapters: [], reviewDays: 0 });
    // antes do último dia de studio (20/11) e com páginas faltando: nada
    expect(quizzesDue(s, days(60, null), [], '2026-11-19')).toEqual([]);
    // no último dia de studio: só o que estudou
    expect(quizzesDue(s, days(60, null), [], '2026-11-20')).toEqual([
      { key: 'studio', kind: 'quiz', pages: { from: 1, to: 60 } },
    ]);
    // terminar as páginas antes: já gera
    expect(quizzesDue(s, days(100, null), [], '2026-11-12')).toEqual([
      { key: 'studio', kind: 'quiz', pages: { from: 1, to: 100 } },
    ]);
    expect(
      studioFinished(study({ type: 'esatte', reviewDays: 0 }), days(10, null), '2026-11-20'),
    ).toBe(true);
  });
  it('sem nenhuma página feita não há o que perguntar', () => {
    expect(quizzesDue(study({ chapters: [] }), days(0), [], '2026-11-23')).toEqual([]);
    expect(quizzesDue(study({ type: 'esatte' }), days(0), [], '2026-11-23')).toEqual([]);
  });
  it('capítulos: no fim dos dias de studio, o capítulo em andamento só até a última página feita', () => {
    // fez 55 págs: cap.1 (1–40) concluído; cap.2 (41–70) em andamento até a 55
    const due = quizzesDue(study(), days(55), [], '2026-11-23');
    expect(due.map((d) => d.key)).toEqual(['cap:1', 'cap:2']);
    expect(due[1].chapter).toMatchObject({ n: 2, from: 41, to: 55 });
    // antes do fim dos dias de studio o capítulo em andamento não gera nada
    expect(quizzesDue(study(), days(55), [], T).map((d) => d.key)).toEqual(['cap:1']);
  });
  it('exatas: 4 exercícios no fim dos dias de studio (não por capítulo)', () => {
    const s = study({ type: 'esatte' });
    expect(quizzesDue(s, days(75), [], T)).toEqual([]);
    expect(quizzesDue(s, days(100), [], T)).toEqual([
      { key: 'esercizi', kind: 'esercizi', pages: { from: 1, to: 100 } },
    ]);
    expect(studioFinished(s, days(10), '2026-11-23')).toBe(true);
  });
});

describe('plano B: ChatGPT', () => {
  const ctx = {
    subject: 'Storia',
    topic: 'Rivoluzione francese',
    difficulty: 2 as const,
    chapter: { n: 2, title: 'Il Terrore', from: 41, to: 70 },
    notes: ['1793'],
    summary: '',
  };
  it('o prompt pede o JSON no formato exato do app', () => {
    const p = chatGptPrompt('quiz', ctx);
    expect(p).toMatch(/quiz di 5 domande/);
    expect(p).toMatch(/Capitolo 2 «Il Terrore», pagine 41–70/);
    expect(p).toMatch(/SOLO con un JSON valido/);
    expect(p).toContain(
      '{"questions":[{"question":"...","options":["...","...","...","..."],"correctIndex":0,"explanation":"..."}]}',
    );
    expect(chatGptPrompt('esercizi', { ...ctx, chapter: undefined })).toMatch(/"solution"/);
    const partial = chatGptPrompt('quiz', {
      ...ctx,
      chapter: undefined,
      pages: { from: 1, to: 60 },
    });
    expect(partial).toMatch(/sulle pagine indicate/);
    expect(partial).toMatch(/Pagine 1–60 del libro \(solo ciò che lo studente ha già studiato\)/);
  });
  it('aceita o JSON colado (puro ou dentro de ```json)', () => {
    const json = JSON.stringify({ questions: [0, 1, 2, 3, 4].map(q) });
    expect(parsePasted('quiz', json)).toMatchObject({ ok: true });
    const r = parsePasted('quiz', 'Ecco il quiz:\n```json\n' + json + '\n```\nBuono studio!');
    expect(r.ok && r.questions).toHaveLength(5);
  });
  it('erro gentil em italiano se vier inválido', () => {
    const bad = parsePasted('quiz', 'Ciao! Non posso aiutarti.');
    expect(bad).toMatchObject({ ok: false });
    expect(!bad.ok && bad.error).toMatch(/Non riesco a leggere la risposta/);
    const wrong = parsePasted('quiz', JSON.stringify({ questions: [q(0)] }));
    expect(!wrong.ok && wrong.error).toMatch(/servono 5 domande/);
    const noSol = parsePasted('esercizi', JSON.stringify({ questions: [0, 1, 2, 3].map(q) }));
    expect(!noSol.ok && noSol.error).toMatch(/solution/);
  });
});

describe('moedinhas do quiz', () => {
  const quiz = { questions: [0, 1, 2, 3, 4].map(q) };
  it('+5 por resposta certa (Gemini e ChatGPT)', () => {
    expect(scoreQuiz({ ...quiz, source: 'gemini' }, [0, 1, 2, 3, 3], 5)).toEqual({
      score: 4,
      coins: 20,
    });
    expect(scoreQuiz({ ...quiz, source: 'chatgpt' }, [0, 1, 2, 3, 0], 5)).toEqual({
      score: 5,
      coins: 25,
    });
  });
  it('"Scrivi tu" não rende moedinhas', () => {
    expect(scoreQuiz({ ...quiz, source: 'manuale' }, [0, 1, 2, 3, 0], 5)).toEqual({
      score: 5,
      coins: 0,
    });
  });
});
