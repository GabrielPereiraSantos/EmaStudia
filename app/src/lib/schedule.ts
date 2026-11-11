import type { Note, PlanDay, Settings, Study } from '../db/types';
import { addDaysISO, type ISODate } from './dates';

/** Quantos dias à frente vão para o servidor (o app reenvia sempre que algo muda). */
export const SCHEDULE_DAYS = 60;

export interface SchedulePayload {
  deviceId: string;
  timezone: string;
  reminders: {
    studyId: number;
    subject: string;
    time: string;
    dates: ISODate[];
    reviewDates: ISODate[];
  }[];
  notes: Record<string, string[]>;
}

/**
 * Agenda mínima (seção 9): só matéria, datas, horário e notas. Respeita
 * "Notifiche" (desligado = agenda vazia) e "Includi le note".
 */
export function buildSchedule(
  studies: Study[],
  days: PlanDay[],
  notes: Note[],
  settings: Pick<Settings, 'deviceId' | 'notifications' | 'includeNotes'>,
  today: ISODate,
  timezone: string,
): SchedulePayload {
  const base = { deviceId: settings.deviceId, timezone, reminders: [], notes: {} };
  if (!settings.notifications) return base;
  const until = addDaysISO(today, SCHEDULE_DAYS);
  const active = studies.filter((s) => !s.archived && s.id != null && s.examDate >= today);
  const reminders = active
    .map((s) => {
      const mine = days
        .filter((d) => d.studyId === s.id && d.date >= today && d.date <= until && !d.done)
        .sort((a, b) => a.date.localeCompare(b.date));
      return {
        studyId: s.id!,
        subject: s.subject.slice(0, 60),
        time: s.reminderTime,
        dates: mine.map((d) => d.date),
        reviewDates: mine.filter((d) => d.kind === 'ripasso').map((d) => d.date),
      };
    })
    .filter((r) => r.dates.length > 0);
  const out: Record<string, string[]> = {};
  if (settings.includeNotes) {
    for (const r of reminders) {
      const texts = notes
        .filter((n) => n.studyId === r.studyId)
        .map((n) => n.text.slice(0, 280))
        .filter(Boolean);
      if (texts.length) out[String(r.studyId)] = texts.slice(0, 50);
    }
  }
  return { ...base, reminders, notes: out };
}
