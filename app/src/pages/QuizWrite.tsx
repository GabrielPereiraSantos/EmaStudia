import { useState } from 'react';
import { BackButton } from '../components/BackButton';
import { db } from '../db/db';
import { saveManualQuiz } from '../db/quizRepo';
import type { Question } from '../db/types';
import { go } from '../lib/router';
import { useLive } from '../lib/useLive';
import { QUESTION_COUNT, validateQuestions } from '../plan/quizzes';

/** "Scrivi tu": ela mesma escreve as perguntas (não rende moedinhas). */
export function QuizWrite({ id }: { id: number }) {
  const quiz = useLive(() => db.quizzes.get(id), [id]);
  const [rows, setRows] = useState<Question[] | null>(null);
  const [err, setErr] = useState('');
  if (!quiz) return <div className="page" />;
  const n = QUESTION_COUNT[quiz.kind];
  const list =
    rows ??
    Array.from({ length: n }, () => ({
      question: '',
      options: ['', '', '', ''],
      correctIndex: 0,
      explanation: '',
      solution: '',
    }));
  const set = (k: number, patch: Partial<Question>) =>
    setRows(list.map((r, j) => (j === k ? { ...r, ...patch } : r)));

  const save = async () => {
    const qs = validateQuestions(quiz.kind, { questions: list });
    if (!qs) {
      setErr(
        quiz.kind === 'esercizi'
          ? 'Completa tutte le domande, le 4 opzioni e la soluzione.'
          : 'Completa tutte le domande e le 4 opzioni.',
      );
      return;
    }
    await saveManualQuiz(id, qs);
    go(`/quiz/${id}`);
  };

  return (
    <div className="page form">
      <div className="page-head">
        <BackButton onClick={() => go('/quiz')} />
        <h1>Scrivi tu</h1>
      </div>
      <p className="muted pad">
        Scrivi {n} {quiz.kind === 'esercizi' ? 'esercizi' : 'domande'} e segna la risposta giusta.
        (I quiz scritti da te non danno monetine.)
      </p>
      {list.map((r, k) => (
        <div className="card" key={k}>
          <label>
            Domanda {k + 1}
            <textarea
              className="field area"
              rows={2}
              maxLength={600}
              value={r.question}
              onChange={(e) => set(k, { question: e.target.value })}
            />
          </label>
          {r.options.map((o, j) => (
            <div className="opt-row" key={j}>
              <input
                type="radio"
                name={`ok-${k}`}
                aria-label={`Opzione ${j + 1} giusta`}
                checked={r.correctIndex === j}
                onChange={() => set(k, { correctIndex: j })}
              />
              <input
                className="field"
                aria-label={`Opzione ${j + 1}`}
                maxLength={300}
                value={o}
                onChange={(e) =>
                  set(k, { options: r.options.map((x, z) => (z === j ? e.target.value : x)) })
                }
              />
            </div>
          ))}
          {quiz.kind === 'esercizi' && (
            <label>
              Soluzione
              <textarea
                className="field area"
                rows={3}
                maxLength={3000}
                value={r.solution}
                onChange={(e) => set(k, { solution: e.target.value })}
              />
            </label>
          )}
        </div>
      ))}
      {err && (
        <div className="errors" role="alert">
          <p>{err}</p>
        </div>
      )}
      <div className="submit-bar">
        <button type="button" className="primary" onClick={() => void save()}>
          Salva quiz
        </button>
      </div>
    </div>
  );
}
