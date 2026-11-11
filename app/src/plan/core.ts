import type { BaseEntry, Chapter, Level, Part, PlanDay, Study } from '../db/types';
import { addDaysISO, maxISO, weekdayOf, type ISODate } from '../lib/dates';

export const DIFFICULTY_FACTOR: Record<Level, number> = { 1: 1, 2: 1.2, 3: 1.5 };
export const DEFAULT_REVIEW_DAYS: Record<Level, number> = { 1: 1, 2: 2, 3: 3 };

export type PlanStudy = Pick<
  Study,
  | 'pageStart'
  | 'pageEnd'
  | 'chapters'
  | 'splitMode'
  | 'startDate'
  | 'examDate'
  | 'weekdays'
  | 'reviewDays'
>;

export interface DraftDay {
  date: ISODate;
  kind: 'studio' | 'ripasso';
  pageFrom?: number;
  pageTo?: number;
  chapters?: number[];
  part?: Part;
  partial?: boolean;
}

/** 6.1 — datas disponíveis de `from` até o dia anterior à prova. */
export function candidateDates(from: ISODate, examDate: ISODate, weekdays: number[]): ISODate[] {
  const out: ISODate[] = [];
  for (let d = from; d < examDate; d = addDaysISO(d, 1)) {
    if (weekdays.includes(weekdayOf(d))) out.push(d);
  }
  return out;
}

/** 6.1 — os últimos `reviewDays` viram ripasso (sempre sobra ao menos 1 dia de studio). */
export function splitCandidates(cands: ISODate[], reviewDays: number) {
  const r = Math.min(Math.max(0, reviewDays), Math.max(0, cands.length - 1));
  return { studio: cands.slice(0, cands.length - r), ripasso: cands.slice(cands.length - r) };
}

/** 6.2 — páginas restantes / dias restantes, arredondando para cima a cada dia. */
export function distributePages(total: number, days: number): number[] {
  const out: number[] = [];
  let rem = Math.max(0, total);
  for (let i = 0; i < days; i++) {
    const n = Math.ceil(rem / (days - i));
    out.push(n);
    rem -= n;
  }
  return out;
}

export interface ChapterRange {
  n: number;
  from: number;
  to: number;
}

export function chapterRanges(
  chapters: Chapter[],
  pageStart: number,
  pageEnd: number,
): ChapterRange[] {
  const sorted = [...chapters].sort((a, b) => a.startPage - b.startPage);
  return sorted
    .map((c, i) => ({
      n: c.n,
      from: i === 0 ? pageStart : c.startPage,
      to: i < sorted.length - 1 ? sorted[i + 1].startPage - 1 : pageEnd,
    }))
    .filter((r) => r.to >= r.from);
}

export function chaptersIn(ranges: ChapterRange[], from: number, to: number): number[] {
  return ranges.filter((r) => r.from <= to && r.to >= from).map((r) => r.n);
}

export interface Unit {
  chapter: number;
  from: number;
  to: number;
  part?: Part;
}

/** 6.3 — capítulos (a partir de `fromPage`); divide só se > 2× a média. */
export function buildUnits(ranges: ChapterRange[], fromPage: number, avg: number): Unit[] {
  const units: Unit[] = [];
  for (const r of ranges) {
    if (r.to < fromPage) continue;
    const from = Math.max(r.from, fromPage);
    const size = r.to - from + 1;
    if (avg > 0 && size > 2 * avg) {
      const k = Math.ceil(size / avg);
      let p = from;
      distributePages(size, k).forEach((s, i) => {
        units.push({ chapter: r.n, from: p, to: p + s - 1, part: { index: i + 1, total: k } });
        p += s;
      });
    } else {
      units.push({ chapter: r.n, from, to: r.to });
    }
  }
  return units;
}

/**
 * 6.3 — distribuição gulosa: o alvo de cada dia é (páginas restantes / dias restantes);
 * acrescenta capítulos enquanto isso aproxima o dia do alvo. O último dia leva o que sobra.
 */
export function assignUnits(units: Unit[], days: number): Unit[][] {
  const groups: Unit[][] = Array.from({ length: days }, () => []);
  if (days === 0) return groups;
  const size = (u: Unit) => u.to - u.from + 1;
  let remaining = units.reduce((s, u) => s + size(u), 0);
  let i = 0;
  for (let day = 0; day < days; day++) {
    const target = remaining / (days - day);
    let load = 0;
    while (i < units.length) {
      const s = size(units[i]);
      const last = day === days - 1;
      if (!last && groups[day].length > 0 && Math.abs(load + s - target) >= Math.abs(load - target))
        break;
      groups[day].push(units[i]);
      load += s;
      i++;
    }
    remaining -= load;
  }
  return groups;
}

