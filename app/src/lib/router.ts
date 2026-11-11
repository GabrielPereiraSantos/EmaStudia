import { useEffect, useState } from 'react';
import { Nav, parentFor, type HistoryEnv } from './nav';

/**
 * Roteador por hash. Rotas:
 *  #/  · #/nuovo · #/studio/:id · #/studio/:id/modifica
 *  #/calendario · #/quiz · #/quiz/:id · #/premi · #/premi/nuovo · #/impostazioni
 */
const currentPath = () => location.hash.replace(/^#/, '') || '/';
const parse = () => currentPath().split('/').filter(Boolean);

const KEY = 'ema-nav';
const env: HistoryEnv = {
  path: currentPath,
  push: (p) => {
    location.hash = '#' + p;
  },
  replace: (p) => location.replace('#' + p),
  back: () => history.back(),
  state: () => history.state as { idx?: number } | null,
  stamp: (idx) => history.replaceState({ ...(history.state ?? {}), idx }, ''),
  load: () => {
    try {
      return sessionStorage.getItem(KEY);
    } catch {
      return null;
    }
  },
  save: (v) => {
    try {
      sessionStorage.setItem(KEY, v);
    } catch {
      /* sem armazenamento: o "<" só substitui, nunca volta no histórico */
    }
  },
};

const nav = new Nav(env);
window.addEventListener('hashchange', () => nav.changed());

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

/** Abre uma tela nova (empilha no histórico). */
export const go = (path: string) => nav.go(path);
/** Troca a entrada atual (abas, depois de salvar, ao sair de um quiz). */
export const replace = (path: string) => nav.replace(path);
/** Volta à tela-mãe da rota atual (sem empilhar). */
export const goUp = (route: string[] = parse()) => nav.up(route);
/** Tela-mãe da rota atual (null nas abas, que não têm "<"). */
export const parentOfCurrent = (route: string[]) => parentFor(route, null);

export const studyPath = (id: number) => `/studio/${id}`;
