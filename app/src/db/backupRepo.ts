import { liveQuery } from 'dexie';
import {
  BACKUP_WARNING,
  backupFileName,
  buildBackup,
  MAX_BACKUP_BYTES,
  parseBackup,
  TABLES,
  type BackupFile,
  type TableName,
} from '../lib/backup';
import { db } from './db';

/** Monta o arquivo de backup com tudo (menos o código de acesso e o aparelho). */
export async function exportBackup(now = new Date()): Promise<{ file: File; json: string }> {
  const settings = await db.settings.get(1);
  if (!settings) throw new Error('settings');
  const entries = await Promise.all(
    TABLES.map(async (t) => [t, await db.table(t).toArray()] as const),
  );
  const tables = Object.fromEntries(entries) as Record<TableName, Record<string, unknown>[]>;
  const json = JSON.stringify(buildBackup(tables, settings, now));
  return { json, file: new File([json], backupFileName(now), { type: 'application/json' }) };
}

export type SaveResult = 'shared' | 'downloaded' | 'cancelled';

/** Salva o backup: folha de compartilhamento do iPhone (com arquivo) ou download. */
export async function saveBackup(now = new Date()): Promise<SaveResult> {
  const { file } = await exportBackup(now);
  let result: SaveResult = 'downloaded';
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: 'Backup Ema studia', text: BACKUP_WARNING });
      result = 'shared';
    } catch (e) {
      if ((e as DOMException).name === 'AbortError') return 'cancelled';
      result = 'downloaded'; // falhou por outro motivo: cai no download
    }
  }
  if (result === 'downloaded') {
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
  await db.settings.update(1, { lastBackupAt: now.toISOString() });
  return result;
}

export async function readBackupFile(file: File) {
  if (file.size > MAX_BACKUP_BYTES) return parseBackup('x'.repeat(MAX_BACKUP_BYTES + 1));
  return parseBackup(await file.text());
}

/**
 * Substitui TUDO pelo conteúdo do backup, numa transação só (se algo falhar, nada muda).
 * Mantém o código de acesso e o aparelho atuais.
 */
export async function restoreBackup(backup: BackupFile): Promise<void> {
  await db.transaction('rw', [...TABLES.map((t) => db.table(t)), db.settings], async () => {
    for (const t of TABLES) {
      await db.table(t).clear();
      await db.table(t).bulkAdd(backup.tables[t]);
    }
    const current = await db.settings.get(1);
    await db.settings.put({
      ...(current ?? { accessCode: '', deviceId: crypto.randomUUID() }),
      ...backup.settings,
      id: 1,
      lastDailyReplan: undefined, // refaz o plano do dia na próxima abertura
      welcomeDone: current?.welcomeDone ?? false,
    } as never);
  });
  try {
    localStorage.removeItem('ema-sync'); // força reenviar a agenda
    localStorage.removeItem('ema-timer'); // cronômetro de antes não vale mais
  } catch {
    /* sem armazenamento: ok */
  }
}

/** Há dados que valem um backup? (reativo) */
export const hasDataLive = () => liveQuery(async () => (await db.studies.count()) > 0);
