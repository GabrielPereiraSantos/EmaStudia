import { format, parseISO } from 'date-fns';
import { it } from 'date-fns/locale';
import type { PlanDay, Session } from '../db/types';
import { weekdayOf } from '../lib/dates';
import { faceFor, secondsByDate, type Face } from '../plan/study';

const LETTERS = ['L', 'M', 'M', 'G', 'V', 'S', 'D'];

function FaceIcon({ face }: { face: Face }) {
  if (face === 'happy')
    return (
      <svg width="34" height="34" viewBox="0 0 30 30" role="img" aria-label="Ha studiato">
        <circle cx="15" cy="15" r="14" fill="#FFD866" />
        <circle cx="11" cy="12.5" r="1.6" fill="#4A3612" />
        <circle cx="19" cy="12.5" r="1.6" fill="#4A3612" />
        <path
          d="M10 17.5c2.5 3 7.5 3 10 0"
          stroke="#4A3612"
          strokeWidth="1.8"
          fill="none"
          strokeLinecap="round"
        />
      </svg>
    );
  if (face === 'sad')
    return (
      <svg width="34" height="34" viewBox="0 0 30 30" role="img" aria-label="Non ha studiato">
        <circle cx="15" cy="15" r="14" fill="#E7E2D6" />
        <circle cx="11" cy="12.5" r="1.6" fill="#5A5345" />
        <circle cx="19" cy="12.5" r="1.6" fill="#5A5345" />
        <path
          d="M10.5 20.5c2.5-2.5 6.5-2.5 9 0"
          stroke="#5A5345"
          strokeWidth="1.8"
          fill="none"
          strokeLinecap="round"
        />
      </svg>
    );
  return (
    <svg width="34" height="34" viewBox="0 0 30 30" role="img" aria-label="Non ancora">
      <circle
        cx="15"
        cy="15"
        r="13"
        fill="#FFF6D6"
        stroke="#F0D27A"
        strokeWidth="1.5"
        strokeDasharray="3 3"
      />
    </svg>
  );
}

export function Faces({
  days,
  sessions,
  today,
}: {
  days: PlanDay[];
  sessions: Session[];
  today: string;
}) {
  const secs = secondsByDate(sessions);
  if (days.length === 0) return <p className="muted">Nessun giorno in programma.</p>;
  return (
    <div className="faces" aria-label="Giorni di studio">
      {days.map((d) => {
        const wd = weekdayOf(d.date);
        const face = faceFor(d.date, today, secs.get(d.date) ?? 0);
        return (
          <div
            key={d.id}
            className={'face' + (d.date === today ? ' today' : '')}
            style={wd === 3 ? { background: '#F9B4D3' } : undefined}
          >
            <FaceIcon face={face} />
            <span>
              {LETTERS[wd - 1]} {format(parseISO(d.date), 'd', { locale: it })}
            </span>
          </div>
        );
      })}
    </div>
  );
}
