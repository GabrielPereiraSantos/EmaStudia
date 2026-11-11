import { useState } from 'react';
import { acceptNewPace, redistribute, snoozePace } from '../db/repo';
import type { PlanDay, Study } from '../db/types';
import { SUBJECT_COLORS } from '../lib/colors';
import { todayISO } from '../lib/dates';
import { assessPace } from '../plan/pace';
import { addableWeekday, addWeekdayLabel, lastStudioDate, perDayWith } from '../plan/study';
import { draftPages } from '../plan/core';
import { format, parseISO } from 'date-fns';
import { it } from 'date-fns/locale';

const fmt = (d: string, f: string) => format(parseISO(d), f, { locale: it });

interface Props {
  study: Study;
  days: PlanDay[];
  onClose: () => void;
}
import { useSheet } from './useSheet';

export function RhythmSheet({ study, days, onClose }: Props) {
  const today = todayISO();
  const pace = assessPace(study, days, today);
  const wd = addableWeekday(study, today);
  const [choice, setChoice] = useState<'auto' | 'day'>('auto');
  const [busy, setBusy] = useState(false);
  const c = SUBJECT_COLORS[study.colorKey];

  const task = days.find((d) => d.date === today && d.kind === 'studio');
  const taskPages = task ? draftPages(task) : 0;
  const donePages = task ? (task.done ? taskPages : task.pagesDone) : 0;
  const last = lastStudioDate(study, today);

  const title =
    pace.reasons.includes('ritmo') && pace.delayDays === null
      ? "Ema, a questo ritmo non finisci prima dell'esame"
      : pace.delayDays && pace.delayDays > 0
        ? `Ema, a questo ritmo finisci ${pace.delayDays} ${pace.delayDays === 1 ? 'giorno' : 'giorni'} dopo l'esame`
        : `Ema, ora servono ${pace.newPerDay} pagine al giorno invece di ${pace.basePerDay}`;

  const confirm = async () => {
    setBusy(true);
    try {
      await redistribute(study.id!, today, choice === 'day' && wd ? wd : undefined);
      onClose();
    } finally {
      setBusy(false);
    }
  };
  // Fechar tocando fora só esconde o aviso hoje; "Lascia com'è" aceita o novo ritmo.
  const dismiss = async () => {
    await snoozePace(study.id!, today);
    onClose();
  };
  const keep = async () => {
    await acceptNewPace(study.id!, today);
    onClose();
  };

  const sheetRef = useSheet(() => void dismiss());

  return (
    <div className="sheet-wrap" role="dialog" aria-modal="true" aria-label="Avviso di ritmo">
      <div className="sheet-bg" onClick={() => void dismiss()} />
      <div className="sheet" ref={sheetRef} tabIndex={-1}>
        <span className="grip" />
        <div className="sheet-top">
          <span className="subj-pill" style={{ background: c.bg }}>
            {study.subject}
          </span>
          <span className="sheet-exam">esame il {fmt(study.examDate, 'd MMMM')}</span>
        </div>
        <h2>{title}</h2>
        {task && taskPages > 0 && (
          <div className="mini-card">
            <div>
              <span>Oggi hai fatto</span>
              <span>
                {donePages} di {taskPages} pagine
              </span>
            </div>
            <div className="bar">
              <i style={{ width: `${Math.min(100, (donePages / taskPages) * 100)}%` }} />
            </div>
          </div>
        )}
        <p className="how">Come vuoi recuperare?</p>
        <button
          type="button"
          role="radio"
          aria-checked={choice === 'auto'}
          className={'opt' + (choice === 'auto' ? ' on' : '')}
          onClick={() => setChoice('auto')}
        >
          <span className="radio" />
          <span>
            <strong>Ridistribuisci in automatico</strong>
            <span>
              {Number.isFinite(pace.newPerDay)
                ? `${pace.newPerDay} pagine al giorno`
                : 'nuovo piano'}
              {last ? ` fino al ${fmt(last, 'dd/MM')}` : ''}
            </span>
          </span>
        </button>
        {wd && (
          <button
            type="button"
            role="radio"
            aria-checked={choice === 'day'}
            className={'opt' + (choice === 'day' ? ' on' : '')}
            onClick={() => setChoice('day')}
          >
            <span className="radio" />
            <span>
              <strong>{addWeekdayLabel(wd)}</strong>
              <span>{perDayWith(study, days, today, wd)} pagine al giorno</span>
            </span>
          </button>
        )}
        <button
          type="button"
          className="primary sheet-confirm"
          disabled={busy}
          onClick={() => void confirm()}
        >
          Conferma il nuovo piano
        </button>
        <button type="button" className="sheet-skip" onClick={() => void keep()}>
          Lascia com'è
        </button>
      </div>
    </div>
  );
}

/** Estudo atrasado que ainda não foi dispensado hoje. */
export function needsPaceNotice(study: Study, days: PlanDay[], today: string): boolean {
  if (study.archived || study.examDate <= today || study.paceSnoozedOn === today || !days.length)
    return false;
  return assessPace(study, days, today).late;
}
