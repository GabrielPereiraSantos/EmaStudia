import { describe, expect, it } from 'vitest';
import type { PlanDay, Study } from '../db/types';
import { weekdayOf } from '../lib/dates';
import { balanceLoad } from './balance';
import {
  assignUnits,
  buildPlan,
  buildUnits,
  candidateDates,
  chapterRanges,
  distributePages,
  initialPlan,
  replanFuture,
  type PlanStudy,
} from './core';
import { assessPace } from './pace';
import { rebalanceStudies } from './rebalance';

// 2026-11-16 é segunda-feira.
const MON = '2026-11-16';

const base: PlanStudy = {
  pageStart: 1,
  pageEnd: 100,
  chapters: [],
  splitMode: 'pagine',
  startDate: MON,
  examDate: '2026-11-30',
  weekdays: [1, 2, 3, 4, 5, 6, 7],
  reviewDays: 0,
};

const toDays = (studyId: number, drafts: ReturnType<typeof buildPlan>): PlanDay[] =>
  drafts.map((d, i) => ({ id: i + 1, studyId, ...d, pagesDone: 0, done: false }));

describe('6.1 dias de estudo', () => {
  it('só os dias disponíveis, até a véspera da prova', () => {
    const c = candidateDates(MON, '2026-11-30', [1, 3, 5]);
    expect(c).toEqual([
      '2026-11-16',
      '2026-11-18',
      '2026-11-20',
      '2026-11-23',
      '2026-11-25',
      '2026-11-27',
    ]);
    expect(c.every((d) => [1, 3, 5].includes(weekdayOf(d)))).toBe(true);
  });

  it('os últimos dias viram ripasso, sem páginas', () => {
    const plan = buildPlan({ ...base, weekdays: [1, 3, 5], reviewDays: 2 }, MON, 1);
    const ripasso = plan.filter((d) => d.kind === 'ripasso');
    expect(ripasso.map((d) => d.date)).toEqual(['2026-11-25', '2026-11-27']);
    expect(ripasso.every((d) => d.pageFrom === undefined)).toBe(true);
    const studio = plan.filter((d) => d.kind === 'studio');
    expect(studio).toHaveLength(4);
    expect(studio[0]).toMatchObject({ pageFrom: 1, pageTo: 25 });
    expect(studio[3]).toMatchObject({ pageFrom: 76, pageTo: 100 });
  });

  it('sempre sobra ao menos 1 dia de studio', () => {
    const plan = buildPlan({ ...base, examDate: '2026-11-18', reviewDays: 3 }, MON, 1);
    expect(plan.map((d) => d.kind)).toEqual(['studio', 'ripasso']);
  });
});

describe('6.2 modo pagine', () => {
  it('arredonda para cima; o último dia recebe o que sobra', () => {
    expect(distributePages(10, 4)).toEqual([3, 3, 2, 2]);
    expect(distributePages(9, 4)).toEqual([3, 2, 2, 2]);
    expect(distributePages(100, 3)).toEqual([34, 33, 33]);
    const sum = distributePages(73, 6).reduce((a, b) => a + b, 0);
    expect(sum).toBe(73);
  });
});

describe('6.3 modo capitoli', () => {
  const chapters = [
    { n: 1, startPage: 1 },
    { n: 2, startPage: 11 }, // cap.1 = 10 pág
    { n: 3, startPage: 41 }, // cap.2 = 30 pág
    { n: 4, startPage: 51 }, // cap.3 = 10 pág
    { n: 5, startPage: 61 }, // cap.4 = 40 pág, cap.5 = 40 pág (61–100)
  ];

  it('capítulos de tamanhos diferentes ficam inteiros e perto da média', () => {
    const s = { ...base, splitMode: 'capitoli' as const, chapters, examDate: '2026-11-20' }; // 4 dias, média 25
    const plan = buildPlan(s, MON, 1).filter((d) => d.kind === 'studio');
    // nenhum capítulo > 50 pág → nenhum dividido
    expect(plan.every((d) => d.part === undefined)).toBe(true);
    // cobre tudo, sem buracos
    expect(plan[0].pageFrom).toBe(1);
    expect(plan.at(-1)!.pageTo).toBe(100);
    for (let i = 1; i < plan.length; i++) expect(plan[i].pageFrom).toBe(plan[i - 1].pageTo! + 1);
    // cada capítulo aparece em um só dia
    const all = plan.flatMap((d) => d.chapters!);
    expect(new Set(all).size).toBe(all.length);
    expect(plan.map((d) => d.chapters)).toEqual([[1], [2], [3, 4], [5]]);
  });

  it('divide só capítulos maiores que 2× a média', () => {
    const ranges = chapterRanges(
      [
        { n: 1, startPage: 1 },
        { n: 2, startPage: 11 },
      ],
      1,
      100,
    );
    const units = buildUnits(ranges, 1, 20); // cap.2 = 90 pág > 40
    expect(units[0]).toEqual({ chapter: 1, from: 1, to: 10 });
    expect(units.slice(1).every((u) => u.chapter === 2 && u.part?.total === 5)).toBe(true);
    expect(units.at(-1)!.to).toBe(100);
  });

  it('distribuição gulosa não deixa capítulo no meio', () => {
    const units = [10, 30, 10, 40, 10].map((s, i, a) => {
      const from = a.slice(0, i).reduce((x, y) => x + y, 0) + 1;
      return { chapter: i + 1, from, to: from + s - 1 };
    });
    const g = assignUnits(units, 3);
    expect(g.flat()).toHaveLength(5);
    expect(g.every((x) => x.length > 0)).toBe(true);
  });
});

