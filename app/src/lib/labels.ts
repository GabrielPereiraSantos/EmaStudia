import type { PlanDay, StudyType } from '../db/types';
import { daysBetween, type ISODate } from './dates';

export const TYPE_LABEL: Record<StudyType, string> = {
  esatte: 'Esatte',
  umanistiche: 'Umanistiche',
  biologiche: 'Biologiche',
  lingue: 'Lingue',
};

export const TYPE_STYLE: Record<StudyType, { bg: string; fg: string }> = {
  esatte: { bg: '#3E6CC4', fg: '#FFFFFF' },
  umanistiche: { bg: '#FBD3E6', fg: '#9C2F66' },
  biologiche: { bg: '#D6F2D9', fg: '#2E6B38' },
  lingue: { bg: '#D5C2EE', fg: '#5A2E91' },
};

export function taskText(
  d: Pick<PlanDay, 'kind' | 'pageFrom' | 'pageTo' | 'chapters' | 'part' | 'partial'>,
  mode: 'pagine' | 'capitoli',
): string {
  if (d.kind === 'ripasso') return 'Ripasso generale';
  if (mode === 'capitoli' && d.chapters?.length) {
    const pages = d.partial && d.pageFrom != null ? ` · pag. ${d.pageFrom}–${d.pageTo}` : '';
    if (d.chapters.length === 1) {
      const p = d.part ? ` – parte ${d.part.index}/${d.part.total}` : '';
      return `capitolo ${d.chapters[0]}${p}${pages}`;
    }
    return `capitoli ${d.chapters[0]}–${d.chapters[d.chapters.length - 1]}${pages}`;
  }
  if (d.pageFrom == null || d.pageTo == null) return '';
  return d.pageFrom === d.pageTo ? `pagina ${d.pageFrom}` : `pagine ${d.pageFrom}–${d.pageTo}`;
}

export function examIn(today: ISODate, exam: ISODate): string {
  const n = daysBetween(today, exam);
  if (n <= 0) return 'esame oggi';
  if (n === 1) return 'esame domani';
  return `esame tra ${n} giorni`;
}
