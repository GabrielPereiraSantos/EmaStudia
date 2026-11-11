# App de estudos da Ema — especificação para o Claude Code

> Leia este arquivo inteiro antes de escrever código. Trabalhe **fase por fase** (seção 12) e, ao final de cada fase, pare, mostre o que foi feito e espere minha confirmação antes de seguir.
> Sempre que algo estiver ambíguo, contraditório ou não estiver claro, **pergunte antes de implementar**.

---

## 1. Visão geral

Web app instalável (PWA) para iPhone 15 que ajuda a **Emanuelle ("Ema")** a organizar os estudos para provas.

- Ela cadastra estudos (matéria, páginas, capítulos, data da prova…) e o app monta uma **programação diária** (páginas ou capítulos por dia).
- Cada estudo tem uma tela própria com contagem para a prova, resumo, cronômetro/pomodoro, carinhas dos dias estudados e bloco de notas para memorizar.
- As anotações aparecem nas **notificações** ("Oggi si studia Fisica! Ricorda: …").
- **Quiz** gerado pelo Gemini ao terminar um capítulo; para matérias de exatas, **4 exercícios** ao terminar os dias de estudo.
- **Moedinhas** por dia estudado, sequências e acertos, trocadas por **prêmios** que ela mesma cadastra.

**Usuária única.** Interface **100% em italiano** (inclusive textos gerados pelo Gemini e notificações). O app trata a usuária por "Ema".

**Custo zero:** sem App Store, sem conta Apple Developer. Hospedagem e servidor gratuitos (Cloudflare).

---

## 2. Stack e arquitetura

```
/app      → PWA (React + Vite + TypeScript)  → Cloudflare Pages
/worker   → API (Cloudflare Worker + D1)      → Cloudflare Workers
/design   → referências visuais (.dc.html)
```

**App (front-end)**
- React 18 + Vite + TypeScript.
- PWA com service worker próprio (ex.: `vite-plugin-pwa` em modo `injectManifest`), porque o SW precisa tratar eventos `push` e `notificationclick`.
- Dados locais em **IndexedDB** via **Dexie**. Chamar `navigator.storage.persist()` na primeira abertura.
- Datas com `date-fns` (locale `it`). Fuso horário = o do aparelho (`Intl.DateTimeFormat().resolvedOptions().timeZone`).
- Estilo: CSS com variáveis (tokens da seção 4). Tailwind é aceitável se mapear os tokens.
- Fonte: **Quicksand** (Google Fonts, pesos 500/600/700).

**Worker (servidor mínimo)** — só existe para duas coisas que o iPhone não faz sozinho:
1. **Notificações push agendadas** (Web Push com VAPID; disparo por *Cron Trigger*).
2. **Proxy do Gemini**, para a chave da API nunca ficar no app.

- Cloudflare Worker em TypeScript (Hono é aceitável), banco **D1**.
- Biblioteca de Web Push compatível com Workers (Web Crypto), por exemplo `@block65/webcrypto-web-push`. **Verifique as versões atuais** antes de instalar.

**Princípio de dados:** tudo fica no iPhone. O Worker guarda **apenas** o necessário para as notificações (seção 9) e um contador diário de uso do Gemini.

---

## 3. Design

Os arquivos em `/design` são as telas aprovadas (formato HTML com marcação de template `{{...}}`, `<sc-for>`, `<sc-if>`). Use-os como **referência exata** de layout, cores, espaçamentos, raios e textos. Não é para copiar o formato — é para reproduzir o visual em React.

- `design/GirassolCores.dc.html` → telas principais: **Home**, **Nuovo studio** (cadastro), **Studio** (tela do estudo), **Quiz**, e o painel de **cores das matérias**.
- `design/TelasExtras.dc.html` → **Calendario**, **Premi**, **Nuovo premio**, **Risultato esercizi** (exatas), **Risultato quiz**, **Avviso di ritmo**, **Impostazioni**, **Benvenuta** (primeira abertura).

Largura de referência: 390 px (iPhone 15). Respeitar `safe-area-inset` (notch e barra inferior). Alvos de toque ≥ 44 px. Sem emojis decorativos na interface (o emoji da matéria escolhido por ela é a exceção).

---

## 4. Tokens visuais

