import { addDays, endOfMonth, endOfWeek, startOfMonth, startOfWeek } from 'date-fns';
import { toISO, type ISODate } from './dates';

/** Células do mês, com segunda-feira na primeira coluna (semanas completas). */
export function monthCells(year: number, month: number): { date: ISODate; inMonth: boolean }[] {
  const first = startOfMonth(new Date(year, month, 1));
  const last = endOfMonth(first);
  const out: { date: ISODate; inMonth: boolean }[] = [];
  for (
    let d = startOfWeek(first, { weekStartsOn: 1 });
    d <= endOfWeek(last, { weekStartsOn: 1 });
    d = addDays(d, 1)
  ) {
    out.push({ date: toISO(d), inMonth: d.getMonth() === month });
  }
  return out;
}

export const monthKey = (year: number, month: number) => ({
  year: year + Math.floor(month / 12),
  month: ((month % 12) + 12) % 12,
});
