/// <reference lib="webworker" />
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';

declare const self: ServiceWorkerGlobalScope;

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

self.addEventListener('message', (e) => {
  if (e.data?.type === 'SKIP_WAITING') void self.skipWaiting();
});

interface PushData {
  title?: string;
  body?: string;
  url?: string;
  tag?: string;
}

/** Só aceita caminhos do próprio app (nada de abrir sites de fora). */
const safeUrl = (u: unknown) => (typeof u === 'string' && /^\/#\/[\w/-]*$/.test(u) ? u : '/#/');

self.addEventListener('push', (event) => {
  let data: PushData;
  try {
    data = event.data?.json() ?? {};
  } catch {
    data = { body: event.data?.text() };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Ema studia', {
      body: data.body || 'Oggi si studia! Ce la fai, Ema.',
      icon: '/icon-192.png',
      badge: '/favicon-32.png',
      tag: data.tag || 'ema',
      data: { url: safeUrl(data.url) },
    }),
  );
});

// Tocar na notificação abre a tela do estudo (ou a Home, se forem vários).
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = safeUrl((event.notification.data as { url?: string } | null)?.url);
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const client = all[0] as WindowClient | undefined;
      if (client) {
        await client.focus();
        client.postMessage({ type: 'navigate', url });
        return;
      }
      await self.clients.openWindow(url);
    })(),
  );
});
