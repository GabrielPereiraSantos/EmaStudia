import { describe, expect, it } from 'vitest';
import type { CoinEntry, Reward } from '../db/types';
import { monthCells } from '../lib/calendar';
import {
  balanceOf,
  canRedeem,
  computeAwards,
  computeStreak,
  redeem,
  scheduledDates,
  streakInCycle,
  studiedDates,
  pomodorosFor,
} from './coins';

const rules = { coinsStreak: 30 };
const S = (date: string, min: number) => ({ date, durationSec: min * 60 });
const range = (from: number, n: number) =>
  Array.from({ length: n }, (_, i) => `2026-11-${String(from + i).padStart(2, '0')}`);
const sched = (dates: string[]) => new Set(dates);

describe('7 — dia estudado (30 min) não rende mais moedas, só conta para a sequência', () => {
  it('30 min no dia (somando estudos e tempo manual) não geram moedas', () => {
    const sessions = [S('2026-11-10', 20), S('2026-11-10', 10)];
    expect(computeAwards(sessions, sched(['2026-11-10']), [], rules, '2026-11-10')).toEqual([]);
    expect(studiedDates(sessions).has('2026-11-10')).toBe(true); // mas o dia conta como estudado
  });
  it('29 min 59 s não contam como dia estudado', () => {
    expect(studiedDates([{ date: '2026-11-10', durationSec: 1799 }]).has('2026-11-10')).toBe(false);
  });
  it('dia estudado sem nada programado também vale (para a carinha e a sequência)', () => {
    expect(studiedDates([S('2026-11-12', 30)]).has('2026-11-12')).toBe(true);
  });
  it('moedas antigas de "Giorno studiato" continuam no extrato (nunca perde moedas)', () => {
    const old = [{ date: '2026-11-01', amount: 10, reason: 'giorno' as const }];
    expect(computeAwards([S('2026-11-01', 40)], sched([]), old, rules, '2026-11-02')).toEqual([]);
    expect(balanceOf(old)).toBe(10);
  });
});

describe('7 — sequência de 7 dias (+30 a cada 7)', () => {
  it('7 dias seguidos dão +30 no sétimo dia; 14 dão dois bônus', () => {
    const d7 = range(1, 7);
    const a = computeAwards(
      d7.map((d) => S(d, 30)),
      sched(d7),
      [],
      rules,
      '2026-11-07',
    );
    expect(a.filter((e) => e.reason === 'serie')).toEqual([
      { date: '2026-11-07', amount: 30, reason: 'serie' },
    ]);
    expect(a.filter((e) => e.reason === 'giorno')).toHaveLength(0); // o dia em si não rende mais
    const d14 = range(1, 14);
    const b = computeAwards(
      d14.map((d) => S(d, 30)),
      sched(d14),
      [],
      rules,
      '2026-11-14',
    );
    expect(b.filter((e) => e.reason === 'serie').map((e) => e.date)).toEqual([
      '2026-11-07',
      '2026-11-14',
    ]);
  });
  it('dia sem nenhum estudo programado não quebra a sequência', () => {
    const studied = ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06']; // seg–sex
    // 7 e 8 (fim de semana) sem nada programado; segue na segunda 9 e terça 10
    const more = ['2026-11-09', '2026-11-10'];
    const r = computeStreak(
      new Set([...studied, ...more]),
      sched([...studied, ...more]),
      '2026-11-10',
    );
    expect(r.current).toBe(7);
    expect(r.bonusDates).toEqual(['2026-11-10']);
  });
  it('dia programado sem 30 min zera a sequência', () => {
    const all = range(1, 7);
    const studied = new Set(all.filter((d) => d !== '2026-11-04'));
    const r = computeStreak(studied, sched(all), '2026-11-07');
    expect(r.current).toBe(3); // 5, 6, 7
    expect(r.bonusDates).toEqual([]);
  });
  it('hoje ainda em aberto não quebra a sequência', () => {
    const past = range(1, 4);
    const r = computeStreak(new Set(past), sched([...past, '2026-11-05']), '2026-11-05');
    expect(r.current).toBe(4);
    expect(streakInCycle(r.current)).toBe(4);
  });
  it('posição na barra de 7', () => {
    expect([0, 1, 5, 7, 8, 14].map(streakInCycle)).toEqual([0, 1, 5, 7, 1, 7]);
  });
  it('nunca perde moedas: a sequência quebrada só deixa de render', () => {
    const existing: CoinEntry[] = [
      { date: '2026-11-07', amount: 30, reason: 'serie' },
      { date: '2026-11-07', amount: 10, reason: 'giorno' },
    ];
    // recalculando com uma sequência que agora está quebrada: nada é removido nem devolvido
    const a = computeAwards(
      [S('2026-11-07', 30)],
      sched(range(1, 7)),
      existing,
      rules,
      '2026-11-08',
    );
    expect(a).toEqual([]);
    expect(balanceOf(existing)).toBe(40);
  });
  it('studiedDates ignora estudos arquivados na programação', () => {
    const days = [
      { studyId: 1, date: '2026-11-10' },
      { studyId: 2, date: '2026-11-11' },
    ];
    const set = scheduledDates(days, [
      { id: 1, archived: false },
      { id: 2, archived: true },
    ]);
    expect([...set]).toEqual(['2026-11-10']);
  });
});

