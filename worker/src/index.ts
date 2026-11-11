import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { createMiddleware } from 'hono/factory';
import { preflight, withCors } from './cors';
import { runCron } from './cron';
import { deleteDevice, dropSubscription, getDevice, saveSchedule, saveSubscription } from './db';
import type { Env } from './env';
import { sendPush } from './push';
import { TEST_MESSAGE } from './reminders';
import { safeEqual } from './security';
import {
  buildPrompt,
  callGemini,
  dailyLimit,
  getUsage,
  parseGeminiRequest,
  refundUsage,
  reserveUsage,
  responseSchema,
  validateQuestions,
  validateSummary,
} from './gemini';
import { LIMITS_PER_MINUTE, hit } from './ratelimit';
import { localNow } from './reminders';
import { isDeviceId, isTimezone, parseSchedule, parseSubscription } from './validate';

export const app = new Hono<{ Bindings: Env }>();

/** Quem está chamando (para os limites por minuto). */
const clientId = (c: { req: { header: (n: string) => string | undefined } }) =>
  c.req.header('CF-Connecting-IP') ?? 'local';

/** Limite por minuto numa rota (depois do código de acesso). */
const limit = (name: keyof typeof LIMITS_PER_MINUTE) =>
  createMiddleware<{ Bindings: Env }>(async (c, next) => {
    if ((await hit(c.env.DB, `${name}:${clientId(c)}`, Date.now())) > LIMITS_PER_MINUTE[name]) {
      return c.json({ error: 'too-many' }, 429, { 'Retry-After': '60' });
    }
    await next();
  });

// CORS em TODAS as respostas (inclusive 4xx/5xx) e no preflight. Fica por fora de tudo.
app.use('*', async (c, next) => {
  if (c.req.method === 'OPTIONS') return preflight(c.req.raw, c.env);
  await next();
  c.res = withCors(c.res, c.req.raw, c.env);
});

app.use('*', async (c, next) => {
  await next();
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('Cache-Control', 'no-store');
  c.header('Referrer-Policy', 'no-referrer');
});

// Código de acesso em todas as rotas (o preflight OPTIONS não leva cabeçalhos próprios).
app.use('*', async (c, next) => {
  if (c.req.method === 'OPTIONS') return next();
  const code = c.req.header('X-Access-Code') ?? '';
  if (!c.env.ACCESS_CODE || !(await safeEqual(code, c.env.ACCESS_CODE))) {
    // Contra adivinhação do código: poucas tentativas erradas por minuto.
    if ((await hit(c.env.DB, `bad:${clientId(c)}`, Date.now())) > LIMITS_PER_MINUTE.badCode) {
      return c.json({ error: 'too-many' }, 429, { 'Retry-After': '60' });
    }
    return c.json({ error: 'unauthorized' }, 401);
  }
  return next();
});

app.use(
  '*',
  bodyLimit({ maxSize: 64 * 1024, onError: (c) => c.json({ error: 'too-large' }, 413) }),
);

const readJson = async (c: { req: { json: () => Promise<unknown> } }) => {
  try {
    return await c.req.json();
  } catch {
    return null;
  }
};

app.post('/api/ping', (c) => c.json({ ok: true }));

app.put('/api/subscription', limit('subscription'), async (c) => {
  const p = parseSubscription(await readJson(c));
  if (!p) return c.json({ error: 'invalid' }, 400);
  await saveSubscription(c.env.DB, p, Date.now());
  return c.json({ ok: true });
});

app.put('/api/schedule', limit('schedule'), async (c) => {
  const p = parseSchedule(await readJson(c));
  if (!p) return c.json({ error: 'invalid' }, 400);
  await saveSchedule(c.env.DB, p, Date.now());
  return c.json({ ok: true, reminders: p.reminders.reduce((n, r) => n + r.dates.length, 0) });
});

