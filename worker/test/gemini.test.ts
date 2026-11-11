import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../src/env';
import {
  buildPrompt,
  callGemini,
  thinkingCandidates,
  parseGeminiRequest,
  reserveUsage,
  refundUsage,
  validateQuestions,
} from '../src/gemini';
import { app } from '../src/index';
import { isTimezone } from '../src/validate';
import { makeD1 } from './d1';

const ORIGIN = 'https://ema.pages.dev';
const CODE = 'codice-segreto-123';
let env: Env & { DB: ReturnType<typeof makeD1> };

beforeEach(() => {
  env = {
    DB: makeD1(),
    ACCESS_CODE: CODE,
    VAPID_PUBLIC_KEY: '',
    VAPID_PRIVATE_KEY: '',
    VAPID_SUBJECT: '',
    ALLOWED_ORIGIN: ORIGIN,
    GEMINI_API_KEY: 'chiave-finta',
    GEMINI_MODEL: 'gemini-2.5-flash',
    GEMINI_DAILY_LIMIT: '2',
  };
});
afterEach(() => vi.unstubAllGlobals());

const body = (o: Record<string, unknown> = {}) => ({
  timezone: 'Europe/Rome',
  subject: 'Storia',
  type: 'umanistiche',
  topic: 'Rivoluzione francese',
  difficulty: 2,
  chapter: { n: 3, title: 'Il Terrore' },
  pages: { from: 45, to: 60 },
  notes: ['1789: presa della Bastiglia'],
  summary: '',
  ...o,
});
const call = (path: string, init: RequestInit = {}) =>
  app.request(
    path,
    {
      ...init,
      headers: { Origin: ORIGIN, 'X-Access-Code': CODE, 'Content-Type': 'application/json' },
    },
    env,
  );

const q = (i: number, extra: Record<string, unknown> = {}) => ({
  question: `Domanda ${i}?`,
  options: ['A', 'B', 'C', 'D'],
  correctIndex: i % 4,
  explanation: 'Perché sì.',
  ...extra,
});
/** Resposta do Gemini no formato da API. */
const geminiReply = (data: unknown, status = 200) =>
  new Response(
    JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(data) }] } }] }),
    { status },
  );

