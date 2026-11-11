import type { Question, Study } from '../db/types';
import { api } from './api';

export type GeminiError = 'quota' | 'errore' | 'offline';

interface Ctx {
  study: Study;
  chapter?: { n: number; title?: string; from: number; to: number };
  notes: string[];
}

const body = ({ study, chapter, notes }: Ctx) => ({
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  subject: study.subject,
  type: study.type,
  topic: study.topic,
  difficulty: study.difficulty,
  chapter: chapter
    ? { n: chapter.n, ...(chapter.title ? { title: chapter.title } : {}) }
    : undefined,
  pages: chapter ? { from: chapter.from, to: chapter.to } : undefined,
  notes: notes.slice(0, 50).map((n) => n.slice(0, 280)),
  summary: study.summary.slice(0, 2000),
});

const errorOf = (status: number): GeminiError =>
  status === 429 ? 'quota' : status === 0 ? 'offline' : 'errore';

/** Pede ao Worker (que chama o Gemini) as perguntas ou os exercícios. */
export async function geminiQuestions(
  kind: 'quiz' | 'esercizi',
  ctx: Ctx,
): Promise<{ ok: true; questions: Question[] } | { ok: false; error: GeminiError }> {
  const r = await api<{ questions?: Question[] }>(`/api/gemini/${kind}`, 'POST', body(ctx));
  if (r.ok && Array.isArray(r.data?.questions)) return { ok: true, questions: r.data.questions };
  return { ok: false, error: errorOf(r.status) };
}

export async function geminiSummary(
  ctx: Ctx,
): Promise<{ ok: true; summary: string } | { ok: false; error: GeminiError }> {
  const r = await api<{ summary?: string }>('/api/gemini/riassunto', 'POST', body(ctx));
  if (r.ok && typeof r.data?.summary === 'string') return { ok: true, summary: r.data.summary };
  return { ok: false, error: errorOf(r.status) };
}

export async function geminiUsage(): Promise<{ used: number; limit: number } | null> {
  const tz = encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone);
  const r = await api<{ used: number; limit: number }>(`/api/gemini/usage?tz=${tz}`, 'GET');
  return r.ok && r.data ? r.data : null;
}

export const PLAN_B_MESSAGE: Record<GeminiError, string> = {
  quota: 'Ema, per oggi Gemini ha finito le domande. Puoi riprovare domani, oppure:',
  errore: 'Gemini non ha risposto questa volta. Puoi riprovare, oppure:',
  offline: 'Sembra che tu sia offline. Riprova quando hai internet, oppure:',
};

/** Copia o prompt e abre o ChatGPT (deve ser chamado num toque dela). */
export async function openChatGpt(prompt: string): Promise<boolean> {
  let copied: boolean;
  try {
    await navigator.clipboard.writeText(prompt);
    copied = true;
  } catch {
    copied = false;
  }
  window.open('https://chatgpt.com/', '_blank', 'noopener,noreferrer');
  return copied;
}
