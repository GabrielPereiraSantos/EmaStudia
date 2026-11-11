import { useEffect, useRef, useState } from 'react';

const FOCUSABLE =
  'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

/**
 * Acessibilidade das folhas: foco entra na folha, Tab fica dentro dela, Esc fecha
 * e o foco volta para o botão que a abriu.
 */
export function useSheet(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  // capturado na primeira renderização, antes de qualquer autofocus da folha
  const [opener] = useState(() => document.activeElement as HTMLElement | null);
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    const el = ref.current;
    const items = () => (el ? [...el.querySelectorAll<HTMLElement>(FOCUSABLE)] : []);
    (items()[0] ?? el)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close.current();
      } else if (e.key === 'Tab') {
        const list = items();
        if (list.length === 0) return e.preventDefault();
        const first = list[0];
        const last = list[list.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      opener?.focus?.();
    };
  }, []);

  return ref;
}
