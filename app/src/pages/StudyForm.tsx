import { useEffect, useMemo, useState } from 'react';
import { BackButton } from '../components/BackButton';
import { db } from '../db/db';
import { createStudy, updateStudy, type StudyInput } from '../db/repo';
import type { Level, SplitMode, StudyType } from '../db/types';
import { COLOR_KEYS, colorForName, pickColor, SUBJECT_COLORS, type ColorKey } from '../lib/colors';
import { todayISO } from '../lib/dates';
import { TYPE_LABEL, TYPE_STYLE } from '../lib/labels';
import { goUp, replace, studyPath } from '../lib/router';
import { validateStudy } from '../lib/validateStudy';
import { DEFAULT_REVIEW_DAYS } from '../plan/core';

const EMOJIS = [
  '📘',
  '📗',
  '📕',
  '📙',
  '📓',
  '🔬',
  '🧪',
  '🧬',
  '🧮',
  '📐',
  '📏',
  '🌍',
  '🏛️',
  '🎨',
  '🎭',
  '🎵',
  '💡',
  '🧠',
  '⚛️',
  '🌱',
  '🦠',
  '🩺',
  '📜',
  '✏️',
  '🗣️',
  '🇬🇧',
  '🇮🇹',
  '💻',
  '⭐',
  '🌻',
];
const DAYS = ['L', 'M', 'M', 'G', 'V', 'S', 'D'];
const DAY_NAMES = ['lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato', 'domenica'];
const LEVEL_STYLE: Record<Level, { bg: string; fg: string; ring: string }> = {
  1: { bg: '#D6F2D9', fg: '#2E6B38', ring: '#3C9A4A' },
  2: { bg: '#FFD866', fg: '#4A3612', ring: '#E0A800' },
  3: { bg: '#FFB3AC', fg: '#8E2219', ring: '#D93A2E' },
};

interface ChapterRow {
  n: string;
  title: string;
  startPage: string;
}

const int = (s: string) => (s.trim() === '' ? NaN : Number(s));