describe('pedido ao Gemini', () => {
  it('prompt em italiano, com o contexto do estudo e nada pessoal', () => {
    const r = parseGeminiRequest('quiz', body(), isTimezone)!;
    const p = buildPrompt(r);
    expect(p).toMatch(/quiz di 5 domande/);
    expect(p).toMatch(/Capitolo 3 «Il Terrore»/);
    expect(p).toMatch(/Pagine 45–60/);
    expect(p).toMatch(/presa della Bastiglia/);
    expect(p).toMatch(/Difficoltà: media/);
    expect(p).not.toMatch(/Ema|Europe\/Rome/);
  });
  it('sem capítulo: quiz sobre o argomento inteiro', () => {
    const p = buildPrompt(
      parseGeminiRequest('quiz', body({ chapter: undefined, pages: undefined }), isTimezone)!,
    );
    expect(p).toMatch(/sull'intero argomento/);
  });
  it('só o que ela já estudou: páginas sem capítulo', () => {
    const p = buildPrompt(
      parseGeminiRequest(
        'quiz',
        body({ chapter: undefined, pages: { from: 1, to: 60 } }),
        isTimezone,
      )!,
    );
    expect(p).toMatch(/sulle pagine indicate \(solo ciò che lo studente ha già studiato\)/);
    expect(p).toMatch(/Pagine 1–60/);
  });
  it('exercícios pedem a solução passo a passo', () => {
    expect(
      buildPrompt(parseGeminiRequest('esercizi', body({ type: 'esatte' }), isTimezone)!),
    ).toMatch(/4 esercizi.*passo a passo/s);
  });
  it.each([
    ['tipo desconhecido', 'quiz', { type: 'magia' }],
    ['dificuldade inválida', 'quiz', { difficulty: 7 }],
    ['notas demais', 'quiz', { notes: Array(51).fill('x') }],
    ['resumo grande', 'riassunto', { summary: 'x'.repeat(2001) }],
    ['rota desconhecida', 'poesia', {}],
  ])('recusa %s', (_n, kind, o) =>
    expect(parseGeminiRequest(kind as string, body(o), isTimezone)).toBeNull(),
  );
});

describe('validação da resposta', () => {
  it('aceita 5 perguntas com 4 opções e limpa o texto', () => {
    const v = validateQuestions('quiz', {
      questions: [q(0, { question: '  Ciao\u0007? ' }), q(1), q(2), q(3), q(4), q(5)],
    })!;
    expect(v).toHaveLength(5); // a sexta é descartada
    expect(v[0].question).toBe('Ciao ?');
  });
  it.each([
    ['menos perguntas', { questions: [q(0), q(1)] }],
    ['3 opções', { questions: [0, 1, 2, 3, 4].map((i) => q(i, { options: ['a', 'b', 'c'] })) }],
    ['correctIndex fora', { questions: [0, 1, 2, 3, 4].map((i) => q(i, { correctIndex: 4 })) }],
    [
      'opção vazia',
      { questions: [0, 1, 2, 3, 4].map((i) => q(i, { options: ['a', '', 'c', 'd'] })) },
    ],
    ['formato errado', 'non è json'],
  ])('recusa %s', (_n, data) => expect(validateQuestions('quiz', data)).toBeNull());
  it('exercícios exigem a solução', () => {
    expect(validateQuestions('esercizi', { questions: [0, 1, 2, 3].map((i) => q(i)) })).toBeNull();
    expect(
      validateQuestions('esercizi', {
        questions: [0, 1, 2, 3].map((i) => q(i, { solution: 'v = s/t = 60' })),
      }),
    ).toHaveLength(4);
  });
});

describe('cota diária', () => {
  it('reserva até o limite e devolve em caso de falha', async () => {
    expect(await reserveUsage(env.DB, '2026-11-11', 2)).toBe(1);
    expect(await reserveUsage(env.DB, '2026-11-11', 2)).toBe(2);
    expect(await reserveUsage(env.DB, '2026-11-11', 2)).toBeNull();
    await refundUsage(env.DB, '2026-11-11');
    expect(await reserveUsage(env.DB, '2026-11-11', 2)).toBe(2);
    expect(await reserveUsage(env.DB, '2026-11-12', 2)).toBe(1); // dia novo
  });
});

describe('rotas do Gemini', () => {
  it('gera o quiz, valida e conta o uso; a chave vai no cabeçalho', async () => {
    const fetcher = vi.fn(async () => geminiReply({ questions: [0, 1, 2, 3, 4].map((i) => q(i)) }));
    vi.stubGlobal('fetch', fetcher);
    const r = await call('/api/gemini/quiz', { method: 'POST', body: JSON.stringify(body()) });
    expect(r.status).toBe(200);
    const data = (await r.json()) as { questions: unknown[]; used: number; limit: number };
    expect(data.questions).toHaveLength(5);
    expect(data).toMatchObject({ used: 1, limit: 2 });
    const [url, init] = fetcher.mock.calls[0] as unknown as [
      string,
      RequestInit & { headers: Record<string, string> },
    ];
    expect(url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
    );
    expect(url).not.toMatch(/key=/);
    expect(init.headers['x-goog-api-key']).toBe('chiave-finta');
    const sent = JSON.parse(init.body as string);
    expect(sent.generationConfig.responseMimeType).toBe('application/json');
    expect(sent.generationConfig.responseSchema.properties.questions).toBeTruthy();
  });

  it('cota esgotada → 429 (e não chama o Gemini)', async () => {
    const fetcher = vi.fn(async () => geminiReply({ questions: [0, 1, 2, 3, 4].map((i) => q(i)) }));
    vi.stubGlobal('fetch', fetcher);
    for (let i = 0; i < 2; i++)
      await call('/api/gemini/quiz', { method: 'POST', body: JSON.stringify(body()) });
    const r = await call('/api/gemini/quiz', { method: 'POST', body: JSON.stringify(body()) });
    expect(r.status).toBe(429);
    expect(fetcher).toHaveBeenCalledTimes(2);
    const u = await (await call('/api/gemini/usage?tz=Europe/Rome')).json();
    expect(u).toEqual({ used: 2, limit: 2 });
  });

  it('resposta inválida do Gemini → 502 e o uso é devolvido', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => geminiReply({ questions: [q(0)] })),
    );
    expect(
      (await call('/api/gemini/quiz', { method: 'POST', body: JSON.stringify(body()) })).status,
    ).toBe(502);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('erro', { status: 500 })),
    );
    expect(
      (await call('/api/gemini/quiz', { method: 'POST', body: JSON.stringify(body()) })).status,
    ).toBe(502);
    expect(await (await call('/api/gemini/usage?tz=Europe/Rome')).json()).toEqual({
      used: 0,
      limit: 2,
    });
  });

  it('resumo', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => geminiReply({ summary: 'Punti chiave:\nla rivoluzione…' })),
    );
    const r = await call('/api/gemini/riassunto', {
      method: 'POST',
      body: JSON.stringify(body({ chapter: undefined })),
    });
    expect(await r.json()).toMatchObject({ ok: true, summary: 'Punti chiave:\nla rivoluzione…' });
  });

  it('sem chave configurada → 503', async () => {
    env.GEMINI_API_KEY = '';
    expect(
      (await call('/api/gemini/quiz', { method: 'POST', body: JSON.stringify(body()) })).status,
    ).toBe(503);
  });

  it('sem código de acesso → 401', async () => {
    const r = await app.request(
      '/api/gemini/quiz',
      { method: 'POST', headers: { Origin: ORIGIN }, body: JSON.stringify(body()) },
      env,
    );
    expect(r.status).toBe(401);
  });
});

