import { coinsPerPomodoro, db, DEFAULT_SETTINGS } from '../db/db';
import { api, API_URL } from './api';
import { toISO } from './dates';
import { playEndSound } from './sound';
import {
  autoPauseIfDone,
  currentWorkEnd,
  pomodoroEndTime,
  pomodoroOutcome,
  type TimerConfig,
  type TimerState,
} from './timer';
import { getTimer, setTimer } from './timerStore';
import { pomodoroAwards, pomodoroRef } from '../plan/coins';

export async function timerConfig(): Promise<TimerConfig> {
  const s = await db.settings.get(1);
  return {
    workMin: s?.pomodoroWork ?? DEFAULT_SETTINGS.pomodoroWork,
    breakMin: s?.pomodoroBreak ?? DEFAULT_SETTINGS.pomodoroBreak,
  };
}

/** Animação "+10": a tela escuta este evento. */
export const COIN_EVENT = 'ema-coins';
const burst = (amount: number) =>
  window.dispatchEvent(new CustomEvent(COIN_EVENT, { detail: { amount } }));

/**
 * Fecha os pomodoros: credita as moedinhas (uma vez só por pomodoro), toca o som se o fim foi
 * agora com o app na tela, cancela a notificação e para o relógio no fim da pausa.
 * Chamado a cada segundo enquanto o cronômetro roda e quando o app volta para a tela.
 */
export async function settlePomodoro(
  now = Date.now(),
  visible = document.visibilityState === 'visible',
) {
  const s = getTimer();
  if (!s || s.mode !== 'pomodoro') return;
  const cfg = await timerConfig();
  const out = pomodoroOutcome(s, now, cfg, visible);
  let next: TimerState = s;

  if (out.newOnes > 0) {
    const settings = await db.settings.get(1);
    const coins = coinsPerPomodoro(settings);
    await db.transaction('rw', db.coins, async () => {
      const refs = new Set(
        (await db.coins.filter((c) => c.reason === 'pomodoro').toArray())
          .map((c) => c.ref)
          .filter((r): r is string => !!r),
      );
      const entries = pomodoroAwards(
        s.sessionStart,
        out.completed,
        s.awarded ?? 0,
        refs,
        coins,
        (k) => toISO(new Date(pomodoroEndTime(s, k, cfg) ?? now)),
      );
      if (entries.length) await db.coins.bulkAdd(entries);
    });
    next = { ...next, awarded: out.completed };
    if (out.playSound) playEndSound();
    if (out.cancelAlert) void cancelPomodoroAlert();
    if (visible && coins > 0) burst(coins * out.newOnes);
  }

  const paused = autoPauseIfDone(next, now, cfg);
  if (paused !== next && visible) navigator.vibrate?.(150);
  next = paused;
  if (next !== s) setTimer(next);
}

// ---------- notificação de fim (agendada no Worker) ----------

async function canNotify() {
  if (!API_URL) return null;
  const s = await db.settings.get(1);
  if (!s?.accessCode || !s.notifications) return null;
  return s;
}

/** Agenda no Worker a notificação do fim do estudo em andamento (ou cancela, se não está estudando). */
export async function syncPomodoroAlert(s: TimerState | null = getTimer(), now = Date.now()) {
  const settings = await canNotify();
  if (!settings) return;
  const end = s ? currentWorkEnd(s, now, await timerConfig()) : null;
  if (end == null) return void cancelPomodoroAlert();
  await api('/api/pomodoro', 'PUT', {
    deviceId: settings.deviceId,
    endsAt: Math.round(end),
    studyId: s!.studyId,
    coins: coinsPerPomodoro(settings),
  });
}

export async function cancelPomodoroAlert() {
  const settings = await canNotify();
  if (!settings) return;
  await api('/api/pomodoro', 'DELETE', { deviceId: settings.deviceId });
}

export { pomodoroRef };
