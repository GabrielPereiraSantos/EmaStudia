import { webcrypto } from 'node:crypto';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { runCron } from '../src/cron';
import type { Env } from '../src/env';
import { app } from '../src/index';
import { buildMessage, isDue, joinIt, localNow, ttlSeconds } from '../src/reminders';
import { safeEqual } from '../src/security';
import { parseSchedule } from '../src/validate';
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
  // "aparelho" de mentira: chaves de um cliente push válido
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
});

const call = (path: string, init: RequestInit & { code?: string | null } = {}) => {
  const headers = new Headers(init.headers);
  headers.set('Origin', ORIGIN);
  if (init.code !== null) headers.set('X-Access-Code', init.code ?? CODE);
  if (init.body) headers.set('Content-Type', 'application/json');
  return app.request(path, { ...init, headers }, env);
};

const schedule = (o: Record<string, unknown> = {}) => ({
  deviceId: DEVICE,
  timezone: 'Europe/Rome',
  reminders: [
    {
      studyId: 1,
      subject: 'Fisica',
      time: '19:00',
      dates: ['2026-11-11', '2026-11-12'],
      reviewDates: ['2026-11-12'],
    },
    { studyId: 2, subject: 'Storia', time: '19:00', dates: ['2026-11-11'] },
  ],
  notes: { '1': ['v = s / t'], '2': ['1789: presa della Bastiglia'] },
  ...o,
});

