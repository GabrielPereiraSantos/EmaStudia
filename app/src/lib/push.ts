import { db } from '../db/db';
import { api, VAPID_PUBLIC_KEY } from './api';
import { pushSupported } from './device';

export type EnableResult = 'ok' | 'denied' | 'unsupported' | 'server' | 'config';

function b64urlToBytes(s: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const raw = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/**
 * Pede permissão (tem que vir de um toque dela, exigência do iOS), assina o push
 * e manda a assinatura ao Worker.
 */
export async function enableNotifications(): Promise<EnableResult> {
  if (!pushSupported()) return 'unsupported';
  if (!VAPID_PUBLIC_KEY) return 'config';
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return 'denied';
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: b64urlToBytes(VAPID_PUBLIC_KEY),
      }));
    const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
    const settings = await db.settings.get(1);
    const r = await api('/api/subscription', 'PUT', {
      deviceId: settings?.deviceId,
      subscription: { endpoint: json.endpoint, keys: json.keys },
    });
    return r.ok ? 'ok' : 'server';
  } catch {
    return 'server';
  }
}

export async function hasPushSubscription(): Promise<boolean> {
  if (!pushSupported() || Notification.permission !== 'granted') return false;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    return !!(await reg?.pushManager.getSubscription());
  } catch {
    return false;
  }
}

export const ENABLE_MESSAGES: Record<Exclude<EnableResult, 'ok'>, string> = {
  denied: 'Le notifiche sono bloccate. Attivale in Impostazioni › Notifiche › Ema studia.',
  unsupported:
    "Questo dispositivo non supporta le notifiche. Sull'iPhone apri l'app dall'icona nella schermata Home.",
  server: 'Non riesco a collegarmi al server. Riprova tra poco.',
  config: 'Server non configurato.',
};
