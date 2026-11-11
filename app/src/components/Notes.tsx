import { useState } from 'react';
import { addNote, deleteNote, updateNote } from '../db/repo';
import type { Note } from '../db/types';

export function Notes({ studyId, notes }: { studyId: number; notes: Note[] }) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState<number | null>(null);

  const save = async () => {
    if (draft.trim()) {
      if (editing != null) await updateNote(editing, draft);
      else await addNote(studyId, draft);
    }
    setAdding(false);
    setEditing(null);
    setDraft('');
  };

  return (
    <>
      <div className="row-between">
        <p className="card-title">Da memorizzare</p>
        <button
          type="button"
          className="round-small"
          aria-label="Nuova nota"
          onClick={() => {
            setAdding(true);
            setEditing(null);
            setDraft('');
          }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.6"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      </div>
      {notes.length === 0 && !adding && (
        <p className="muted">Scrivi qui le cose da ricordare: te le mostro nelle notifiche.</p>
      )}
      <ul className="note-list">
        {notes.map((n) =>
          editing === n.id ? null : (
            <li key={n.id}>
              <button
                type="button"
                className="note-text"
                onClick={() => {
                  setEditing(n.id!);
                  setAdding(true);
                  setDraft(n.text);
                }}
              >
                {n.text}
              </button>
              <button
                type="button"
                className="x small"
                aria-label="Elimina nota"
                onClick={() => void deleteNote(n.id!)}
              >
                ×
              </button>
            </li>
          ),
        )}
      </ul>
      {adding && (
        <div className="note-edit">
          <textarea
            autoFocus
            rows={2}
            maxLength={280}
            aria-label="Nota"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <div className="row-between">
            <button
              type="button"
              className="link"
              onClick={() => {
                setAdding(false);
                setEditing(null);
              }}
            >
              Annulla
            </button>
            <button type="button" className="add" onClick={() => void save()}>
              Salva nota
            </button>
          </div>
        </div>
      )}
    </>
  );
}