/** Plano individual de um estudo a partir de `fromDate`, começando na página `fromPage`. */
export function buildPlan(study: PlanStudy, fromDate: ISODate, fromPage: number): DraftDay[] {
  const cands = candidateDates(fromDate, study.examDate, study.weekdays);
  const { studio, ripasso } = splitCandidates(cands, study.reviewDays);
  const out: DraftDay[] = [];
  const remaining = Math.max(0, study.pageEnd - fromPage + 1);

  if (remaining > 0 && studio.length > 0) {
    if (study.splitMode === 'capitoli' && study.chapters.length > 0) {
      const ranges = chapterRanges(study.chapters, study.pageStart, study.pageEnd);
      const units = buildUnits(ranges, fromPage, remaining / studio.length);
      assignUnits(units, studio.length).forEach((g, i) => {
        if (g.length === 0) return;
        out.push({
          date: studio[i],
          kind: 'studio',
          pageFrom: g[0].from,
          pageTo: g[g.length - 1].to,
          chapters: [...new Set(g.map((u) => u.chapter))],
          part: g.length === 1 ? g[0].part : undefined,
        });
      });
    } else {
      let p = fromPage;
      distributePages(remaining, studio.length).forEach((n, i) => {
        if (n <= 0) return;
        out.push({ date: studio[i], kind: 'studio', pageFrom: p, pageTo: p + n - 1 });
        p += n;
      });
    }
  }
  for (const d of ripasso) out.push({ date: d, kind: 'ripasso' });
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

export const draftPages = (d: { pageFrom?: number; pageTo?: number }) =>
  d.pageFrom != null && d.pageTo != null ? d.pageTo - d.pageFrom + 1 : 0;

/** Páginas já feitas (todas as tarefas). */
export const pagesDoneTotal = (days: PlanDay[]) =>
  days.reduce((s, d) => s + (d.kind === 'studio' ? d.pagesDone : 0), 0);

export function todayRemaining(days: PlanDay[], today: ISODate): number {
  const t = days.find((d) => d.date === today && d.kind === 'studio');
  if (!t || t.done) return 0;
  return Math.max(0, draftPages(t) - t.pagesDone);
}

/** Primeira página que o plano futuro (a partir de amanhã) deve cobrir. */
export function nextFuturePage(study: PlanStudy, days: PlanDay[], today: ISODate): number {
  return study.pageStart + pagesDoneTotal(days) + todayRemaining(days, today);
}

export function baseFromDrafts(drafts: DraftDay[], today: ISODate): BaseEntry[] {
  return drafts
    .filter((d) => d.kind === 'studio' && d.date > today && d.pageFrom != null)
    .map((d) => ({
      date: d.date,
      pageFrom: d.pageFrom!,
      pages: draftPages(d),
      chapters: d.chapters,
      part: d.part,
    }));
}

/** Plano inicial (cadastro): de max(Inizio, hoje), desde a primeira página. */
export function initialPlan(study: PlanStudy, today: ISODate) {
  const drafts = buildPlan(study, maxISO(study.startDate, today), study.pageStart);
  const studioCount = drafts.filter((d) => d.kind === 'studio').length;
  const total = study.pageEnd - study.pageStart + 1;
  return {
    drafts,
    basePlan: baseFromDrafts(drafts, today),
    basePagesPerDay: studioCount ? Math.ceil(total / studioCount) : total,
  };
}

/**
 * 6.5 — refaz o plano a partir de amanhã com as páginas que faltam.
 * Dias passados e a tarefa de hoje não mudam.
 */
export function replanFuture(study: PlanStudy, days: PlanDay[], today: ISODate) {
  const fromDate = maxISO(study.startDate, addDaysISO(today, 1));
  const drafts = buildPlan(study, fromDate, nextFuturePage(study, days, today));
  return { drafts, basePlan: baseFromDrafts(drafts, today) };
}

/** Recria as faixas de páginas a partir das novas quantidades por dia. */
export function rebuildFromCounts(
  study: Pick<Study, 'chapters' | 'pageStart' | 'pageEnd' | 'basePlan'>,
  counts: { date: ISODate; pages: number }[],
): DraftDay[] {
  const base = [...study.basePlan].sort((a, b) => a.date.localeCompare(b.date));
  if (base.length === 0) return [];
  const byDate = new Map(base.map((b) => [b.date, b]));
  const ranges = chapterRanges(study.chapters, study.pageStart, study.pageEnd);
  let p = base[0].pageFrom;
  const out: DraftDay[] = [];
  for (const c of [...counts].sort((a, b) => a.date.localeCompare(b.date))) {
    if (c.pages <= 0) continue;
    const from = p;
    const to = p + c.pages - 1;
    p = to + 1;
    const b = byDate.get(c.date);
    const same = b && b.pageFrom === from && b.pages === c.pages;
    const inRange = ranges.filter((r) => r.from <= to && r.to >= from);
    const whole = inRange.every((r) => r.from >= from && r.to <= to);
    out.push({
      date: c.date,
      kind: 'studio',
      pageFrom: from,
      pageTo: to,
      chapters: same ? b.chapters : ranges.length ? chaptersIn(ranges, from, to) : undefined,
      part: same ? b.part : undefined,
      partial: !same && inRange.length > 0 && !whole ? true : undefined,
    });
  }
  return out;
}