export function StudyForm({ id }: { id?: number }) {
  const today = todayISO();
  const [loaded, setLoaded] = useState(!id);
  const [subject, setSubject] = useState('');
  const [emoji, setEmoji] = useState<string | undefined>();
  const [showEmoji, setShowEmoji] = useState(false);
  const [colorKey, setColorKey] = useState<ColorKey | null>(null);
  const [colorManual, setColorManual] = useState(false);
  const [usedColors, setUsedColors] = useState<ColorKey[]>([]);
  const [topic, setTopic] = useState('');
  const [type, setType] = useState<StudyType | null>(null);
  const [pageStart, setPageStart] = useState('');
  const [pageEnd, setPageEnd] = useState('');
  const [chapters, setChapters] = useState<ChapterRow[]>([]);
  const [startDate, setStartDate] = useState(today);
  const [examDate, setExamDate] = useState('');
  const [splitMode, setSplitMode] = useState<SplitMode>('pagine');
  const [difficulty, setDifficulty] = useState<Level>(2);
  const [priority, setPriority] = useState<Level>(2);
  const [weekdays, setWeekdays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [reminderTime, setReminderTime] = useState('19:00');
  const [reviewDays, setReviewDays] = useState('2');
  const [reviewManual, setReviewManual] = useState(false);
  const [materials, setMaterials] = useState<{ title: string; url: string }[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      const all = await db.studies.toArray();
      setUsedColors(all.filter((s) => !s.archived && s.id !== id).map((s) => s.colorKey));
      const settings = await db.settings.get(1);
      if (!id && settings) setReminderTime(settings.defaultReminder);
      if (!id) return;
      const s = all.find((x) => x.id === id);
      if (!s) return;
      setSubject(s.subject);
      setEmoji(s.emoji);
      setColorKey(s.colorKey);
      setColorManual(true);
      setTopic(s.topic);
      setType(s.type);
      setPageStart(String(s.pageStart));
      setPageEnd(String(s.pageEnd));
      setChapters(
        s.chapters.map((c) => ({
          n: String(c.n),
          title: c.title ?? '',
          startPage: String(c.startPage),
        })),
      );
      setStartDate(s.startDate);
      setExamDate(s.examDate);
      setSplitMode(s.splitMode);
      setDifficulty(s.difficulty);
      setPriority(s.priority);
      setWeekdays(s.weekdays);
      setReminderTime(s.reminderTime);
      setReviewDays(String(s.reviewDays));
      setReviewManual(true);
      setMaterials(s.materials);
      setLoaded(true);
    })();
  }, [id]);

  const autoColor = useMemo(() => pickColor(subject, usedColors), [subject, usedColors]);
  const color = colorManual && colorKey ? colorKey : subject.trim() ? autoColor : null;
  const c = color ? SUBJECT_COLORS[color] : null;

  const onDifficulty = (l: Level) => {
    setDifficulty(l);
    if (!reviewManual) setReviewDays(String(DEFAULT_REVIEW_DAYS[l]));
  };

  const total = int(pageEnd) - int(pageStart) + 1;

  const submit = async () => {
    const input: StudyInput = {
      subject: subject.trim(),
      emoji,
      colorKey: color ?? 'fisica',
      topic: topic.trim(),
      type: type ?? 'umanistiche',
      difficulty,
      priority,
      pageStart: int(pageStart),
      pageEnd: int(pageEnd),
      chapters: chapters
        .filter((r) => r.n.trim() || r.startPage.trim())
        .map((r) => ({
          n: int(r.n),
          title: r.title.trim() || undefined,
          startPage: int(r.startPage),
        })),
      splitMode,
      startDate,
      examDate,
      weekdays: [...weekdays].sort(),
      reminderTime,
      reviewDays: int(reviewDays),
      materials: materials
        .filter((m) => m.url.trim())
        .map((m) => ({ title: m.title.trim() || m.url.trim(), url: m.url.trim() })),
    };
    const errs = validateStudy({ ...input, type }, today);
    if (input.chapters.some((ch) => !Number.isInteger(ch.n)))
      errs.push('Scrivi il numero di ogni capitolo.');
    setErrors(errs);
    if (errs.length) {
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
      return;
    }
    setSaving(true);
    try {
      const sid = id ? (await updateStudy(id, input), id) : await createStudy(input);
      // depois de salvar, o formulário não reabre ao voltar
      if (id) goUp(['studio', String(id), 'modifica']);
      else replace(studyPath(sid));
    } finally {
      setSaving(false);
    }
  };

  if (!loaded) return <div className="page" />;

  return (
    <form
      className="page form"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      noValidate
    >
      <div className="page-head">
        <BackButton />
        <h1>{id ? 'Modifica studio' : 'Nuovo studio'}</h1>
      </div>

      <div className="card">
        <div className="grid2">
          <label>
            Materia
            <div className="with-btn">
              <input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                maxLength={40}
                style={c ? { background: c.bg, borderColor: c.accent, fontWeight: 700 } : undefined}
                className="field subj-field"
                autoComplete="off"
              />
              <button
                type="button"
                className="emoji-btn"
                aria-label="Scegli emoji"
                onClick={() => setShowEmoji((v) => !v)}
              >
                {emoji ?? (
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    aria-hidden="true"
                  >
                    <circle cx="12" cy="12" r="9" />
                    <path d="M8.5 14.5c1.8 2 5.2 2 7 0M9 9.5h.01M15 9.5h.01" />
                  </svg>
                )}
              </button>
            </div>
          </label>
          <label>
            Argomento
            <input
              className="field"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              maxLength={60}
            />
          </label>
        </div>
        {showEmoji && (
          <div className="emoji-grid" role="listbox" aria-label="Emoji">
            <button
              type="button"
              onClick={() => {
                setEmoji(undefined);
                setShowEmoji(false);
              }}
            >
              Nessuno
            </button>
            {EMOJIS.map((e) => (
              <button
                type="button"
                key={e}
                aria-selected={emoji === e}
                onClick={() => {
                  setEmoji(e);
                  setShowEmoji(false);
                }}
              >
                {e}
              </button>
            ))}
          </div>
        )}

        <div className="col">
          <span className="lbl">
            Colore della materia <span className="hint">· automatico, si può cambiare</span>
          </span>
          <div className="dots">
            {COLOR_KEYS.map((k) => {
              const sc = SUBJECT_COLORS[k];
              const sel = k === color;
              return (
                <button
                  type="button"
                  key={k}
                  aria-label={sc.name + (sel ? ' selezionata' : '')}
                  aria-pressed={sel}
                  className="dot"
                  onClick={() => {
                    setColorKey(k);
                    setColorManual(true);
                  }}
                  style={
                    sel
                      ? { background: sc.bg, boxShadow: `0 0 0 2px #fff, 0 0 0 4px ${sc.accent}` }
                      : { background: sc.bg, border: `1.5px solid ${sc.accent}` }
                  }
                />
              );
            })}
          </div>
          {colorManual && colorForName(subject) && colorForName(subject) !== colorKey && (
            <button type="button" className="link" onClick={() => setColorManual(false)}>
              Usa il colore automatico
            </button>
          )}
        </div>

        <div className="chips" role="radiogroup" aria-label="Tipo">
          {(Object.keys(TYPE_LABEL) as StudyType[]).map((t) => {
            const st = TYPE_STYLE[t];
            const sel = type === t;
            const bg = t === 'esatte' && !sel ? '#C9D9F7' : st.bg;
            const fg = t === 'esatte' && !sel ? '#2A4F9A' : st.fg;
            return (
              <button
                type="button"
                role="radio"
                aria-checked={sel}
                key={t}
                className="chip"
                style={{
                  background: bg,
                  color: fg,
                  boxShadow: sel
                    ? `0 0 0 2px #fff, 0 0 0 4px ${t === 'esatte' ? st.bg : st.fg}`
                    : undefined,
                }}
                onClick={() => setType(t)}
              >
                {TYPE_LABEL[t]}
              </button>
            );
          })}
        </div>
      </div>

      <div className="card">
        <div className="grid3">
          <label>
            Pag. iniziale
            <input
              className="field"
              inputMode="numeric"
              value={pageStart}
              onChange={(e) => setPageStart(e.target.value.replace(/\D/g, ''))}
            />
          </label>
          <label>
            Pag. finale
            <input
              className="field"
              inputMode="numeric"
              value={pageEnd}
              onChange={(e) => setPageEnd(e.target.value.replace(/\D/g, ''))}
            />
          </label>
          <div className="lbl total">
            Totale<span>{total > 0 ? `${total} pag.` : '—'}</span>
          </div>
        </div>

        <div className="col">
          <span className="lbl">
            Capitoli <span className="hint">· numero, titolo (facoltativo), pagina iniziale</span>
          </span>
          {chapters.map((r, i) => (
            <div className="chapter-row" key={i}>
              <input
                className="field n"
                aria-label={`Numero capitolo ${i + 1}`}
                inputMode="numeric"
                value={r.n}
                onChange={(e) =>
                  setChapters(
                    chapters.map((x, j) =>
                      j === i ? { ...x, n: e.target.value.replace(/\D/g, '') } : x,
                    ),
                  )
                }
              />
              <input
                className="field"
                aria-label={`Titolo capitolo ${i + 1}`}
                placeholder="Titolo"
                value={r.title}
                maxLength={60}
                onChange={(e) =>
                  setChapters(
                    chapters.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)),
                  )
                }
              />
              <input
                className="field p"
                aria-label={`Pagina iniziale capitolo ${i + 1}`}
                placeholder="pag."
                inputMode="numeric"
                value={r.startPage}
                onChange={(e) =>
                  setChapters(
                    chapters.map((x, j) =>
                      j === i ? { ...x, startPage: e.target.value.replace(/\D/g, '') } : x,
                    ),
                  )
                }
              />
              <button
                type="button"
                className="x"
                aria-label={`Rimuovi capitolo ${i + 1}`}
                onClick={() => setChapters(chapters.filter((_, j) => j !== i))}
              >
                ×
              </button>
            </div>
          ))}
          <button
            type="button"
            className="add"
            onClick={() => {
              const last = chapters[chapters.length - 1];
              setChapters([
                ...chapters,
                {
                  n: String(last ? int(last.n) + 1 || chapters.length + 1 : 1),
                  title: '',
                  startPage: last ? '' : pageStart,
                },
              ]);
            }}
          >
            + Aggiungi capitolo
          </button>
        </div>

        <div className="grid2">
          <label>
            Inizio
            <input
              className="field"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </label>
          <label>
            Esame
            <input
              className="field"
              type="date"
              value={examDate}
              onChange={(e) => setExamDate(e.target.value)}
            />
          </label>
        </div>

        <div className="segmented" role="radiogroup" aria-label="Dividi per">
          {(['pagine', 'capitoli'] as SplitMode[]).map((m) => (
            <button
              type="button"
              role="radio"
              aria-checked={splitMode === m}
              key={m}
              className={splitMode === m ? 'on' : ''}
              onClick={() => setSplitMode(m)}
            >
              {m === 'pagine' ? 'Per pagine' : 'Per capitoli'}
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        {(
          [
            ['Difficoltà', difficulty, onDifficulty, ['Facile', 'Media', 'Difficile']],
            ['Priorità', priority, setPriority, ['Bassa', 'Media', 'Alta']],
          ] as const
        ).map(([label, value, set, names]) => (
          <div className="level-row" key={label} role="radiogroup" aria-label={label}>
            <span className="lbl">{label}</span>
            <span className="levels">
              {([1, 2, 3] as Level[]).map((l) => {
                const st = LEVEL_STYLE[l];
                return (
                  <button
                    type="button"
                    role="radio"
                    aria-checked={value === l}
                    key={l}
                    className="level"
                    style={{
                      background: st.bg,
                      color: st.fg,
                      boxShadow: value === l ? `0 0 0 2px #fff, 0 0 0 4px ${st.ring}` : undefined,
                    }}
                    onClick={() => set(l)}
                  >
                    {names[l - 1]}
                  </button>
                );
              })}
            </span>
          </div>
        ))}

        <div className="col">
          <span className="lbl">Giorni disponibili</span>
          <div className="week">
            {DAYS.map((d, i) => {
              const wd = i + 1;
              const on = weekdays.includes(wd);
              return (
                <button
                  type="button"
                  key={wd}
                  aria-label={DAY_NAMES[i]}
                  aria-pressed={on}
                  className={'day' + (on ? ' on' : '') + (wd === 3 ? ' wed' : '')}
                  onClick={() =>
                    setWeekdays(on ? weekdays.filter((x) => x !== wd) : [...weekdays, wd])
                  }
                >
                  {d}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid2">
          <label>
            Promemoria
            <input
              className="field"
              type="time"
              value={reminderTime}
              onChange={(e) => setReminderTime(e.target.value)}
            />
          </label>
          <label>
            Giorni di ripasso
            <input
              className="field"
              inputMode="numeric"
              value={reviewDays}
              onChange={(e) => {
                setReviewDays(e.target.value.replace(/\D/g, ''));
                setReviewManual(true);
              }}
            />
          </label>
        </div>
      </div>

      <div className="card">
        <span className="lbl">
          Materiali <span className="hint">· link alle videolezioni</span>
        </span>
        {materials.map((m, i) => (
          <div className="material-row" key={i}>
            <input
              className="field"
              placeholder="Titolo"
              aria-label={`Titolo materiale ${i + 1}`}
              value={m.title}
              maxLength={80}
              onChange={(e) =>
                setMaterials(
                  materials.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)),
                )
              }
            />
            <input
              className="field"
              placeholder="https://…"
              aria-label={`Link materiale ${i + 1}`}
              inputMode="url"
              value={m.url}
              onChange={(e) =>
                setMaterials(materials.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))
              }
            />
            <button
              type="button"
              className="x"
              aria-label={`Rimuovi materiale ${i + 1}`}
              onClick={() => setMaterials(materials.filter((_, j) => j !== i))}
            >
              ×
            </button>
          </div>
        ))}
        <button
          type="button"
          className="add"
          onClick={() => setMaterials([...materials, { title: '', url: '' }])}
        >
          + Aggiungi link
        </button>
      </div>

      {errors.length > 0 && (
        <div className="errors" role="alert">
          {errors.map((e) => (
            <p key={e}>{e}</p>
          ))}
        </div>
      )}

      <div className="submit-bar">
        <button type="submit" className="primary" disabled={saving}>
          {id ? 'Salva le modifiche' : 'Crea il piano di studio'}
        </button>
      </div>
    </form>
  );
}