const OK_BODY = geminiReply({ questions: [0, 1, 2, 3, 4].map((i) => q(i)) });
const errReply = (status: number, error: Record<string, unknown>) =>
  new Response(JSON.stringify({ error }), { status });
const sentBody = (f: ReturnType<typeof vi.fn>, n = 0) =>
  JSON.parse(((f.mock.calls[n] as unknown[])[1] as { body: string }).body);

describe('thinking no mínimo', () => {
  it('cada família usa o campo certo', () => {
    expect(thinkingCandidates('gemini-2.5-flash')[0].config).toEqual({ thinkingBudget: 0 });
    expect(thinkingCandidates('gemini-2.5-flash-lite')[0].config).toEqual({ thinkingBudget: 0 });
    expect(thinkingCandidates('gemini-3-flash-preview')[0].config).toEqual({
      thinkingLevel: 'minimal',
    });
    expect(thinkingCandidates('gemini-flash-latest')[0].config).toEqual({
      thinkingLevel: 'minimal',
    });
    expect(thinkingCandidates('gemini-2.5-pro')[0].config).toEqual({ thinkingBudget: 128 }); // não desliga
  });
  it('a chamada leva o thinkingConfig (riassunto, quiz e esercizi usam a mesma função)', async () => {
    const f = vi.fn(async () => OK_BODY.clone());
    await callGemini(
      'k',
      'gemini-2.5-flash',
      'p',
      {},
      { fetcher: f as unknown as typeof fetch, log: () => {} },
    );
    expect(sentBody(f).generationConfig.thinkingConfig).toEqual({ thinkingBudget: 0 });
  });
  it('se o modelo recusa o campo, tenta o próximo (e lembra o que funcionou)', async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(
        errReply(400, {
          code: 400,
          status: 'INVALID_ARGUMENT',
          message: 'Unknown name "thinkingLevel": Cannot find field.',
        }),
      )
      .mockResolvedValue(OK_BODY.clone());
    const r = await callGemini(
      'k',
      'gemini-meuapelido-latest',
      'p',
      {},
      { fetcher: f as unknown as typeof fetch, log: () => {} },
    );
    expect(r.ok).toBe(true);
    expect(f).toHaveBeenCalledTimes(2);
    expect(sentBody(f, 0).generationConfig.thinkingConfig).toEqual({ thinkingLevel: 'minimal' });
    expect(sentBody(f, 1).generationConfig.thinkingConfig).toEqual({ thinkingBudget: 0 });
    // próxima chamada já parte da configuração que funcionou
    const g = vi.fn(async () => OK_BODY.clone());
    await callGemini(
      'k',
      'gemini-meuapelido-latest',
      'p',
      {},
      { fetcher: g as unknown as typeof fetch, log: () => {} },
    );
    expect(sentBody(g).generationConfig.thinkingConfig).toEqual({ thinkingBudget: 0 });
  });
  it('um 400 que não é sobre thinking não é repetido', async () => {
    const f = vi.fn(async () =>
      errReply(400, { code: 400, status: 'INVALID_ARGUMENT', message: 'API key not valid.' }),
    );
    const r = await callGemini(
      'k',
      'gemini-outro-latest',
      'p',
      {},
      { fetcher: f as unknown as typeof fetch, log: () => {} },
    );
    expect(r).toMatchObject({ ok: false, reason: 'http', status: 400 });
    expect(f).toHaveBeenCalledTimes(1);
  });
});

