import { useRef, useState } from 'react';
import { ConfirmSheet } from '../components/ConfirmSheet';
import { Thinking } from '../components/Thinking';
import {
  geminiSummary,
  openChatGpt,
  PLAN_B_MESSAGE,
  THINKING_TEXT,
  type GeminiError,
} from '../lib/gemini';
import { chatGptSummaryPrompt } from '../plan/quizzes';
import { format, parseISO } from 'date-fns';
import { it } from 'date-fns/locale';
import { AddTime } from '../components/AddTime';
import { BackButton } from '../components/BackButton';
import { Faces } from '../components/Faces';
import { Notes } from '../components/Notes';
import { needsPaceNotice, RhythmSheet } from '../components/RhythmSheet';
import { Timer } from '../components/Timer';
import { db } from '../db/db';
import {
  deleteStudy,
  markDone,
  setArchived,
  setProgress,
  setSummary,
  unmarkDone,
} from '../db/repo';
import { SUBJECT_COLORS } from '../lib/colors';
import { daysBetween, todayISO } from '../lib/dates';
import { taskText } from '../lib/labels';
import { go, studyPath } from '../lib/router';
import { loadTimer } from '../lib/timer';
import { useLive } from '../lib/useLive';
import { draftPages, pagesDoneTotal } from '../plan/core';
import { STUDIED_SEC, totalSeconds } from '../plan/study';
import { isSafeUrl } from '../lib/validateStudy';

