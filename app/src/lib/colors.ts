export const SUBJECT_COLORS = {
  fisica: { name: 'Fisica', bg: '#FFB3AC', accent: '#D93A2E' },
  storia: { name: 'Storia', bg: '#C9D9F7', accent: '#3E6CC4' },
  chimica: { name: 'Chimica', bg: '#FFE680', accent: '#E0A800' },
  biologia: { name: 'Biologia', bg: '#D6F2D9', accent: '#3C9A4A' },
  matematica: { name: 'Matematica', bg: '#FFDDB8', accent: '#EE8A1E' },
  filosofia: { name: 'Filosofia', bg: '#F6CBB4', accent: '#C4582A' },
  arte: { name: 'Arte', bg: '#ECE2FB', accent: '#A98BE0' },
  psicologia: { name: 'Psicologia', bg: '#FBD3E6', accent: '#E06BA4' },
  italiano: { name: 'Italiano', bg: '#CDEFEA', accent: '#2FA897' },
  latino: { name: 'Latino', bg: '#D5C2EE', accent: '#6A37A8' },
  inglese: { name: 'Inglese', bg: '#D4F0FB', accent: '#4BB3DB' },
} as const;

export type ColorKey = keyof typeof SUBJECT_COLORS;
export const COLOR_KEYS = Object.keys(SUBJECT_COLORS) as ColorKey[];

const ALIASES: Record<string, ColorKey> = {
  fisica: 'fisica',
  storia: 'storia',
  historia: 'storia',
  chimica: 'chimica',
  quimica: 'chimica',
  biologia: 'biologia',
  matematica: 'matematica',
  filosofia: 'filosofia',
  arte: 'arte',
  artes: 'arte',
  psicologia: 'psicologia',
  italiano: 'italiano',
  latino: 'latino',
  latim: 'latino',
  inglese: 'inglese',
  ingles: 'inglese',
};

export const normalizeName = (s: string): string =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

export function colorForName(name: string): ColorKey | undefined {
  return ALIASES[normalizeName(name)];
}

/** Cor pelo nome; se não for conhecida, a próxima cor ainda não usada (ou cíclica). */
export function pickColor(name: string, used: ColorKey[]): ColorKey {
  const known = colorForName(name);
  if (known) return known;
  const free = COLOR_KEYS.find((k) => !used.includes(k));
  return free ?? COLOR_KEYS[used.length % COLOR_KEYS.length];
}

// ---------- contraste (acessibilidade) ----------
const lum = (hex: string) => {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** Razão de contraste WCAG entre duas cores (#rrggbb). */
export function contrast(a: string, b: string): number {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

const mix = (a: string, b: string, t: number) => {
  const pa = [0, 2, 4].map((i) => parseInt(a.slice(1 + i, 3 + i), 16));
  const pb = [0, 2, 4].map((i) => parseInt(b.slice(1 + i, 3 + i), 16));
  return (
    '#' +
    pa
      .map((v, i) =>
        Math.round(v + (pb[i] - v) * t)
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
  );
};

/** Escurece a cor de acento (em direção ao marrom do app) até o texto branco ter contraste ≥ 4,5. */
export function readableFill(accent: string): string {
  let c = accent;
  for (let t = 0; contrast('#ffffff', c) < 4.5 && t <= 1; t += 0.05) c = mix(accent, '#4a3612', t);
  return c;
}
