import { useEffect, useState } from 'react';

/**
 * Roteador por hash. Rotas:
 *  #/  · #/nuovo · #/studio/:id · #/studio/:id/modifica
 *  #/calendario · #/quiz · #/premi · #/impostazioni
 */
const parse = () => (location.hash.replace(/^#\/?/, '') || '').split('/').filter(Boolean);

export function useRoute(): string[] {
  const [parts, setParts] = useState(parse);
  useEffect(() => {
    const on = () => {
      setParts(parse());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return parts;
}

export const go = (path: string) => {
  location.hash = '#' + path;
};
export const studyPath = (id: number) => `/studio/${id}`;
