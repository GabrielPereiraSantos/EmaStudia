import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';
import { runCron } from './cron';
import { deleteDevice, dropSubscription, getDevice, saveSchedule, saveSubscription } from './db';
import type { Env } from './env';
import { sendPush } from './push';
import { TEST_MESSAGE } from './reminders';
import { safeEqual } from './security';
import { isDeviceId, parseSchedule, parseSubscription } from './validate';

export const app = new Hono<{ Bindings: Env }>();

app.use('*', async (c, next) => {
  await next();
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('Cache-Control', 'no-store');
  c.header('Referrer-Policy', 'no-referrer');
});

// CORS só para a origem do Pages.
app.use('*', (c, next) =>
  cors({
    origin: (origin) => (c.env.ALLOWED_ORIGIN && origin === c.env.ALLOWED_ORIGIN ? origin : null),
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'X-Access-Code'],
    maxAge: 86400,
  })(c, next),
);

// Código de acesso em todas as rotas (o preflight OPTIONS não leva cabeçalhos próprios).
app.use('*', async (c, next) => {
  if (c.req.method === 'OPTIONS') return next();
  const code = c.req.header('X-Access-Code') ?? '';
  if (!c.env.ACCESS_CODE || !(await safeEqual(code, c.env.ACCESS_CODE))) {
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

app.put('/api/subscription', async (c) => {
  const p = parseSubscription(await readJson(c));
  if (!p) return c.json({ error: 'invalid' }, 400);
  await saveSubscription(c.env.DB, p, Date.now());
  return c.json({ ok: true });
});

app.put('/api/schedule', async (c) => {
  const p = parseSchedule(await readJson(c));
  if (!p) return c.json({ error: 'invalid' }, 400);
  await saveSchedule(c.env.DB, p, Date.now());
  return c.json({ ok: true, reminders: p.reminders.reduce((n, r) => n + r.dates.length, 0) });
});

app.post('/api/test-notification', async (c) => {
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

app.notFound((c) => c.json({ error: 'not-found' }, 404));
app.onError((err, c) => {
  console.error(`error: ${err.name}`); // sem detalhes do corpo
  return c.json({ error: 'server' }, 500);
});

export default {
  fetch: app.fetch,
  scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runCron(env, Date.now()).then(() => undefined));
  },
} satisfies ExportedHandler<Env>;