describe('6.4 equilíbrio entre provas', () => {
  it('a prioridade menor cede primeiro, para dias anteriores', () => {
    const dates = ['2026-11-16', '2026-11-17', '2026-11-18'];
    const studies = [
      { id: 1, priority: 3 as const, difficulty: 1 as const, examDate: '2026-11-19', dates },
      { id: 2, priority: 1 as const, difficulty: 1 as const, examDate: '2026-11-19', dates },
    ];
    const tasks = [
      { studyId: 1, date: dates[0], pages: 2 },
      { studyId: 1, date: dates[1], pages: 2 },
      { studyId: 1, date: dates[2], pages: 20 },
      { studyId: 2, date: dates[0], pages: 2 },
      { studyId: 2, date: dates[1], pages: 2 },
      { studyId: 2, date: dates[2], pages: 20 },
    ];
    const out = balanceLoad(studies, tasks);
    const get = (id: number, d: string) =>
      out.find((t) => t.studyId === id && t.date === d)?.pages ?? 0;
    // Alta (1) não muda
    expect([get(1, dates[0]), get(1, dates[1]), get(1, dates[2])]).toEqual([2, 2, 20]);
    // Bassa (2) cede 16 páginas para antes
    expect(get(2, dates[2])).toBe(4);
    expect(get(2, dates[0]) + get(2, dates[1])).toBe(20);
    // total preservado
    expect(out.reduce((s, t) => s + t.pages, 0)).toBe(48);
  });

  it('nunca move para depois nem fora dos dias do estudo', () => {
    const studies = [
      {
        id: 1,
        priority: 1 as const,
        difficulty: 3 as const,
        examDate: '2026-11-20',
        dates: ['2026-11-18', '2026-11-19'],
      },
      {
        id: 2,
        priority: 2 as const,
        difficulty: 1 as const,
        examDate: '2026-11-20',
        dates: ['2026-11-16', '2026-11-19'],
      },
    ];
    const tasks = [
      { studyId: 1, date: '2026-11-19', pages: 30 },
      { studyId: 2, date: '2026-11-16', pages: 5 },
      { studyId: 2, date: '2026-11-19', pages: 5 },
    ];
    const out = balanceLoad(studies, tasks);
    for (const t of out) expect(studies.find((s) => s.id === t.studyId)!.dates).toContain(t.date);
    expect(out.find((t) => t.studyId === 1 && t.date === '2026-11-18')!.pages).toBeGreaterThan(0);
  });

  it('duas provas próximas com prioridades diferentes (planos completos)', () => {
    const today = '2026-11-15';
    const mk = (id: number, priority: 1 | 3, examDate: string, pageEnd: number): Study => {
      const s = {
        ...base,
        id,
        subject: 's' + id,
        colorKey: 'fisica' as const,
        topic: '',
        type: 'umanistiche' as const,
        difficulty: 2 as const,
        priority,
        pageEnd,
        examDate,
        materials: [],
        summary: '',
        archived: false,
        createdAt: '',
        reminderTime: '19:00',
        basePagesPerDay: 0,
        basePlan: [],
      };
      return { ...s, basePlan: initialPlan(s, today).basePlan };
    };
    // A (Alta) tem prova em 5 dias, B (Bassa) em 3: a B é que se adianta.
    const a = mk(1, 3, '2026-11-21', 100);
    const b = mk(2, 1, '2026-11-19', 30);
    a.startDate = b.startDate = '2026-11-16';
    a.basePlan = initialPlan(a, today).basePlan;
    b.basePlan = initialPlan(b, today).basePlan;
    // sobrecarga artificial no último dia da B
    b.basePlan = [
      { date: '2026-11-16', pageFrom: 1, pages: 2 },
      { date: '2026-11-17', pageFrom: 3, pages: 2 },
      { date: '2026-11-18', pageFrom: 5, pages: 26 },
    ];
    const res = rebalanceStudies([a, b], today);
    const aDays = res.get(1)!;
    expect(aDays.map((d) => d.pageTo! - d.pageFrom! + 1)).toEqual(a.basePlan.map((x) => x.pages));
    const bDays = res.get(2)!;
    expect(bDays.at(-1)!.pageTo! - bDays.at(-1)!.pageFrom! + 1).toBeLessThan(26);
    expect(bDays[0].pageFrom).toBe(1);
    expect(bDays.at(-1)!.pageTo).toBe(30);
  });
});

