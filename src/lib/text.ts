import type { Film, FilmKind } from '../types';

/** Lowercase, strip accents, treat ё as е, collapse punctuation to spaces. */
export function norm(s: string | null | undefined): string {
  return (s ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/**
 * Russian and English films show their original title only; films in any other
 * language show the original title plus the English one.
 */
export function titles(f: Film): { main: string; sub: string | null } {
  const lang = f.originalLanguage;
  const en = f.englishTitle && norm(f.englishTitle) !== norm(f.originalTitle) ? f.englishTitle : null;
  if (lang === 'ru' || lang === 'en') return { main: f.originalTitle, sub: null };
  return { main: f.originalTitle, sub: en };
}

/** Every other title the film is known by, for the details view. */
export function akaTitles(f: Film): string[] {
  const { main, sub } = titles(f);
  const shown = new Set([norm(main), norm(sub)]);
  const out: string[] = [];
  for (const t of [f.englishTitle, f.russianTitle]) {
    if (t && !shown.has(norm(t))) {
      shown.add(norm(t));
      out.push(t);
    }
  }
  return out;
}

const searchCache = new WeakMap<Film, string>();

function searchText(f: Film): string {
  let s = searchCache.get(f);
  if (s === undefined) {
    s = norm(
      [
        f.originalTitle,
        f.englishTitle,
        f.russianTitle,
        ...f.sourceText,
        ...f.directors,
        f.recommendedBy,
        f.year,
      ].join(' '),
    );
    searchCache.set(f, s);
  }
  return s;
}

/** True when every word of the query appears in one of the film's titles, notes or credits. */
export function matches(f: Film, query: string): boolean {
  const words = norm(query).split(' ').filter(Boolean);
  if (!words.length) return true;
  const hay = searchText(f);
  return words.every((w) => hay.includes(w));
}

const KIND_LABEL: Record<FilmKind, string | null> = {
  movie: null,
  series: 'Series',
  miniseries: 'Mini-series',
  short: 'Short',
  special: 'Special',
  opera: 'Opera',
};

export function kindLabel(kind: FilmKind): string | null {
  return KIND_LABEL[kind] ?? null;
}

export function yearLabel(f: Film): string {
  if (!f.year) return '';
  if (f.kind === 'series') return f.endYear && f.endYear !== f.year ? `${f.year}–${f.endYear}` : `${f.year}–`;
  return String(f.year);
}

export function slugify(s: string): string {
  return norm(s).replace(/\s+/g, '-').slice(0, 60) || 'film';
}

export function formatDate(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Cinemeta returns some names HTML-escaped ("Pat O&apos;Connor"). */
export function decodeEntities(s: string): string {
  const named: Record<string, string> = { amp: '&', apos: "'", quot: '"', lt: '<', gt: '>', nbsp: ' ' };
  return s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, code: string) => {
    if (code[0] !== '#') return named[code.toLowerCase()] ?? m;
    const hex = code[1] === 'x' || code[1] === 'X';
    return String.fromCodePoint(hex ? parseInt(code.slice(2), 16) : Number(code.slice(1)));
  });
}
