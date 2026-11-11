import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../src/env';
import worker, { app } from '../src/index';
import { makeD1 } from './d1';

const ORIGIN = 'https://ema.pages.dev';
const CODE = 'codice-segreto-123';
const DEVICE = '3f2b8c1e-1a2b-4c3d-9e8f-001122334455';
let env: Env & { DB: ReturnType<typeof makeD1> };

beforeEach(() => {
  env = {
    DB: makeD1(),
    ACCESS_CODE: CODE,
    VAPID_PUBLIC_KEY: '',
    VAPID_PRIVATE_KEY: '',
    VAPID_SUBJECT: '',
    ALLOWED_ORIGIN: ORIGIN,
  };
});

const req = (
  path: string,
  init: RequestInit & { origin?: string | null; code?: string | null } = {},
) => {
  const headers = new Headers(init.headers);
  if (init.origin !== null) headers.set('Origin', init.origin ?? ORIGIN);
  if (init.code !== null) headers.set('X-Access-Code', init.code ?? CODE);
  if (init.body) headers.set('Content-Type', 'application/json');
  return app.request(path, { ...init, headers }, env);
};

const hasCors = (r: Response) => r.headers.get('Access-Control-Allow-Origin') === ORIGIN;

describe('CORS em todas as respostas (inclusive erros)', () => {
  it('200 de sucesso', async () =>
    expect(hasCors(await req('/api/ping', { method: 'POST' }))).toBe(true));
  it('401 sem código ou com código errado', async () => {
    const a = await req('/api/ping', { method: 'POST', code: null });
    const b = await req('/api/ping', { method: 'POST', code: 'errado' });
    expect([a.status, b.status]).toEqual([401, 401]);
    expect(hasCors(a) && hasCors(b)).toBe(true);
  });
  it('400 (corpo inválido), 404 (rota inexistente) e 413 (corpo grande)', async () => {
    const bad = await req('/api/schedule', { method: 'PUT', body: '{x' });
    const nf = await req('/nao-existe');
    const big = await req('/api/schedule', {
      method: 'PUT',
      body: JSON.stringify({ x: 'a'.repeat(70 * 1024) }),
    });
    expect([bad.status, nf.status, big.status]).toEqual([400, 404, 413]);
    expect(hasCors(bad) && hasCors(nf) && hasCors(big)).toBe(true);
  });
  it('429 (limite por minuto) com Retry-After visível ao navegador', async () => {
    let last!: Response;
    for (let i = 0; i < 7; i++)
      last = await req('/api/test-notification', {
        method: 'POST',
        body: JSON.stringify({ deviceId: DEVICE }),
      });
    expect(last.status).toBe(429);
    expect(hasCors(last)).toBe(true);
    expect(last.headers.get('Access-Control-Expose-Headers')).toMatch(/Retry-After/);
  });
  it('500 (exceção na rota) mantém o CORS e não vaza detalhes', async () => {
    env.DB = {
      prepare: () => {
        throw new Error('banco quebrou com segredo-xyz');
      },
      batch: () => {
        throw new Error('x');
      },
    } as never;
    const r = await req('/api/schedule', {
      method: 'PUT',
      body: JSON.stringify({ deviceId: DEVICE, timezone: 'Europe/Rome', reminders: [], notes: {} }),
    });
    // o limite por minuto também usa o banco: qualquer falha vira 500 com CORS
    expect(r.status).toBe(500);
    expect(hasCors(r)).toBe(true);
    expect(await r.text()).not.toMatch(/segredo-xyz/);
  });
  it('rede de segurança: exceção fora da aplicação também sai com CORS', async () => {
    const spy = vi.spyOn(app, 'fetch').mockRejectedValue(new Error('explodiu'));
    const r = await worker.fetch(
      new Request('https://w.example/api/ping', { method: 'POST', headers: { Origin: ORIGIN } }),
      env,
      {} as ExecutionContext,
    );
    spy.mockRestore();
    expect(r.status).toBe(500);
    expect(hasCors(r)).toBe(true);
  });
  it('origem de fora nunca recebe CORS (nem nos erros)', async () => {
    const r = await req('/api/ping', {
      method: 'POST',
      code: 'errado',
      origin: 'https://malvagio.example',
    });
    expect(r.status).toBe(401);
    expect(r.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
});

describe('preflight', () => {
  const pre = (origin: string | null, e: Partial<Env> = {}) =>
    app.request(
      '/api/gemini/riassunto',
      {
        method: 'OPTIONS',
        headers: {
          ...(origin ? { Origin: origin } : {}),
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'content-type,x-access-code',
        },
      },
      { ...env, ...e },
    );
  it('origem do app: 204 com métodos, cabeçalhos permitidos e cache', async () => {
    const r = await pre(ORIGIN);
    expect(r.status).toBe(204);
    expect(hasCors(r)).toBe(true);
    expect(r.headers.get('Access-Control-Allow-Headers')).toMatch(/X-Access-Code/i);
    expect(r.headers.get('Access-Control-Allow-Methods')).toMatch(/POST/);
    expect(r.headers.get('Access-Control-Max-Age')).toBe('86400');
  });
  it('origem de fora ou ALLOWED_ORIGIN vazio: sem Allow-Origin', async () => {
    expect(
      (await pre('https://malvagio.example')).headers.get('Access-Control-Allow-Origin'),
    ).toBeNull();
    expect(
      (await pre(ORIGIN, { ALLOWED_ORIGIN: '' })).headers.get('Access-Control-Allow-Origin'),
    ).toBeNull();
  });
});
