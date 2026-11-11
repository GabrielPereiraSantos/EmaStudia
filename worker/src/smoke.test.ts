import { describe, it, expect } from 'vitest';
import app from './index';

describe('worker', () => {
  it('responde /health', async () => {
    const res = await app.request('/health');
    expect(await res.json()).toEqual({ ok: true });
  });
});
