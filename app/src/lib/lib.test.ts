import { describe, expect, it } from 'vitest';
import { colorForName, pickColor } from './colors';
import { greeting } from './dates';

describe('cores das matérias', () => {
  it('reconhece nomes em italiano e português, sem acento e maiúsculas', () => {
    expect(colorForName('Física')).toBe('fisica');
    expect(colorForName('  HISTÓRIA ')).toBe('storia');
    expect(colorForName('Química')).toBe('chimica');
    expect(colorForName('Latim')).toBe('latino');
    expect(colorForName('Inglês')).toBe('inglese');
    expect(colorForName('Artes')).toBe('arte');
  });
  it('matéria desconhecida recebe a próxima cor livre', () => {
    expect(pickColor('Geografia', ['fisica', 'storia'])).toBe('chimica');
  });
});

describe('saudação', () => {
  const at = (h: number) => new Date(2026, 10, 10, h, 0);
  it('pela hora local', () => {
    expect(greeting(at(5))).toBe('Buongiorno, Ema');
    expect(greeting(at(11))).toBe('Buongiorno, Ema');
    expect(greeting(at(12))).toBe('Buon pomeriggio, Ema');
    expect(greeting(at(18))).toBe('Buonasera, Ema');
    expect(greeting(at(4))).toBe('Buonasera, Ema');
  });
});
