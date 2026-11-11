import { useEffect, useState } from 'react';
import { BackButton } from '../components/BackButton';
import { ConfirmSheet } from '../components/ConfirmSheet';
import { REWARD_ICONS, RewardIcon } from '../components/RewardIcon';
import { db, DEFAULT_SETTINGS } from '../db/db';
import { removeReward, saveReward } from '../db/repo';
import type { Reward } from '../db/types';
import { go } from '../lib/router';
import { studyDaysFor } from '../plan/coins';

const SHORTCUTS = [50, 100, 200, 300];
const STEP = 10;

export function RewardForm({ id }: { id?: number }) {
  const [loaded, setLoaded] = useState(!id);
  const [name, setName] = useState('');
  const [icon, setIcon] = useState<Reward['icon']>('regalo');
  const [price, setPrice] = useState(100);
  const [repeatable, setRepeatable] = useState(true);
  const [coinsDay, setCoinsDay] = useState(DEFAULT_SETTINGS.coinsDay);
  const [errors, setErrors] = useState<string[]>([]);
  const [askRemove, setAskRemove] = useState(false);

  useEffect(() => {
    void (async () => {
      const s = await db.settings.get(1);
      if (s) setCoinsDay(s.coinsDay);
      if (!id) return;
      const r = await db.rewards.get(id);
      if (r && !r.removed) {
        setName(r.name);
        setIcon(r.icon);
        setPrice(r.price);
        setRepeatable(r.repeatable);
      }
      setLoaded(true);
    })();
  }, [id]);

  const days = studyDaysFor(price, coinsDay);

  const submit = async () => {
    const errs: string[] = [];
    if (!name.trim()) errs.push('Scrivi il nome del premio.');
    if (!Number.isInteger(price) || price < 1)
      errs.push('Il prezzo deve essere almeno 1 monetina.');
    setErrors(errs);
    if (errs.length) return;
    await saveReward({ name: name.trim(), icon, price, repeatable }, id);
    go('/premi');
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
        <BackButton onClick={() => go('/premi')} />
        <h1>{id ? 'Modifica premio' : 'Nuovo premio'}</h1>
      </div>

      <div className="card">
        <label>
          Nome del premio
          <input
            className="field"
            value={name}
            maxLength={40}
            onChange={(e) => setName(e.target.value)}
            autoComplete="off"
          />
        </label>

        <div className="col">
          <span className="lbl">Icona</span>
          <div className="icon-row" role="radiogroup" aria-label="Icona">
            {REWARD_ICONS.map((i) => (
              <button
                type="button"
                role="radio"
                aria-checked={icon === i.key}
                aria-label={i.label}
                key={i.key}
                className={'icon-btn' + (icon === i.key ? ' on' : '')}
                onClick={() => setIcon(i.key)}
              >
                <RewardIcon icon={i.key} />
              </button>
            ))}
          </div>
        </div>

        <div className="col">
          <span className="lbl">Prezzo in monetine</span>
          <div className="stepper">
            <button
              type="button"
              aria-label="Diminuisci"
              onClick={() => setPrice(Math.max(1, price - STEP))}
            >
              −
            </button>
            <input
              aria-label="Prezzo"
              inputMode="numeric"
              value={price || ''}
              onChange={(e) => setPrice(Number(e.target.value.replace(/\D/g, '').slice(0, 5)))}
            />
            <button
              type="button"
              className="plus"
              aria-label="Aumenta"
              onClick={() => setPrice(Math.min(99999, price + STEP))}
            >
              +
            </button>
          </div>
          <div className="shortcuts">
            {SHORTCUTS.map((n) => (
              <button
                type="button"
                key={n}
                className={price === n ? 'on' : ''}
                onClick={() => setPrice(n)}
              >
                {n}
              </button>
            ))}
          </div>
          <p className="muted">
            Circa {days} {days === 1 ? 'giorno' : 'giorni'} di studio
          </p>
        </div>

        <div className="row-between switch-row">
          <span className="lbl">Si può riscattare più volte</span>
          <button
            type="button"
            role="switch"
            aria-checked={repeatable}
            aria-label="Ripetibile"
            className={'switch' + (repeatable ? ' on' : '')}
            onClick={() => setRepeatable(!repeatable)}
          >
            <span />
          </button>
        </div>
      </div>

      <p className="preview-label">Anteprima nel negozio</p>
      <div className="preview">
        <span className="reward-icon">
          <RewardIcon icon={icon} />
        </span>
        <div>
          <p className="r-name">{name.trim() || 'Nome del premio'}</p>
          <p className="r-price">{price} monetine</p>
        </div>
      </div>

      {errors.length > 0 && (
        <div className="errors" role="alert">
          {errors.map((e) => (
            <p key={e}>{e}</p>
          ))}
        </div>
      )}
      {id && (
        <div className="center-row">
          <button type="button" className="soft danger solo" onClick={() => setAskRemove(true)}>
            Elimina premio
          </button>
        </div>
      )}

      <div className="submit-bar">
        <button type="submit" className="primary">
          Salva premio
        </button>
      </div>

      {askRemove && (
        <ConfirmSheet
          title="Eliminare questo premio?"
          text="Sparisce dal negozio. I premi già riscattati restano nello storico."
          confirmLabel="Sì, elimina"
          onConfirm={async () => {
            await removeReward(id!);
            go('/premi');
          }}
          onClose={() => setAskRemove(false)}
        />
      )}
    </form>
  );
}
