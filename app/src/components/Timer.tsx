import { useCallback, useEffect, useRef, useState } from 'react';
import { addSession } from '../db/repo';
import { toISO } from '../lib/dates';
import {
  formatClock,
  loadTimer,
  pauseTimer,
  resumeTimer,
  saveTimer,
  startTimer,
  timerView,
  type TimerMode,
  type TimerState,
} from '../lib/timer';

const R = 92;
const C = 2 * Math.PI * R;

function beep() {
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 660;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.8);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.85);
  } catch {
    /* sem áudio: segue sem som */
  }
}

interface Props {
  studyId: number;
  workMin: number;
  breakMin: number;
  /** Nome do estudo em que o cronômetro está ativo, se for outro. */
  otherStudy?: { id: number; subject: string } | null;
  onSaved?: (minutes: number) => void;
}

export function Timer({ studyId, workMin, breakMin, otherStudy, onSaved }: Props) {
  const [state, setState] = useState<TimerState | null>(loadTimer);
  const [now, setNow] = useState(Date.now());
  const [msg, setMsg] = useState('');
  const lastPhase = useRef<{ index: number; at: number } | null>(null);

  const update = useCallback((s: TimerState | null) => {
    setState(s);
    saveTimer(s);
  }, []);

  // O relógio só redesenha; o tempo vem sempre de Date.now() − início.
  useEffect(() => {
    if (!state?.running) return;
    const tick = () => setNow(Date.now());
    const i = setInterval(tick, 500);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(i);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [state?.running]);

  const mine = state && state.studyId === studyId ? state : null;
  const cfg = { workMin, breakMin };
  const view = mine ? timerView(mine, mine.running ? now : (mine.startedAt ?? now), cfg) : null;

  // Aviso no fim de cada fase do pomodoro (só se o app estava à vista).
  useEffect(() => {
    if (!mine?.running || mine.mode !== 'pomodoro' || !view) return;
    const prev = lastPhase.current;
    if (prev && prev.index !== view.phaseIndex && now - prev.at < 3000) {
      navigator.vibrate?.([200, 100, 200]);
      beep();
    }
    lastPhase.current = { index: view.phaseIndex, at: now };
  }, [now, mine?.running, mine?.mode, view?.phaseIndex]);

  const begin = (mode: TimerMode) => {
    setMsg('');
    lastPhase.current = null;
    update(startTimer(studyId, mode, Date.now()));
    setNow(Date.now());
  };

  const stop = async () => {
    if (!mine) return;
    const v = timerView(mine, Date.now(), cfg);
    const sec = Math.floor(v.studiedMs / 1000);
    update(null);
    if (sec < 60) {
      setMsg('Sessione troppo breve (meno di 1 minuto): non salvata.');
      return;
    }
    await addSession(
      studyId,
      toISO(new Date(mine.sessionStart)),
      sec,
      mine.mode,
      false,
      mine.sessionStart,
    );
    const min = Math.round(sec / 60);
    setMsg(`Sessione salvata: ${min} min.`);
    onSaved?.(min);
  };

  const pomodoro = mine?.mode === 'pomodoro';
  const total = view?.phaseTotalMs ?? workMin * 60_000;
  const shown = view ? (pomodoro ? total - view.phaseMs : view.elapsedMs) : workMin * 60_000;
  const progress = view
    ? pomodoro
      ? Math.min(1, view.phaseMs / total)
      : (view.elapsedMs % 3_600_000) / 3_600_000
    : 0;
  const label = !view
    ? 'pomodoro'
    : view.phase === 'pausa'
      ? 'pausa'
      : view.phase === 'libero'
        ? 'libero'
        : 'pomodoro';
  const sub = !view
    ? `su ${formatClock(workMin * 60_000)}`
    : pomodoro
      ? `su ${formatClock(total)}`
      : 'tempo di studio';

  return (
    <section className="timer" aria-label="Cronometro">
      <div className="ring">
        <svg width="210" height="210" viewBox="0 0 210 210" aria-hidden="true">
          <circle cx="105" cy="105" r={R} fill="#FFFFFF" stroke="#FFF0BF" strokeWidth="14" />
          <circle
            cx="105"
            cy="105"
            r={R}
            fill="none"
            stroke={view?.phase === 'pausa' ? '#3C9A4A' : '#E8A317'}
            strokeWidth="14"
            strokeLinecap="round"
            strokeDasharray={`${Math.max(0.001, progress) * C} ${C + 20}`}
            transform="rotate(-90 105 105)"
          />
        </svg>
        <div className="ring-text" role="timer" aria-live="off">
          <span className="t-label">{label}</span>
          <span className="t-time">{formatClock(shown)}</span>
          <span className="t-sub">{sub}</span>
        </div>
      </div>

      {otherStudy && !mine ? (
        <p className="timer-note">
          Il cronometro è attivo su <a href={`#/studio/${otherStudy.id}`}>{otherStudy.subject}</a>.
          Fermalo prima di iniziarne un altro.
        </p>
      ) : (
        <div className="timer-btns">
          {!mine && (
            <>
              <button type="button" className="t-main" onClick={() => begin('pomodoro')}>
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d="M8 5v14l11-7z" />
                </svg>
                Inizia
              </button>
              <button type="button" className="t-soft" onClick={() => begin('libero')}>
                Libero
              </button>
            </>
          )}
          {mine && (
            <>
              {mine.running ? (
                <button
                  type="button"
                  className="t-main"
                  onClick={() => update(pauseTimer(mine, Date.now()))}
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path d="M7 5h4v14H7zM13 5h4v14h-4z" />
                  </svg>
                  Pausa
                </button>
              ) : (
                <button
                  type="button"
                  className="t-main"
                  onClick={() => {
                    update(resumeTimer(mine, Date.now()));
                    setNow(Date.now());
                  }}
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path d="M8 5v14l11-7z" />
                  </svg>
                  Riprendi
                </button>
              )}
              <button type="button" className="t-soft" onClick={() => void stop()}>
                Stop
              </button>
            </>
          )}
        </div>
      )}
      <p className="timer-msg" role="status">
        {msg}
      </p>
    </section>
  );
}
