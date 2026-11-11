import { liveQuery } from 'dexie';
import { db } from '../db/db';
import { api, API_URL } from './api';
import { todayISO } from './dates';
import { buildSchedule } from './schedule';

const KEY = 'ema-sync';
let timer: ReturnType<typeof setTimeout> | undefined;

/** Envia a agenda ao Worker se mudou desde o último envio bem-sucedido. */
export async function syncSchedule(force = false): Promise<boolean> {
  if (!API_URL) return false;
  const settings = await db.settings.get(1);
  if (!settings?.accessCode || !settings.welcomeDone) return false;
  const [studies, days, notes] = await Promise.all([
    db.studies.toArray(),
    db.planDays.toArray(),
    db.notes.toArray(),
  ]);
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const payload = buildSchedule(studies, days, notes, settings, todayISO(), tz);
  const body = JSON.stringify(payload);
  let last: string | null = null;
  try {
    last = localStorage.getItem(KEY);
  } catch {
    /* sem armazenamento: envia sempre */
  }
  if (!force && last === body) return true;
  const r = await api('/api/schedule', 'PUT', payload);
  if (r.ok) {
    try {
      localStorage.setItem(KEY, body);
    } catch {
      /* ignora */
    }
  }
  return r.ok;
}

/** Reenvia (com um pequeno atraso) sempre que plano, notas, estudos ou configurações mudam. */
export function startAutoSync(): () => void {
  const sub = liveQuery(async () => {
    // lê as tabelas só para o Dexie observar as mudanças; o valor muda a cada execução
    await Promise.all([
      db.studies.count(),
      db.planDays.count(),
      db.notes.count(),
      db.settings.get(1),
    ]);
    return Date.now();
  }).subscribe({
    next: () => {
      clearTimeout(timer);
      timer = setTimeout(() => void syncSchedule(), 2000);
    },
  });
  const onOnline = () => void syncSchedule();
  window.addEventListener('online', onOnline);
  return () => {
    sub.unsubscribe();
    window.removeEventListener('online', onOnline);
    clearTimeout(timer);
  };
}
