/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core';
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';

declare const self: ServiceWorkerGlobalScope;

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);
// A versão nova passa a controlar as abas assim que é ativada (depois do "Aggiorna").
clientsClaim();

// "Aggiorna": a página pede para a versão nova assumir.
self.addEventListener('message', (e) => {
  if (e.data?.type === 'SKIP_WAITING') void self.skipWaiting();
});

/** A aba responde ao "ping" se roda uma versão do app que sabe mostrar "Nuova versione disponibile". */
function answers(client: Client): Promise<boolean> {
  return new Promise((resolve) => {
    const ch = new MessageChannel();
    const timer = setTimeout(() => resolve(false), 700);
    ch.port1.onmessage = () => {
      clearTimeout(timer);
      resolve(true);
    };
    client.postMessage({ type: 'ema-ping' }, [ch.port2]);
  });
}

/**
 * Versões antigas do app (sem o aviso) ficavam presas: o service worker novo esperava para sempre
 * e a Ema continuava na versão velha. Se alguma aba aberta não responde ao ping, ela não consegue
 * pedir a atualização: ativa já. Se todas respondem, espera o toque em "Aggiorna".
 */
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const tabs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      if (tabs.length === 0) return void (await self.skipWaiting());
      const replies = await Promise.all(tabs.map(answers));
      if (replies.some((ok) => !ok)) await self.skipWaiting();
    })(),
  );
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
