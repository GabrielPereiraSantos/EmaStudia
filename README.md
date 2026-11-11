# Ema studia

App feito por mim para minha excelentíssima namorada e futura esposa, focado na rotinas de estudo e personalizado especialmente para ela.

PWA em italiano (React + Vite + Dexie) com um Worker mínimo na Cloudflare (notificações e proxy do Gemini). Especificação completa: `PROJETO_APP_EMA.md`.

## Estrutura

```
app/      PWA (React + Vite + TypeScript) → Cloudflare Pages
worker/   API (Cloudflare Worker + D1)    → Cloudflare Workers
design/   referências visuais e ícones
```

## Como rodar

Requer Node 20+.

```bash
npm install
```

```bash
npm run dev          # app em http://localhost:5173
```

```bash
npm test             # Vitest (app e worker)
```

```bash
npm run lint         # ESLint
```

```bash
npm run build        # build de produção do app (app/dist)
```

```bash
npm run dev:worker   # Worker local (wrangler dev)
```

O service worker só é gerado no build; para testar a instalação do PWA use `npm run build -w app` e `npm run preview -w app`.

## Segredos

Nunca vão para o Git. No Worker, use `wrangler secret put GEMINI_API_KEY` (e `ACCESS_CODE`, `VAPID_PRIVATE_KEY`). Para desenvolvimento local, copie `worker/.dev.vars.example` para `worker/.dev.vars` (ignorado pelo Git).

## Deploy (rascunho — completo na Fase 6)

1. Conta grátis em cloudflare.com.
2. Repositório no GitHub.
3. Cloudflare Pages → Connect to Git → pasta `app`, build `npm run build`, saída `dist`.
4. Worker: `npx wrangler login`, `npx wrangler d1 create ema-db`, migrações, `wrangler secret put …`, `npx wrangler deploy`.
5. Chaves VAPID e chave do Gemini (Google AI Studio).
6. Enviar o link do Pages e o código de acesso para a Ema.