### 4.1 Base (amarelo claro, delicado)
| Token | Cor |
|---|---|
| Fundo da página | `#FFFBEB` |
| Fundo externo / suave | `#FFF3C4` |
| Amarelo principal (cabeçalho, botões redondos) | `#FFD866` |
| Amarelo claro (detalhes) | `#FFE597` |
| Campos de formulário | `#FFF6D6` |
| Chips inativos / trilhas | `#FFF0BF` |
| Acento (botões de ação, progresso) | `#E8A317` |
| Texto principal / barra de navegação | `#4A3612` |
| Texto secundário | `#6B5428` |
| Cartões | `#FFFFFF`, raio 24–28 px |

### 4.2 Cores das matérias (iguais em todas as telas)
A cor é atribuída **automaticamente pelo nome** (comparação sem acento e sem maiúsculas, aceitar nome em italiano e em português). Ela pode trocar no cadastro. Matérias não listadas recebem a próxima cor livre.

| Matéria (IT / PT) | Fundo | Acento |
|---|---|---|
| Fisica / Física — vermelho | `#FFB3AC` | `#D93A2E` |
| Storia / História — azul | `#C9D9F7` | `#3E6CC4` |
| Chimica / Química — amarelo | `#FFE680` | `#E0A800` |
| Biologia — verde | `#D6F2D9` | `#3C9A4A` |
| Matematica / Matemática — laranja | `#FFDDB8` | `#EE8A1E` |
| Filosofia — laranja terracota | `#F6CBB4` | `#C4582A` |
| Arte / Artes — lilás | `#ECE2FB` | `#A98BE0` |
| Psicologia — rosa | `#FBD3E6` | `#E06BA4` |
| Italiano — verde-água | `#CDEFEA` | `#2FA897` |
| Latino / Latim — roxo | `#D5C2EE` | `#6A37A8` |
| Inglese / Inglês — azul claro | `#D4F0FB` | `#4BB3DB` |

Onde a cor da matéria aparece: cartões da Home ("Oggi"), campo Materia no cadastro, **Riassunto** na tela do estudo, topo do Quiz e dos resultados (e resposta selecionada no acento), Calendario (dias de prova e lista "Prossimi esami"). **O resto da tela do estudo continua amarelo.**

### 4.3 Tipos de matéria
| Tipo | Fundo | Texto |
|---|---|---|
| Esatte | `#3E6CC4` (selecionado) | `#FFFFFF` |
| Umanistiche (rosa) | `#FBD3E6` | `#9C2F66` |
| Biologiche (verde) | `#D6F2D9` | `#2E6B38` |
| Lingue (roxo) | `#D5C2EE` | `#5A2E91` |

### 4.4 Dificuldade e prioridade (mesmas cores)
Facile / Bassa = verde `#D6F2D9` · Media = amarelo `#FFD866` · Difficile / Alta = vermelho `#FFB3AC`. Opção selecionada com anel (box-shadow) na cor de acento.

### 4.5 Quarta-feira rosa
**Toda quarta-feira é rosa, sempre:** na fileira de dias do cadastro (`#F9B4D3`), no cabeçalho e coluna do Calendario (`#F9B4D3` / `#FDE7F1`) e atrás da carinha de quarta na tela do estudo (`#F9B4D3`, sem mudar se a carinha é feliz ou triste).

---

## 5. Telas e comportamento

Navegação inferior flutuante (escura) com 4 abas: **Home**, **Calendario**, **Quiz**, **Premi**. Botão flutuante "+" na Home abre **Nuovo studio**. Ícone de engrenagem (Home) abre **Impostazioni**.

### 5.1 Home
- Saudação pela hora local: 05:00–11:59 **"Buongiorno, Ema"**, 12:00–17:59 **"Buon pomeriggio, Ema"**, 18:00–04:59 **"Buonasera, Ema"**. Abaixo: **"Cosa studiamo oggi?"** e a data ("Martedì, 10 novembre").
- Cartão com: dias de sequência, moedinhas, nº de provas ativas.
- Seção **"Oggi"** já na tela inicial: tarefas do dia de todos os estudos, cartões no estilo do design (tag do tipo, "esame tra X giorni", matéria, o que fazer: "pagine 12–30" ou "capitolo 3", botão "Studia ora"). Tarefas concluídas mostram "Fatto".
- Se algum estudo estiver atrasado → mostrar o **Avviso di ritmo** (5.7).

