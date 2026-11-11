export type TimerMode = 'pomodoro' | 'libero';

/** Estado persistido do cronômetro (tudo em ms de relógio, nada de contagem por setInterval). */
export interface TimerState {
  studyId: number;
  mode: TimerMode;
  running: boolean;
  /** Início do trecho em andamento (Date.now()); null se pausado. */
  startedAt: number | null;
  /** Tempo acumulado em trechos anteriores. */
  accMs: number;
  /** Início da sessão (ISO), para gravar a data. */
  sessionStart: string;
}

export interface TimerConfig {
  workMin: number;
  breakMin: number;
}

export interface TimerView {
  elapsedMs: number;
  phase: 'studio' | 'pausa' | 'libero';
  /** Posição dentro da fase atual (ms) e tamanho dela (null no modo livre). */
  phaseMs: number;
  phaseTotalMs: number | null;
  /** Tempo realmente estudado (pausas do pomodoro não contam). */
  studiedMs: number;
  /** Índice da fase (muda a cada troca estudo↔pausa), para disparar o aviso. */
  phaseIndex: number;
}

export const elapsedMs = (s: TimerState, now: number): number =>
  s.accMs + (s.running && s.startedAt != null ? Math.max(0, now - s.startedAt) : 0);

export function timerView(s: TimerState, now: number, cfg: TimerConfig): TimerView {
  const elapsed = elapsedMs(s, now);
  if (s.mode === 'libero') {
    return {
      elapsedMs: elapsed,
      phase: 'libero',
      phaseMs: elapsed,
      phaseTotalMs: null,
      studiedMs: elapsed,
      phaseIndex: 0,
    };
  }
  const work = Math.max(1, cfg.workMin) * 60_000;
  const brk = Math.max(0, cfg.breakMin) * 60_000;
  const cycle = work + brk;
  const cycles = Math.floor(elapsed / cycle);
  const pos = elapsed - cycles * cycle;
  const inWork = pos < work;
  return {
    elapsedMs: elapsed,
    phase: inWork ? 'studio' : 'pausa',
    phaseMs: inWork ? pos : pos - work,
    phaseTotalMs: inWork ? work : brk,
    studiedMs: cycles * work + Math.min(pos, work),
    phaseIndex: cycles * 2 + (inWork ? 0 : 1),
  };
}

export const startTimer = (studyId: number, mode: TimerMode, now: number): TimerState => ({
  studyId,
  mode,
  running: true,
  startedAt: now,
  accMs: 0,
  sessionStart: new Date(now).toISOString(),
});

export const pauseTimer = (s: TimerState, now: number): TimerState => ({
  ...s,
  running: false,
  startedAt: null,
  accMs: elapsedMs(s, now),
});

export const resumeTimer = (s: TimerState, now: number): TimerState => ({
  ...s,
  running: true,
  startedAt: now,
});

export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(sec).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

const KEY = 'ema-timer';

export function loadTimer(): TimerState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as TimerState;
    return typeof s.studyId === 'number' && (s.mode === 'pomodoro' || s.mode === 'libero')
      ? s
      : null;
  } catch {
    return null;
  }
}

export function saveTimer(s: TimerState | null) {
  try {
    if (s) localStorage.setItem(KEY, JSON.stringify(s));
    else localStorage.removeItem(KEY);
  } catch {
    /* sem armazenamento: o cronômetro funciona só enquanto o app está aberto */
  }
}
