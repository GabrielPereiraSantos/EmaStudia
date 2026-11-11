import { todayISO, type ISODate } from '../lib/dates';
import { geminiQuestions } from '../lib/gemini';
import { chapterRanges } from '../plan/core';
import { quizzesDue, scoreQuiz, type PromptContext } from '../plan/quizzes';
import { db, DEFAULT_SETTINGS } from './db';
import type { Question, Quiz } from './types';

const attempted = new Set<number>();

/** Contexto do estudo para o Gemini/ChatGPT. */
export async function quizContext(
  quiz: Pick<Quiz, 'studyId' | 'chapter'>,
): Promise<PromptContext | null> {
  const study = await db.studies.get(quiz.studyId);
  if (!study) return null;
  const notes = (await db.notes.where('studyId').equals(quiz.studyId).toArray()).map((n) => n.text);
  let chapter: PromptContext['chapter'];
  if (quiz.chapter != null) {
    const r = chapterRanges(study.chapters, study.pageStart, study.pageEnd).find(
      (x) => x.n === quiz.chapter,
    );
    const title = study.chapters.find((c) => c.n === quiz.chapter)?.title;
    if (r) chapter = { n: r.n, title, from: r.from, to: r.to };
  }
  return {
    subject: study.subject,
    topic: study.topic,
    difficulty: study.difficulty,
    chapter,
    notes,
    summary: study.summary,
  };
}

/** Gera as perguntas de um quiz pendente. Em caso de erro, fica "in-attesa" com o motivo (plano B). */
export async function generateQuiz(id: number): Promise<boolean> {
  const quiz = await db.quizzes.get(id);
  if (!quiz || quiz.status !== 'in-attesa') return false;
  const study = await db.studies.get(quiz.studyId);
  const ctx = await quizContext(quiz);
  if (!study || !ctx) return false;
  attempted.add(id);
  await db.quizzes.update(id, { failReason: undefined });
  const r = await geminiQuestions(quiz.kind, { study, chapter: ctx.chapter, notes: ctx.notes });
  const fresh = await db.quizzes.get(id);
  if (!fresh || fresh.status !== 'in-attesa') return false; // ela já colou ou escreveu enquanto isso
  if (r.ok) {
    await db.quizzes.update(id, {
      questions: r.questions,
      status: 'disponibile',
      source: 'gemini',
      failReason: undefined,
    });
    return true;
  }
  await db.quizzes.update(id, { failReason: r.error });
  return false;
}

/** Cria os quizzes que devem existir (8.1) e tenta gerá-los. Nunca duplica (chave por estudo). */
export async function ensureQuizzes(today: ISODate = todayISO()) {
  const created = await db.transaction('rw', db.studies, db.planDays, db.quizzes, async () => {
    const ids: number[] = [];
    for (const s of await db.studies.filter((x) => !x.archived).toArray()) {
      const days = await db.planDays.where('studyId').equals(s.id!).toArray();
      const existing = await db.quizzes.where('studyId').equals(s.id!).toArray();
      for (const need of quizzesDue(s, days, existing, today)) {
        ids.push(
          (await db.quizzes.add({
            studyId: s.id!,
            kind: need.kind,
            key: need.key,
            chapter: need.chapter?.n,
            chapterTitle: need.chapter?.title,
            questions: [],
            answers: [],
            score: 0,
            coinsAwarded: 0,
            status: 'in-attesa',
            createdAt: new Date().toISOString(),
          })) as number,
        );
      }
    }
    return ids;
  });
  // novos + pendentes ainda não tentados nesta sessão (ex.: cota de ontem)
  const pending = (await db.quizzes.where('status').equals('in-attesa').toArray()).map(
    (q) => q.id!,
  );
  for (const id of new Set([...created, ...pending.filter((p) => !attempted.has(p))]))
    await generateQuiz(id);
}

async function fill(id: number, questions: Question[], source: 'chatgpt' | 'manuale') {
  await db.quizzes.update(id, { questions, source, status: 'disponibile', failReason: undefined });
}
export const savePastedQuiz = (id: number, q: Question[]) => fill(id, q, 'chatgpt');
export const saveManualQuiz = (id: number, q: Question[]) => fill(id, q, 'manuale');

/** Conclui o quiz: nota e +5 por certa no extrato (uma vez só; "Scrivi tu" não rende moedinhas). */
export async function finishQuiz(id: number, answers: number[], today: ISODate = todayISO()) {
  return db.transaction('rw', db.quizzes, db.coins, db.settings, async () => {
    const quiz = await db.quizzes.get(id);
    if (!quiz || quiz.status === 'completato') return quiz;
    const rules = (await db.settings.get(1)) ?? DEFAULT_SETTINGS;
    const { score, coins } = scoreQuiz(quiz, answers, rules.coinsCorrect);
    await db.quizzes.update(id, { answers, score, coinsAwarded: coins, status: 'completato' });
    if (coins > 0) await db.coins.add({ date: today, amount: coins, reason: 'quiz' });
    return db.quizzes.get(id);
  });
}