### 5.2 Nuovo studio (cadastro) — campos
| Campo (IT) | Tipo | Obs. |
|---|---|---|
| Materia | texto | define a cor automática |
| Emoji | seletor | opcional, botão ao lado de Materia |
| Argomento | texto | assunto |
| Colore della materia | 11 bolinhas | pré-selecionada pelo nome |
| Tipo | Esatte / Umanistiche / Biologiche / Lingue | obrigatório |
| Pag. iniziale / Pag. finale | número | total = final − inicial + 1 |
| Capitoli | lista: nº, título (opcional), página inicial | página inicial é necessária para distribuir capítulos de tamanhos diferentes |
| Inizio | data | início do estudo |
| Esame | data | data da prova |
| Dividi per | Pagine / Capitoli | ela escolhe |
| Difficoltà | Facile / Media / Difficile | |
| Priorità | Bassa / Media / Alta | |
| Giorni disponibili | L M M G V S D | quarta rosa |
| Promemoria | hora | lembrete diário |
| Giorni di ripasso | número | padrão pela dificuldade: 1 / 2 / 3 |
| Materiali | lista de links (título + URL) | videoaulas públicas que ela cola |

Validações: final ≥ inicial; prova > início; pelo menos 1 dia disponível; dias de estudo suficientes (se não houver, avisar em italiano e sugerir ajuste). Botão: **"Crea il piano di studio"**. Estudos podem ser editados e arquivados; ela pode ter quantos quiser.

### 5.3 Studio (tela do estudo)
- Cabeçalho: matéria, argomento, chip "X giorni" para a prova.
- **Cronômetro** em anel com modo **pomodoro** opcional (padrão 25/5, configurável) e modo livre. Botões "Inizia" / "Libero" / pausar / parar. O tempo continua contando corretamente se o app for para segundo plano (calcular pela hora de início, não por `setInterval`). Ao terminar um pomodoro, vibrar/tocar som suave se possível.
- **Riassunto** (na cor da matéria): texto editável; botão para gerar com o Gemini.
- **Carinhas** dos dias programados **deste estudo**: feliz (estudou ≥ 30 min), triste (dia passado sem 30 min), tracejada (futuro).
- Progresso: páginas feitas / total, e tarefa de hoje com opção de registrar progresso parcial ("Oggi ho fatto 10 di 15 pagine").
- **Da memorizzare**: bloco de notas (adicionar, editar, apagar). Essas notas entram nas notificações.
- **Materiali**: links salvos, abrem em nova aba.

### 5.4 Quiz (aba e telas)
- Aba Quiz lista quizzes **disponíveis** (gerados, não respondidos) e o histórico.
- Uma pergunta por vez, 4 opções, barra de progresso, "+5" visível, botão **"Conferma"**. Rodapé: "Domande create da Gemini".
- **Risultato quiz** (não exatas): nota (ex. 4/5), "Ottimo, Ema!", moedinhas ganhas, lista com ✓/✗ e "Risposta giusta: …" nas erradas.
- **Risultato esercizi** (exatas): mesmo formato com 4 exercícios; nos errados, botão "Vedi la soluzione" com a resolução passo a passo.
- Se o Gemini falhar ou a cota acabar → ver 8.3.

### 5.5 Calendario
Mês com segunda-feira na primeira coluna, quarta rosa, hoje destacado (fundo `#4A3612`, texto `#FFE597`), dias de prova na cor da matéria. Lista **"Prossimi esami"** (data, matéria, "tra X giorni", % feito). Tocar num dia mostra as tarefas daquele dia.

### 5.6 Premi e Nuovo premio
- Saldo de moedinhas, barra da sequência ("5 di 7 giorni di fila · +30 bonus"), grade de prêmios: os que ela pode pagar têm **"Riscatta"** (pede confirmação); os outros mostram barra e "mancano X".
- "Come guadagnare" com os valores atuais.
- **Nuovo premio**: nome, ícone (5 opções: regalo, cuore, film, tazza, stella), preço (stepper + atalhos 50/100/200/300, com "Circa X giorni di studio"), "Si può riscattare più volte", prévia. Botão "Salva premio".
- Histórico de resgates.

### 5.7 Avviso di ritmo
Folha inferior: "Ema, a questo ritmo finisci X giorni dopo l'esame", progresso de hoje, opções **"Ridistribuisci in automatico"** (mostra novo nº de páginas/dia) e **"Aggiungi il sabato"** (ou o próximo dia não disponível), botões "Conferma il nuovo piano" / "Lascia com'è".

