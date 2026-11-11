import { useState } from 'react';
import { addSession } from '../db/repo';
import { todayISO, type ISODate } from '../lib/dates';

interface Props {
  studyId: number;
  minDate: ISODate;
  onClose: () => void;
  onSaved: (minutes: number, date: ISODate) => void;
}
import { useSheet } from './useSheet';

export function AddTime({ studyId, minDate, onClose, onSaved }: Props) {
  const sheetRef = useSheet(onClose);
  const today = todayISO();
  const [minutes, setMinutes] = useState('');
  const [date, setDate] = useState(today);
  const [err, setErr] = useState('');

  const save = async () => {
    const m = Number(minutes);
    if (!Number.isInteger(m) || m < 1 || m > 600)
      return setErr('Scrivi i minuti studiati (da 1 a 600).');
    if (!date || date > today) return setErr('Scegli oggi o un giorno passato.');
    await addSession(studyId, date, m * 60, 'libero', true);
    onSaved(m, date);
    onClose();
  };

  return (
    <div className="sheet-wrap" role="dialog" aria-modal="true" aria-label="Aggiungi tempo">
      <div className="sheet-bg" onClick={onClose} />
      <div className="sheet" ref={sheetRef} tabIndex={-1}>
        <span className="grip" />
        <h2>Aggiungi tempo</h2>
        <p className="how">Hai studiato senza il cronometro? Scrivi quanto.</p>
        <div className="grid2 form">
          <label className="lbl">
            Minuti
            <input
              className="field"
              inputMode="numeric"
              autoFocus
              value={minutes}
              onChange={(e) => setMinutes(e.target.value.replace(/\D/g, ''))}
            />
          </label>
          <label className="lbl">
            Giorno
            <input
              className="field"
              type="date"
              value={date}
              min={minDate}
              max={today}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
        </div>
        {err && (
          <p className="errors" role="alert">
            {err}
          </p>
        )}
        <button type="button" className="primary sheet-confirm" onClick={() => void save()}>
          Salva
        </button>
        <button type="button" className="sheet-skip" onClick={onClose}>
          Annulla
        </button>
      </div>
    </div>
  );
}
