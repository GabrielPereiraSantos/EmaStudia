import { describe, expect, it } from 'vitest';
import {
  addableWeekday,
  addWeekdayLabel,
  faceFor,
  secondsByDate,
  STUDIED_SEC,
  totalSeconds,
} from './study';
import { formatClock, pauseTimer, resumeTimer, startTimer, timerView } from '../lib/timer';

const cfg = { workMin: 25, breakMin: 5 };
const MIN = 60_000;

describe('cronômetro (calculado pela hora, não por setInterval)', () => {
  it('modo livre: tempo = hora atual − início', () => {
    const s = startTimer(1, 'libero', 1_000_000);
    expect(timerView(s, 1_000_000 + 12 * MIN, cfg).studiedMs).toBe(12 * MIN);
  });

  it('continua certo depois de ficar em segundo plano (sem nenhum tick)', () => {
    const s = startTimer(1, 'libero', 0);
    expect(timerView(s, 47 * MIN, cfg).elapsedMs).toBe(47 * MIN);
  });

  it('pausa e retomada acumulam sem contar o tempo parado', () => {
    let s = startTimer(1, 'libero', 0);
    s = pauseTimer(s, 10 * MIN);
    expect(timerView(s, 50 * MIN, cfg).elapsedMs).toBe(10 * MIN);
    s = resumeTimer(s, 50 * MIN);
    expect(timerView(s, 55 * MIN, cfg).elapsedMs).toBe(15 * MIN);
  });

  it('pomodoro 25/5: fases, tempo restante e pausa fora do tempo estudado', () => {
    const s = startTimer(1, 'pomodoro', 0);
    expect(timerView(s, 24 * MIN, cfg)).toMatchObject({
      phase: 'studio',
      phaseMs: 24 * MIN,
      phaseTotalMs: 25 * MIN,
      studiedMs: 24 * MIN,
    });
    const br = timerView(s, 27 * MIN, cfg);
    expect(br).toMatchObject({
      phase: 'pausa',
      phaseMs: 2 * MIN,
      phaseTotalMs: 5 * MIN,
      studiedMs: 25 * MIN,
      phaseIndex: 1,
    });
    const second = timerView(s, 40 * MIN, cfg);
    expect(second).toMatchObject({ phase: 'studio', studiedMs: 35 * MIN, phaseIndex: 2 });
  });

  it('formata o relógio', () => {
    expect(formatClock(24 * MIN + 10_000)).toBe('24:10');
    expect(formatClock(3_725_000)).toBe('1:02:05');
  });
});

describe('carinhas e 30 minutos', () => {
  const today = '2026-11-18';
  it('30 min (cronômetro + manual somados) deixam a carinha feliz', () => {
    const secs = secondsByDate([
      { date: today, durationSec: 20 * 60 },
      { date: today, durationSec: 10 * 60 },
    ]).get(today)!;
    expect(secs).toBe(STUDIED_SEC);
    expect(faceFor(today, today, secs)).toBe('happy');
  });
  it('29 min 59 s não chegam', () =>
    expect(faceFor('2026-11-10', today, STUDIED_SEC - 1)).toBe('sad'));
  it('passado sem 30 min = triste; hoje/futuro em aberto = tracejada', () => {
    expect(faceFor('2026-11-10', today, 0)).toBe('sad');
    expect(faceFor(today, today, 600)).toBe('future');
    expect(faceFor('2026-11-25', today, 0)).toBe('future');
  });
  it('total do dia soma todos os estudos', () => {
    expect(
      totalSeconds(
        [
          { date: today, durationSec: 600 },
          { date: today, durationSec: 900 },
          { date: '2026-11-17', durationSec: 999 },
        ],
        today,
      ),
    ).toBe(1500);
  });
});

describe('Aggiungi il giorno', () => {
  const base = {
    startDate: '2026-11-11',
    examDate: '2026-11-24',
    weekdays: [1, 2, 3, 4, 5],
    reviewDays: 2,
  };
  it('oferece o sábado, com o nome certo', () => {
    const wd = addableWeekday(base, '2026-11-11')!;
    expect(wd).toBe(6);
    expect(addWeekdayLabel(wd)).toBe('Aggiungi il sabato');
    expect(addWeekdayLabel(7)).toBe('Aggiungi la domenica');
    expect(addWeekdayLabel(1)).toBe('Aggiungi il lunedì');
  });
  it('sem sábado possível, oferece o domingo', () => {
    expect(addableWeekday({ ...base, weekdays: [1, 2, 3, 4, 5, 6] }, '2026-11-11')).toBe(7);
  });
  it('não oferece dia que só cai no ripasso ou depois da prova', () => {
    // prova na terça 17; ripasso = seg 16 → só o dia 12–15 pode receber sábado (14)
    const s = { ...base, examDate: '2026-11-17', reviewDays: 1 };
    expect(addableWeekday(s, '2026-11-11')).toBe(6);
    // hoje é sábado 14: amanhã (dom 15) é a única opção livre antes do ripasso (seg 16)
    expect(addableWeekday(s, '2026-11-14')).toBe(7);
    // hoje é domingo 15: sobra só o ripasso (16) → nenhum dia
    expect(addableWeekday(s, '2026-11-15')).toBeNull();
  });
  it('nunca oferece dia já disponível', () => {
    expect(addableWeekday({ ...base, weekdays: [1, 2, 3, 4, 5, 6, 7] }, '2026-11-11')).toBeNull();
  });
});
