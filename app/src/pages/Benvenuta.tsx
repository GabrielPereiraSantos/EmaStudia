import { useState } from 'react';
import { db } from '../db/db';
import { api, API_URL } from '../lib/api';
import { isIOS, isStandalone } from '../lib/device';
import { ENABLE_MESSAGES, enableNotifications } from '../lib/push';
import { syncSchedule } from '../lib/sync';

const STEPS = [
  'Apri questo link in Safari',
  'Tocca Condividi',
  'Aggiungi alla schermata Home',
  "Apri l'app dall'icona e attiva le notifiche",
];

function Sunflower() {
  return (
    <svg width="140" height="140" viewBox="0 0 140 140" aria-hidden="true" className="sunflower">
      <g fill="#E8A317">
        <ellipse cx="70" cy="22" rx="14" ry="22" />
        <ellipse cx="70" cy="118" rx="14" ry="22" />
        <ellipse cx="22" cy="70" rx="22" ry="14" />
        <ellipse cx="118" cy="70" rx="22" ry="14" />
        <ellipse cx="36" cy="36" rx="14" ry="22" transform="rotate(-45 36 36)" />
        <ellipse cx="104" cy="104" rx="14" ry="22" transform="rotate(-45 104 104)" />
        <ellipse cx="104" cy="36" rx="14" ry="22" transform="rotate(45 104 36)" />
        <ellipse cx="36" cy="104" rx="14" ry="22" transform="rotate(45 36 104)" />
      </g>
      <circle cx="70" cy="70" r="30" fill="#4A3612" />
      <circle cx="60" cy="64" r="3" fill="#FFE597" />
      <circle cx="80" cy="64" r="3" fill="#FFE597" />
      <path
        d="M58 76c6 7 18 7 24 0"
        stroke="#FFE597"
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}

type Step = 'guide' | 'code' | 'notify';

/** Primeira abertura (5.9). No iPhone/iPad sem instalar, bloqueia com o guia. */
export function Benvenuta() {
  const ios = isIOS();
  const installed = isStandalone();
  const [step, setStep] = useState<Step>(installed ? 'code' : 'guide');
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const finish = async () => {
    await db.settings.update(1, { welcomeDone: true });
    void syncSchedule(true);
  };

  const checkCode = async () => {
    const c = code.trim();
    if (!c) return setMsg('Scrivi il codice di accesso.');
    setBusy(true);
    setMsg('');
    const r = await api('/api/ping', 'POST', {}, c);
    setBusy(false);
    if (r.ok) {
      await db.settings.update(1, { accessCode: c });
      setStep('notify');
    } else if (r.status === 401) setMsg('Codice non valido. Controlla e riprova.');
    else setMsg('Non riesco a collegarmi. Controlla la connessione e riprova.');
  };

  const activate = async () => {
    setBusy(true);
    setMsg('');
    const r = await enableNotifications();
    setBusy(false);
    if (r === 'ok') return finish();
    setMsg(ENABLE_MESSAGES[r]);
  };

  return (
    <div className="welcome">
      <div className="welcome-hero">
        <div className="wb1" />
        <div className="wb2" />
        <Sunflower />
      </div>
      <div className="welcome-body">
        <div>
          <h1>Benvenuta, Ema!</h1>
          {step === 'guide' && (
            <p className="sub">Installa l&apos;app in un minuto, solo la prima volta.</p>
          )}
          {step === 'code' && <p className="sub">Scrivi il codice di accesso che ti ho mandato.</p>}
          {step === 'notify' && (
            <p className="sub">Ultimo passo: attiva le notifiche per i promemoria.</p>
          )}
        </div>

        {step === 'guide' && (
          <>
            <ol className="steps">
              {STEPS.map((t, i) => (
                <li key={t}>
                  <span>{i + 1}</span>
                  {t}
                </li>
              ))}
            </ol>
            {ios && (
              <p className="note">
                Usa l&apos;app solo dall&apos;icona nella schermata Home: i dati salvati in Safari
                non passano all&apos;app installata.
              </p>
            )}
          </>
        )}

        {step === 'code' && (
          <form
            className="code-form"
            onSubmit={(e) => {
              e.preventDefault();
              void checkCode();
            }}
          >
            <label className="lbl">
              Codice di accesso
              <input
                className="field"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                maxLength={200}
              />
            </label>
            {!API_URL && <p className="note">Server non configurato (VITE_API_URL).</p>}
          </form>
        )}

        {msg && (
          <p className="errors" role="alert">
            {msg}
          </p>
        )}
      </div>

      <div className="welcome-actions">
        {step === 'guide' && !ios && (
          <button type="button" className="primary" onClick={() => setStep('code')}>
            Continua nel browser
          </button>
        )}
        {step === 'code' && (
          <>
            <button
              type="button"
              className="primary"
              disabled={busy}
              onClick={() => void checkCode()}
            >
              Continua
            </button>
            {!API_URL && (
              <button type="button" className="sheet-skip" onClick={() => void finish()}>
                Continua senza server
              </button>
            )}
          </>
        )}
        {step === 'notify' && (
          <>
            <button
              type="button"
              className="primary bell"
              disabled={busy}
              onClick={() => void activate()}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#fff"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 0 0 3.4 0" />
              </svg>
              Attiva le notifiche
            </button>
            <button type="button" className="sheet-skip" onClick={() => void finish()}>
              Più tardi
            </button>
          </>
        )}
      </div>
    </div>
  );
}