### 5.8 Impostazioni
Valores das moedinhas (giorno studiato, 7 giorni di fila, risposta corretta), notificações liga/desliga, "Includi le note da memorizzare", horário padrão, pomodoro (estudo/pausa), **Backup** ("Salva backup" / "Ripristina", data do último), uso do Gemini hoje ("6 di 20"), código de acesso (seção 10).

### 5.9 Benvenuta (primeira abertura)
- Se **não** estiver instalado (`display-mode: standalone` falso / `navigator.standalone` falso): guia em 4 passos — "Apri questo link in Safari", "Tocca Condividi", "Aggiungi alla schermata Home", "Apri l'app dall'icona e attiva le notifiche".
- Se instalado: pedir o **código de acesso** e então o botão **"Attiva le notifiche"** (a permissão no iOS só pode ser pedida a partir de um toque do usuário).

---

## 6. Regras da programação de estudos

### 6.1 Dias de estudo
- Candidatos: datas de `max(Inizio, hoje)` até o dia **anterior** à prova, apenas nos **giorni disponibili**.
- Os últimos `Giorni di ripasso` dias candidatos viram dias de **ripasso** (revisão, sem páginas novas; tarefa "Ripasso generale").
- O restante são dias de **studio**.

### 6.2 Modo Pagine
`paginasRestantes / diasDeStudoRestantes`, arredondando para cima; o último dia recebe o que sobrar. Cada dia mostra o intervalo ("pagine 45–60").

### 6.3 Modo Capitoli
Calcular o tamanho de cada capítulo pelas páginas iniciais. Distribuir capítulos inteiros pelos dias de forma gulosa, buscando que cada dia fique perto da média de páginas/dia. Só dividir um capítulo se ele tiver mais de 2× a média ("Capitolo 3 – parte 1/2").

### 6.4 Equilíbrio entre provas (prioridade)
Peso de carga de uma tarefa = páginas × fator de dificuldade (Facile 1.0, Media 1.2, Difficile 1.5). Depois de gerar os planos individuais, para cada dia cuja carga total passe de 1,5× a média do período, mover trabalho do estudo de **menor prioridade** (Bassa < Media < Alta) para dias disponíveis anteriores, sem passar da prova dele. A prioridade Alta nunca é a que cede primeiro. Escreva esse algoritmo como função pura e **com testes**.

### 6.5 Progresso e redistribuição automática
- Ela marca a tarefa como feita ou informa progresso parcial (páginas feitas).
- Ao abrir o app (e a cada mudança), recalcular a partir de hoje com as páginas que faltam. Dias passados não são alterados.
- **Alerta de ritmo** quando: (a) o ritmo médio real dos últimos 3 dias de estudo projeta término depois da prova, ou (b) o novo valor de páginas/dia ficar > 25% acima do original. Mostrar o nº de dias de atraso projetado.

### 6.6 Dia estudado
Um dia conta como **estudado** para um estudo quando a soma das sessões do cronômetro daquele estudo naquele dia é **≥ 30 minutos**. Isso define a carinha feliz. Para as moedinhas do dia, vale a soma de **todos** os estudos ≥ 30 min.

---

## 7. Moedinhas e prêmios

| Evento | Padrão (editável) |
|---|---|
| Dia estudado (≥ 30 min no total) | **+10**, uma vez por dia |
| Sequência de 7 dias estudados seguidos | **+30**, a cada 7 dias |
| Resposta certa no quiz / exercício | **+5** |

- Dias sem nenhum estudo programado **não quebram** a sequência.
- **Ela nunca perde moedas** — só deixa de ganhar.
- Registrar tudo num extrato (data, valor, motivo). Saldo = soma do extrato.
- Resgatar um prêmio debita o preço; prêmio não repetível some da loja depois de resgatado.

---

## 8. Gemini (quiz, exercícios e resumo)

### 8.1 Quando gerar
- **Não exatas:** ao concluir um **capítulo** (em modo Capitoli, quando a tarefa daquele capítulo é concluída; em modo Pagine, quando o progresso passa a página final de um capítulo) → quiz de **5 perguntas** de múltipla escolha sobre aquele capítulo.
- **Esatte:** ao concluir **todos os dias de studio** (antes do ripasso) → **4 exercícios** de múltipla escolha com resolução passo a passo.
- **Riassunto:** sob demanda, botão na tela do estudo.

