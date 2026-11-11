import { useEffect, useState } from 'react';
import { BackButton } from '../components/BackButton';
import { db } from '../db/db';
import { api, API_URL } from '../lib/api';
import { geminiUsage } from '../lib/gemini';
import { ENABLE_MESSAGES, enableNotifications, hasPushSubscription } from '../lib/push';
import { go } from '../lib/router';
import { syncSchedule } from '../lib/sync';
import { useLive } from '../lib/useLive';

/** Fase 4: promemoria e notifiche. O resto de Impostazioni chega na Fase 6. */
export function Impostazioni() {
  const settings = useLive(() => db.settings.get(1), []);
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [newCode, setNewCode] = useState('');
  const [editCode, setEditCode] = useState(false);

  const [usage, setUsage] = useState<{ used: number; limit: number } | null>(null);
  useEffect(() => {
    void hasPushSubscription().then(setSubscribed);
    void geminiUsage().then(setUsage);
  }, []);

  if (!settings) return <div className="page" />;

  const flash = (m: string) => {
    setMsg(m);
    setTimeout(() => setMsg(''), 5000);
  };

  const toggle = async (key: 'notifications' | 'includeNotes') => {
    await db.settings.update(1, { [key]: !settings[key] });
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
    else flash('Non riesco a collegarmi al server. Riprova tra poco.');
  };

  const saveCode = async () => {
    const c = newCode.trim();
    if (!c) return;
    setBusy(true);
    const r = await api('/api/ping', 'POST', {}, c);
    setBusy(false);
    if (r.ok) {
      await db.settings.update(1, { accessCode: c });
      setEditCode(false);
      setNewCode('');
      await syncSchedule(true);
      flash('Codice aggiornato.');
    } else flash(r.status === 401 ? 'Codice non valido.' : 'Non riesco a collegarmi al server.');
  };

  return (
    <div className="page settings">
      <div className="page-head">
        <BackButton onClick={() => go('/')} />
        <h1>Impostazioni</h1>
      </div>

      <section className="card">
        <p className="sec-label">PROMEMORIA</p>
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

      <section className="card">
        <p className="sec-label">CODICE DI ACCESSO</p>
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

      <section className="card">
        <p className="sec-label">GEMINI</p>
        <div className="row-between">
          <span>Richieste usate oggi</span>
          <strong>{usage ? `${usage.used} di ${usage.limit}` : '—'}</strong>
        </div>
        {usage && (
          <div className="bar">
            <i
              style={{ width: `${Math.min(100, (usage.used / Math.max(1, usage.limit)) * 100)}%` }}
            />
          </div>
        )}
      </section>

      <p className="empty">Le altre impostazioni arrivano presto.</p>
      {msg && (
        <div className="toast" role="status">
          {msg}
        </div>
      )}
    </div>
  );
}
