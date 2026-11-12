import { webcrypto } from 'node:crypto';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { runCron } from '../src/cron';
import type { Env } from '../src/env';
import { app } from '../src/index';
import {
  ALERT_TTL_S,
  GIVE_UP_MS,
  MARGIN_MS,
  parsePomodoroAlert,
  pomodoroMessage,
  runPomodoroAlerts,
} from '../src/pomodoro';
import { makeD1 } from './d1';

const ORIGIN = 'https://ema.pages.dev';
const CODE = 'codice-segreto-123';
const DEVICE = '3f2b8c1e-1a2b-4c3d-9e8f-001122334455';
let env: Env & { DB: ReturnType<typeof makeD1> };
let vapid: { pub: string; priv: string };
let sub: { endpoint: string; keys: { p256dh: string; auth: string } };
const b64url = (b: ArrayBuffer | Uint8Array) =>
  Buffer.from(b instanceof Uint8Array ? b : new Uint8Array(b)).toString('base64url');

beforeAll(async () => {
  const pair = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
  ]);
  vapid = {
    pub: b64url(await webcrypto.subtle.exportKey('raw', pair.publicKey)),
    priv: (await webcrypto.subtle.exportKey('jwk', pair.privateKey)).d!,
  };
  const client = await webcrypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
    'deriveBits',
  ]);
  sub = {
    endpoint: 'https://web.push.apple.com/abc123',
    keys: {
      p256dh: b64url(await webcrypto.subtle.exportKey('raw', client.publicKey)),
      auth: b64url(webcrypto.getRandomValues(new Uint8Array(16))),
    },
  };
});

