import type { PlanDay, Question, Quiz, Study } from '../db/types';
import { chapterRanges, firstUndonePage } from './core';

export interface QuizNeed {
  key: string;
  kind: 'quiz' | 'esercizi';
  chapter?: { n: number; title?: string; from: number; to: number };
}

/** Fim dos dias de studio: todas as páginas feitas, ou já chegou o primeiro dia de ripasso. */
export function studioFinished(study: Study, days: PlanDay[], today: string): boolean {
  if (firstUndonePage(study, days) > study.pageEnd) return true;
  const firstReview = days
    .filter((d) => d.kind === 'ripasso')
    .map((d) => d.date)
    .sort()[0];
  return !!firstReview && today >= firstReview;
}

/**
 * Quizzes que devem existir agora (8.1):
 *  - não exatas com capítulos: um quiz por capítulo concluído (a última página já foi feita);
 *  - não exatas sem capítulos: um quiz sobre o argomento inteiro no fim dos dias de studio;
 *  - exatas: 4 exercícios no fim dos dias de studio.
 * Os que já existem (pela `key`) não são gerados de novo.
 */
export function quizzesDue(
  study: Study,
  days: PlanDay[],
  existing: Pick<Quiz, 'key'>[],
  today: string,
): QuizNeed[] {
  const have = new Set(existing.map((q) => q.key));
  const out: QuizNeed[] = [];
  if (study.type === 'esatte') {
    if (studioFinished(study, days, today)) out.push({ key: 'esercizi', kind: 'esercizi' });
  } else if (study.chapters.length) {
    const next = firstUndonePage(study, days);
    const titles = new Map(study.chapters.map((c) => [c.n, c.title]));
    for (const r of chapterRanges(study.chapters, study.pageStart, study.pageEnd)) {
      if (r.to < next)
        out.push({
          key: `cap:${r.n}`,
          kind: 'quiz',
          chapter: { n: r.n, title: titles.get(r.n), from: r.from, to: r.to },
        });
    }
  } else if (studioFinished(study, days, today)) {
    out.push({ key: 'studio', kind: 'quiz' });
  }
  return out.filter((n) => !have.has(n.key));
}

export const QUESTION_COUNT = { quiz: 5, esercizi: 4 } as const;

const clean = (s: string, max: number, multiline = false) =>
  [...s]
    .map((ch) => {
      const n = ch.charCodeAt(0);
      if (multiline && n === 10) return '\n';
      return n < 32 || n === 127 ? ' ' : ch;
    })
    .join('')
    .replace(/[ \t]+/g, ' ')
    .trim()
    .slice(0, max);

/** Mesma validação do Worker, para o JSON colado do ChatGPT. */
export function validateQuestions(kind: 'quiz' | 'esercizi', data: unknown): Question[] | null {
  if (typeof data !== 'object' || data === null) return null;
  const qs = (data as { questions?: unknown }).questions;
  const n = QUESTION_COUNT[kind];
  if (!Array.isArray(qs) || qs.length < n) return null;
  const out: Question[] = [];
  for (const raw of qs.slice(0, n)) {
    if (typeof raw !== 'object' || raw === null) return null;
    const q = raw as Record<string, unknown>;
    if (typeof q.question !== 'string' || !Array.isArray(q.options) || q.options.length !== 4)
      return null;
    const ci = q.correctIndex;
    if (typeof ci !== 'number' || !Number.isInteger(ci) || ci < 0 || ci > 3) return null;
    const options = q.options.map((o) => (typeof o === 'string' ? clean(o, 300) : ''));
    const question = clean(q.question, 600, true);
    if (!question || options.some((o) => !o)) return null;
    const item: Question = {
      question,
      options,
      correctIndex: ci,
      explanation: typeof q.explanation === 'string' ? clean(q.explanation, 800, true) : '',
    };
    if (kind === 'esercizi') {
      if (typeof q.solution !== 'string' || !q.solution.trim()) return null;
      item.solution = clean(q.solution, 3000, true);
    }
    out.push(item);
  }
  return out;
}

