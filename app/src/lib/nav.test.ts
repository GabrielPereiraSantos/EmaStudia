import { beforeEach, describe, expect, it } from 'vitest';
import { Nav, parentFor, type HistoryEnv } from './nav';

/** Histórico de navegador de mentira (pilha de entradas, como o de verdade). */
class FakeBrowser implements HistoryEnv {
  entries: { path: string; state: { idx?: number } | null }[];
  i = 0;
  store: string | null = null;
  nav!: Nav;
  constructor(start = '/') {
    this.entries = [{ path: start, state: null }];
  }
  boot() {
    this.nav = new Nav(this);
    return this;
  }
  fire() {
    this.nav.changed();
  }
  path = () => this.entries[this.i].path;
  push = (p: string) => {
    this.entries.length = this.i + 1; // joga fora o "avançar"
    this.entries.push({ path: p, state: null });
    this.i++;
    this.fire();
  };
  replace = (p: string) => {
    this.entries[this.i] = { path: p, state: null };
    this.fire();
  };
  back = () => {
    this.i--;
    this.fire();
  };
  forward() {
    this.i++;
    this.fire();
  }
  state = () => this.entries[this.i].state;
  stamp = (idx: number) => {
    this.entries[this.i].state = { idx };
  };
  load = () => this.store;
  save = (v: string) => {
    this.store = v;
  };
  /** Clique num <a href="#/…"> (empilha). */
  link(p: string) {
    this.push(p);
  }
  get paths() {
    return this.entries.map((e) => e.path);
  }
  /** "<" na tela atual. */
  up() {
    const route = this.path().split('/').filter(Boolean);
    return this.nav.up(route);
  }
}

describe('tela-mãe de cada tela', () => {
  const p = (route: string, prev: string | null = null) =>
    parentFor(route.split('/').filter(Boolean), prev);
  it('Studio → Home; Nuovo studio → Home; Impostazioni → Home', () => {
    expect(p('studio/3')).toBe('/');
    expect(p('nuovo')).toBe('/');
    expect(p('impostazioni')).toBe('/');
  });
  it('editando um estudo → de volta ao Studio', () =>
    expect(p('studio/3/modifica')).toBe('/studio/3'));
  it('Nuovo premio e Modifica premio → Premi', () => {
    expect(p('premi/nuovo')).toBe('/premi');
    expect(p('premi/7/modifica')).toBe('/premi');
  });
  it('Quiz/Risultato → aba Quiz, ou Studio se veio de lá', () => {
    expect(p('quiz/5', '/quiz')).toBe('/quiz');
    expect(p('quiz/5', null)).toBe('/quiz');
    expect(p('quiz/5', '/studio/3')).toBe('/studio/3');
    expect(p('quiz/5', '/studio/3/modifica')).toBe('/quiz');
    expect(p('quiz/5/scrivi', '/studio/3')).toBe('/quiz');
  });
  it('Calendario, Quiz, Premi e Home (abas) não têm "<"', () => {
    for (const r of ['', 'calendario', 'quiz', 'premi']) expect(p(r)).toBeNull();
  });
});

describe('"<" volta à tela-mãe sem empilhar', () => {
  let b: FakeBrowser;
  beforeEach(() => {
    b = new FakeBrowser('/').boot();
  });

  it('Home → Studio → "<": volta à Home e o histórico não cresce', () => {
    b.link('/studio/3');
    expect(b.up()).toBe(true);
    expect(b.path()).toBe('/');
    expect(b.paths).toEqual(['/', '/studio/3']); // a entrada do Studio fica só como "avançar"
    for (let n = 0; n < 10; n++) {
      b.link('/studio/3');
      b.up();
    }
    expect(b.entries.length).toBe(2); // 10 idas e vindas não empilham nada
  });

  it('várias telas abertas: cada "<" sobe um degrau lógico até a Home', () => {
    b.link('/studio/3');
    b.link('/studio/3/modifica');
    b.up();
    expect(b.path()).toBe('/studio/3');
    b.up();
    expect(b.path()).toBe('/');
    expect(b.up()).toBe(false); // a Home é aba: sem "<"
  });

  it('a rota aberta por uma notificação (#/studio/ID) volta para a Home', () => {
    const n = new FakeBrowser('/studio/9').boot(); // sem nada antes no histórico
    expect(n.up()).toBe(true);
    expect(n.path()).toBe('/');
    expect(n.entries.length).toBe(1); // substituiu, não empilhou
    // com o app já aberto em outro estudo: ainda vai direto à Home
    const m = new FakeBrowser('/').boot();
    m.link('/studio/1');
    m.link('/studio/9'); // chegou pela notificação
    m.up();
    expect(m.path()).toBe('/');
  });

  it('o "<" nunca vai para uma tela que não é a mãe, mesmo que seja a anterior no histórico', () => {
    b.link('/impostazioni');
    b.link('/studio/3'); // (hipótese) navegou direto
    b.up();
    expect(b.path()).toBe('/'); // não "/impostazioni"
  });

  it('Impostazioni → Home', () => {
    b.link('/impostazioni');
    b.up();
    expect(b.path()).toBe('/');
  });
});

