import type { Chapter, SplitMode, StudyType } from '../db/types';
import { candidateDates } from '../plan/core';
import { maxISO, type ISODate } from './dates';

export interface StudyDraft {
  subject: string;
  type: StudyType | null;
  pageStart: number;
  pageEnd: number;
  chapters: Chapter[];
  splitMode: SplitMode;
  startDate: ISODate;
  examDate: ISODate;
  weekdays: number[];
  reviewDays: number;
  materials: { title: string; url: string }[];
}

export const isSafeUrl = (u: string) => {
  try {
    const p = new URL(u.trim());
    return p.protocol === 'https:' || p.protocol === 'http:';
  } catch {
    return false;
  }
};

/** Validações do cadastro (5.2). Devolve mensagens em italiano; vazio = ok. */
export function validateStudy(d: StudyDraft, today: ISODate): string[] {
  const e: string[] = [];
  if (!d.subject.trim()) e.push('Scrivi il nome della materia.');
  if (!d.type) e.push('Scegli il tipo di materia.');
  if (!Number.isInteger(d.pageStart) || !Number.isInteger(d.pageEnd) || d.pageStart < 0)
    e.push('Scrivi la pagina iniziale e quella finale.');
  else if (d.pageEnd < d.pageStart)
    e.push('La pagina finale deve essere uguale o maggiore di quella iniziale.');
  if (!d.startDate || !d.examDate) e.push("Scegli la data di inizio e quella dell'esame.");
  else if (d.examDate <= d.startDate) e.push("La data dell'esame deve essere dopo l'inizio.");
  if (d.weekdays.length === 0) e.push('Scegli almeno un giorno disponibile.');
  if (!Number.isInteger(d.reviewDays) || d.reviewDays < 0)
    e.push('I giorni di ripasso devono essere 0 o più.');

  if (d.splitMode === 'capitoli' && d.chapters.length === 0)
    e.push('Aggiungi almeno un capitolo, oppure dividi per pagine.');
  if (d.chapters.length) {
    const sorted = [...d.chapters].sort((a, b) => a.startPage - b.startPage);
    const okRange = sorted.every(
      (c) =>
        Number.isInteger(c.startPage) && c.startPage >= d.pageStart && c.startPage <= d.pageEnd,
    );
    const unique = new Set(sorted.map((c) => c.startPage)).size === sorted.length;
    const uniqueN = new Set(sorted.map((c) => c.n)).size === sorted.length;
    if (!okRange || !unique)
      e.push('Ogni capitolo deve iniziare in una pagina diversa, dentro le pagine dello studio.');
    if (!uniqueN) e.push('I numeri dei capitoli devono essere diversi.');
  }
  if (d.materials.some((m) => !isSafeUrl(m.url)))
    e.push('I link dei materiali devono iniziare con https:// o http://.');

  if (e.length === 0) {
    const cands = candidateDates(maxISO(d.startDate, today), d.examDate, d.weekdays);
    if (cands.length <= d.reviewDays) {
      e.push(
        cands.length === 0
          ? "Non ci sono giorni disponibili prima dell'esame. Aggiungi qualche giorno o sposta la data dell'esame."
          : `Ci sono solo ${cands.length} giorni disponibili e ${d.reviewDays} di ripasso: non resta tempo per studiare. ` +
              "Prova ad aggiungere giorni, ridurre il ripasso o spostare l'esame.",
      );
    }
  }
  return e;
}
