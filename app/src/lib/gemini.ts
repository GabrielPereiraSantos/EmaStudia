import type { Question, Study } from '../db/types';
import { api } from './api';

export { PLAN_B_MESSAGE, THINKING_TEXT, type GeminiError } from './geminiErrors';
import { GEMINI_APP_TIMEOUT_MS, geminiErrorOf, type GeminiError } from './geminiErrors';

interface Ctx {
  study: Study;
  chapter?: { n: number; title?: string; from: number; to: number };
  pages?: { from: number; to: number };
  notes: string[];
}

const body = ({ study, chapter, pages, notes }: Ctx) => ({
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  subject: study.subject,
  type: study.type,
  topic: study.topic,
  difficulty: study.difficulty,
  chapter: chapter
    ? { n: chapter.n, ...(chapter.title ? { title: chapter.title } : {}) }
    : undefined,
  pages: chapter ? { from: chapter.from, to: chapter.to } : pages,
  notes: notes.slice(0, 50).map((n) => n.slice(0, 280)),
  summary: study.summary.slice(0, 2000),
});

const failure = (r: {
  status: number;
  kind?: 'timeout' | 'network';
}): { ok: false; error: GeminiError } => ({
  ok: false,
  error: geminiErrorOf(r, navigator.onLine),
});

/** Pede ao Worker (que chama o Gemini) as perguntas ou os exercícios. */
export async function geminiQuestions(
  kind: 'quiz' | 'esercizi',
  ctx: Ctx,
): Promise<{ ok: true; questions: Question[] } | { ok: false; error: GeminiError }> {
  if (!navigator.onLine) return { ok: false, error: 'offline' };
  const r = await api<{ questions?: Question[] }>(
    `/api/gemini/${kind}`,
    'POST',
    body(ctx),
    undefined,
    GEMINI_APP_TIMEOUT_MS,
  );
  if (r.ok && Array.isArray(r.data?.questions)) return { ok: true, questions: r.data.questions };
  return failure(r);
}

export async function geminiSummary(
  ctx: Ctx,
): Promise<{ ok: true; summary: string } | { ok: false; error: GeminiError }> {
  if (!navigator.onLine) return { ok: false, error: 'offline' };
  const r = await api<{ summary?: string }>(
    '/api/gemini/riassunto',
    'POST',
    body(ctx),
    undefined,
    GEMINI_APP_TIMEOUT_MS,
  );
  if (r.ok && typeof r.data?.summary === 'string') return { ok: true, summary: r.data.summary };
  return failure(r);
}

export async function geminiUsage(): Promise<{ used: number; limit: number } | null> {
  const tz = encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone);
  const r = await api<{ used: number; limit: number }>(`/api/gemini/usage?tz=${tz}`, 'GET');
  return r.ok && r.data ? r.data : null;
}

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
