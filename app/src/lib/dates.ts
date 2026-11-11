import { addDays, differenceInCalendarDays, format, getISODay, parseISO } from 'date-fns';
import { it } from 'date-fns/locale';

/** Data local no formato yyyy-MM-dd. */
export type ISODate = string;

export const toISO = (d: Date): ISODate => format(d, 'yyyy-MM-dd');
export const todayISO = (now: Date = new Date()): ISODate => toISO(now);
export const addDaysISO = (d: ISODate, n: number): ISODate => toISO(addDays(parseISO(d), n));
/** 1 = lunedì … 7 = domenica */
export const weekdayOf = (d: ISODate): number => getISODay(parseISO(d));
/** Dias de calendário de `a` até `b` (b − a). */
export const daysBetween = (a: ISODate, b: ISODate): number =>
  differenceInCalendarDays(parseISO(b), parseISO(a));
export const maxISO = (a: ISODate, b: ISODate): ISODate => (a > b ? a : b);

export function formatLongIt(d: Date): string {
  const s = format(d, 'EEEE, d MMMM', { locale: it });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function greeting(now: Date = new Date()): string {
  const h = now.getHours();
  if (h >= 5 && h < 12) return 'Buongiorno, Ema';
  if (h >= 12 && h < 18) return 'Buon pomeriggio, Ema';
  return 'Buonasera, Ema';
}
