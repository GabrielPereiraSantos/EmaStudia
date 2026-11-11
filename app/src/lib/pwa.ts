import { useSyncExternalStore } from 'react';
import { registerSW } from 'virtual:pwa-register';

const CHECK_EVERY_MS = 60 * 60 * 1000;

let needRefresh = false;
let applyFn: (reload?: boolean) => Promise<void> = async () => {};
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Registra o service worker e avisa quando há versão nova esperando. */
export function initPwa() {
  if (!('serviceWorker' in navigator)) return;

  // Responde ao "ping" do service worker novo: esta versão sabe mostrar o aviso.
  navigator.serviceWorker.addEventListener('message', (e: MessageEvent) => {
    if ((e.data as { type?: string } | null)?.type === 'ema-ping') e.ports[0]?.postMessage('ok');
  });

  applyFn = registerSW({
    onNeedRefresh() {
      needRefresh = true;
      emit();
    },
    onRegisteredSW(_url, reg) {
      if (!reg) return;
      // Procura versão nova de hora em hora e sempre que o app volta para a tela
      // (o iPhone mantém o app aberto em segundo plano por dias).
      const check = () => void reg.update().catch(() => {});
      setInterval(check, CHECK_EVERY_MS);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check();
      });
    },
  });
}

/** "Aggiorna": ativa a versão nova e recarrega o app. */
export const applyUpdate = () => applyFn(true);

export function useUpdateAvailable(): boolean {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => needRefresh,
  );
}