describe('segurança', () => {
  it('compara o código em tempo constante e recusa vazio', async () => {
    expect(await safeEqual('abc', 'abc')).toBe(true);
    expect(await safeEqual('abc', 'abd')).toBe(false);
    expect(await safeEqual('', '')).toBe(false);
  });
  it('sem código ou com código errado → 401 em todas as rotas', async () => {
    expect((await call('/api/ping', { method: 'POST', code: null })).status).toBe(401);
    expect((await call('/api/ping', { method: 'POST', code: 'errado' })).status).toBe(401);
    expect(
      (
        await call('/api/schedule', {
          method: 'PUT',
          code: 'errado',
          body: JSON.stringify(schedule()),
        })
      ).status,
    ).toBe(401);
    expect((await call('/qualquer', { code: null })).status).toBe(401);
  });
  it('com o código certo → 200', async () => {
    const r = await call('/api/ping', { method: 'POST' });
    expect(r.status).toBe(200);
    expect(r.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });
  it('CORS só libera a origem do Pages', async () => {
    const ok = await call('/api/ping', {
      method: 'OPTIONS',
      code: null,
      headers: { 'Access-Control-Request-Method': 'POST' },
    });
    expect(ok.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    const bad = await app.request(
      '/api/ping',
      {
        method: 'OPTIONS',
        headers: { Origin: 'https://malvagio.example', 'Access-Control-Request-Method': 'POST' },
      },
      env,
    );
    expect(bad.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
  it('corpo grande demais → 413', async () => {
    const big = JSON.stringify({ x: 'a'.repeat(70 * 1024) });
    expect((await call('/api/schedule', { method: 'PUT', body: big })).status).toBe(413);
  });
});

describe('validação da agenda', () => {
  it('aceita a agenda mínima e limpa o texto', () => {
    const p = parseSchedule(schedule({ notes: { '1': ['  ciao\u0007 '] } }))!;
    expect(p.reminders).toHaveLength(2);
    expect(p.notes['1']).toEqual(['ciao']);
  });
  it.each([
    ['deviceId inválido', { deviceId: 'x' }],
    ['fuso inválido', { timezone: 'Marte/Base' }],
    ['hora inválida', { reminders: [{ studyId: 1, subject: 'F', time: '25:00', dates: [] }] }],
    [
      'data inválida',
      { reminders: [{ studyId: 1, subject: 'F', time: '19:00', dates: ['11/11/2026'] }] },
    ],
    [
      'ripasso fora das datas',
      {
        reminders: [
          { studyId: 1, subject: 'F', time: '19:00', dates: [], reviewDates: ['2026-11-11'] },
        ],
      },
    ],
    ['nota longa demais', { notes: { '1': ['x'.repeat(281)] } }],
  ])('recusa %s', (_n, o) => expect(parseSchedule(schedule(o))).toBeNull());
  it('rota devolve 400 para JSON inválido', async () => {
    expect((await call('/api/schedule', { method: 'PUT', body: '{nao json' })).status).toBe(400);
  });
});

describe('lembretes: hora local, janela de 2 h e TTL', () => {
  // 11/11/2026 18:05 UTC = 19:05 em Roma (CET, UTC+1)
  const t = Date.UTC(2026, 10, 11, 18, 5, 0);
  it('hora local no fuso dela', () => {
    expect(localNow('Europe/Rome', t)).toMatchObject({ date: '2026-11-11', minutes: 19 * 60 + 5 });
    expect(localNow('America/Sao_Paulo', t)).toMatchObject({
      date: '2026-11-11',
      minutes: 15 * 60 + 5,
    });
  });
  it('vence no horário, até 2 h depois, só no mesmo dia e uma vez', () => {
    const now = localNow('Europe/Rome', t);
    expect(isDue({ date: '2026-11-11', time: '19:00', sent_at: null }, now)).toBe(true);
    expect(isDue({ date: '2026-11-11', time: '19:10', sent_at: null }, now)).toBe(false); // ainda não
    expect(isDue({ date: '2026-11-11', time: '17:04', sent_at: null }, now)).toBe(false); // > 2 h
    expect(isDue({ date: '2026-11-10', time: '19:00', sent_at: null }, now)).toBe(false); // outro dia
    expect(isDue({ date: '2026-11-11', time: '19:00', sent_at: 1 }, now)).toBe(false); // já enviado
  });
  it('TTL acaba no fim da janela de 2 h e nunca passa da meia-noite', () => {
    const now = localNow('Europe/Rome', t); // 19:05:00
    expect(ttlSeconds(['19:00'], now)).toBe((21 * 60 - (19 * 60 + 5)) * 60); // até 21:00
    const late = { date: '2026-11-11', minutes: 23 * 60 + 30, seconds: 0 };
    expect(ttlSeconds(['23:00'], late)).toBe(30 * 60); // até 24:00, não 01:00
  });
});

describe('texto das notificações (italiano)', () => {
  const one =
    (r = 0.0) =>
    () =>
      r;
  it('com nota', () => {
    expect(
      buildMessage(
        [{ study_id: 1, subject: 'Fisica', kind: 'studio' }],
        { '1': ['v = s / t'] },
        one(),
      ).body,
    ).toBe('Oggi si studia Fisica! Ricorda: v = s / t');
  });
  it('sem nota', () => {
    expect(buildMessage([{ study_id: 1, subject: 'Fisica', kind: 'studio' }], {}).body).toBe(
      'Oggi si studia Fisica! Ce la fai, Ema.',
    );
  });
  it('dia de ripasso', () => {
    expect(buildMessage([{ study_id: 1, subject: 'Fisica', kind: 'ripasso' }], {}).body).toBe(
      'Oggi è giorno di ripasso di Fisica',
    );
  });
  it('vários estudos no mesmo horário → uma notificação, abre a Home', () => {
    const m = buildMessage(
      [
        { study_id: 1, subject: 'Fisica', kind: 'studio' },
        { study_id: 2, subject: 'Storia', kind: 'studio' },
      ],
      {},
    );
    expect(m.body).toBe('Oggi si studia Fisica e Storia! Ce la fai, Ema.');
    expect(m.url).toBe('/#/');
  });
  it('um estudo só abre a tela do estudo', () => {
    expect(buildMessage([{ study_id: 7, subject: 'Fisica', kind: 'studio' }], {}).url).toBe(
      '/#/studio/7',
    );
  });
  it('lista em italiano', () => expect(joinIt(['A', 'B', 'C'])).toBe('A, B e C'));
});

describe('fluxo completo: agenda → cron → push', () => {
  const t = Date.UTC(2026, 10, 11, 18, 5, 0); // 19:05 em Roma

  const setup = async () => {
    expect(
      (
        await call('/api/subscription', {
          method: 'PUT',
          body: JSON.stringify({ deviceId: DEVICE, subscription: sub }),
        })
      ).status,
    ).toBe(200);
    expect(
      (await call('/api/schedule', { method: 'PUT', body: JSON.stringify(schedule()) })).status,
    ).toBe(200);
  };

  it('envia um push agrupado, cifrado, com TTL, e não repete', async () => {
    await setup();
    const fetcher = vi.fn(async () => new Response(null, { status: 201 }));
    const r = await runCron(env, t, fetcher as unknown as typeof fetch);
    expect(r.sent).toBe(1);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0] as unknown as [
      string,
      { headers: Record<string, string> },
    ];
    expect(url).toBe(sub.endpoint);
    expect(init.headers['content-encoding']).toBe('aes128gcm');
    expect(init.headers.authorization).toMatch(/^vapid t=.+, k=/);
    expect(Number(init.headers.ttl)).toBe(115 * 60);
    // segundo ciclo: nada novo
    await runCron(env, t + 5 * 60_000, fetcher as unknown as typeof fetch);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('reenviar a agenda não reenvia o que já foi', async () => {
    await setup();
    const fetcher = vi.fn(async () => new Response(null, { status: 201 }));
    await runCron(env, t, fetcher as unknown as typeof fetch);
    await call('/api/schedule', { method: 'PUT', body: JSON.stringify(schedule()) });
    await runCron(env, t + 60_000, fetcher as unknown as typeof fetch);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('erro temporário: tenta de novo no próximo ciclo', async () => {
    await setup();
    const fetcher = vi.fn(async () => new Response(null, { status: 500 }));
    expect((await runCron(env, t, fetcher as unknown as typeof fetch)).errors).toBe(1);
    fetcher.mockImplementation(async () => new Response(null, { status: 201 }));
    expect((await runCron(env, t + 5 * 60_000, fetcher as unknown as typeof fetch)).sent).toBe(1);
  });

  it('assinatura expirada (410) é apagada do D1', async () => {
    await setup();
    const fetcher = vi.fn(async () => new Response(null, { status: 410 }));
    expect((await runCron(env, t, fetcher as unknown as typeof fetch)).gone).toBe(1);
    const row = env.DB.raw
      .prepare('SELECT endpoint FROM devices WHERE device_id = ?')
      .get(DEVICE) as { endpoint: string | null };
    expect(row.endpoint).toBeNull();
  });

  it('com agenda vazia (notificações desligadas) não envia nada', async () => {
    await setup();
    await call('/api/schedule', {
      method: 'PUT',
      body: JSON.stringify(schedule({ reminders: [], notes: {} })),
    });
    const fetcher = vi.fn(async () => new Response(null, { status: 201 }));
    await runCron(env, t, fetcher as unknown as typeof fetch);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('desligar "Includi le note" apaga as notas que já estavam no servidor', async () => {
    await setup();
    const count = () =>
      (env.DB.raw.prepare('SELECT COUNT(*) AS n FROM notes').get() as { n: number }).n;
    expect(count()).toBe(2);
    // o app manda a mesma agenda, agora sem notas
    await call('/api/schedule', { method: 'PUT', body: JSON.stringify(schedule({ notes: {} })) });
    expect(count()).toBe(0);
    // e a notificação sai sem nota
    const fetcher = vi.fn(async () => new Response(null, { status: 201 }));
    expect((await runCron(env, t, fetcher as unknown as typeof fetch)).sent).toBe(1);
  });

  it('notifica de prova sem assinatura → 404', async () => {
    const r = await call('/api/test-notification', {
      method: 'POST',
      body: JSON.stringify({ deviceId: DEVICE }),
    });
    expect(r.status).toBe(404);
  });

  it('apagar o aparelho remove tudo', async () => {
    await setup();
    expect(
      (await call('/api/device', { method: 'DELETE', body: JSON.stringify({ deviceId: DEVICE }) }))
        .status,
    ).toBe(200);
    expect(env.DB.raw.prepare('SELECT COUNT(*) AS n FROM reminders').get()).toEqual({ n: 0 });
  });
});
