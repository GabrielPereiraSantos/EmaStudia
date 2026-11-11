import { db } from '../db/db';

export const API_URL = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '');
export const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY ?? '';

export interface ApiResult<T = unknown> {
  ok: boolean;
  status: number; // 0 = sem rede / sem servidor
  data?: T;
}

/** Chamada ao Worker com o código de acesso (salvo só no aparelho). */
export async function api<T = unknown>(
  path: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  body?: unknown,
  code?: string,
): Promise<ApiResult<T>> {
  if (!API_URL) return { ok: false, status: 0 };
  const accessCode = code ?? (await db.settings.get(1))?.accessCode ?? '';
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15_000);
  try {
    const res = await fetch(API_URL + path, {
      method,
      headers: { 'Content-Type': 'application/json', 'X-Access-Code': accessCode },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: ctrl.signal,
    });
    let data: T | undefined;
    try {
      data = (await res.json()) as T;
    } catch {
      /* sem corpo */
    }
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0 };
  } finally {
    clearTimeout(timer);
  }
}
