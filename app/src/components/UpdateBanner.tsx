import { useState } from 'react';
import { applyUpdate, useUpdateAvailable } from '../lib/pwa';

/** Aviso de versão nova do app. */
export function UpdateBanner() {
  const available = useUpdateAvailable();
  const [busy, setBusy] = useState(false);
  if (!available) return null;
  return (
    <div className="update-banner" role="status" aria-live="polite">
      <span>Nuova versione disponibile</span>
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          void applyUpdate();
        }}
      >
        Aggiorna
      </button>
    </div>
  );
}
