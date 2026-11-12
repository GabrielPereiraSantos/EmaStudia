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
  /** Pomodoro: quantos pomodoros ela já iniciou nesta sessão (o tempo para no fim da pausa do último). */
  pomodoros?: number;
  /** Pomodoro: quantos pomodoros completos já renderam moedinhas. */
  awarded?: number;
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
  /** Pomodoro: a pausa acabou e o tempo parou; "Inizia" começa o próximo pomodoro. */
  waitingNext: boolean;
}

export const elapsedMs = (s: TimerState, now: number): number =>
  s.accMs + (s.running && s.startedAt != null ? Math.max(0, now - s.startedAt) : 0);

export const phaseLengths = (cfg: TimerConfig) => {
  const work = Math.max(1, cfg.workMin) * 60_000;
  const brk = Math.max(0, cfg.breakMin) * 60_000;
  return { work, brk, cycle: work + brk };
};

/**
 * Pomodoro: o relógio para no fim da pausa do pomodoro atual (ela toca "Inizia" para o próximo).
 * Assim um pomodoro esquecido rodando não fica rendendo moedinhas sozinho.
 */
export function cappedElapsed(s: TimerState, now: number, cfg: TimerConfig): number {
  const e = elapsedMs(s, now);
  if (s.mode !== 'pomodoro') return e;
  return Math.min(e, (s.pomodoros ?? 1) * phaseLengths(cfg).cycle);
}

export function timerView(s: TimerState, now: number, cfg: TimerConfig): TimerView {
  const elapsed = cappedElapsed(s, now, cfg);
  if (s.mode === 'libero') {
    return {
      elapsedMs: elapsed,
      phase: 'libero',
      phaseMs: elapsed,
      phaseTotalMs: null,
      studiedMs: elapsed,
      phaseIndex: 0,
      waitingNext: false,
    };
  }
  const { work, brk, cycle } = phaseLengths(cfg);
  const limit = (s.pomodoros ?? 1) * cycle;
  if (elapsed >= limit) {
    // pausa do último pomodoro terminada: parado esperando o próximo
    return {
      elapsedMs: elapsed,
      phase: 'pausa',
      phaseMs: brk,
      phaseTotalMs: brk,
      studiedMs: (s.pomodoros ?? 1) * work,
      phaseIndex: (s.pomodoros ?? 1) * 2 - 1,
      waitingNext: true,
    };
  }
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
    waitingNext: false,
  };
}

/** Pomodoros de estudo completos (fim dos 25 min, não da pausa). Parar antes do fim não conta. */
export function completedPomodoros(s: TimerState, now: number, cfg: TimerConfig): number {
  if (s.mode !== 'pomodoro') return 0;
  const { work, cycle } = phaseLengths(cfg);
  const e = cappedElapsed(s, now, cfg);
  if (e < work) return 0;
  return Math.min(s.pomodoros ?? 1, Math.floor((e - work) / cycle) + 1);
}

/**
 * Horário (epoch ms) em que o k-ésimo pomodoro (0 = primeiro) terminou ou vai terminar,
 * se dá para saber pelo trecho em andamento; null se terminou num trecho anterior (antes de uma pausa).
 */
export function pomodoroEndTime(s: TimerState, k: number, cfg: TimerConfig): number | null {
  const { work, cycle } = phaseLengths(cfg);
  const point = k * cycle + work;
  if (!s.running || s.startedAt == null || point < s.accMs) return null;
  return s.startedAt + (point - s.accMs);
}

/** Fim do estudo em andamento (para agendar a notificação); null se não está estudando agora. */
export function currentWorkEnd(s: TimerState, now: number, cfg: TimerConfig): number | null {
  if (s.mode !== 'pomodoro' || !s.running) return null;
  const v = timerView(s, now, cfg);
  if (v.phase !== 'studio' || v.waitingNext) return null;
  return now + (v.phaseTotalMs! - v.phaseMs);
}

/** Fim detectado com o app na tela há no máximo isto: toca o som e cancela a notificação. */
export const FRESH_END_MS = 4000;

/**
 * O que fazer quando pomodoros terminam:
 * - quantos pomodoros completos são novos (para creditar as moedinhas);
 * - se o último acabou AGORA com o app na tela: toca o som e cancela a notificação do servidor
 *   (assim ela não recebe as duas coisas). Se o app estava fechado, a notificação já foi.
 */
export function pomodoroOutcome(s: TimerState, now: number, cfg: TimerConfig, visible: boolean) {
  const completed = completedPomodoros(s, now, cfg);
  const newOnes = Math.max(0, completed - (s.awarded ?? 0));
  const end = newOnes > 0 ? pomodoroEndTime(s, completed - 1, cfg) : null;
  const justNow = end != null && now - end >= 0 && now - end <= FRESH_END_MS;
  return { completed, newOnes, playSound: visible && justNow, cancelAlert: visible && justNow };
}

export const startTimer = (studyId: number, mode: TimerMode, now: number): TimerState => ({
  studyId,
  mode,
  running: true,
  startedAt: now,
  accMs: 0,
  sessionStart: new Date(now).toISOString(),
  ...(mode === 'pomodoro' ? { pomodoros: 1, awarded: 0 } : {}),
});

export const pauseTimer = (s: TimerState, now: number, cfg?: TimerConfig): TimerState => ({
  ...s,
  running: false,
  startedAt: null,
  accMs: cfg ? cappedElapsed(s, now, cfg) : elapsedMs(s, now),
});

export const resumeTimer = (s: TimerState, now: number): TimerState => ({
  ...s,
  running: true,
  startedAt: now,
});

/** "Inizia" depois da pausa: começa o próximo pomodoro. */
export const nextPomodoro = (s: TimerState, now: number, cfg: TimerConfig): TimerState => ({
  ...s,
  accMs: cappedElapsed(s, now, cfg),
  pomodoros: (s.pomodoros ?? 1) + 1,
  running: true,
  startedAt: now,
});

/** Chegou ao fim da pausa: para o relógio (ele não continua contando sozinho). */
export function autoPauseIfDone(s: TimerState, now: number, cfg: TimerConfig): TimerState {
  if (s.mode !== 'pomodoro' || !s.running) return s;
  const limit = (s.pomodoros ?? 1) * phaseLengths(cfg).cycle;
  return elapsedMs(s, now) >= limit ? { ...s, running: false, startedAt: null, accMs: limit } : s;
}

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
