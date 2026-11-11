import { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { it } from 'date-fns/locale';
import { db } from '../db/db';
import { SUBJECT_COLORS } from '../lib/colors';
import { monthCells } from '../lib/calendar';
import { daysBetween, todayISO, weekdayOf, type ISODate } from '../lib/dates';
import { taskText } from '../lib/labels';
import { go, studyPath } from '../lib/router';
import { useLive } from '../lib/useLive';
import { pagesDoneTotal } from '../plan/core';

const LETTERS = ['L', 'M', 'M', 'G', 'V', 'S', 'D'];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function Calendario() {
  const today = todayISO();
  const now = new Date();
  const [ym, setYm] = useState({ year: now.getFullYear(), month: now.getMonth() });
  const [selected, setSelected] = useState<ISODate>(today);
  const data = useLive(async () => {
    const studies = (await db.studies.toArray()).filter((s) => !s.archived);
    const days = await db.planDays.toArray();
    return { studies, days };
  }, []);

  const studies = data?.studies ?? [];
  const byId = new Map(studies.map((s) => [s.id!, s]));
  const days = (data?.days ?? []).filter((d) => byId.has(d.studyId));
  const cells = monthCells(ym.year, ym.month);
  const exams = new Map<ISODate, typeof studies>();
  for (const s of studies) exams.set(s.examDate, [...(exams.get(s.examDate) ?? []), s]);

  const shift = (n: number) => {
    const d = new Date(ym.year, ym.month + n, 1);
    setYm({ year: d.getFullYear(), month: d.getMonth() });
  };

  const upcoming = studies
    .filter((s) => s.examDate >= today)
    .sort((a, b) => a.examDate.localeCompare(b.examDate));
  const percent = (id: number) => {
    const s = byId.get(id)!;
    const total = s.pageEnd - s.pageStart + 1;
    return Math.min(
      100,
      Math.round((pagesDoneTotal(days.filter((d) => d.studyId === id)) / Math.max(1, total)) * 100),
    );
  };
  const when = (d: ISODate) => {
    const n = daysBetween(today, d);
    return n === 0 ? 'oggi' : n === 1 ? 'domani' : `tra ${n} giorni`;
  };

  const dayTasks = days.filter((d) => d.date === selected);
  const dayExams = exams.get(selected) ?? [];

  return (
    <div className="page calendar">
      <div className="page-head between">
        <h1 className="big">Calendario</h1>
        <div className="nav-btns">
          <button
            type="button"
            className="round-btn sm"
            aria-label="Mese precedente"
            onClick={() => shift(-1)}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M15 5l-7 7 7 7" />
            </svg>
          </button>
          <button
            type="button"
            className="round-btn sm"
            aria-label="Mese successivo"
            onClick={() => shift(1)}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>
      <p className="month-label" aria-live="polite">
        {cap(format(new Date(ym.year, ym.month, 1), 'LLLL yyyy', { locale: it }))}
      </p>

      <div className="cal-card">
        <div className="cal-grid head">
          {LETTERS.map((l, i) => (
            <span key={i} className={i === 2 ? 'wed' : ''}>
              {l}
            </span>
          ))}
        </div>
        <div className="cal-grid">
          {cells.map((c) => {
            const exam = exams.get(c.date)?.[0];
            const col = exam ? SUBJECT_COLORS[exam.colorKey] : null;
            const isToday = c.date === today;
            const tasks = days.filter((d) => d.date === c.date);
            const style = col
              ? { background: col.bg, color: '#4A3612', fontWeight: 700 }
              : isToday
                ? { background: '#4A3612', color: '#FFE597', fontWeight: 700 }
                : undefined;
            const wed = weekdayOf(c.date) === 3;
            return (
              <button
                type="button"
                key={c.date}
                aria-label={
                  format(parseISO(c.date), 'd MMMM', { locale: it }) +
                  (exam ? `, esame di ${exam.subject}` : '')
                }
                aria-pressed={selected === c.date}
                className={
                  'cell' +
                  (wed ? ' wed' : '') +
                  (c.inMonth ? '' : ' out') +
                  (selected === c.date ? ' sel' : '') +
                  (isToday && exam ? ' today-ring' : '')
                }
                style={style}
                onClick={() => {
                  setSelected(c.date);
                  if (!c.inMonth) {
                    const d = parseISO(c.date);
                    setYm({ year: d.getFullYear(), month: d.getMonth() });
                  }
                }}
              >
                {parseISO(c.date).getDate()}
                {tasks.length > 0 && !exam && (
                  <i className="dots">
                    {[...new Set(tasks.map((t) => byId.get(t.studyId)!.colorKey))]
                      .slice(0, 3)
                      .map((k) => (
                        <b key={k} style={{ background: SUBJECT_COLORS[k].accent }} />
                      ))}
                  </i>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <section className="day-panel" aria-live="polite">
        <h2>{cap(format(parseISO(selected), 'EEEE d MMMM', { locale: it }))}</h2>
        {dayExams.map((s) => (
          <a
            key={'e' + s.id}
            className="day-item"
            style={{ background: SUBJECT_COLORS[s.colorKey].bg }}
            href={'#' + studyPath(s.id!)}
          >
            <strong>Esame di {s.subject}</strong>
          </a>
        ))}
        {dayTasks.map((t) => {
          const s = byId.get(t.studyId)!;
          return (
            <a
              key={t.id}
              className="day-item"
              style={{ background: SUBJECT_COLORS[s.colorKey].bg }}
              href={'#' + studyPath(s.id!)}
            >
              <span className="grow">
                <strong>
                  {s.emoji ? s.emoji + ' ' : ''}
                  {s.subject}
                </strong>
                <small>{[s.topic, taskText(t, s.splitMode)].filter(Boolean).join(' · ')}</small>
              </span>
              {t.done && <span className="pill">Fatto</span>}
            </a>
          );
        })}
        {dayTasks.length === 0 && dayExams.length === 0 && (
          <p className="muted">Niente in programma questo giorno.</p>
        )}
      </section>

      <h2 className="sec-title">Prossimi esami</h2>
      {data && upcoming.length === 0 && <p className="empty">Nessun esame in arrivo.</p>}
      <div className="exam-list">
        {upcoming.map((s) => {
          const c = SUBJECT_COLORS[s.colorKey];
          const d = parseISO(s.examDate);
          return (
            <button
              type="button"
              key={s.id}
              className="exam"
              style={{ background: c.bg }}
              onClick={() => go(studyPath(s.id!))}
            >
              <span className="exam-date">
                <strong>{d.getDate()}</strong>
                <small>{format(d, 'MMM', { locale: it })}</small>
              </span>
              <span className="grow">
                <strong>{s.subject}</strong>
                <small>
                  {when(s.examDate)} · {percent(s.id!)}% fatto
                </small>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
