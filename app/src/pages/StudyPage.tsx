import { format, parseISO } from 'date-fns';
import { it } from 'date-fns/locale';
import { BackButton } from '../components/BackButton';
import { db } from '../db/db';
import { deleteStudy, setArchived } from '../db/repo';
import { SUBJECT_COLORS } from '../lib/colors';
import { daysBetween, todayISO } from '../lib/dates';
import { taskText } from '../lib/labels';
import { go, studyPath } from '../lib/router';
import { useLive } from '../lib/useLive';

/** Versão provisória: a tela completa do estudo é da Fase 2. */
export function StudyPage({ id }: { id: number }) {
  const today = todayISO();
  const data = useLive(async () => {
    const study = await db.studies.get(id);
    const days = await db.planDays.where('studyId').equals(id).sortBy('date');
    return { study, days };
  }, [id]);

  if (!data) return <div className="page" />;
  const { study, days } = data;
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

  return (
    <div className="page">
      <div className="page-head">
        <BackButton onClick={() => go('/')} />
        <div className="grow">
          <h1>
            {study.emoji ? study.emoji + ' ' : ''}
            {study.subject}
          </h1>
          {study.topic && <p className="sub">{study.topic}</p>}
        </div>
        <span className="chip-days">{left > 0 ? `${left} giorni` : 'oggi'}</span>
      </div>

      <div className="card">
        <span className="lbl">Programma</span>
        <ul className="plan-list">
          {days.map((d) => (
            <li
              key={d.id}
              className={(d.date === today ? 'today ' : '') + (d.date < today ? 'past' : '')}
            >
              <span className="d" style={d.date === today ? { background: c.bg } : undefined}>
                {format(parseISO(d.date), 'EEE d MMM', { locale: it })}
              </span>
              <span>{taskText(d, study.splitMode)}</span>
              {d.done && <span className="ok">Fatto</span>}
            </li>
          ))}
        </ul>
      </div>

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
    </div>
  );
}
