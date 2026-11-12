import { describe, expect, it } from 'vitest';
import {
  autoPauseIfDone,
  completedPomodoros,
  currentWorkEnd,
  FRESH_END_MS,
  nextPomodoro,
  pauseTimer,
  pomodoroEndTime,
  pomodoroOutcome,
  resumeTimer,
  startTimer,
  timerView,
  type TimerState,
} from '../lib/timer';
import { pomodoroAwards, pomodoroRef } from './coins';

const MIN = 60_000;
const cfg = { workMin: 25, breakMin: 5 };
const T0 = Date.UTC(2026, 10, 12, 9, 0, 0);

describe('pomodoro completo = fim dos 25 min de estudo', () => {
  it('só conta quando os 25 min terminam (não a pausa)', () => {
    const s = startTimer(1, 'pomodoro', T0);
    expect(completedPomodoros(s, T0 + 24 * MIN + 59_000, cfg)).toBe(0);
    expect(completedPomodoros(s, T0 + 25 * MIN, cfg)).toBe(1);
    expect(completedPomodoros(s, T0 + 29 * MIN, cfg)).toBe(1); // durante a pausa
  });
  it('pausado e retomado conta normalmente', () => {
    let s = startTimer(1, 'pomodoro', T0);
    s = pauseTimer(s, T0 + 10 * MIN, cfg); // estudou 10
    s = resumeTimer(s, T0 + 60 * MIN); // voltou 50 min depois
    expect(completedPomodoros(s, T0 + 60 * MIN + 14 * MIN, cfg)).toBe(0);
    expect(completedPomodoros(s, T0 + 60 * MIN + 15 * MIN, cfg)).toBe(1);
    expect(pomodoroEndTime(s, 0, cfg)).toBe(T0 + 75 * MIN);
  });
  it('parado antes do fim não dá moedas', () => {
    const s = startTimer(1, 'pomodoro', T0);
    const stopped = pauseTimer(s, T0 + 20 * MIN, cfg);
    expect(completedPomodoros(stopped, T0 + 3 * 60 * MIN, cfg)).toBe(0);
  });
  it('modo Libero nunca conta pomodoros', () => {
    const s = startTimer(1, 'libero', T0);
    expect(completedPomodoros(s, T0 + 120 * MIN, cfg)).toBe(0);
    expect(currentWorkEnd(s, T0, cfg)).toBeNull();
  });
});

describe('depois da pausa, o relógio para (não rende moedas sozinho)', () => {
  it('esquecido rodando por horas: 1 pomodoro só, parado esperando "Inizia"', () => {
    const s = startTimer(1, 'pomodoro', T0);
    expect(completedPomodoros(s, T0 + 5 * 60 * MIN, cfg)).toBe(1);
    expect(timerView(s, T0 + 5 * 60 * MIN, cfg)).toMatchObject({
      waitingNext: true,
      studiedMs: 25 * MIN,
    });
    const paused = autoPauseIfDone(s, T0 + 31 * MIN, cfg);
    expect(paused).toMatchObject({ running: false, accMs: 30 * MIN });
    expect(autoPauseIfDone(s, T0 + 29 * MIN, cfg)).toBe(s); // ainda na pausa: continua
  });
  it('"Inizia" depois da pausa começa o próximo pomodoro', () => {
    let s = startTimer(1, 'pomodoro', T0);
    s = autoPauseIfDone(s, T0 + 31 * MIN, cfg);
    s = nextPomodoro(s, T0 + 40 * MIN, cfg);
    expect(s.pomodoros).toBe(2);
    expect(completedPomodoros(s, T0 + 64 * MIN, cfg)).toBe(1);
    expect(completedPomodoros(s, T0 + 65 * MIN, cfg)).toBe(2);
  });
});

describe('horário de fim para a notificação', () => {
  it('ao iniciar: agenda para daqui a 25 min', () => {
    expect(currentWorkEnd(startTimer(1, 'pomodoro', T0), T0, cfg)).toBe(T0 + 25 * MIN);
  });
  it('pausado: nada agendado; ao retomar, reagenda pelo que falta', () => {
    let s = startTimer(1, 'pomodoro', T0);
    s = pauseTimer(s, T0 + 10 * MIN, cfg);
    expect(currentWorkEnd(s, T0 + 10 * MIN, cfg)).toBeNull();
    s = resumeTimer(s, T0 + 30 * MIN);
    expect(currentWorkEnd(s, T0 + 30 * MIN, cfg)).toBe(T0 + 45 * MIN); // faltavam 15
  });
  it('durante a pausa não há notificação a agendar', () => {
    const s = startTimer(1, 'pomodoro', T0);
    expect(currentWorkEnd(s, T0 + 27 * MIN, cfg)).toBeNull();
  });
});

describe('som e notificação: nunca as duas coisas', () => {
  const s = startTimer(1, 'pomodoro', T0);
  const end = T0 + 25 * MIN;
  it('acabou agora com o app na tela → toca o som e cancela a notificação', () => {
    expect(pomodoroOutcome(s, end + 500, cfg, true)).toMatchObject({
      newOnes: 1,
      playSound: true,
      cancelAlert: true,
    });
  });
  it('app em segundo plano → sem som nem cancelamento (a notificação do servidor avisa)', () => {
    expect(pomodoroOutcome(s, end + 500, cfg, false)).toMatchObject({
      newOnes: 1,
      playSound: false,
      cancelAlert: false,
    });
  });
  it('voltou ao app depois: credita as moedas, mas não toca som atrasado', () => {
    expect(pomodoroOutcome(s, end + FRESH_END_MS + 60_000, cfg, true)).toMatchObject({
      newOnes: 1,
      playSound: false,
      cancelAlert: false,
    });
  });
  it('já creditado: nada novo', () => {
    const done: TimerState = { ...s, awarded: 1 };
    expect(pomodoroOutcome(done, end + 1000, cfg, true)).toMatchObject({
      newOnes: 0,
      playSound: false,
    });
  });
});

describe('+10 por pomodoro completo, uma vez só', () => {
  const start = '2026-11-12T09:00:00.000Z';
  const date = () => '2026-11-12';
  it('cada pomodoro completo rende o valor configurado', () => {
    expect(pomodoroAwards(start, 2, 0, new Set(), 10, date)).toEqual([
      { date: '2026-11-12', amount: 10, reason: 'pomodoro', ref: pomodoroRef(start, 0) },
      { date: '2026-11-12', amount: 10, reason: 'pomodoro', ref: pomodoroRef(start, 1) },
    ]);
  });
  it('não credita de novo (nem se o app reabrir e o estado não tiver sido salvo)', () => {
    expect(pomodoroAwards(start, 2, 1, new Set(), 10, date)).toHaveLength(1);
    expect(
      pomodoroAwards(
        start,
        2,
        0,
        new Set([pomodoroRef(start, 0), pomodoroRef(start, 1)]),
        10,
        date,
      ),
    ).toEqual([]);
  });
  it('valor 0 em Impostazioni: não gera entrada', () => {
    expect(pomodoroAwards(start, 1, 0, new Set(), 0, date)).toEqual([]);
  });
});