### 8.2 Como gerar
- O app chama o Worker; o Worker chama a API do Gemini com a chave guardada em segredo.
- Contexto enviado: matéria, tipo, argomento, nº e título do capítulo, intervalo de páginas, notas "Da memorizzare" e o resumo existente. **Sem dados pessoais.**
- Pedir **saída JSON estruturada** (usar o modo de resposta JSON / schema da API) e validar no Worker antes de devolver. Formato: `{questions: [{question, options[4], correctIndex, explanation}]}`; exercícios incluem `solution`.
- Tudo **em italiano**, nível de ensino médio/universidade inicial, dificuldade ajustada pela "Difficoltà".
- Modelo configurável por variável (`GEMINI_MODEL`), usando um modelo **Flash disponível no plano gratuito** — confirme o nome atual na documentação do Google AI Studio.
- Limite diário próprio (`GEMINI_DAILY_LIMIT`, padrão 20) contado no D1; o app mostra o uso em Impostazioni.

### 8.3 Plano B (cota acabou ou erro)
Mensagem gentil em italiano e duas opções:
1. **"Apri in ChatGPT"**: copia para a área de transferência um prompt pronto (em italiano, pedindo o quiz no mesmo formato) e abre `https://chatgpt.com/`.
2. **"Scrivi tu"**: ela digita as perguntas/resumo manualmente.

Quizzes gerados ficam salvos localmente (não gerar de novo o mesmo).

---

## 9. Notificações

- iOS só entrega Web Push para **PWA instalado na Tela de Início** (iOS 16.4+), com permissão pedida a partir de um toque.
- Fluxo: o app registra a assinatura push (`PushManager.subscribe` com a chave VAPID pública) e envia ao Worker.
- O app envia ao Worker uma **agenda mínima** sempre que algo muda: `{deviceId, timezone, reminders: [{studyId, subject, dates[], time}], notes: {studyId: [textos]}}`. Somente isso vai para o servidor.
- Cron do Worker a cada 5 minutos: para cada lembrete vencido (no fuso dela) envia a notificação e marca como enviada.
- Texto: **"Oggi si studia {Materia}! Ricorda: {nota aleatória}"** (sem nota: "Oggi si studia {Materia}! Ce la fai, Ema."). Dia de ripasso: "Oggi è giorno di ripasso di {Materia}". Se houver mais de um estudo no mesmo horário, agrupar numa só notificação.
- Respeitar "Notifiche" e "Includi le note" de Impostazioni.
- Tocar na notificação abre a tela do estudo correspondente.
- Assinatura expirada (404/410) → apagar do D1.

---

## 10. Segurança (obrigatório)

- **Nenhum segredo no front-end nem no Git.** Segredos do Worker via `wrangler secret put`: `GEMINI_API_KEY`, `ACCESS_CODE`, `VAPID_PRIVATE_KEY`. Variáveis: `VAPID_PUBLIC_KEY`, `VAPID_SUBJECT` (`mailto:`), `GEMINI_MODEL`, `GEMINI_DAILY_LIMIT`, `ALLOWED_ORIGIN`. `.dev.vars` no `.gitignore`.
- **Código de acesso:** todas as rotas do Worker exigem o header `X-Access-Code` igual a `ACCESS_CODE` (comparação em tempo constante). A Ema digita o código uma vez na primeira abertura; ele fica salvo no aparelho. Isso impede que estranhos usem a cota do Gemini.
- **CORS** restrito à origem do Pages (`ALLOWED_ORIGIN`).
- Rate limit diário do Gemini + limite de tamanho do corpo das requisições.
- Validar e sanitizar entrada e a resposta do Gemini; renderizar textos do Gemini como texto (nunca `dangerouslySetInnerHTML`).
- Não registrar em log o conteúdo das notas.
- Cabeçalhos de segurança no Pages (`_headers`): CSP, `X-Content-Type-Options`, `Referrer-Policy`.

---

## 11. Modelo de dados (IndexedDB)

