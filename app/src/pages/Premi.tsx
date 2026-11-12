import { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { it } from 'date-fns/locale';
import { ConfirmSheet } from '../components/ConfirmSheet';
import { RewardIcon } from '../components/RewardIcon';
import { coinsPerPomodoro, db } from '../db/db';
import { redeemReward } from '../db/repo';
import type { Reward } from '../db/types';
import { go } from '../lib/router';
import { useCoins } from '../lib/useCoins';
import { useLive } from '../lib/useLive';
import { STREAK_CYCLE } from '../plan/coins';

const REASON: Record<string, string> = {
  giorno: 'Giorno studiato',
  pomodoro: 'Pomodoro completato',
  serie: '7 giorni di fila',
  quiz: 'Risposte del quiz',
  premio: 'Premio riscattato',
};
const fmt = (d: string) => format(parseISO(d), 'd MMM', { locale: it });

export function Premi() {
  const coins = useCoins();
  const data = useLive(async () => {
    const rewards = await db.rewards.toArray();
    const redemptions = await db.redemptions.toArray();
    return { rewards, redemptions };
  }, []);
  const [pick, setPick] = useState<Reward | null>(null);
  const [msg, setMsg] = useState('');
  const [showAll, setShowAll] = useState(false);

  const balance = coins?.balance ?? 0;
  const rules = coins?.rules;
  const shop = (data?.rewards ?? []).filter((r) => r.active);
  const nameOf = (id: number) => data?.rewards.find((r) => r.id === id)?.name ?? 'Premio';
  const history = [...(data?.redemptions ?? [])].sort(
    (a, b) => b.date.localeCompare(a.date) || (b.id ?? 0) - (a.id ?? 0),
  );
  const entries = coins?.entries ?? [];

  const confirm = async () => {
    if (!pick) return;
    const r = await redeemReward(pick.id!);
    setPick(null);
    setMsg(
      r === 'ok'
        ? `Riscattato: ${pick.name}. Goditelo, Ema!`
        : r === 'poor'
          ? 'Non hai abbastanza monetine.'
          : 'Questo premio non è più disponibile.',
    );
    setTimeout(() => setMsg(''), 4000);
  };

  return (
    <div className="page premi">
      <header className="hero premi-hero">
        <div className="blob1" />
        <div className="row-between rel">
          <h1>Premi</h1>
          <button type="button" className="dark-pill" onClick={() => go('/premi/nuovo')}>
            + Nuovo premio
          </button>
        </div>
        <div className="coin-total rel">
          <svg width="48" height="48" viewBox="0 0 48 48" aria-hidden="true">
            <circle cx="24" cy="24" r="21" fill="#E8A317" />
            <circle cx="24" cy="24" r="15" fill="none" stroke="#FFE597" strokeWidth="2.5" />
            <path
              d="M24 16v16M20 20h6a2.5 2.5 0 0 1 0 5h-4a2.5 2.5 0 0 0 0 5h6"
              stroke="#fff"
              strokeWidth="2.4"
              fill="none"
              strokeLinecap="round"
            />
          </svg>
          <div>
            <strong>{balance}</strong>
            <span>monetine</span>
          </div>
        </div>
        <div className="streak-card rel">
          <div className="row-between">
            <span>
              {coins?.inCycle ?? 0} di {STREAK_CYCLE} giorni di fila
            </span>
            <span className="bonus">+{rules?.coinsStreak ?? 30} bonus</span>
          </div>
          <div className="streak-bars" aria-hidden="true">
            {Array.from({ length: STREAK_CYCLE }, (_, i) => (
              <i key={i} className={i < (coins?.inCycle ?? 0) ? 'on' : ''} />
            ))}
          </div>
        </div>
      </header>

      <div className="premi-body">
        {data && shop.length === 0 && <p className="empty">Nessun premio ancora — creane uno!</p>}
        <div className="reward-grid">
          {shop.map((r) => {
            const can = balance >= r.price;
            return (
              <div className="reward" key={r.id}>
                <div className="reward-top">
                  <span className="reward-icon">
                    <RewardIcon icon={r.icon} />
                  </span>
                  <button
                    type="button"
                    className="edit-btn"
                    aria-label={`Modifica ${r.name}`}
                    onClick={() => go(`/premi/${r.id}/modifica`)}
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M4 20h4L19 9l-4-4L4 16zM13 7l4 4" />
                    </svg>
                  </button>
                </div>
                <p className="r-name">{r.name}</p>
                <p className="r-price">
                  {r.price} monetine{r.repeatable ? '' : ' · una volta'}
                </p>
                {can ? (
                  <button type="button" className="redeem" onClick={() => setPick(r)}>
                    Riscatta
                  </button>
                ) : (
                  <>
                    <div className="bar">
                      <i style={{ width: `${Math.min(100, (balance / r.price) * 100)}%` }} />
                    </div>
                    <p className="missing">mancano {r.price - balance}</p>
                  </>
                )}
              </div>
            );
          })}
        </div>

        <section className="card earn" style={{ background: '#FFE597' }}>
          <p className="card-title">Come guadagnare</p>
          <div className="row-between">
            <span>Pomodoro completato</span>
            <strong>+{coinsPerPomodoro(rules)}</strong>
          </div>
          <div className="row-between">
            <span>7 giorni di fila</span>
            <strong>+{rules?.coinsStreak ?? 30}</strong>
          </div>
          <div className="row-between">
            <span>Risposta corretta nel quiz</span>
            <strong>+{rules?.coinsCorrect ?? 5}</strong>
          </div>
        </section>

        {history.length > 0 && (
          <section className="card">
            <p className="card-title">Premi riscattati</p>
            <ul className="ledger">
              {history.map((h) => (
                <li key={h.id}>
                  <span>{fmt(h.date)}</span>
                  <span className="grow">{nameOf(h.rewardId)}</span>
                  <strong>−{h.price}</strong>
                </li>
              ))}
            </ul>
          </section>
        )}

        {entries.length > 0 && (
          <section className="card">
            <div className="row-between">
              <p className="card-title">Estratto monetine</p>
              {entries.length > 8 && (
                <button type="button" className="link" onClick={() => setShowAll(!showAll)}>
                  {showAll ? 'Mostra meno' : 'Mostra tutto'}
                </button>
              )}
            </div>
            <ul className="ledger">
              {(showAll ? entries : entries.slice(0, 8)).map((e) => (
                <li key={e.id}>
                  <span>{fmt(e.date)}</span>
                  <span className="grow">{REASON[e.reason] ?? e.reason}</span>
                  <strong className={e.amount < 0 ? 'neg' : ''}>
                    {e.amount > 0 ? '+' : '−'}
                    {Math.abs(e.amount)}
                  </strong>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      {pick && (
        <ConfirmSheet
          title={`Riscattare «${pick.name}»?`}
          text={`Spenderai ${pick.price} monetine. Ti resteranno ${balance - pick.price}.`}
          confirmLabel="Sì, riscatta"
          onConfirm={() => void confirm()}
          onClose={() => setPick(null)}
        />
      )}
      {msg && (
        <div className="toast" role="status">
          {msg}
        </div>
      )}
    </div>
  );
}
