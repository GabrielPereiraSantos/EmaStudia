import { useState } from 'react';
import { db } from '../db/db';
import { finishQuiz } from '../db/quizRepo';
import { readableFill, SUBJECT_COLORS } from '../lib/colors';
import { go, studyPath } from '../lib/router';
import { useLive } from '../lib/useLive';
import { quizLabel } from './QuizList';

const CLOSE = (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.4"
    strokeLinecap="round"
    aria-hidden="true"
  >
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);
const OK = (
  <svg width="22" height="22" viewBox="0 0 24 24" role="img" aria-label="Giusta">
    <circle cx="12" cy="12" r="11" fill="#3C9A4A" />
    <path
      d="M7 12.5l3.2 3.2L17 9"
      stroke="#fff"
      strokeWidth="2.4"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);
const KO = (
  <svg width="22" height="22" viewBox="0 0 24 24" role="img" aria-label="Sbagliata">
    <circle cx="12" cy="12" r="11" fill="#D93A2E" />
    <path d="M8.5 8.5l7 7M15.5 8.5l-7 7" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
  </svg>
);

export function QuizPlay({ id }: { id: number }) {
  const data = useLive(async () => {
    const quiz = await db.quizzes.get(id);
    const study = quiz ? await db.studies.get(quiz.studyId) : undefined;
    const settings = await db.settings.get(1);
    return { quiz, study, settings };
  }, [id]);
  const [i, setI] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const [pick, setPick] = useState<number | null>(null);
  const [open, setOpen] = useState<number | null>(null);

  if (!data) return <div className="page" />;
  const { quiz, study, settings } = data;
  if (!quiz || !study || quiz.status === 'in-attesa')
    return (
      <div className="page">
        <p className="empty">Quiz non disponibile.</p>
        <div className="center-row">
          <button type="button" className="soft solo" onClick={() => go('/quiz')}>
            Torna ai quiz
          </button>
        </div>
      </div>
    );

  const c = SUBJECT_COLORS[study.colorKey];
  const n = quiz.questions.length;
  const by = quiz.source === 'chatgpt' ? 'ChatGPT' : quiz.source === 'manuale' ? 'te' : 'Gemini';
  const footer = quiz.kind === 'esercizi' ? `Esercizi creati da ${by}` : `Domande create da ${by}`;
  const head = (sub: string) => (
    <div className="quiz-head">
      <button
        type="button"
        className="round-btn white"
        aria-label="Chiudi"
        onClick={() => go('/quiz')}
      >
        {CLOSE}
      </button>
      <div className="center">
        <p className="qh-subj">{study.subject}</p>
        <p className="qh-sub">{sub}</p>
      </div>
      {quiz.status === 'disponibile' && quiz.source !== 'manuale' ? (
        <span className="plus5">+{settings?.coinsCorrect ?? 5}</span>
      ) : (
        <span style={{ width: 44 }} />
      )}
    </div>
  );

  // ---------- resultado ----------
  if (quiz.status === 'completato') {
    const R = 44;
    const C = 2 * Math.PI * R;
    const ratio = n ? quiz.score / n : 0;
    return (
      <div className="quiz-screen" style={{ background: c.bg }}>
        {head(
          `${quiz.kind === 'esercizi' ? 'Esercizi' : 'Quiz'} · ${quizLabel(quiz, study).replace(/^(Esercizi|Quiz) · /, '')}`,
        )}
        <div className="quiz-sheet">
          <div className="result-top">
            <div className="score-ring">
              <svg width="104" height="104" viewBox="0 0 104 104" aria-hidden="true">
                <circle cx="52" cy="52" r={R} fill="#fff" stroke="#FFF0BF" strokeWidth="10" />
                <circle
                  cx="52"
                  cy="52"
                  r={R}
                  fill="none"
                  stroke={c.accent}
                  strokeWidth="10"
                  strokeLinecap="round"
                  strokeDasharray={`${Math.max(0.001, ratio) * C} ${C + 10}`}
                  transform="rotate(-90 52 52)"
                />
              </svg>
              <span>
                {quiz.score}/{n}
              </span>
            </div>
            <div>
              <h1>
                {ratio >= 0.8
                  ? 'Ottimo, Ema!'
                  : ratio >= 0.5
                    ? 'Brava, Ema!'
                    : 'Continua così, Ema!'}
              </h1>
              <p className="muted">
                {quiz.kind === 'esercizi'
                  ? `Hai finito i giorni di studio di ${study.subject}`
                  : quiz.chapter != null
                    ? `Capitolo ${quiz.chapter} completato`
                    : `Hai finito i giorni di studio di ${study.subject}`}
              </p>
              {quiz.coinsAwarded > 0 && (
                <span className="coins-pill">+{quiz.coinsAwarded} monetine</span>
              )}
            </div>
          </div>
          <ol className="result-list">
            {quiz.questions.map((q, k) => {
              const right = quiz.answers[k] === q.correctIndex;
              return (
                <li
                  key={k}
                  className={right ? '' : 'ko'}
                  style={right ? undefined : { borderColor: c.bg }}
                >
                  <div className="rl-row">
                    {right ? OK : KO}
                    <p>
                      <strong>{k + 1}.</strong> {q.question}
                    </p>
                  </div>
                  {!right && quiz.kind === 'quiz' && (
                    <p className="right-answer">Risposta giusta: {q.options[q.correctIndex]}</p>
                  )}
                  {!right && quiz.kind === 'esercizi' && (
                    <>
                      <p className="right-answer">Risposta giusta: {q.options[q.correctIndex]}</p>
                      {open === k ? (
                        <p className="solution">{q.solution}</p>
                      ) : (
                        <button type="button" className="see-solution" onClick={() => setOpen(k)}>
                          Vedi la soluzione
                        </button>
                      )}
                    </>
                  )}
                </li>
              );
            })}
          </ol>
          <div className="quiz-actions">
            <button type="button" className="dark-big" onClick={() => go(studyPath(study.id!))}>
              Torna allo studio
            </button>
            <p className="footer-note">{footer}</p>
          </div>
        </div>
      </div>
    );
  }

  // ---------- perguntas ----------
  const q = quiz.questions[i];
  const confirm = async () => {
    if (pick === null) return;
    const next = [...answers, pick];
    setAnswers(next);
    setPick(null);
    if (next.length < n) setI(i + 1);
    else await finishQuiz(id, next);
  };
  return (
    <div className="quiz-screen" style={{ background: c.bg }}>
      {head(`${quizLabel(quiz, study).split(' · ')[0]} · ${i + 1} di ${n}`)}
      <div className="quiz-sheet">
        <div className="bar" aria-hidden="true">
          <i style={{ width: `${(i / n) * 100}%`, background: c.accent }} />
        </div>
        <h1 className="q-text">{q.question}</h1>
        <div className="options" role="radiogroup" aria-label="Risposte">
          {q.options.map((o, k) => (
            <button
              type="button"
              role="radio"
              aria-checked={pick === k}
              key={k}
              className={'option' + (pick === k ? ' on' : '')}
              style={pick === k ? { background: readableFill(c.accent), color: '#fff' } : undefined}
              onClick={() => setPick(k)}
            >
              {o}
            </button>
          ))}
        </div>
        <div className="quiz-actions">
          <button
            type="button"
            className="dark-big"
            disabled={pick === null}
            onClick={() => void confirm()}
          >
            Conferma
          </button>
          <p className="footer-note">{footer}</p>
        </div>
      </div>
    </div>
  );
}
