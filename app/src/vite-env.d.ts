/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Endereço do Worker (público), ex.: https://ema-worker.SEU-USUARIO.workers.dev */
  readonly VITE_API_URL?: string;
  /** Chave VAPID pública (não é segredo). */
  readonly VITE_VAPID_PUBLIC_KEY?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
