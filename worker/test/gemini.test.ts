import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../src/env';
import {
  buildPrompt,
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
