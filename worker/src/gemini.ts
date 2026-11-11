/** Gemini: validação do pedido, prompt em italiano, schema JSON e validação da resposta. */

export type GeminiKind = 'quiz' | 'esercizi' | 'riassunto';
export const KINDS: GeminiKind[] = ['quiz', 'esercizi', 'riassunto'];

export interface GeminiRequest {
  kind: GeminiKind;
  timezone: string;
  subject: string;
  type: 'esatte' | 'umanistiche' | 'biologiche' | 'lingue';
  topic: string;
  difficulty: 1 | 2 | 3;
  chapter?: { n: number; title?: string };
  pages?: { from: number; to: number };
  notes: string[];
  summary: string;
}

export interface Question {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  solution?: string;
}

export const QUESTION_COUNT: Record<'quiz' | 'esercizi', number> = { quiz: 5, esercizi: 4 };

const TYPES = ['esatte', 'umanistiche', 'biologiche', 'lingue'] as const;
const LEVEL = { 1: 'facile', 2: 'media', 3: 'difficile' } as const;
const TYPE_IT = {
  esatte: 'scienze esatte',
  umanistiche: 'materia umanistica',
  biologiche: 'scienze biologiche',
  lingue: 'lingue',
} as const;

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Tira caracteres de controle (mantém quebra de linha se `multiline`). */
export function cleanText(s: string, max: number, multiline = false): string {
  const out = [...s]
    .map((ch) => {
      const n = ch.charCodeAt(0);
      if (multiline && n === 10) return '\n';
      return n < 32 || n === 127 ? ' ' : ch;
    })
    .join('')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return out.slice(0, max);
}

const str = (v: unknown, max: number) =>
  typeof v === 'string' && v.length <= max * 2 ? cleanText(v, max) : null;

export function parseGeminiRequest(
  kind: string,
  body: unknown,
  isTz: (tz: unknown) => boolean,
): GeminiRequest | null {
  if (!KINDS.includes(kind as GeminiKind) || !isObj(body)) return null;
  const subject = str(body.subject, 60);
  const topic = str(body.topic ?? '', 120) ?? '';
  if (!subject || !isTz(body.timezone)) return null;
  if (!TYPES.includes(body.type as (typeof TYPES)[number])) return null;
  if (![1, 2, 3].includes(body.difficulty as number)) return null;
  let chapter: GeminiRequest['chapter'];
  if (body.chapter !== undefined) {
    if (
      !isObj(body.chapter) ||
      !Number.isInteger(body.chapter.n) ||
      (body.chapter.n as number) < 0 ||
      (body.chapter.n as number) > 9999
    )
      return null;
    const title = body.chapter.title === undefined ? undefined : str(body.chapter.title, 120);
    if (title === null) return null;
    chapter = { n: body.chapter.n as number, title: title || undefined };
  }
  let pages: GeminiRequest['pages'];
  if (body.pages !== undefined) {
    const p = body.pages;
    if (
      !isObj(p) ||
      !Number.isInteger(p.from) ||
      !Number.isInteger(p.to) ||
      (p.from as number) < 0 ||
      (p.to as number) < (p.from as number) ||
      (p.to as number) > 100000
    )
      return null;
    pages = { from: p.from as number, to: p.to as number };
  }
  const notesIn = body.notes ?? [];
  if (
    !Array.isArray(notesIn) ||
    notesIn.length > 50 ||
    !notesIn.every((n) => typeof n === 'string' && n.length <= 280)
  )
    return null;
  const summaryIn = body.summary ?? '';
  if (typeof summaryIn !== 'string' || summaryIn.length > 2000) return null;
  return {
    kind: kind as GeminiKind,
    timezone: body.timezone as string,
    subject,
    type: body.type as GeminiRequest['type'],
    topic,
    difficulty: body.difficulty as 1 | 2 | 3,
    chapter,
    pages,
    notes: (notesIn as string[]).map((n) => cleanText(n, 280)).filter(Boolean),
    summary: cleanText(summaryIn, 2000, true),
  };
}

/** Contexto do estudo (sem dados pessoais: só o conteúdo do estudo). */
function context(r: GeminiRequest): string {
  const lines = [`Materia: ${r.subject} (${TYPE_IT[r.type]}).`];
  if (r.topic) lines.push(`Argomento: ${r.topic}.`);
  if (r.chapter)
    lines.push(`Capitolo ${r.chapter.n}${r.chapter.title ? ` «${r.chapter.title}»` : ''}.`);
  if (r.pages) lines.push(`Pagine ${r.pages.from}–${r.pages.to} del libro.`);
  if (r.notes.length)
    lines.push(
      `Appunti dello studente da memorizzare:\n${r.notes.map((n) => `- ${n}`).join('\n')}`,
    );
  if (r.summary) lines.push(`Riassunto scritto dallo studente:\n${r.summary}`);
  return lines.join('\n');
}

