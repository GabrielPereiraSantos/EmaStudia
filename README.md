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

Requer Node 22 (ou mais novo).

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

Nunca vão para o Git: `ACCESS_CODE`, `VAPID_PRIVATE_KEY` e `GEMINI_API_KEY` ficam só como segredos do Worker (`npx wrangler secret put ...`). `worker/.dev.vars` e `app/.env.local` estão no `.gitignore`. A chave VAPID **pública** e o endereço do Worker não são segredos. O código de acesso fica só no aparelho dela (e nunca entra no arquivo de backup).

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

```bash
npx wrangler secret put GEMINI_API_KEY -c worker/wrangler.toml
```

(Para o `GEMINI_API_KEY`, veja o passo 6.1.)

#### 6.1 Chave e modelo do Gemini

1. Abra <https://aistudio.google.com/apikey> e entre com uma conta Google.
2. Toque em **Create API key** (não é preciso cadastrar cartão; o plano gratuito basta).
3. Copie a chave e cole quando o comando `npx wrangler secret put GEMINI_API_KEY ...` pedir. Ela nunca vai para o código nem para o Git: fica só no Worker.
4. **Confirme o nome do modelo.** No AI Studio, veja na lista de modelos qual **Flash** está disponível no plano gratuito e o nome exato (ex.: `gemini-2.5-flash`). Coloque esse nome em `worker/wrangler.toml`:

   ```toml
   GEMINI_MODEL = "gemini-2.5-flash"
   ```

   **Se a cota gratuita do Flash for pouca**, use a versão **Flash-Lite** (mais leve; costuma ter cota gratuita maior; confira no AI Studio), por exemplo `GEMINI_MODEL = "gemini-2.5-flash-lite"`. Depois de trocar, publique o Worker de novo (passo 7).

5. **Velocidade:** o Worker pede ao Gemini o **thinking no mínimo** (respostas rápidas) e espera no máximo **50 s**; o app espera até 60 s e mostra "Gemini sta pensando…". O campo de thinking é escolhido pelo nome do modelo (`gemini-3…` e apelidos `…-latest`: nível mínimo; `gemini-2.5-flash` e `-flash-lite`: orçamento 0); se o modelo recusar, o Worker tenta a próxima configuração sozinho.
6. O limite diário do app é `GEMINI_DAILY_LIMIT` (padrão `20`), no mesmo arquivo. A contagem vira à meia-noite no fuso do iPhone dela, e o uso aparece em **Impostazioni → Gemini**. Se o Gemini falhar ou o limite acabar, o app oferece o plano B (ChatGPT ou escrever à mão).

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

**Como a Ema recebe a versão nova:** depois do deploy, ao abrir o app (ou voltar para ele) aparece no topo **"Nuova versione disponibile"** com o botão **Aggiorna**. Tocar em Aggiorna carrega a versão nova na hora; os dados não se perdem. O app procura versão nova a cada hora e toda vez que volta para a tela.

Se ela estava numa versão **antiga** (anterior a esse aviso), a versão nova assume sozinha: basta fechar e abrir o app de novo. Se mesmo assim a tela não mudar: Ajustes do iPhone → Safari → Avançado → Dados de sites → apague só o endereço do app **depois de fazer o backup** (apagar o app ou os dados dele apaga os estudos).

## Backup e restauração

Os dados da Ema ficam **só no iPhone dela** (Impostazioni → Backup).

- **Salvar backup:** Impostazioni → **Salva backup**. No iPhone abre a folha de compartilhamento (Arquivos, iCloud Drive, AirDrop…); em outros aparelhos baixa um `ema-studia-backup-AAAA-MM-DD.json`. O app avisa na Home quando o último backup tem mais de 14 dias.
- **O que vai no arquivo:** estudos, planos, notas, sessões, quizzes, moedinhas, prêmios, resgates e os valores das Impostazioni. **Não vai** o código de acesso nem o identificador do aparelho. Mesmo assim o arquivo tem as notas e os estudos dela: guarde num lugar seguro.
- **Restaurar:** num aparelho novo (ou depois de limpar os dados), abra o app instalado, digite o código de acesso, vá em Impostazioni → **Ripristina** e escolha o arquivo. O app confere o arquivo (versão e formato) antes de tocar em qualquer dado, pede confirmação e **substitui tudo** de uma vez; se algo estiver errado, nada muda. Depois do restauro, ative de novo as notificações (a assinatura é do aparelho).

## Segurança (resumo)

| Proteção                                                                         | Onde                          |
| -------------------------------------------------------------------------------- | ----------------------------- |
| Código de acesso em **todas** as rotas (comparação em tempo constante)           | Worker                        |
| Tentativas com código errado limitadas (10 por minuto)                           | Worker                        |
| Limite por minuto: agenda 20, assinatura 10, notificação de prova 5              | Worker                        |
| Limite diário do Gemini (`GEMINI_DAILY_LIMIT`) e limite de corpo (64 KB)         | Worker                        |
| CORS só para o endereço do app (`ALLOWED_ORIGIN`)                                | Worker                        |
| Entrada e resposta do Gemini validadas; textos mostrados como texto (nunca HTML) | Worker e app                  |
| CSP, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`           | `app/public/_headers` (Pages) |
| Nenhum segredo no front-end nem no Git (conferido no histórico)                  | Todo o repositório            |
| Arquivo de backup validado antes de restaurar                                    | App                           |

Se o Worker usar um **domínio próprio** (e não `*.workers.dev`), troque `https://*.workers.dev` na linha `Content-Security-Policy` de `app/public/_headers` pelo endereço dele, senão o navegador bloqueia as chamadas.

