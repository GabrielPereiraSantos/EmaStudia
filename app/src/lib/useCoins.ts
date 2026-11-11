import { db, DEFAULT_SETTINGS } from '../db/db';
import {
  balanceOf,
  computeStreak,
  scheduledDates,
  studiedDates,
  streakInCycle,
} from '../plan/coins';
import { todayISO } from './dates';
import { useLive } from './useLive';

/** Saldo, sequência e extrato (reativo). */
export function useCoins() {
  return useLive(async () => {
    const today = todayISO();
    const [coins, sessions, days, studies, settings] = await Promise.all([
      db.coins.toArray(),
      db.sessions.toArray(),
      db.planDays.toArray(),
      db.studies.toArray(),
      db.settings.get(1),
    ]);
    const streak = computeStreak(
      studiedDates(sessions),
      scheduledDates(days, studies),
      today,
    ).current;
    return {
      balance: balanceOf(coins),
      streak,
      inCycle: streakInCycle(streak),
      entries: [...coins].sort((a, b) => b.date.localeCompare(a.date) || (b.id ?? 0) - (a.id ?? 0)),
      rules: settings ?? DEFAULT_SETTINGS,
    };
  }, []);
}
