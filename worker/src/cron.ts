import {
  cleanupOld,
  devicesWithPush,
  dropSubscription,
  markSent,
  notesOf,
  pendingReminders,
} from './db';
import type { Env } from './env';
import { sendPush } from './push';
import { buildMessage, isDue, localNow, ttlSeconds } from './reminders';

export interface CronReport {
  devices: number;
  sent: number;
  gone: number;
  errors: number;
}

/** Cron (a cada 5 min): envia os lembretes vencidos no fuso de cada aparelho. */
export async function runCron(
  env: Env,
  nowMs: number,
  fetcher: typeof fetch = fetch,
): Promise<CronReport> {
  const report: CronReport = { devices: 0, sent: 0, gone: 0, errors: 0 };
  const devices = await devicesWithPush(env.DB);
  for (const d of devices) {
    report.devices++;
    const now = localNow(d.timezone, nowMs);
    const due = (await pendingReminders(env.DB, d.device_id, now.date)).filter((r) =>
      isDue(r, now),
    );
    if (!due.length) continue;
    const msg = buildMessage(due, await notesOf(env.DB, d.device_id));
    const res = await sendPush(
      env,
      d,
      msg,
      ttlSeconds(
        due.map((r) => r.time),
        now,
      ),
      fetcher,
    );
    if (res === 'ok') {
      await markSent(env.DB, due, nowMs);
      report.sent++;
    } else if (res === 'gone') {
      await dropSubscription(env.DB, d.device_id);
      report.gone++;
    } else {
      report.errors++; // tenta de novo no próximo ciclo, dentro da janela de 2 h
    }
  }
  // lembretes de mais de 2 dias atrás não servem mais
  await cleanupOld(env.DB, new Date(nowMs - 2 * 86_400_000).toISOString().slice(0, 10));
  // só contagens no log (nunca o conteúdo das notas)
  console.log(`cron: ${JSON.stringify(report)}`);
  return report;
}
