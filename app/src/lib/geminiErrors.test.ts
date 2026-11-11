import { describe, expect, it } from 'vitest';
import {
  geminiErrorOf,
  GEMINI_APP_TIMEOUT_MS,
  PLAN_B_MESSAGE,
  THINKING_TEXT,
} from './geminiErrors';

describe('mensagens do Gemini (plano B)', () => {
  it('"offline" só se o aparelho está offline ou a rede falhou de verdade', () => {
    expect(geminiErrorOf({ status: 0, kind: 'network' }, true)).toBe('offline'); // rede falhou de verdade
    expect(geminiErrorOf({ status: 0, kind: 'timeout' }, false)).toBe('offline'); // navigator.onLine = false
    expect(geminiErrorOf({ status: 0 }, false)).toBe('offline');
  });
  it('estourou o tempo (app ou Worker) → timeout, nunca offline', () => {
    expect(geminiErrorOf({ status: 0, kind: 'timeout' }, true)).toBe('timeout');
    expect(geminiErrorOf({ status: 504 }, true)).toBe('timeout');
  });
  it('cota esgotada → quota; qualquer outro erro do servidor/Gemini → errore (nunca offline)', () => {
    expect(geminiErrorOf({ status: 429 }, true)).toBe('quota');
    for (const status of [400, 401, 403, 404, 500, 502, 503])
      expect(geminiErrorOf({ status }, true)).toBe('errore');
    expect(geminiErrorOf({ status: 502 }, false)).toBe('errore'); // o servidor respondeu: não é offline
  });
  it('sem servidor configurado (status 0 sem motivo) → errore, não offline', () => {
    expect(geminiErrorOf({ status: 0 }, true)).toBe('errore');
  });
  it('textos em italiano', () => {
    expect(PLAN_B_MESSAGE.timeout).toBe('Gemini ci sta mettendo troppo. Riprova oppure:');
    expect(PLAN_B_MESSAGE.errore).toMatch(/^Gemini non ha risposto questa volta/);
    expect(PLAN_B_MESSAGE.offline).toMatch(/offline/);
    expect(THINKING_TEXT).toBe('Gemini sta pensando…');
  });
  it('o app espera 60 s pelo Worker (que espera 50 s pelo Gemini)', () => {
    expect(GEMINI_APP_TIMEOUT_MS).toBe(60_000);
  });
});
