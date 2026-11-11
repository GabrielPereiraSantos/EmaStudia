import { useEffect, useRef, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { it } from 'date-fns/locale';
import { BackButton } from '../components/BackButton';
import { ConfirmSheet } from '../components/ConfirmSheet';
import { db } from '../db/db';
import { readBackupFile, restoreBackup, saveBackup } from '../db/backupRepo';
import { awardCoins, dailyReplan } from '../db/repo';
import type { Settings } from '../db/types';
import { api, API_URL } from '../lib/api';
import {
  backupDue,
  BACKUP_WARNING,
  clampSetting,
  SETTING_LIMITS,
  type BackupFile,
} from '../lib/backup';
import { geminiUsage } from '../lib/gemini';
import { ENABLE_MESSAGES, enableNotifications, hasPushSubscription } from '../lib/push';
import { go } from '../lib/router';
import { syncSchedule } from '../lib/sync';
import { useLive } from '../lib/useLive';

type NumKey = keyof typeof SETTING_LIMITS;

function Stepper({
  label,
  value,
  k,
  onChange,
  unit,
}: {
  label: string;
  value: number;
  k: NumKey;
  onChange: (v: number) => void;
  unit?: string;
}) {
  const { step } = SETTING_LIMITS[k];
  return (
    <div className="row-between">
      <span id={`lbl-${k}`}>{label}</span>
      <span className="mini-stepper" role="group" aria-labelledby={`lbl-${k}`}>
        <button
          type="button"
          aria-label={`Diminuisci ${label}`}
          onClick={() => onChange(clampSetting(k, value - step))}
        >
          −
        </button>
        <strong aria-live="polite">
          {value}
          {unit}
        </strong>
        <button
          type="button"
          className="plus"
          aria-label={`Aumenta ${label}`}
          onClick={() => onChange(clampSetting(k, value + step))}
        >
          +
        </button>
      </span>
    </div>
  );
}

const fmtDate = (iso: string) => format(parseISO(iso), 'd MMMM yyyy', { locale: it });

export function Impostazioni() {
  const data = useLive(
    async () => ({ settings: await db.settings.get(1), studies: await db.studies.count() }),
    [],
  );
  const settings = data?.settings;
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [usage, setUsage] = useState<{ used: number; limit: number } | null>(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [newCode, setNewCode] = useState('');
  const [editCode, setEditCode] = useState(false);
  const [pending, setPending] = useState<BackupFile | null>(null);
  const [restoreError, setRestoreError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void hasPushSubscription().then(setSubscribed);
    void geminiUsage().then(setUsage);
  }, []);

  if (!settings) return <div className="page" />;

  const flash = (m: string) => {
    setMsg(m);
    setTimeout(() => setMsg(''), 6000);
  };
  const set = (patch: Partial<Settings>) => db.settings.update(1, patch);

  const toggle = async (key: 'notifications' | 'includeNotes') => {
    await set({ [key]: !settings[key] });
    if (key === 'notifications' && !settings.notifications && !subscribed) await activate();
  };

  const activate = async () => {
    setBusy(true);
    const r = await enableNotifications();
    setBusy(false);
    if (r === 'ok') {
      setSubscribed(true);
      await syncSchedule(true);
      flash('Notifiche attivate.');
    } else flash(ENABLE_MESSAGES[r]);
  };

  const test = async () => {
    setBusy(true);
    const r = await api('/api/test-notification', 'POST', { deviceId: settings.deviceId });
    setBusy(false);
    if (r.ok) flash('Notifica di prova inviata. Dovrebbe arrivare tra pochi secondi.');
    else if (r.status === 404 || r.status === 410) {
      setSubscribed(false);
      flash('Le notifiche non sono attive su questo dispositivo. Tocca «Attiva le notifiche».');
    } else if (r.status === 401) flash('Codice di accesso non valido.');
    else if (r.status === 429) flash('Troppi tentativi. Riprova tra un minuto.');
    else flash('Non riesco a collegarmi al server. Riprova tra poco.');
  };

  const saveCode = async () => {
    const c = newCode.trim();
    if (!c) return;
    setBusy(true);
    const r = await api('/api/ping', 'POST', {}, c);
    setBusy(false);
    if (r.ok) {
      await set({ accessCode: c });
      setEditCode(false);
      setNewCode('');
      await syncSchedule(true);
      flash('Codice aggiornato.');
    } else
      flash(
        r.status === 401
          ? 'Codice non valido.'
          : r.status === 429
            ? 'Troppi tentativi. Riprova tra un minuto.'
            : 'Non riesco a collegarmi al server.',
      );
  };

  const backup = async () => {
    setBusy(true);
    try {
      const r = await saveBackup();
      if (r === 'downloaded') flash('Backup scaricato. ' + BACKUP_WARNING);
      else if (r === 'shared') flash('Backup salvato.');
    } catch {
      flash('Non sono riuscita a creare il backup. Riprova.');
    }
    setBusy(false);
  };

  const pickFile = async (file: File | undefined) => {
    setRestoreError('');
    if (!file) return;
    const r = await readBackupFile(file);
    if (fileRef.current) fileRef.current.value = '';
    if (!r.ok) return setRestoreError(r.error);
    setPending(r.backup);
  };

  const restore = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      await restoreBackup(pending);
      setPending(null);
      await dailyReplan();
      await awardCoins();
      await syncSchedule(true);
      flash('Backup ripristinato.');
      go('/');
    } catch {
      setPending(null);
      setRestoreError('Non sono riuscita a ripristinare il backup. I tuoi dati non sono cambiati.');
    }
    setBusy(false);
  };

  const due = backupDue(settings.lastBackupAt, (data?.studies ?? 0) > 0);

  return (
    <div className="page settings">
      <div className="page-head">
        <BackButton onClick={() => go('/')} />
        <h1>Impostazioni</h1>
      </div>

      <section className="card" aria-labelledby="sec-coins">
        <p className="sec-label" id="sec-coins">
          MONETINE
        </p>
        <Stepper
          label="Giorno studiato (30 min)"
          k="coinsDay"
          value={settings.coinsDay}
          onChange={(v) => void set({ coinsDay: v })}
        />
        <Stepper
          label="7 giorni di fila"
          k="coinsStreak"
          value={settings.coinsStreak}
          onChange={(v) => void set({ coinsStreak: v })}
        />
        <Stepper
          label="Risposta corretta"
          k="coinsCorrect"
          value={settings.coinsCorrect}
          onChange={(v) => void set({ coinsCorrect: v })}
        />
      </section>

      <section className="card" aria-labelledby="sec-rem">
        <p className="sec-label" id="sec-rem">
          PROMEMORIA
        </p>
        <div className="row-between">
          <span>Notifiche</span>
          <button
            type="button"
            role="switch"
            aria-checked={settings.notifications}
            aria-label="Notifiche"
            className={'switch' + (settings.notifications ? ' on' : '')}
            onClick={() => void toggle('notifications')}
          >
            <span />
          </button>
        </div>
        <div className="row-between">
          <span>Includi le note da memorizzare</span>
          <button
            type="button"
            role="switch"
            aria-checked={settings.includeNotes}
            aria-label="Includi le note"
            className={'switch' + (settings.includeNotes ? ' on' : '')}
            onClick={() => void toggle('includeNotes')}
          >
            <span />
          </button>
        </div>
        <div className="row-between">
          <label htmlFor="default-time">Orario predefinito</label>
          <input
            id="default-time"
            className="field time-field"
            type="time"
            value={settings.defaultReminder}
            onChange={(e) => e.target.value && void set({ defaultReminder: e.target.value })}
          />
        </div>
        {settings.notifications && subscribed === false && (
          <button
            type="button"
            className="primary small"
            disabled={busy}
            onClick={() => void activate()}
          >
            Attiva le notifiche
          </button>
        )}
        <button
          type="button"
          className="soft solo"
          disabled={busy || !API_URL}
          onClick={() => void test()}
        >
          Invia notifica di prova
        </button>
      </section>

      <section className="card" aria-labelledby="sec-pomo">
        <p className="sec-label" id="sec-pomo">
          POMODORO
        </p>
        <Stepper
          label="Studio"
          unit=" min"
          k="pomodoroWork"
          value={settings.pomodoroWork}
          onChange={(v) => void set({ pomodoroWork: v })}
        />
        <Stepper
          label="Pausa"
          unit=" min"
          k="pomodoroBreak"
          value={settings.pomodoroBreak}
          onChange={(v) => void set({ pomodoroBreak: v })}
        />
      </section>

      <section className="card backup" aria-labelledby="sec-backup">
        <p className="sec-label" id="sec-backup">
          BACKUP
        </p>
        <p className="muted">
          {settings.lastBackupAt
            ? `Ultimo backup: ${fmtDate(settings.lastBackupAt)}.`
            : 'Non hai ancora fatto nessun backup.'}{' '}
          I dati sono solo su questo dispositivo.
        </p>
        {due && (
          <p className="backup-due" role="status">
            Fai un backup: è passato più di un po’ dall’ultimo.
          </p>
        )}
        <p className="muted">{BACKUP_WARNING}</p>
        <div className="grid2">
          <button type="button" className="dark-btn" disabled={busy} onClick={() => void backup()}>
            Salva backup
          </button>
          <button
            type="button"
            className="white-btn"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
          >
            Ripristina
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          aria-label="Scegli il file di backup"
          onChange={(e) => void pickFile(e.target.files?.[0])}
        />
        {restoreError && (
          <p className="errors" role="alert">
            {restoreError}
          </p>
        )}
      </section>

      <section className="card" aria-labelledby="sec-gem">
        <p className="sec-label" id="sec-gem">
          GEMINI
        </p>
        <div className="row-between">
          <span>Richieste usate oggi</span>
          <strong>{usage ? `${usage.used} di ${usage.limit}` : '—'}</strong>
        </div>
        {usage && (
          <div
            className="bar"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={usage.limit}
            aria-valuenow={usage.used}
            aria-label="Richieste Gemini usate oggi"
          >
            <i
              style={{ width: `${Math.min(100, (usage.used / Math.max(1, usage.limit)) * 100)}%` }}
            />
          </div>
        )}
      </section>

      <section className="card" aria-labelledby="sec-code">
        <p className="sec-label" id="sec-code">
          CODICE DI ACCESSO
        </p>
        {!editCode ? (
          <div className="row-between">
            <span>{settings.accessCode ? 'Salvato su questo dispositivo' : 'Non impostato'}</span>
            <button type="button" className="link" onClick={() => setEditCode(true)}>
              Cambia
            </button>
          </div>
        ) : (
          <div className="col">
            <input
              className="field"
              aria-label="Nuovo codice di accesso"
              value={newCode}
              onChange={(e) => setNewCode(e.target.value)}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
            />
            <div className="row-between">
              <button type="button" className="link" onClick={() => setEditCode(false)}>
                Annulla
              </button>
              <button type="button" className="add" disabled={busy} onClick={() => void saveCode()}>
                Salva
              </button>
            </div>
          </div>
        )}
      </section>

      {msg && (
        <div className="toast" role="status">
          {msg}
        </div>
      )}
      {pending && (
        <ConfirmSheet
          title="Ripristinare il backup?"
          text={`Il backup${pending.exportedAt ? ` del ${fmtDate(pending.exportedAt)}` : ''} contiene ${pending.tables.studies.length} ${pending.tables.studies.length === 1 ? 'studio' : 'studi'}. Tutto quello che c'è ora in questa app verrà sostituito.`}
          confirmLabel="Sì, ripristina"
          onConfirm={() => void restore()}
          onClose={() => setPending(null)}
        />
      )}
    </div>
  );
}