/** "Incolla qui la risposta": aceita o JSON puro ou dentro de ```json … ```. */
export function parsePasted(
  kind: 'quiz' | 'esercizi',
  text: string,
): { ok: true; questions: Question[] } | { ok: false; error: string } {
  const t = text.trim();
  const fenced = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced
    ? fenced[1]
    : t.slice(Math.max(0, t.indexOf('{')), t.lastIndexOf('}') + 1);
  let data: unknown;
  try {
    data = JSON.parse(candidate);
  } catch {
    return {
      ok: false,
      error:
        'Non riesco a leggere la risposta. Copia tutto il testo che ti ha dato ChatGPT (dalla prima { all’ultima }) e riprova.',
    };
  }
  const qs = validateQuestions(kind, data);
  if (!qs) {
    const n = QUESTION_COUNT[kind];
    return {
      ok: false,
      error:
        kind === 'esercizi'
          ? `La risposta non è nel formato giusto: servono ${n} esercizi, ognuno con 4 opzioni, "correctIndex" da 0 a 3 e la "solution". Chiedi a ChatGPT di rispettare il formato e riprova.`
          : `La risposta non è nel formato giusto: servono ${n} domande, ognuna con 4 opzioni e "correctIndex" da 0 a 3. Chiedi a ChatGPT di rispettare il formato e riprova.`,
    };
  }
  return { ok: true, questions: qs };
}

const LEVEL = { 1: 'facile', 2: 'media', 3: 'difficile' } as const;

export interface PromptContext {
  subject: string;
  topic: string;
  difficulty: 1 | 2 | 3;
  chapter?: { n: number; title?: string; from: number; to: number };
  notes: string[];
  summary: string;
}

function contextLines(c: PromptContext): string[] {
  const l = [`Materia: ${c.subject}.`];
  if (c.topic) l.push(`Argomento: ${c.topic}.`);
  if (c.chapter)
    l.push(
      `Capitolo ${c.chapter.n}${c.chapter.title ? ` «${c.chapter.title}»` : ''}, pagine ${c.chapter.from}–${c.chapter.to}.`,
    );
  if (c.notes.length) l.push(`Appunti da memorizzare:\n${c.notes.map((n) => `- ${n}`).join('\n')}`);
  if (c.summary) l.push(`Riassunto:\n${c.summary}`);
  return l;
}

/** Prompt para o ChatGPT (plano B), pedindo o JSON no formato exato do app. */
export function chatGptPrompt(kind: 'quiz' | 'esercizi', c: PromptContext): string {
  const n = QUESTION_COUNT[kind];
  const about = c.chapter ? 'sul capitolo indicato' : "sull'intero argomento";
  const example =
    kind === 'esercizi'
      ? '{"questions":[{"question":"...","options":["...","...","...","..."],"correctIndex":0,"explanation":"...","solution":"Passo 1: ... Passo 2: ..."}]}'
      : '{"questions":[{"question":"...","options":["...","...","...","..."],"correctIndex":0,"explanation":"..."}]}';
  return [
    kind === 'esercizi'
      ? `Crea ${n} esercizi a scelta multipla ${about}, con la risoluzione passo a passo.`
      : `Crea un quiz di ${n} domande a scelta multipla ${about}.`,
    `Livello: scuola superiore / primo anno di università. Difficoltà: ${LEVEL[c.difficulty]}. Tutto in italiano.`,
    ...contextLines(c),
    `Ogni domanda ha esattamente 4 opzioni e una sola corretta; "correctIndex" è la posizione della risposta giusta (0, 1, 2 o 3).`,
    `Rispondi SOLO con un JSON valido, senza altro testo, esattamente in questo formato, con ${n} elementi in "questions":`,
    example,
  ].join('\n\n');
}

export function chatGptSummaryPrompt(c: PromptContext): string {
  return [
    'Scrivi in italiano un riassunto chiaro per studiare, al massimo 1200 caratteri, con i concetti chiave in frasi brevi.',
    ...contextLines(c),
    'Rispondi solo con il testo del riassunto.',
  ].join('\n\n');
}

/** Nota e moedinhas: +coinsCorrect por certa, só para Gemini e ChatGPT (não "Scrivi tu"). */
export function scoreQuiz(
  quiz: Pick<Quiz, 'questions' | 'source'>,
  answers: number[],
  coinsCorrect: number,
) {
  const score = quiz.questions.reduce((n, q, i) => n + (answers[i] === q.correctIndex ? 1 : 0), 0);
  const coins = quiz.source === 'manuale' ? 0 : score * coinsCorrect;
  return { score, coins };
}
