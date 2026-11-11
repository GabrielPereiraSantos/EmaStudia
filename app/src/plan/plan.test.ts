import { describe, expect, it } from 'vitest';
import type { PlanDay, Study } from '../db/types';
import { weekdayOf } from '../lib/dates';
import { balanceLoad } from './balance';
import {
  assignUnits,
  baseFromDrafts,
  buildPlan,
  buildUnits,
  candidateDates,
  chapterRanges,
  distributePages,
  draftPages,
  firstUndonePage,
  hasStartedToday,
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

/** Faixas consecutivas, sem sobreposição nem buracos, terminando na página final. */
function expectTiling(
  drafts: { pageFrom?: number; pageTo?: number; kind: string }[],
  from: number,
  end: number,
) {
  const studio = drafts.filter((d) => d.kind === 'studio');
  expect(studio[0].pageFrom).toBe(from);
  for (let i = 1; i < studio.length; i++)
    expect(studio[i].pageFrom).toBe(studio[i - 1].pageTo! + 1);
  expect(studio.at(-1)!.pageTo).toBe(end);
}

describe('6.5 replanejamento: páginas consecutivas, nenhuma sem dono', () => {
  // 100 pág, segunda a domingo, 16/11–25/11 (10 dias × 10 pág), prova dia 26.
  const study: PlanStudy = { ...base, examDate: '2026-11-26' };
  const today = '2026-11-19'; // quinta; já passaram 16, 17 e 18
  const pastDone = (days: PlanDay[], each: number) =>
    days.filter((d) => d.date < today).forEach((d) => (d.pagesDone = each));

  /** Dia de hoje no estado de depois da primeira abertura (refeito do zero). */
  const afterOpening = () => {
    const days = toDays(1, buildPlan(study, MON, 1));
    pastDone(days, 5); // fez 15 de 30: atrasada
    const p = replanFuture(study, days, today, false);
    const todayRow = toDays(
      1,
      p.drafts.filter((d) => d.date === today),
    );
    return {
      past: days.filter((d) => d.date < today),
      todayRow,
      future: p.drafts.filter((d) => d.date > today),
      all: p.drafts,
    };
  };

  it('(a) atrasada, dia não começado: hoje começa na primeira página não feita e cobre tudo até o fim', () => {
    const days = toDays(1, buildPlan(study, MON, 1));
    pastDone(days, 5);
    expect(hasStartedToday(days, today, false)).toBe(false);
    expect(firstUndonePage(study, days)).toBe(16);
    const { drafts } = replanFuture(study, days, today, false);
    expect(drafts[0]).toMatchObject({ date: today, pageFrom: 16 });
    expectTiling(drafts, 16, 100);
    // o atraso se distribui por hoje e pelos dias futuros: 85 pág em 7 dias
    expect(drafts.map((d) => draftPages(d))).toEqual([13, 12, 12, 12, 12, 12, 12]);
  });

  it('(b) atrasada, dia já começado: hoje fica igual e amanhã começa logo depois da última página feita', () => {
    const { past, todayRow, future } = afterOpening();
    expect(todayRow[0]).toMatchObject({ pageFrom: 16, pageTo: 28 });
    todayRow[0].pagesDone = 4; // começou: fez 16–19
    const days = [...past, ...todayRow, ...toDays(1, future)];
    expect(hasStartedToday(days, today, false)).toBe(true);
    const p = replanFuture(study, days, today, true);
    expect(p.drafts.every((d) => d.date > today)).toBe(true); // hoje não é tocado
    expect(p.drafts[0]).toMatchObject({ date: '2026-11-20', pageFrom: 1 + 15 + 4 });
    expectTiling(p.drafts, 20, 100);
  });

  it('(b2) só tem sessão do cronômetro, sem páginas: também conta como começado', () => {
    const { past, todayRow } = afterOpening();
    expect(hasStartedToday([...past, ...todayRow], today, true)).toBe(true);
    expect(hasStartedToday([...past, ...todayRow], today, false)).toBe(false);
  });

  it('(c) progresso parcial e total: amanhã parte da última página feita', () => {
    const { past, todayRow } = afterOpening();
    todayRow[0].pagesDone = 10;
    const partial = replanFuture(study, [...past, ...todayRow], today, true);
    expect(partial.drafts[0].pageFrom).toBe(26); // 1 + 15 feitas + 10 de hoje
    expectTiling(partial.drafts, 26, 100);
    // terminou tudo de hoje (16–28): amanhã na página seguinte ao fim da faixa de hoje
    todayRow[0].pagesDone = 13;
    todayRow[0].done = true;
    const full = replanFuture(study, [...past, ...todayRow], today, true);
    expect(full.drafts[0].pageFrom).toBe(todayRow[0].pageTo! + 1);
    expect(full.drafts[0].pageFrom).toBe(29);
    expectTiling(full.drafts, 29, 100);
  });

  it('hoje 35–51 concluído: amanhã começa na 52', () => {
    const days = toDays(1, [
      { date: '2026-11-16', kind: 'studio', pageFrom: 1, pageTo: 17 },
      { date: '2026-11-17', kind: 'studio', pageFrom: 18, pageTo: 34 },
      { date: today, kind: 'studio', pageFrom: 35, pageTo: 51 },
    ]);
    days[0].pagesDone = 17;
    days[1].pagesDone = 17;
    days[2].pagesDone = 17;
    days[2].done = true;
    const p = replanFuture(study, days, today, true);
    expect(p.drafts[0].pageFrom).toBe(52);
    expectTiling(p.drafts, 52, 100);
  });

  it('(d) hoje sem tarefa: o plano começa na primeira página não feita, no próximo dia disponível', () => {
    const s: PlanStudy = { ...base, weekdays: [1, 2, 3, 4, 5], examDate: '2026-11-30' };
    const sat = '2026-11-21';
    const days = toDays(1, buildPlan(s, MON, 1)).filter((d) => d.date < sat);
    days.forEach((d) => (d.pagesDone = 4)); // 5 dias × 4 = 20 feitas
    expect(days.some((d) => d.date === sat)).toBe(false);
    for (const started of [false, true]) {
      const p = replanFuture(s, days, sat, started);
      expect(p.drafts[0]).toMatchObject({ date: '2026-11-23', pageFrom: 1 + 20 });
      expectTiling(p.drafts, 21, 100);
    }
  });

  it('modo capitoli: recomeça no meio de um capítulo e continua consecutivo', () => {
    const s: PlanStudy = {
      ...base,
      splitMode: 'capitoli',
      chapters: [
        { n: 1, startPage: 1 },
        { n: 2, startPage: 41 },
        { n: 3, startPage: 71 },
      ],
      examDate: '2026-11-26',
    };
    const days = toDays(1, buildPlan(s, MON, 1));
    days.filter((d) => d.date < today).forEach((d) => (d.pagesDone = 5));
    const { drafts } = replanFuture(s, days, today, false);
    expectTiling(drafts, 16, 100);
    expect(drafts[0].chapters![0]).toBe(1); // pág. 16 ainda é do capítulo 1
  });

  it('o equilíbrio não recebe a tarefa de hoje (só amanhã em diante)', () => {
    const { all } = afterOpening();
    const entries = baseFromDrafts(all, today);
    expect(entries.every((e) => e.date > today)).toBe(true);
    expect(entries.length).toBe(all.filter((d) => d.date > today).length);
  });
});
