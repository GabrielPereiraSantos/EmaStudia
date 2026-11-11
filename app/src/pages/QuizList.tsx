import { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { it } from 'date-fns/locale';
import { PlanB } from '../components/PlanB';
import { Thinking } from '../components/Thinking';
import { db } from '../db/db';
import type { Quiz, Study } from '../db/types';
import { SUBJECT_COLORS } from '../lib/colors';
import { go } from '../lib/router';
import { useLive } from '../lib/useLive';

export const quizLabel = (q: Pick<Quiz, 'kind' | 'chapter' | 'chapterTitle'>, s?: Study) =>
  q.kind === 'esercizi'
    ? `Esercizi${s?.topic ? ' · ' + s.topic : ''}`
    : q.chapter != null
      ? `Capitolo ${q.chapter}${q.chapterTitle ? ' · ' + q.chapterTitle : ''}`
      : `Quiz${s?.topic ? ' · ' + s.topic : ''}`;

export function QuizList() {
  const data = useLive(
    async () => ({ quizzes: await db.quizzes.toArray(), studies: await db.studies.toArray() }),
    [],
  );
  const [toast, setToast] = useState('');
  const flash = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(''), 5000);
  };
  const byId = new Map((data?.studies ?? []).map((s) => [s.id!, s]));
  const quizzes = (data?.quizzes ?? []).filter((q) => byId.has(q.studyId));
  const open = quizzes
    .filter((q) => q.status !== 'completato')
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const done = quizzes
    .filter((q) => q.status === 'completato')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <div className="page quiz-list">
      <div className="page-head">
        <h1 className="big">Quiz</h1>
      </div>
      {data && quizzes.length === 0 && (
        <p className="empty">
          Nessun quiz ancora. Arrivano quando finisci un capitolo o i giorni di studio.
        </p>
      )}
      {open.length > 0 && <h2 className="sec-title">Da fare</h2>}
      <div className="quiz-cards">
        {open.map((q) => {
          const s = byId.get(q.studyId)!;
          const c = SUBJECT_COLORS[s.colorKey];
          return (
            <div key={q.id} className="quiz-card" style={{ background: c.bg }}>
              <div className="row-between">
                <div>
                  <p className="qc-subj">
                    {s.emoji ? s.emoji + ' ' : ''}
                    {s.subject}
                  </p>
                  <p className="qc-what">{quizLabel(q, s)}</p>
                </div>
                {q.status === 'disponibile' && (
                  <button
                    type="button"
                    className="dark-btn qc-go"
                    onClick={() => go(`/quiz/${q.id}`)}
                  >
                    Inizia
                  </button>
                )}
              </div>
              {q.status === 'in-attesa' && !q.failReason && <Thinking />}
              {q.status === 'in-attesa' && q.failReason && <PlanB quiz={q} onToast={flash} />}
            </div>
          );
        })}
      </div>
      {done.length > 0 && <h2 className="sec-title">Storico</h2>}
      <div className="quiz-cards">
        {done.map((q) => {
          const s = byId.get(q.studyId)!;
          return (
            <button
              type="button"
              key={q.id}
              className="quiz-done"
              onClick={() => go(`/quiz/${q.id}`)}
            >
              <span className="grow">
                <strong>{s.subject}</strong>
                <small>
                  {quizLabel(q, s)} · {format(parseISO(q.createdAt), 'd MMM', { locale: it })}
                </small>
              </span>
              <span className="qd-score">
                {q.score}/{q.questions.length}
              </span>
            </button>
          );
        })}
      </div>
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
