/** Erros do Gemini vistos pelo app (sem dependências, para testar fácil). */
export type GeminiError = 'quota' | 'timeout' | 'errore' | 'offline';

/** O app espera até 60 s pelo Worker (que espera até 50 s pelo Gemini). */
export const GEMINI_APP_TIMEOUT_MS = 60_000;

export interface ApiFailure {
  status: number;
  /** status 0: estourou o tempo ou a rede falhou de verdade. */
  kind?: 'timeout' | 'network';
}

/**
 * "Offline" só quando o aparelho diz que está offline ou a rede falhou de verdade.
 * Timeout tem mensagem própria; qualquer outro erro é "o Gemini não respondeu".
 */
export function geminiErrorOf(r: ApiFailure, online: boolean): GeminiError {
  if (r.status === 0) {
    if (!online) return 'offline';
    if (r.kind === 'timeout') return 'timeout';
    if (r.kind === 'network') return 'offline';
    return 'errore'; // sem servidor configurado
  }
  if (r.status === 429) return 'quota';
  if (r.status === 504) return 'timeout';
  return 'errore';
}

export const PLAN_B_MESSAGE: Record<GeminiError, string> = {
  quota: 'Ema, per oggi Gemini ha finito le domande. Puoi riprovare domani, oppure:',
  timeout: 'Gemini ci sta mettendo troppo. Riprova oppure:',
  errore: 'Gemini non ha risposto questa volta. Puoi riprovare, oppure:',
  offline: 'Sembra che tu sia offline. Riprova quando hai internet, oppure:',
};

export const THINKING_TEXT = 'Gemini sta pensando…';
