/**
 * CORS para TODAS as respostas do Worker (sucesso, erros 4xx/5xx, preflight e exceções).
 * Sem isso o navegador esconde a resposta de erro e o app acha que está offline.
 * Só a origem do Pages (`ALLOWED_ORIGIN`) é liberada.
 */
export function corsAllowed(request: Request, env: { ALLOWED_ORIGIN?: string }): string | null {
  const origin = request.headers.get('Origin');
  return origin && env.ALLOWED_ORIGIN && origin === env.ALLOWED_ORIGIN ? origin : null;
}

export function withCors(
  response: Response,
  request: Request,
  env: { ALLOWED_ORIGIN?: string },
): Response {
  const origin = corsAllowed(request, env);
  // cópia mutável (respostas vindas de fetch() têm cabeçalhos imutáveis)
  const res = new Response(response.body, response);
  res.headers.append('Vary', 'Origin');
  if (origin) {
    res.headers.set('Access-Control-Allow-Origin', origin);
    res.headers.set('Access-Control-Expose-Headers', 'Retry-After');
  }
  return res;
}

export function preflight(request: Request, env: { ALLOWED_ORIGIN?: string }): Response {
  const res = new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Access-Code',
      'Access-Control-Max-Age': '86400',
    },
  });
  return withCors(res, request, env);
}