describe('log do Gemini (sem o conteúdo)', () => {
  it('erro HTTP: status, código e mensagem do Gemini e duração', async () => {
    const lines: string[] = [];
    const f = vi.fn(async () =>
      errReply(503, {
        code: 503,
        status: 'UNAVAILABLE',
        message: 'The model is overloaded.\nTry later.',
      }),
    );
    await callGemini(
      'chave-secreta',
      'gemini-2.5-flash',
      'TESTO-PRIVATO-DA-EMA',
      {},
      { fetcher: f as unknown as typeof fetch, log: (l) => lines.push(l), kind: 'riassunto' },
    );
    const log = JSON.parse(lines[0]);
    expect(log).toMatchObject({
      at: 'gemini',
      kind: 'riassunto',
      model: 'gemini-2.5-flash',
      ok: false,
      reason: 'http',
      http: 503,
      geminiStatus: 'UNAVAILABLE',
      geminiCode: 503,
      message: 'The model is overloaded. Try later.',
    });
    expect(typeof log.ms).toBe('number');
    expect(lines.join()).not.toMatch(/TESTO-PRIVATO|chave-secreta/);
  });
  it('sucesso, resposta vazia (bloqueio) e corpo estranho', async () => {
    const lines: string[] = [];
    const log = (l: string) => lines.push(l);
    await callGemini(
      'k',
      'gemini-2.5-flash',
      'p',
      {},
      { fetcher: (async () => OK_BODY.clone()) as typeof fetch, log, kind: 'quiz' },
    );
    await callGemini(
      'k',
      'gemini-2.5-flash',
      'p',
      {},
      {
        fetcher: (async () =>
          new Response(
            JSON.stringify({ promptFeedback: { blockReason: 'SAFETY' } }),
          )) as typeof fetch,
        log,
      },
    );
    await callGemini(
      'k',
      'gemini-2.5-flash',
      'p',
      {},
      { fetcher: (async () => new Response('não é json')) as typeof fetch, log },
    );
    const [a, b, c] = lines.map((l) => JSON.parse(l));
    expect(a).toMatchObject({ ok: true, http: 200, kind: 'quiz' });
    expect(b).toMatchObject({ ok: false, reason: 'empty', blockReason: 'SAFETY' });
    expect(c).toMatchObject({ ok: false, reason: 'parse' });
  });
});

describe('tempo limite do Gemini', () => {
  it('estourou o tempo → reason "timeout" (de verdade, pelo sinal de abort)', async () => {
    const hang = (_u: string, init: RequestInit) =>
      new Promise<Response>((_res, rej) =>
        init.signal!.addEventListener('abort', () => rej(init.signal!.reason)),
      );
    const t0 = Date.now();
    const r = await callGemini(
      'k',
      'gemini-2.5-flash',
      'p',
      {},
      { fetcher: hang as unknown as typeof fetch, timeoutMs: 1200, log: () => {} },
    );
    expect(r).toMatchObject({ ok: false, reason: 'timeout' });
    expect(Date.now() - t0).toBeLessThan(3000);
  });
  it('falha de rede → "network" (não confundir com timeout)', async () => {
    const r = await callGemini(
      'k',
      'gemini-2.5-flash',
      'p',
      {},
      {
        fetcher: (async () => {
          throw new TypeError('fetch failed');
        }) as typeof fetch,
        log: () => {},
      },
    );
    expect(r).toMatchObject({ ok: false, reason: 'network' });
  });
  it('o limite padrão é de 50 s', async () => {
    const { GEMINI_TIMEOUT_MS } = await import('../src/gemini');
    expect(GEMINI_TIMEOUT_MS).toBe(50_000);
  });
});

describe('respostas de erro do Gemini na rota (sempre com CORS)', () => {
  const post = () =>
    call('/api/gemini/riassunto', {
      method: 'POST',
      body: JSON.stringify(body({ chapter: undefined })),
    });
  const usage = async () =>
    ((await (await call('/api/gemini/usage?tz=Europe/Rome')).json()) as { used: number }).used;
  const cors = (r: Response) => expect(r.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
  beforeEach(() => vi.spyOn(console, 'log').mockImplementation(() => {}));

  it('429 do Gemini → 429 "gemini-quota" e a vaga é devolvida', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        errReply(429, { code: 429, status: 'RESOURCE_EXHAUSTED', message: 'quota' }),
      ),
    );
    const r = await post();
    expect(r.status).toBe(429);
    expect(await r.json()).toMatchObject({ error: 'gemini-quota' });
    cors(r);
    expect(await usage()).toBe(0);
  });
  it('timeout → 504 "gemini-timeout"', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new DOMException('timed out', 'TimeoutError');
      }),
    );
    const r = await post();
    expect(r.status).toBe(504);
    expect(await r.json()).toMatchObject({ error: 'gemini-timeout' });
    cors(r);
    expect(await usage()).toBe(0);
  });
  it('outro erro (500/503/rede) → 502 com o motivo', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => errReply(503, { code: 503, status: 'UNAVAILABLE', message: 'overloaded' })),
    );
    const r = await post();
    expect(r.status).toBe(502);
    expect(await r.json()).toMatchObject({ error: 'gemini', reason: 'http', http: 503 });
    cors(r);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('fetch failed');
      }),
    );
    expect(await (await post()).json()).toMatchObject({ error: 'gemini', reason: 'network' });
  });
  it('quiz com resposta fora do formato → 502 "invalid-output"', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => geminiReply({ questions: [q(0)] })),
    );
    const r = await call('/api/gemini/quiz', { method: 'POST', body: JSON.stringify(body()) });
    expect(r.status).toBe(502);
    expect(await r.json()).toMatchObject({ reason: 'invalid-output' });
    cors(r);
  });
});