```ts
Study { id, subject, emoji?, colorKey, topic, type: 'esatte'|'umanistiche'|'biologiche'|'lingue',
        difficulty: 1|2|3, priority: 1|2|3, pageStart, pageEnd,
        chapters: {n, title?, startPage}[], splitMode: 'pagine'|'capitoli',
        startDate, examDate, weekdays: number[], reminderTime, reviewDays,
        materials: {title, url}[], summary, archived, createdAt }
PlanDay { id, studyId, date, kind: 'studio'|'ripasso', pageFrom?, pageTo?, chapters?: number[],
          pagesDone, done }
Note { id, studyId, text, createdAt }
Session { id, studyId, date, startedAt, durationSec, mode: 'pomodoro'|'libero' }
Quiz { id, studyId, kind: 'quiz'|'esercizi', chapter?, questions[], answers[], score,
       coinsAwarded, status: 'disponibile'|'completato', createdAt }
CoinEntry { id, date, amount, reason: 'giorno'|'serie'|'quiz'|'premio' }
Reward { id, name, icon, price, repeatable, active }
Redemption { id, rewardId, date, price }
Settings { coinsDay, coinsStreak, coinsCorrect, pomodoroWork, pomodoroBreak,
           defaultReminder, notifications, includeNotes, accessCode, deviceId, lastBackupAt }
```

**Backup:** "Salva backup" exporta tudo num `.json` (via `navigator.share` com arquivo, ou download); "Ripristina" importa (validar versão e formato, pedir confirmação antes de substituir). Lembrar no app se o último backup tiver mais de 14 dias.

---

## 12. Fases de desenvolvimento

Pare ao final de cada fase e mostre como testar.

**Fase 0 — Estrutura**
Monorepo `/app` e `/worker`, TypeScript, lint, Vitest, README com como rodar. Manifest PWA (nome "Ema studia", ícone de girassol amarelo, `theme_color #FFD866`, `display: standalone`). Tokens e fonte.
✔ App abre no navegador, instalável, tela vazia no estilo do design.

**Fase 1 — Cadastro, programação e Home**
Banco Dexie, Nuovo studio completo, algoritmos da seção 6 (com testes unitários cobrindo: só alguns dias da semana, ripasso, modo capítulos com tamanhos diferentes, duas provas próximas com prioridades diferentes, atraso e redistribuição). Home com saudação e "Oggi".
✔ Cadastro de 3 estudos gera planos corretos; testes passando.

**Fase 2 — Tela do estudo**
Cronômetro/pomodoro, sessões, carinhas, progresso parcial, Riassunto manual, Da memorizzare, Materiali, Avviso di ritmo.
✔ 30 min de cronômetro deixam a carinha feliz; atraso gera o aviso.

**Fase 3 — Moedinhas, prêmios e calendário**
Extrato, sequência, Premi, Nuovo premio, resgate, Calendario.
✔ Regras da seção 7 testadas.

**Fase 4 — Worker e notificações**
Worker + D1, código de acesso, CORS, registro de push, sincronização da agenda, cron, Benvenuta.
✔ Notificação chega no iPhone instalado no horário certo, com a nota.

**Fase 5 — Gemini**
Rotas de quiz, exercícios e resumo; JSON validado; limite diário; Plano B (ChatGPT / manual); telas de Quiz e Risultato.
✔ Concluir capítulo gera quiz em italiano; cota esgotada mostra o Plano B.

**Fase 6 — Backup e acabamento**
Backup/restauração, Impostazioni completa, estados vazios ("Nessuno studio ancora — creane uno!"), acessibilidade, revisão de segurança, deploy final.
✔ Restaurar backup num navegador limpo recupera tudo.

---

## 13. Deploy (passo a passo para o dono do projeto)

1. Criar conta grátis em **cloudflare.com** (Sign up → confirmar e-mail).
2. Subir o repositório no **GitHub**.
3. No painel Cloudflare: **Workers & Pages → Create → Pages → Connect to Git**, escolher o repo, pasta `app`, build `npm run build`, saída `dist`.
4. Worker: `npx wrangler login`, `npx wrangler d1 create ema-db`, aplicar migrações, cadastrar segredos (`wrangler secret put …`), `npx wrangler deploy`.
5. Gerar as chaves VAPID (script no repo) e a chave do Gemini no **Google AI Studio** (sem cadastrar cartão).
6. Mandar o link do Pages para a Ema, junto com o código de acesso.

Escreva no README esses passos com os comandos exatos do projeto.

---

## 14. Fora do escopo (v1)
Login/contas, sincronização entre aparelhos, App Store, versão Android específica, compartilhar com outras pessoas, foto de páginas para o Gemini (pode virar v2).
