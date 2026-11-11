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

describe('contraste das cores (acessibilidade)', () => {
  it('a cor de acento escurecida sempre dá contraste ≥ 4,5 com texto branco', async () => {
    const { SUBJECT_COLORS, readableFill, contrast } = await import('./colors');
    for (const c of Object.values(SUBJECT_COLORS))
      expect(contrast('#ffffff', readableFill(c.accent))).toBeGreaterThanOrEqual(4.5);
    // quem já é escuro não muda
    expect(readableFill('#6A37A8')).toBe('#6A37A8');
  });
  it('texto marrom sobre o laranja dos botões passa de 4,5', async () => {
    const { contrast } = await import('./colors');
    expect(contrast('#4A3612', '#E8A317')).toBeGreaterThan(4.5);
    expect(contrast('#FFFFFF', '#E8A317')).toBeLessThan(3); // por isso o branco foi trocado
  });
});
