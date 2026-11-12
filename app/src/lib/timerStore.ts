import { useSyncExternalStore } from 'react';
import { loadTimer, saveTimer, type TimerState } from './timer';

/** Estado do cronômetro compartilhado entre a tela do estudo e o "fechamento" dos pomodoros. */
let state: TimerState | null = loadTimer();
const listeners = new Set<() => void>();

export const getTimer = () => state;

export function setTimer(next: TimerState | null) {
  state = next;
  saveTimer(next);
  listeners.forEach((l) => l());
}

export function useTimerState(): TimerState | null {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
  );
}
