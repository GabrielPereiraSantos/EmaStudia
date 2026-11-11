/**
 * Navegação por hash com "tela-mãe lógica".
 *
 * O "<" nunca usa o histórico do navegador às cegas: ele leva à tela-mãe da tela atual.
 * Para não empilhar entradas, se a entrada anterior do histórico JÁ é a tela-mãe, volta
 * nela (history.back); senão SUBSTITUI a entrada atual pela tela-mãe (replace).
 */

const STUDY = /^\/studio\/\d+$/;

/** Tela-mãe de uma rota (null = tela de aba, sem "<"). `prev` = caminho da entrada anterior. */
export function parentFor(route: string[], prev: string | null): string | null {
  const [a, b, c] = route;
  if (!a) return null; // Home
  if (a === 'calendario' || (a === 'quiz' && !b)) return null; // abas
  if (a === 'premi' && !b) return null;
  if (a === 'nuovo') return '/';
  if (a === 'impostazioni') return '/';
  if (a === 'studio' && b) return c === 'modifica' ? `/studio/${b}` : '/';
  if (a === 'premi') return '/premi'; // Nuovo premio e Modifica premio
  if (a === 'quiz' && b) {
    if (c === 'scrivi') return '/quiz';
    // Risultato/quiz: volta ao Studio se veio de lá, senão à aba Quiz
    return prev && STUDY.test(prev) ? prev : '/quiz';
  }
  return '/';
}

export interface HistoryEnv {
  /** Caminho atual (#/studio/3 → /studio/3). */
  path(): string;
  push(path: string): void;
  replace(path: string): void;
  back(): void;
  /** history.state da entrada atual. */
  state(): { idx?: number } | null;
  /** Grava o índice na entrada atual (history.replaceState). */
  stamp(idx: number): void;
  load(): string | null;
  save(value: string): void;
}

/** Guarda o caminho de cada entrada do histórico para saber o que vem "antes". */
export class Nav {
  private paths: string[] = [];
  private idx = 0;
  private replacing = false;

  constructor(private env: HistoryEnv) {
    const st = env.state();
    if (typeof st?.idx === 'number') {
      this.idx = st.idx;
      try {
        const saved = JSON.parse(env.load() ?? '[]');
        if (Array.isArray(saved))
          this.paths = saved.filter((x): x is string => typeof x === 'string');
      } catch {
        /* recomeça */
      }
    } else {
      this.idx = 0;
      env.stamp(0);
    }
    this.paths[this.idx] = env.path();
    this.persist();
  }

  /** Chamado a cada mudança de hash (clique, push, replace, voltar/avançar do navegador). */
  changed() {
    const path = this.env.path();
    const st = this.env.state();
    if (typeof st?.idx === 'number') {
      // entrada já conhecida (voltar/avançar)
      this.idx = st.idx;
      this.paths[this.idx] = path;
    } else if (this.replacing) {
      this.replacing = false;
      this.paths[this.idx] = path;
      this.env.stamp(this.idx);
    } else {
      // entrada nova (link ou go)
      this.idx += 1;
      this.paths.length = this.idx;
      this.paths[this.idx] = path;
      this.env.stamp(this.idx);
    }
    this.persist();
  }

  private persist() {
    this.env.save(JSON.stringify(this.paths.slice(0, this.idx + 1)));
  }

  /** Caminho da entrada anterior (null se não houver). */
  previous(): string | null {
    return this.idx > 0 ? (this.paths[this.idx - 1] ?? null) : null;
  }

  go(path: string) {
    if (path !== this.env.path()) this.env.push(path);
  }

  /** Substitui a entrada atual (trocar de aba, depois de salvar, sair de um quiz…). */
  replace(path: string) {
    if (path === this.env.path()) return;
    this.replacing = true;
    this.env.replace(path);
  }

  /** "<": leva à tela-mãe sem empilhar. Devolve false se a tela não tem mãe (aba). */
  up(route: string[]): boolean {
    const prev = this.previous();
    const parent = parentFor(route, prev);
    if (!parent) return false;
    if (prev === parent) this.env.back();
    else this.replace(parent);
    return true;
  }
}