beforeEach(() => {
  env = {
    DB: makeD1(),
    ACCESS_CODE: CODE,
    VAPID_PUBLIC_KEY: vapid.pub,
    VAPID_PRIVATE_KEY: vapid.priv,
    VAPID_SUBJECT: 'mailto:test@example.com',
    ALLOWED_ORIGIN: ORIGIN,
  };
  vi.spyOn(console, 'log').mockImplementation(() => {});
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
const subscribe = () =>
  call('/api/subscription', {
    method: 'PUT',
    body: JSON.stringify({ deviceId: DEVICE, subscription: sub }),
  });
const schedule = (endsAt: number, extra: Record<string, unknown> = {}) =>
  call('/api/pomodoro', {
    method: 'PUT',
    body: JSON.stringify({ deviceId: DEVICE, endsAt, studyId: 3, coins: 10, ...extra }),
  });
const cancel = () =>
  call('/api/pomodoro', { method: 'DELETE', body: JSON.stringify({ deviceId: DEVICE }) });
const rows = () =>
  env.DB.raw.prepare('SELECT * FROM pomodoro_alerts').all() as { fire_at: number }[];
const okPush = () => vi.fn(async () => new Response(null, { status: 201 }));

describe('texto e validação', () => {
  it('"Pomodoro finito! +10 monetine 🌻 Fai una pausa, Ema." e abre a tela do estudo', () => {
    expect(pomodoroMessage(10, 3)).toEqual({
      title: 'Ema studia',
      body: 'Pomodoro finito! +10 monetine 🌻 Fai una pausa, Ema.',
      url: '/#/studio/3',
      tag: 'pomodoro',
    });
    expect(pomodoroMessage(0).body).toBe('Pomodoro finito! 🌻 Fai una pausa, Ema.');
  });
  it('recusa horários no passado, longe demais ou dados estranhos', () => {
    const now = Date.now();
    expect(
      parsePomodoroAlert({ deviceId: DEVICE, endsAt: now + 25 * 60_000, coins: 10 }, now),
    ).toBeTruthy();
    expect(
      parsePomodoroAlert({ deviceId: DEVICE, endsAt: now - 5 * 60_000, coins: 10 }, now),
    ).toBeNull();
    expect(
      parsePomodoroAlert({ deviceId: DEVICE, endsAt: now + 4 * 3600_000, coins: 10 }, now),
    ).toBeNull();
    expect(parsePomodoroAlert({ deviceId: 'x', endsAt: now + 1000 }, now)).toBeNull();
    expect(
      parsePomodoroAlert({ deviceId: DEVICE, endsAt: now + 1000, coins: 5000 }, now),
    ).toBeNull();
    expect(parsePomodoroAlert({ deviceId: DEVICE, endsAt: 'amanhã' }, now)).toBeNull();
  });
});

describe('agendar, cancelar e reagendar', () => {
  it('iniciar agenda; pausar/parar cancela', async () => {
    const end = Date.now() + 25 * 60_000;
    expect((await schedule(end)).status).toBe(200);
    expect(rows()).toHaveLength(1);
    expect((await cancel()).status).toBe(200);
    expect(rows()).toHaveLength(0);
  });
  it('retomar reagenda: fica um alarme só, com o horário novo', async () => {
    const now = Date.now();
    await schedule(now + 25 * 60_000);
    await schedule(now + 40 * 60_000);
    expect(rows()).toEqual([expect.objectContaining({ fire_at: now + 40 * 60_000 })]);
  });
  it('respostas com CORS, inclusive o erro de validação', async () => {
    const bad = await call('/api/pomodoro', {
      method: 'PUT',
      body: JSON.stringify({ deviceId: DEVICE, endsAt: 1 }),
    });
    expect(bad.status).toBe(400);
    expect(bad.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
  });
  it('limite por minuto (30)', async () => {
    let last!: Response;
    for (let i = 0; i < 31; i++) last = await cancel();
    expect(last.status).toBe(429);
  });
});

describe('envio no fim (cron a cada minuto, com margem)', () => {
  it('não envia antes do fim + margem; envia depois, uma vez, e apaga o alarme', async () => {
    await subscribe();
    const end = Date.now() + 60_000;
    await schedule(end);
    const f = okPush();
    expect(
      (await runPomodoroAlerts(env, end + MARGIN_MS - 1, f as unknown as typeof fetch)).sent,
    ).toBe(0);
    expect(f).not.toHaveBeenCalled();
    expect((await runPomodoroAlerts(env, end + MARGIN_MS, f as unknown as typeof fetch)).sent).toBe(
      1,
    );
    const [url, init] = f.mock.calls[0] as unknown as [string, { headers: Record<string, string> }];
    expect(url).toBe(sub.endpoint);
    expect(init.headers.ttl).toBe(String(ALERT_TTL_S)); // não chega muito depois
    expect(init.headers['content-encoding']).toBe('aes128gcm'); // push com conteúdo: sempre visível
    expect(rows()).toHaveLength(0);
    await runPomodoroAlerts(env, end + 2 * 60_000, f as unknown as typeof fetch);
    expect(f).toHaveBeenCalledTimes(1);
  });
  it('cancelado pelo app (som tocou com o app na tela) → nenhuma notificação', async () => {
    await subscribe();
    const end = Date.now() + 60_000;
    await schedule(end);
    await cancel(); // o app viu o fim e cancelou dentro da margem
    const f = okPush();
    await runPomodoroAlerts(env, end + MARGIN_MS + 1000, f as unknown as typeof fetch);
    expect(f).not.toHaveBeenCalled();
  });
  it('falha temporária: tenta no minuto seguinte; depois de 10 min desiste', async () => {
    await subscribe();
    const end = Date.now() + 60_000;
    await schedule(end);
    const bad = vi.fn(async () => new Response(null, { status: 500 }));
    expect(
      (await runPomodoroAlerts(env, end + MARGIN_MS, bad as unknown as typeof fetch)).errors,
    ).toBe(1);
    expect(rows()).toHaveLength(1);
    expect(
      (await runPomodoroAlerts(env, end + GIVE_UP_MS + 1, bad as unknown as typeof fetch)).dropped,
    ).toBe(1);
    expect(rows()).toHaveLength(0);
  });
  it('sem assinatura de push: descarta sem enviar; 410 apaga a assinatura', async () => {
    const end = Date.now() + 60_000;
    await schedule(end);
    const f = okPush();
    expect(
      (await runPomodoroAlerts(env, end + MARGIN_MS, f as unknown as typeof fetch)).dropped,
    ).toBe(1);
    expect(f).not.toHaveBeenCalled();
    await subscribe();
    await schedule(end);
    const gone = vi.fn(async () => new Response(null, { status: 410 }));
    await runPomodoroAlerts(env, end + MARGIN_MS, gone as unknown as typeof fetch);
    expect(
      (env.DB.raw.prepare('SELECT endpoint FROM devices').get() as { endpoint: string | null })
        .endpoint,
    ).toBeNull();
  });
  it('o cron normal também cuida dos pomodoros (e relata no log)', async () => {
    await subscribe();
    const end = Date.now() + 60_000;
    await schedule(end);
    const r = await runCron(env, end + MARGIN_MS, okPush() as unknown as typeof fetch);
    expect(r.pomodoro).toMatchObject({ due: 1, sent: 1 });
  });
  it('apagar o aparelho apaga também o alarme', async () => {
    await schedule(Date.now() + 60_000);
    await call('/api/device', { method: 'DELETE', body: JSON.stringify({ deviceId: DEVICE }) });
    expect(rows()).toHaveLength(0);
  });
});