app.post('/api/test-notification', limit('test'), async (c) => {
  const body = (await readJson(c)) as { deviceId?: unknown } | null;
  if (!body || !isDeviceId(body.deviceId)) return c.json({ error: 'invalid' }, 400);
  const device = await getDevice(c.env.DB, body.deviceId);
  if (!device) return c.json({ error: 'no-subscription' }, 404);
  const res = await sendPush(c.env, device, TEST_MESSAGE, 300);
  if (res === 'gone') {
    await dropSubscription(c.env.DB, device.device_id);
    return c.json({ error: 'subscription-expired' }, 410);
  }
  return res === 'ok' ? c.json({ ok: true }) : c.json({ error: 'push-failed' }, 502);
});

app.delete('/api/device', async (c) => {
  const body = (await readJson(c)) as { deviceId?: unknown } | null;
  if (!body || !isDeviceId(body.deviceId)) return c.json({ error: 'invalid' }, 400);
  await deleteDevice(c.env.DB, body.deviceId);
  return c.json({ ok: true });
});

// ---------- Gemini (seção 8) ----------
const today = (tz: string) => localNow(isTimezone(tz) ? tz : 'UTC', Date.now()).date;

app.get('/api/gemini/usage', async (c) => {
  const limit = dailyLimit(c.env.GEMINI_DAILY_LIMIT);
  const used = await getUsage(c.env.DB, today(c.req.query('tz') ?? 'UTC'));
  return c.json({ used, limit });
});

app.post('/api/gemini/:kind', async (c) => {
  const req = parseGeminiRequest(c.req.param('kind'), await readJson(c), isTimezone);
  if (!req) return c.json({ error: 'invalid' }, 400);
  if (!c.env.GEMINI_API_KEY) return c.json({ error: 'not-configured' }, 503);
  const limit = dailyLimit(c.env.GEMINI_DAILY_LIMIT);
  const day = today(req.timezone);
  const used = await reserveUsage(c.env.DB, day, limit);
  if (used === null) return c.json({ error: 'quota', used: limit, limit }, 429);

  const t0 = Date.now();
  const r = await callGemini(
    c.env.GEMINI_API_KEY,
    c.env.GEMINI_MODEL,
    buildPrompt(req),
    responseSchema(req.kind),
    {
      kind: req.kind,
    },
  );
  const fail = async (status: 429 | 502 | 504, body: Record<string, unknown>) => {
    await refundUsage(c.env.DB, day); // falhou: não conta
    return c.json(body, status);
  };
  if (!r.ok) {
    if (r.reason === 'timeout') return fail(504, { error: 'gemini-timeout' });
    if (r.reason === 'http' && r.status === 429) return fail(429, { error: 'gemini-quota' });
    return fail(502, {
      error: 'gemini',
      reason: r.reason,
      ...(r.reason === 'http' ? { http: r.status } : {}),
    });
  }
  const result =
    req.kind === 'riassunto' ? validateSummary(r.data) : validateQuestions(req.kind, r.data);
  if (!result) {
    console.log(
      JSON.stringify({
        at: 'gemini',
        kind: req.kind,
        model: r.model,
        ok: false,
        reason: 'invalid-output',
        ms: Date.now() - t0,
      }),
    );
    return fail(502, { error: 'gemini', reason: 'invalid-output' });
  }
  return c.json(
    req.kind === 'riassunto'
      ? { ok: true, summary: result, used, limit }
      : { ok: true, questions: result, used, limit },
  );
});

app.notFound((c) => c.json({ error: 'not-found' }, 404));
app.onError((err, c) => {
  console.error(`error: ${err.name}`); // sem detalhes do corpo
  return c.json({ error: 'server' }, 500);
});

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    try {
      return await app.fetch(request, env, ctx);
    } catch (err) {
      // rede de segurança: mesmo uma exceção inesperada sai com CORS (e sem detalhes)
      console.error(`fatal: ${(err as Error).name}`);
      return withCors(Response.json({ error: 'server' }, { status: 500 }), request, env);
    }
  },
  scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runCron(env, Date.now()).then(() => undefined));
  },
} satisfies ExportedHandler<Env>;
