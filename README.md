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

## Rodar o Worker localmente

```bash
cp worker/.dev.vars.example worker/.dev.vars    # preencha ACCESS_CODE e as chaves VAPID
```

```bash
npm run vapid -w worker                          # gera o par de chaves VAPID
```

```bash
npm run db:migrate:local -w worker               # cria as tabelas no D1 local
```

```bash
npm run dev:worker                               # http://localhost:8787
```

Para o app falar com o Worker local, crie `app/.env.local` com `VITE_API_URL=http://localhost:8787` e `VITE_VAPID_PUBLIC_KEY=...` (veja `app/.env.example`). Para disparar o cron na mão: `curl "http://localhost:8787/__scheduled?cron=*/5+*+*+*+*"`.

## Segredos

Nunca vão para o Git: `ACCESS_CODE`, `VAPID_PRIVATE_KEY` e `GEMINI_API_KEY` ficam só como segredos do Worker (`npx wrangler secret put ...`). `worker/.dev.vars` e `app/.env.local` estão no `.gitignore`. A chave VAPID **pública** e o endereço do Worker não são segredos.

## Deploy passo a passo (custo zero)

Você vai precisar de: um computador com [Node.js 22](https://nodejs.org) instalado, este repositório no GitHub e uns 30 minutos. Todos os comandos abaixo são rodados na pasta do projeto, num terminal.

### 1. Criar a conta Cloudflare

1. Abra <https://dash.cloudflare.com/sign-up>, escreva seu e-mail e uma senha e toque em **Sign up**.
2. Abra o e-mail de confirmação da Cloudflare e clique no link. Não é preciso cadastrar cartão.
3. No painel, se pedir um plano, escolha **Free**.

### 2. Preparar o projeto no seu computador

```bash
git clone https://github.com/GabrielPereiraSantos/EmaStudia.git
```

```bash
cd EmaStudia
```

```bash
npm install
```

### 3. Entrar na Cloudflare pelo terminal

```bash
npx wrangler login
```

Abre o navegador: toque em **Allow**. Volte ao terminal.

### 4. Criar o banco D1

```bash
npx wrangler d1 create ema-db
```

O comando mostra um `database_id` (algo como `a1b2c3d4-...`). Abra `worker/wrangler.toml` e troque `00000000-0000-0000-0000-000000000000` por esse id. Depois crie as tabelas:

```bash
npm run db:migrate -w worker
```

### 5. Gerar as chaves das notificações (VAPID)

```bash
npm run vapid -w worker
```

Aparecem duas linhas. Guarde as duas por enquanto (num lugar seguro, fora do Git):

- `VAPID_PUBLIC_KEY`: abra `worker/wrangler.toml` e cole em `VAPID_PUBLIC_KEY = "..."`.
- Em `VAPID_SUBJECT`, troque o exemplo pelo seu e-mail: `VAPID_SUBJECT = "mailto:seu@email.com"`.
- `VAPID_PRIVATE_KEY`: vira segredo no passo 6 (nunca coloque no arquivo).

### 6. Cadastrar os segredos do Worker

Invente um código de acesso (ex.: uma frase sem espaços, só vocês dois sabem). Cada comando pede o valor; cole e aperte Enter:

```bash
npx wrangler secret put ACCESS_CODE -c worker/wrangler.toml
```

```bash
npx wrangler secret put VAPID_PRIVATE_KEY -c worker/wrangler.toml
```

(O `GEMINI_API_KEY` entra na Fase 5.)

### 7. Publicar o Worker

```bash
npm run deploy -w worker
```

No fim aparece o endereço, algo como `https://ema-worker.SEU-USUARIO.workers.dev`. Guarde.

### 8. Publicar o app no Cloudflare Pages

1. Envie suas alterações para o GitHub (`git push`).
2. No painel da Cloudflare: **Workers & Pages → Create → Pages → Connect to Git**. Autorize o GitHub e escolha o repositório **EmaStudia**.
3. Configuração do build (copie exatamente):
   - **Project name**: `ema-studia` (o endereço será `https://ema-studia.pages.dev`)
   - **Production branch**: `main`
   - **Framework preset**: `None`
   - **Build command**:

     ```
     npm run build
     ```

   - **Build output directory**:

     ```
     app/dist
     ```

   - **Root directory (advanced)**: deixe **vazio**. O projeto usa workspaces: o Pages instala tudo na raiz e o `npm run build` da raiz compila o app (`npm run build -w app`), gerando os arquivos em `app/dist`.
4. Em **Environment variables**, adicione:
   - `NODE_VERSION` = `22`
   - `VITE_API_URL` = o endereço do Worker do passo 7
   - `VITE_VAPID_PUBLIC_KEY` = a chave pública do passo 5
5. Toque em **Save and Deploy** e espere terminar. Anote o endereço final (ex.: `https://ema-studia.pages.dev`).

### 9. Ligar o Worker ao endereço do app (CORS)

Em `worker/wrangler.toml`, coloque em `ALLOWED_ORIGIN` o endereço exato do Pages, sem barra no fim (ex.: `"https://ema-studia.pages.dev"`). Publique de novo:

```bash
npm run deploy -w worker
```

### 10. Instalar no iPhone da Ema

1. Mande para ela o link do Pages e, separado, o código de acesso.
2. No iPhone (iOS 16.4 ou mais novo), ela abre o link **no Safari**.
3. Toca em **Condividi** (o quadrado com a seta) → **Aggiungi alla schermata Home** → **Aggiungi**.
4. Abre o app **pelo ícone** na tela de início (não pelo Safari: os dados do Safari não passam para o app).
5. Digita o código de acesso e toca em **Attiva le notifiche** → **Consenti**.

### 11. Testar as notificações

No app: engrenagem → **Impostazioni → Invia notifica di prova**. A notificação deve chegar em alguns segundos. Os lembretes normais saem no horário de cada estudo (o cron roda a cada 5 minutos; um lembrete atrasado mais de 2 h, ou de outro dia, não é enviado).

Para ver os registros do Worker (só contagens, nunca o conteúdo das notas):

```bash
npx wrangler tail -c worker/wrangler.toml
```

### Atualizar depois

- App: basta `git push`; o Pages publica sozinho.
- Worker: `npm run deploy -w worker`. Se houver migração nova: `npm run db:migrate -w worker`.