describe('7 — prêmios e resgate', () => {
  const reward = (o: Partial<Reward> = {}): Reward => ({
    id: 1,
    name: 'Gelato',
    icon: 'cuore',
    price: 50,
    repeatable: true,
    active: true,
    ...o,
  });
  it('saldo = soma do extrato (inclui resgates negativos)', () => {
    expect(balanceOf([{ amount: 10 }, { amount: 30 }, { amount: -25 }])).toBe(15);
  });
  it('só resgata com saldo suficiente', () => {
    expect(canRedeem(49, reward())).toBe(false);
    expect(canRedeem(50, reward())).toBe(true);
    expect(redeem(49, reward(), '2026-11-10')).toEqual({ ok: false, reason: 'poor' });
  });
  it('resgate debita o preço e registra', () => {
    const r = redeem(120, reward(), '2026-11-10');
    expect(r.ok && r.entry).toEqual({ date: '2026-11-10', amount: -50, reason: 'premio' });
    expect(r.ok && r.redemption).toEqual({ rewardId: 1, date: '2026-11-10', price: 50 });
  });
  it('prêmio repetível continua na loja; não repetível some', () => {
    const rep = redeem(100, reward({ repeatable: true }), '2026-11-10');
    const once = redeem(100, reward({ repeatable: false }), '2026-11-10');
    expect(rep.ok && rep.reward.active).toBe(true);
    expect(once.ok && once.reward.active).toBe(false);
  });
  it('prêmio que já saiu da loja não resgata de novo', () => {
    expect(redeem(100, reward({ active: false }), '2026-11-10')).toEqual({
      ok: false,
      reason: 'gone',
    });
  });
  it('"Circa X pomodori"', () => {
    expect(pomodorosFor(200, 10)).toBe(20);
    expect(pomodorosFor(55, 10)).toBe(6);
    expect(pomodorosFor(5, 10)).toBe(1);
    expect(pomodorosFor(50, 0)).toBe(0);
  });
});

describe('calendário (segunda na primeira coluna)', () => {
  it('novembro de 2026 começa em 26/10 e a quarta é a 3ª coluna', () => {
    const cells = monthCells(2026, 10);
    expect(cells[0]).toEqual({ date: '2026-10-26', inMonth: false });
    expect(cells.length % 7).toBe(0);
    expect(cells.find((c) => c.date === '2026-11-04')).toBeTruthy();
    expect(cells.findIndex((c) => c.date === '2026-11-04') % 7).toBe(2); // quarta
    expect(cells.at(-1)!.date).toBe('2026-12-06'); // 30/11 é segunda
  });
});