**Avisos do `npm audit`:** em tudo o que vai para produção (`npm audit --omit=dev`) não há vulnerabilidades. Os avisos que aparecem no `npm audit` completo vêm só de ferramentas de desenvolvimento (`eslint` e o gerador do service worker); não chegam ao app nem ao Worker, e a correção automática exigiria atualizações que quebram o projeto.

## Lista de conferência

### Antes do deploy

- [ ] Conta Cloudflare criada e `npx wrangler login` feito (passos 1 e 3).
- [ ] `database_id` do D1 colocado em `worker/wrangler.toml` e `npm run db:migrate -w worker` rodado (passo 4: cria as 3 migrações).
- [ ] Chaves VAPID geradas; a **pública** em `worker/wrangler.toml` e `VAPID_SUBJECT` com o seu e-mail; a **privada** só como segredo (passo 5).
- [ ] Segredos cadastrados: `ACCESS_CODE`, `VAPID_PRIVATE_KEY`, `GEMINI_API_KEY` (passo 6).
- [ ] `GEMINI_MODEL` confirmado no Google AI Studio (e `gemini-2.5-flash-lite` como reserva se a cota for pouca).
- [ ] Worker publicado (`npm run deploy -w worker`) e o endereço anotado (passo 7).
- [ ] Pages criado com **Build command** `npm run build`, **Build output directory** `app/dist`, **Root directory** vazio, e as variáveis `NODE_VERSION=22`, `VITE_API_URL` e `VITE_VAPID_PUBLIC_KEY` (passo 8).
- [ ] `ALLOWED_ORIGIN` em `worker/wrangler.toml` com o endereço **exato** do Pages (sem barra no fim) e o Worker publicado de novo (passo 9).
- [ ] Nada de segredo em arquivos que vão para o Git (`git status` limpo de `.dev.vars` e `.env.local`).
- [ ] Rodou `npm run lint`, `npm test` e `npm run build` sem erros.

### Depois do deploy (no iPhone da Ema)

- [ ] Abrir o link no **Safari**: aparece o guia de 4 passos e **não** há botão "Continua nel browser".
- [ ] Instalar (Condividi → Aggiungi alla schermata Home) e abrir **pelo ícone**.
- [ ] Digitar o código de acesso → "Attiva le notifiche" → Consenti.
- [ ] Impostazioni → **Invia notifica di prova**: a notificação chega e, ao tocar, abre o app.
- [ ] Criar um estudo com lembrete para daqui a uns 10 minutos: a notificação chega no horário, com a nota.
- [ ] Concluir um capítulo (ou o último dia de studio): aparece o quiz do Gemini; Impostazioni mostra "Richieste usate oggi".
- [ ] Impostazioni → **Salva backup** e guardar o arquivo; testar **Ripristina** num navegador de computador para ter certeza de que funciona.
- [ ] Confirmar que o app abre sem internet (modo avião): a tela, a fonte e os dados continuam aparecendo.

### Se algo não funcionar

| Sintoma                                                         | O que ver                                                                                                                                                                                                                                                                                                                         |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Codice non valido" na Benvenuta                                | O código digitado é o mesmo do `ACCESS_CODE`? (`npx wrangler secret put ACCESS_CODE` troca.)                                                                                                                                                                                                                                      |
| "Non riesco a collegarmi al server"                             | `VITE_API_URL` certo no Pages? `ALLOWED_ORIGIN` igual ao endereço do app? CSP com o domínio do Worker?                                                                                                                                                                                                                            |
| Notificação não chega                                           | Notificações ligadas em Impostazioni e no iPhone (Ajustes → Notificações → Ema studia); app aberto pelo **ícone**; `npx wrangler tail -c worker/wrangler.toml` mostra as contagens do cron.                                                                                                                                       |
| Gemini não responde                                             | `GEMINI_API_KEY` cadastrada? `GEMINI_MODEL` com um nome que existe? Cota do dia (`GEMINI_DAILY_LIMIT`)? O app oferece o plano B (ChatGPT ou escrever à mão).                                                                                                                                                                      |
| "Gemini sta pensando…" e depois "Gemini ci sta mettendo troppo" | O Worker esperou 50 s e o Gemini não respondeu (o app espera até 60 s). Tente de novo; se repetir, troque `GEMINI_MODEL` por um modelo mais rápido (Flash-Lite) e veja o log abaixo.                                                                                                                                              |
| "Gemini non ha risposto questa volta"                           | O Gemini devolveu um erro. Rode `npx wrangler tail -c worker/wrangler.toml` e procure a linha `{"at":"gemini",...}`: ela mostra `http` (status), `geminiStatus` e `message` (o motivo dito pelo Google, ex. `API key not valid`, `model not found`), `model`, `thinking` e `ms` (duração). O conteúdo enviado nunca é registrado. |
| "Sembra che tu sia offline"                                     | Só aparece com o iPhone realmente sem internet (ou rede que falhou). Erro do Gemini e demora têm mensagem própria.                                                                                                                                                                                                                |
| "Troppi tentativi"                                              | O limite por minuto do Worker: espere um minuto e tente de novo.                                                                                                                                                                                                                                                                  |
