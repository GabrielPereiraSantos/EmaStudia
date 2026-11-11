import { useState } from 'react';
import { generateQuiz, quizContext, savePastedQuiz } from '../db/quizRepo';
import type { Quiz } from '../db/types';
import { openChatGpt, PLAN_B_MESSAGE } from '../lib/gemini';
import { Thinking } from './Thinking';
import { go } from '../lib/router';
import { chatGptPrompt, parsePasted } from '../plan/quizzes';

/** Plano B (8.3): Riprova, Apri in ChatGPT (+ Incolla qui la risposta), Scrivi tu. */
export function PlanB({ quiz, onToast }: { quiz: Quiz; onToast: (m: string) => void }) {
  const [paste, setPaste] = useState(false);
  const [text, setText] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const retry = async () => {
    setBusy(true);
    const ok = await generateQuiz(quiz.id!);
    setBusy(false);
    if (ok) onToast('Quiz pronto!');
  };
  const chatgpt = async () => {
    const ctx = await quizContext(quiz);
    if (!ctx) return;
    const copied = await openChatGpt(chatGptPrompt(quiz.kind, ctx));
    onToast(
      copied
        ? 'Prompt copiato! Incollalo in ChatGPT, poi torna qui e incolla la risposta.'
        : 'Apri ChatGPT e chiedi il quiz: non sono riuscita a copiare il prompt.',
    );
    setPaste(true);
  };
  const save = async () => {
    const r = parsePasted(quiz.kind, text);
    if (!r.ok) return setErr(r.error);
    await savePastedQuiz(quiz.id!, r.questions);
    setPaste(false);
    onToast('Quiz salvato! Puoi iniziarlo.');
  };

  return (
    <div className="planb">
      {busy ? <Thinking /> : <p className="muted">{PLAN_B_MESSAGE[quiz.failReason ?? 'errore']}</p>}
      <div className="planb-btns">
        <button type="button" className="soft" disabled={busy} onClick={() => void retry()}>
          Riprova
        </button>
        <button type="button" className="soft" onClick={() => void chatgpt()}>
          Apri in ChatGPT
        </button>
        <button type="button" className="soft" onClick={() => go(`/quiz/${quiz.id}/scrivi`)}>
          Scrivi tu
        </button>
      </div>
      {!paste && (
        <button type="button" className="link" onClick={() => setPaste(true)}>
          Incolla qui la risposta di ChatGPT
        </button>
      )}
      {paste && (
        <div className="note-edit">
          <label className="lbl">
            Incolla qui la risposta
            <textarea
              rows={5}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setErr('');
              }}
              placeholder='{"questions": [...]}'
            />
          </label>
          {err && (
            <p className="errors" role="alert">
              {err}
            </p>
          )}
          <div className="row-between">
            <button type="button" className="link" onClick={() => setPaste(false)}>
              Annulla
            </button>
            <button
              type="button"
              className="add"
              disabled={!text.trim()}
              onClick={() => void save()}
            >
              Salva quiz
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
