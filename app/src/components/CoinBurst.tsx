import { useEffect, useState } from 'react';
import { COIN_EVENT } from '../lib/pomodoro';

/** Animação curta "+10" quando um pomodoro completo rende moedinhas. */
export function CoinBurst() {
  const [shown, setShown] = useState<{ amount: number; key: number } | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const on = (e: Event) => {
      const amount = (e as CustomEvent<{ amount: number }>).detail?.amount ?? 0;
      if (amount <= 0) return;
      setShown({ amount, key: Date.now() });
      clearTimeout(timer);
      timer = setTimeout(() => setShown(null), 1800);
    };
    window.addEventListener(COIN_EVENT, on);
    return () => {
      window.removeEventListener(COIN_EVENT, on);
      clearTimeout(timer);
    };
  }, []);
  if (!shown) return null;
  return (
    <div key={shown.key} className="coin-burst" role="status" aria-live="polite">
      <svg width="30" height="30" viewBox="0 0 48 48" aria-hidden="true">
        <circle cx="24" cy="24" r="21" fill="#E8A317" />
        <circle cx="24" cy="24" r="15" fill="none" stroke="#FFE597" strokeWidth="2.5" />
      </svg>
      <span>+{shown.amount}</span>
      <span className="sr-only"> monetine: pomodoro completato</span>
    </div>
  );
}