describe('abas substituem a entrada do histórico', () => {
  it('trocar de aba várias vezes não empilha', () => {
    const b = new FakeBrowser('/').boot();
    for (const t of ['/calendario', '/quiz', '/premi', '/', '/calendario']) b.nav.replace(t);
    expect(b.entries.length).toBe(1);
    expect(b.path()).toBe('/calendario');
  });
  it('clicar na aba em que já está não faz nada', () => {
    const b = new FakeBrowser('/premi').boot();
    b.nav.replace('/premi');
    b.link('/premi/nuovo'); // o próximo push continua sendo push (não virou "replace" por engano)
    expect(b.paths).toEqual(['/premi', '/premi/nuovo']);
  });
});

describe('depois de salvar, voltar não reabre o formulário', () => {
  it('estudo novo: Nuovo studio é substituído pelo Studio', () => {
    const b = new FakeBrowser('/').boot();
    b.link('/nuovo');
    b.nav.replace('/studio/4'); // depois de "Crea il piano di studio"
    expect(b.paths).toEqual(['/', '/studio/4']);
    b.up();
    expect(b.path()).toBe('/');
    expect(b.paths).not.toContain('/nuovo');
  });
  it('estudo editado: salvar volta ao Studio sem duplicá-lo', () => {
    const b = new FakeBrowser('/').boot();
    b.link('/studio/4');
    b.link('/studio/4/modifica');
    b.nav.up(['studio', '4', 'modifica']); // depois de "Salva le modifiche"
    expect(b.path()).toBe('/studio/4');
    b.up();
    expect(b.path()).toBe('/');
    expect(b.entries.length).toBe(3); // nada foi empilhado a mais
  });
  it('prêmio: salvar volta a Premi (criar ou editar)', () => {
    const b = new FakeBrowser('/premi').boot(); // aba (entrada substituída)
    b.link('/premi/nuovo');
    b.nav.up(['premi', 'nuovo']);
    expect(b.path()).toBe('/premi');
    b.link('/premi/2/modifica');
    b.up();
    expect(b.path()).toBe('/premi');
    expect(b.entries.length).toBe(2);
  });
  it('"Scrivi tu": ao salvar, o formulário é substituído pelo quiz', () => {
    const b = new FakeBrowser('/quiz').boot();
    b.link('/quiz/5/scrivi');
    b.nav.replace('/quiz/5');
    expect(b.paths).toEqual(['/quiz', '/quiz/5']);
    b.up();
    expect(b.path()).toBe('/quiz');
  });
});

describe('quiz e resultado', () => {
  it('veio da aba Quiz: "<" volta à aba Quiz', () => {
    const b = new FakeBrowser('/quiz').boot();
    b.link('/quiz/5');
    b.up();
    expect(b.path()).toBe('/quiz');
    expect(b.entries.length).toBe(2);
  });
  it('veio do Studio: "<" volta ao Studio', () => {
    const b = new FakeBrowser('/').boot();
    b.link('/studio/3');
    b.link('/quiz/5');
    b.up();
    expect(b.path()).toBe('/studio/3');
  });
  it('"Torna allo studio" substitui o quiz (voltar não reabre o resultado)', () => {
    const b = new FakeBrowser('/quiz').boot();
    b.link('/quiz/5');
    b.nav.replace('/studio/3');
    expect(b.paths).toEqual(['/quiz', '/studio/3']);
    b.up();
    expect(b.path()).toBe('/');
    expect(b.paths).not.toContain('/quiz/5');
  });
});

describe('histórico do navegador e recarregar a página', () => {
  it('voltar/avançar do próprio navegador mantém o rastreio', () => {
    const b = new FakeBrowser('/').boot();
    b.link('/studio/1');
    b.link('/studio/1/modifica');
    b.back();
    b.back();
    b.forward();
    expect(b.path()).toBe('/studio/1');
    expect(b.nav.previous()).toBe('/');
    b.up();
    expect(b.path()).toBe('/');
  });
  it('depois de recarregar, ainda sabe qual era a entrada anterior', () => {
    const b = new FakeBrowser('/').boot();
    b.link('/studio/2');
    const reloaded = new Nav(b); // novo Nav sobre o mesmo histórico (state e sessionStorage persistem)
    expect(reloaded.previous()).toBe('/');
    b.nav = reloaded;
    b.up();
    expect(b.path()).toBe('/');
  });
  it('sem sessionStorage o "<" ainda funciona (só substitui)', () => {
    const b = new FakeBrowser('/').boot();
    b.link('/studio/2');
    b.store = null;
    const reloaded = new Nav(b);
    b.nav = reloaded;
    b.up();
    expect(b.path()).toBe('/');
  });
});