describe('6.5 atraso e redistribuição', () => {
  const study = { ...base, examDate: '2026-11-26', basePagesPerDay: 10 }; // 10 dias × 10 pág
  const today = '2026-11-19'; // passaram 3 dias de studio

  it('ritmo real baixo projeta término depois da prova', () => {
    const days = toDays(1, buildPlan(study, MON, 1));
    days.slice(0, 3).forEach((d) => (d.pagesDone = 5)); // fez 15 de 30
    const r = assessPace(study, days, today);
    expect(r.late).toBe(true);
    expect(r.reasons).toContain('ritmo');
    // faltam 100-15-10(hoje) = 75 pág a 5/dia = 15 dias a partir de 20/11 → 04/12
    expect(r.realPace).toBe(5);
    expect(r.delayDays).toBe(9);
  });

  it('sem atraso quando está em dia', () => {
    const days = toDays(1, buildPlan(study, MON, 1));
    days.slice(0, 3).forEach((d) => {
      d.pagesDone = 10;
      d.done = true;
    });
    expect(assessPace(study, days, today).late).toBe(false);
  });

  it('redistribuição: passado e hoje intactos, o resto vai do amanhã até a prova', () => {
    const days = toDays(1, buildPlan(study, MON, 1));
    days.slice(0, 3).forEach((d) => (d.pagesDone = 5));
    const { drafts } = replanFuture(study, days, today);
    expect(drafts.every((d) => d.date > today)).toBe(true);
    // hoje continua 31–40 (não muda); o futuro começa depois do que hoje cobre em sequência
    expect(drafts[0].pageFrom).toBe(1 + 15 + 10);
    expect(drafts.at(-1)!.pageTo).toBe(100);
    expect(drafts).toHaveLength(6);
  });

  it('alerta de carga quando páginas/dia passa de 25% do original', () => {
    const days = toDays(1, buildPlan(study, MON, 1));
    days[0].pagesDone = 10;
    const r = assessPace(study, days, today);
    // faltam 100-10-10 = 80 em 6 dias → 14/dia > 12,5
    expect(r.newPerDay).toBe(14);
    expect(r.reasons).toContain('carico');
  });
});

describe('rótulos depois do equilíbrio', () => {
  it('faixa que corta um capítulo é marcada como parcial', async () => {
    const { rebuildFromCounts } = await import('./core');
    const s = {
      chapters: [
        { n: 1, startPage: 1 },
        { n: 2, startPage: 11 },
      ],
      pageStart: 1,
      pageEnd: 20,
      basePlan: [
        { date: '2026-11-16', pageFrom: 1, pages: 10, chapters: [1] },
        { date: '2026-11-17', pageFrom: 11, pages: 10, chapters: [2] },
      ],
    };
    const out = rebuildFromCounts(s, [
      { date: '2026-11-16', pages: 14 },
      { date: '2026-11-17', pages: 6 },
    ]);
    expect(out[0]).toMatchObject({ chapters: [1, 2], partial: true });
    expect(out[1]).toMatchObject({ chapters: [2], partial: true, pageFrom: 15 });
    const same = rebuildFromCounts(s, [
      { date: '2026-11-16', pages: 10 },
      { date: '2026-11-17', pages: 10 },
    ]);
    expect(same.every((d) => !d.partial)).toBe(true);
  });
});
