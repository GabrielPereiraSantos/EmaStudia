import { buildPushPayload, type PushSubscription } from '@block65/webcrypto-web-push';
import type { Env } from './env';
import type { Message } from './reminders';

export interface DeviceSub {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export type SendResult = 'ok' | 'gone' | 'error';

/** Envia um Web Push. 404/410 = assinatura expirada (o chamador apaga do D1). */
export async function sendPush(
  env: Pick<Env, 'VAPID_PUBLIC_KEY' | 'VAPID_PRIVATE_KEY' | 'VAPID_SUBJECT'>,
  sub: DeviceSub,
  msg: Message,
  ttl: number,
  fetcher: typeof fetch = fetch,
): Promise<SendResult> {
  const subscription: PushSubscription = {
    endpoint: sub.endpoint,
    expirationTime: null,
    keys: { p256dh: sub.p256dh, auth: sub.auth },
  };
  try {
    const payload = await buildPushPayload(
      {
        data: { title: msg.title, body: msg.body, url: msg.url, tag: msg.tag },
        options: { ttl: Math.round(ttl), urgency: 'high' },
      },
      subscription,
      {
        subject: env.VAPID_SUBJECT,
        publicKey: env.VAPID_PUBLIC_KEY,
        privateKey: env.VAPID_PRIVATE_KEY,
      },
    );
    const res = await fetcher(sub.endpoint, payload);
    if (res.status === 404 || res.status === 410) return 'gone';
    return res.ok ? 'ok' : 'error';
  } catch {
    return 'error';
  }
}
