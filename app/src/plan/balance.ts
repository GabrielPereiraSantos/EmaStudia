import type { Level } from '../db/types';
import type { ISODate } from '../lib/dates';
import { DIFFICULTY_FACTOR } from './core';

export interface BalanceStudy {
  id: number;
  priority: Level;
  difficulty: Level;
  examDate: ISODate;
  /** Datas de studio permitidas (disponíveis, antes do ripasso, a partir de amanhã). */
  dates: ISODate[];
}

export interface BalanceTask {
  studyId: number;
  date: ISODate;
  pages: number;
}

const EPS = 1e-9;

/**
 * 6.4 — Equilíbrio entre provas (função pura).
 * Carga = páginas × fator de dificuldade. Média = carga total / dias com carga.
 * Para cada dia acima de 1,5× a média, move páginas do estudo de menor prioridade
 * para dias permitidos anteriores (do próprio estudo) que fiquem abaixo do limite.
 * Prioridade mais alta só cede se as mais baixas não resolverem.
 */
export function balanceLoad(studies: BalanceStudy[], tasks: BalanceTask[]): BalanceTask[] {
  const meta = new Map(studies.map((s) => [s.id, s]));
  const pages = new Map<number, Map<ISODate, number>>();
  for (const s of studies) pages.set(s.id, new Map());
  for (const t of tasks) {
    const m = pages.get(t.studyId);
    if (!m) continue;
    m.set(t.date, (m.get(t.date) ?? 0) + t.pages);
  }
  const factor = (id: number) => DIFFICULTY_FACTOR[meta.get(id)!.difficulty];
  const loadOf = (date: ISODate) => {
    let l = 0;
    for (const [id, m] of pages) l += (m.get(date) ?? 0) * factor(id);
    return l;
  };
  const allDates = () => {
    const set = new Set<ISODate>();
    for (const m of pages.values()) for (const [d, n] of m) if (n > 0) set.add(d);
    return [...set];
  };

  const stuck = new Set<ISODate>();
  for (let iter = 0; iter < 10000; iter++) {
    const dates = allDates();
    if (dates.length === 0) break;
    const loads = new Map(dates.map((d) => [d, loadOf(d)]));
    const total = [...loads.values()].reduce((a, b) => a + b, 0);
    const thr = 1.5 * (total / dates.length);
    const over = dates
      .filter((d) => !stuck.has(d) && loads.get(d)! > thr + EPS)
      .sort((a, b) => loads.get(b)! - loads.get(a)! || a.localeCompare(b));
    if (over.length === 0) break;
    const day = over[0];

    const cands = studies
      .filter((s) => (pages.get(s.id)!.get(day) ?? 0) > 0)
      .sort(
        (a, b) => a.priority - b.priority || b.examDate.localeCompare(a.examDate) || a.id - b.id,
      );

    let moved = false;
    for (const s of cands) {
      const m = pages.get(s.id)!;
      const f = factor(s.id);
      const excess = loadOf(day) - thr;
      if (excess <= EPS) break;
      let toMove = Math.min(m.get(day)!, Math.ceil(excess / f - EPS));
      const dests = s.dates
        .filter((d) => d < day)
        .sort((a, b) => loadOf(a) - loadOf(b) || b.localeCompare(a));
      for (const dest of dests) {
        if (toMove <= 0) break;
        const can = Math.min(toMove, Math.floor((thr - loadOf(dest)) / f + EPS));
        if (can <= 0) continue;
        m.set(dest, (m.get(dest) ?? 0) + can);
        m.set(day, m.get(day)! - can);
        toMove -= can;
        moved = true;
      }
    }
    if (!moved) stuck.add(day);
  }

  const out: BalanceTask[] = [];
  for (const [studyId, m] of pages)
    for (const [date, n] of m) if (n > 0) out.push({ studyId, date, pages: n });
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.studyId - b.studyId);
}