export function StudyPage({ id }: { id: number }) {
  const today = todayISO();
  const data = useLive(async () => {
    const study = await db.studies.get(id);
    const days = await db.planDays.where('studyId').equals(id).sortBy('date');
    const sessions = await db.sessions.toArray();
    const settings = await db.settings.get(1);
    const notes = await db.notes.where('studyId').equals(id).toArray();
    const running = loadTimer();
    const runningStudy =
      running && running.studyId !== id ? await db.studies.get(running.studyId) : undefined;
    return { study, days, sessions, settings, notes, runningStudy };
  }, [id]);

  const [addTime, setAddTime] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [toast, setToast] = useState('');
  const [summaryBusy, setSummaryBusy] = useState(false);
  const [summaryFail, setSummaryFail] = useState<GeminiError | null>(null);
  const [askReplace, setAskReplace] = useState<string | null>(null);
  const summaryRef = useRef<HTMLTextAreaElement>(null);
  const [partial, setPartial] = useState<string | null>(null);

  if (!data) return <div className="page" />;
  const { study, days, sessions, settings, notes, runningStudy } = data;
  if (!study)
    return (
      <div className="page">
        <div className="page-head">
          <BackButton onClick={() => go('/')} />
          <h1>Studio</h1>
        </div>
        <p className="empty">Studio non trovato.</p>
      </div>
    );

  const c = SUBJECT_COLORS[study.colorKey];
  const left = daysBetween(today, study.examDate);
  const mySessions = sessions.filter((s) => s.studyId === id);
  const studioDays = days.filter((d) => d.kind === 'studio');
  const totalPages = study.pageEnd - study.pageStart + 1;
  const donePages = pagesDoneTotal(days);
  const task = days.find((d) => d.date === today);
  const taskPages = task ? draftPages(task) : 0;
  const late = needsPaceNotice(study, days, today);

  const flash = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(''), 4000);
  };

  const finish = async () => {
    if (!task) return;
    await markDone(task.id!);
    setPartial(null);
    // As moedinhas contam a soma de todos os estudos no dia.
    if (totalSeconds(sessions, today) < STUDIED_SEC)
      flash('Ricorda di avviare il cronometro per guadagnare le monetine');
  };

  const savePartial = async () => {
    if (!task || partial === null) return;
    const n = Number(partial);
    if (!Number.isFinite(n) || n < 0 || n > taskPages)
      return flash(`Scrivi un numero da 0 a ${taskPages}.`);
    await setProgress(task.id!, n);
    setPartial(null);
    if (n >= taskPages && totalSeconds(sessions, today) < STUDIED_SEC)
      flash('Ricorda di avviare il cronometro per guadagnare le monetine');
  };

  const summaryCtx = () => ({
    study,
    notes: notes.map((n) => n.text),
  });
  const makeSummary = async () => {
    setSummaryBusy(true);
    setSummaryFail(null);
    const r = await geminiSummary(summaryCtx());
    setSummaryBusy(false);
    if (!r.ok) return setSummaryFail(r.error);
    // não apaga o que ela escreveu sem perguntar
    if (study.summary.trim()) setAskReplace(r.summary);
    else await setSummary(id, r.summary);
  };
  const summaryChatGpt = async () => {
    const copied = await openChatGpt(
      chatGptSummaryPrompt({
        subject: study.subject,
        topic: study.topic,
        difficulty: study.difficulty,
        notes: notes.map((n) => n.text),
        summary: '',
      }),
    );
    flash(
      copied
        ? 'Prompt copiato! Incolla il riassunto di ChatGPT qui sopra.'
        : 'Apri ChatGPT e chiedi il riassunto.',
    );
  };

  return (
    <div className="page study">
      <div className="page-head between">
        <BackButton onClick={() => go('/')} />
        <div className="center">
          <h1>
            {study.emoji ? study.emoji + ' ' : ''}
            {study.subject}
          </h1>
          {study.topic && <p className="sub">{study.topic}</p>}
        </div>
        <span className="chip-days">
          {left > 0 ? `${left} ${left === 1 ? 'giorno' : 'giorni'}` : 'oggi'}
        </span>
      </div>

      {late && (
        <button type="button" className="late-banner" onClick={() => setSheet(true)}>
          Sei in ritardo sul piano. Tocca per sistemarlo.
        </button>
      )}

      <Timer
        studyId={id}
        workMin={settings?.pomodoroWork ?? 25}
        breakMin={settings?.pomodoroBreak ?? 5}
        otherStudy={runningStudy ? { id: runningStudy.id!, subject: runningStudy.subject } : null}
        onSaved={(m) => flash(`Sessione salvata: ${m} min.`)}
      />
      <div className="center-row">
        <button type="button" className="add-time" onClick={() => setAddTime(true)}>
          Aggiungi tempo
        </button>
      </div>

      <section className="card summary" style={{ background: c.bg }}>
        <div className="row-between">
          <p className="card-title">Riassunto</p>
          <button
            type="button"
            className="gemini-btn"
            disabled={summaryBusy}
            onClick={() => void makeSummary()}
          >
            {summaryBusy ? THINKING_TEXT : 'Genera con Gemini'}
          </button>
        </div>
        <textarea
          ref={summaryRef}
          key={study.id + ':' + study.summary}
          aria-label="Riassunto"
          placeholder="Scrivi qui il riassunto…"
          defaultValue={study.summary}
          maxLength={2000}
          rows={study.summary.length > 200 ? 8 : 3}
          onBlur={(e) => {
            if (e.target.value !== study.summary) void setSummary(id, e.target.value);
          }}
        />
        {summaryBusy && <Thinking />}
        {summaryFail && (
          <div className="planb">
            <p className="muted">{PLAN_B_MESSAGE[summaryFail]}</p>
            <div className="planb-btns">
              <button type="button" className="soft" onClick={() => void summaryChatGpt()}>
                Apri in ChatGPT
              </button>
              <button
                type="button"
                className="soft"
                onClick={() => {
                  setSummaryFail(null);
                  summaryRef.current?.focus();
                }}
              >
                Scrivi tu
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="card">
        <Faces days={days} sessions={mySessions} today={today} />
      </section>

      <section className="card">
        <div className="row-between">
          <p className="card-title">Progresso</p>
          <span className="prog-text">
            {donePages} / {totalPages} pagine
          </span>
        </div>
        <div className="bar">
          <i style={{ width: `${Math.min(100, (donePages / Math.max(1, totalPages)) * 100)}%` }} />
        </div>

        {task && (
          <div className="today-task">
            <p className="tt-label">Oggi · {taskText(task, study.splitMode)}</p>
            {task.done ? (
              <div className="row-between">
                <span className="done-tag">Fatto</span>
                <button type="button" className="link" onClick={() => void unmarkDone(task.id!)}>
                  Annulla
                </button>
              </div>
            ) : (
              <>
                {taskPages > 0 && (
                  <div className="partial">
                    <span>Oggi ho fatto</span>
                    <input
                      className="field mini"
                      inputMode="numeric"
                      aria-label="Pagine fatte oggi"
                      value={partial ?? String(task.pagesDone)}
                      onChange={(e) => setPartial(e.target.value.replace(/\D/g, ''))}
                    />
                    <span>di {taskPages} pagine</span>
                    {partial !== null && (
                      <button type="button" className="add" onClick={() => void savePartial()}>
                        Salva
                      </button>
                    )}
                  </div>
                )}
                <button type="button" className="primary small" onClick={() => void finish()}>
                  Segna come fatto
                </button>
              </>
            )}
          </div>
        )}
        {!task && studioDays.length > 0 && (
          <p className="muted">Oggi non c'è niente in programma per questo studio.</p>
        )}
      </section>

      <section className="card notes" style={{ background: '#FFE597' }}>
        <Notes studyId={id} notes={notes} />
      </section>

      {study.materials.length > 0 && (
        <section className="card">
          <p className="card-title">Materiali</p>
          <ul className="materials">
            {study.materials
              .filter((m) => isSafeUrl(m.url))
              .map((m, i) => (
                <li key={i}>
                  <a href={m.url} target="_blank" rel="noopener noreferrer">
                    {m.title}
                  </a>
                </li>
              ))}
          </ul>
        </section>
      )}

      <section className="card">
        <p className="card-title">Programma</p>
        <ul className="plan-list">
          {days.map((d) => (
            <li key={d.id} className={d.date < today ? 'past' : ''}>
              <span className="d" style={d.date === today ? { background: c.bg } : undefined}>
                {format(parseISO(d.date), 'EEE d MMM', { locale: it })}
              </span>
              <span>{taskText(d, study.splitMode)}</span>
              {d.done && <span className="ok">Fatto</span>}
            </li>
          ))}
        </ul>
      </section>

      <div className="actions">
        <button type="button" className="soft" onClick={() => go(studyPath(id) + '/modifica')}>
          Modifica
        </button>
        <button
          type="button"
          className="soft"
          onClick={async () => {
            await setArchived(id, !study.archived);
            go('/');
          }}
        >
          {study.archived ? 'Ripristina' : 'Archivia'}
        </button>
        <button
          type="button"
          className="soft danger"
          onClick={async () => {
            if (confirm(`Eliminare lo studio di ${study.subject}? Non si può annullare.`)) {
              await deleteStudy(id);
              go('/');
            }
          }}
        >
          Elimina
        </button>
      </div>

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
      {addTime && (
        <AddTime
          studyId={id}
          minDate={study.startDate}
          onClose={() => setAddTime(false)}
          onSaved={(m, d) => flash(`Aggiunti ${m} min al ${format(parseISO(d), 'dd/MM')}.`)}
        />
      )}
      {askReplace !== null && (
        <ConfirmSheet
          title="Sostituire il riassunto?"
          text="Gemini ha scritto un nuovo riassunto. Quello che hai adesso verrà sostituito."
          confirmLabel="Sì, sostituisci"
          onConfirm={async () => {
            await setSummary(id, askReplace);
            setAskReplace(null);
          }}
          onClose={() => setAskReplace(null)}
        />
      )}
      {sheet && <RhythmSheet study={study} days={days} onClose={() => setSheet(false)} />}
    </div>
  );
}