export function buildPrompt(r: GeminiRequest): string {
  const level = `Livello: scuola superiore / primo anno di università. Difficoltà: ${LEVEL[r.difficulty]}.`;
  const rules = 'Scrivi tutto in italiano. Usa solo testo semplice, senza markdown né HTML.';
  if (r.kind === 'riassunto') {
    return [
      'Sei un insegnante gentile. Scrivi un riassunto chiaro per aiutare a studiare.',
      level,
      context(r),
      'Il riassunto deve avere al massimo 1200 caratteri, con i concetti chiave in frasi brevi (puoi andare a capo).',
      rules,
      'Rispondi solo con JSON: {"summary": "..."}',
    ].join('\n\n');
  }
  const n = QUESTION_COUNT[r.kind];
  const about = r.chapter
    ? 'sul capitolo indicato'
    : r.pages
      ? 'sulle pagine indicate (solo ciò che lo studente ha già studiato)'
      : "sull'intero argomento";
  const what =
    r.kind === 'esercizi'
      ? `Crea ${n} esercizi a scelta multipla ${about}, con calcoli o ragionamenti. Per ogni esercizio scrivi la risoluzione passo a passo nel campo "solution".`
      : `Crea un quiz di ${n} domande a scelta multipla ${about}.`;
  return [
    'Sei un insegnante gentile che prepara uno studente a un esame.',
    what,
    level,
    context(r),
    'Ogni domanda ha esattamente 4 opzioni e una sola è corretta. "correctIndex" è la posizione (0, 1, 2 o 3) della risposta giusta. "explanation" spiega in breve perché.',
    rules,
  ].join('\n\n');
}

export function responseSchema(kind: GeminiKind): object {
  if (kind === 'riassunto') {
    return { type: 'OBJECT', properties: { summary: { type: 'STRING' } }, required: ['summary'] };
  }
  const props: Record<string, object> = {
    question: { type: 'STRING' },
    options: { type: 'ARRAY', items: { type: 'STRING' } },
    correctIndex: { type: 'INTEGER' },
    explanation: { type: 'STRING' },
  };
  const required = ['question', 'options', 'correctIndex', 'explanation'];
  if (kind === 'esercizi') {
    props.solution = { type: 'STRING' };
    required.push('solution');
  }
  return {
    type: 'OBJECT',
    properties: {
      questions: { type: 'ARRAY', items: { type: 'OBJECT', properties: props, required } },
    },
    required: ['questions'],
  };
}

/** Valida a resposta (nunca confiar no que o modelo devolve). */
export function validateQuestions(kind: 'quiz' | 'esercizi', data: unknown): Question[] | null {
  if (!isObj(data) || !Array.isArray(data.questions)) return null;
  const n = QUESTION_COUNT[kind];
  if (data.questions.length < n) return null;
  const out: Question[] = [];
  for (const q of data.questions.slice(0, n)) {
    if (
      !isObj(q) ||
      typeof q.question !== 'string' ||
      !Array.isArray(q.options) ||
      q.options.length !== 4
    )
      return null;
    if (
      !Number.isInteger(q.correctIndex) ||
      (q.correctIndex as number) < 0 ||
      (q.correctIndex as number) > 3
    )
      return null;
    const question = cleanText(q.question, 600, true);
    const options = q.options.map((o) => (typeof o === 'string' ? cleanText(o, 300) : ''));
    if (!question || options.some((o) => !o)) return null;
    const explanation =
      typeof q.explanation === 'string' ? cleanText(q.explanation, 800, true) : '';
    const item: Question = {
      question,
      options,
      correctIndex: q.correctIndex as number,
      explanation,
    };
    if (kind === 'esercizi') {
      if (typeof q.solution !== 'string' || !q.solution.trim()) return null;
      item.solution = cleanText(q.solution, 3000, true);
    }
    out.push(item);
  }
  return out;
}

export function validateSummary(data: unknown): string | null {
  if (!isObj(data) || typeof data.summary !== 'string') return null;
  const s = cleanText(data.summary, 2000, true);
  return s || null;
}

const MODEL_RE = /^[a-z0-9][a-z0-9.-]{1,62}$/;
export const DEFAULT_MODEL = 'gemini-2.5-flash';

/** Chama o Gemini pedindo JSON com schema. A chave vai no cabeçalho, nunca na URL. */
export async function callGemini(
  apiKey: string,
  model: string | undefined,
  prompt: string,
  schema: object,
  fetcher: typeof fetch = fetch,
): Promise<unknown | null> {
  const m = model && MODEL_RE.test(model) ? model : DEFAULT_MODEL;
  try {
    const res = await fetcher(
      `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: schema,
            temperature: 0.7,
          },
        }),
        signal: AbortSignal.timeout(30_000),
      },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Reserva 1 uso do dia; null se a cota acabou. */
export async function reserveUsage(
  db: D1Database,
  day: string,
  limit: number,
): Promise<number | null> {
  const row = await db
    .prepare(
      `INSERT INTO gemini_usage (day, count) VALUES (?, 1)
       ON CONFLICT(day) DO UPDATE SET count = count + 1 WHERE gemini_usage.count < ?
       RETURNING count`,
    )
    .bind(day, limit)
    .first<{ count: number }>();
  return row ? row.count : null;
}

export async function refundUsage(db: D1Database, day: string) {
  await db
    .prepare('UPDATE gemini_usage SET count = MAX(count - 1, 0) WHERE day = ?')
    .bind(day)
    .run();
}

export async function getUsage(db: D1Database, day: string): Promise<number> {
  const row = await db
    .prepare('SELECT count FROM gemini_usage WHERE day = ?')
    .bind(day)
    .first<{ count: number }>();
  return row?.count ?? 0;
}

export const dailyLimit = (v: string | undefined) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 1000 ? n : 20;
};
