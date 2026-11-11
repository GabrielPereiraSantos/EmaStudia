import { db } from '../db/db';
import { SUBJECT_COLORS } from '../lib/colors';
import { formatLongIt, greeting, todayISO } from '../lib/dates';
import { examIn, taskText, TYPE_LABEL, TYPE_STYLE } from '../lib/labels';
import { go, studyPath } from '../lib/router';
import { useLive } from '../lib/useLive';

export function Home() {
  const today = todayISO();
  const data = useLive(async () => {
    const studies = (await db.studies.toArray()).filter((s) => !s.archived);
    const days = await db.planDays.where('date').equals(today).toArray();
    return { studies, days };
  }, [today]);

  const studies = data?.studies ?? [];
  const byId = new Map(studies.map((s) => [s.id!, s]));
  const tasks = (data?.days ?? [])
    .filter((d) => byId.has(d.studyId))
    .sort(
      (a, b) =>
        Number(a.done) - Number(b.done) ||
        byId.get(a.studyId)!.examDate.localeCompare(byId.get(b.studyId)!.examDate),
    );
  const activeExams = studies.filter((s) => s.examDate >= today).length;

  return (
    <div className="page home">
      <header className="hero">
        <div className="blob1" />
        <div className="blob2" />
        <a href="#/impostazioni" className="gear" aria-label="Impostazioni">
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
          </svg>
        </a>
        <p className="date">{formatLongIt(new Date())}</p>
        <h1>{greeting()}</h1>
        <p>Cosa studiamo oggi?</p>
      </header>

      <div className="stats">
        <div>
          <strong>0</strong>
          <span>giorni di fila</span>
        </div>
        <i />
        <div>
          <strong>0</strong>
          <span>monetine</span>
        </div>
        <i />
        <div>
          <strong>{activeExams}</strong>
          <span>{activeExams === 1 ? 'esame' : 'esami'}</span>
        </div>
      </div>

      <section className="today">
        <h2>Oggi</h2>
        {data && studies.length === 0 && (
          <p className="empty">Nessuno studio ancora — creane uno!</p>
        )}
        {data && studies.length > 0 && tasks.length === 0 && (
          <p className="empty">Oggi niente in programma. Riposati, Ema.</p>
        )}
        {tasks.map((t) => {
          const s = byId.get(t.studyId)!;
          const c = SUBJECT_COLORS[s.colorKey];
          const what = [s.topic, taskText(t, s.splitMode)].filter(Boolean).join(' · ');
          if (t.done)
            return (
              <a
                key={t.id}
                className="task small"
                style={{ background: c.bg }}
                href={'#' + studyPath(s.id!)}
              >
                <div className="grow">
                  <p className="subj">
                    {s.emoji ? s.emoji + ' ' : ''}
                    {s.subject}
                  </p>
                  <p className="what">{what}</p>
                </div>
                <span className="pill" style={{ color: c.accent }}>
                  Fatto
                </span>
              </a>
            );
          const ts = TYPE_STYLE[s.type];
          return (
            <div key={t.id} className="task" style={{ background: c.bg }}>
              <div className="row">
                <span className="tag" style={{ background: ts.bg, color: ts.fg }}>
                  {TYPE_LABEL[s.type].toUpperCase()}
                </span>
                <span className="exam">{examIn(today, s.examDate)}</span>
              </div>
              <p className="subj big">
                {s.emoji ? s.emoji + ' ' : ''}
                {s.subject}
              </p>
              <p className="what">{what}</p>
              <button type="button" className="dark-btn" onClick={() => go(studyPath(s.id!))}>
                Studia ora
              </button>
            </div>
          );
        })}
      </section>

      <button type="button" className="fab" aria-label="Nuovo studio" onClick={() => go('/nuovo')}>
        <svg
          width="28"
          height="28"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#fff"
          strokeWidth="2.6"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>
    </div>
  );
}
