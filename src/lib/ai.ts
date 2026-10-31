// AI enrichment through OpenRouter, called straight from the owner's browser.
// The key lives in Firestore under private/settings, readable only by the owner.
// Flow: the model identifies film(s) from text and/or a screenshot (with web
// search for new or obscure titles) → Cinemeta confirms the IMDb id and supplies
// the IMDb rating, genres, cast and poster.
import { metaById, searchMeta, wikipediaPoster, type Meta } from './meta';
import { slugify } from './text';
import type { AiSettings, Film, FilmKind, FilmStatus } from '../types';

const OPENROUTER = 'https://openrouter.ai/api/v1';

export interface AiFilm {
  original_title: string;
  english_title: string;
  russian_title: string;
  original_language: string;
  year: number;
  kind: 'movie' | 'series' | 'miniseries' | 'short' | 'special';
  imdb_id: string;
  directors: string[];
  countries: string[];
  genres: string[];
  description: string;
  recommended_by: string;
  note: string;
  confidence: number;
}

const GENRES =
  'Action, Adventure, Animation, Biography, Comedy, Crime, Documentary, Drama, Family, Fantasy, History, Horror, Music, Musical, Mystery, Romance, Sci-Fi, Sport, Thriller, War, Western';

const SYSTEM_PROMPT = `You identify films and TV series for a personal movie list.
The input is free text (often Russian, sometimes misspelled, nicknames or half-remembered titles), a pasted message, a link, and/or a screenshot (poster, streaming app, chat, social post).
Find every film or series it refers to and return JSON matching the schema.

Rules:
- original_title: the title in the film's original language AND script (Левиафан, 唐人街探案3, פאודה, La vita è bella, Amour).
- english_title: the official English / international title. russian_title: the official Russian release title if one exists, else "".
- original_language: ISO 639-1 code of the main spoken language (ru, en, fr, de, it, es, zh, ja, he…).
- year: first release year (festival premiere counts). For series, the first season's year.
- kind: movie | series | miniseries | short | special.
- imdb_id: the IMDb id (tt1234567). Use web search to confirm it when you are not certain; "" if not found.
- genres: 1–3 from this list only: ${GENRES}.
- description: 1–2 spoiler-free sentences in English, max 220 characters, saying what the film is about (mention the director when notable).
- recommended_by: who recommended it if the input says so (e.g. "от Маши", "(seb cao)", "мама", "Anya from coliving"); keep their name as written but capitalized. Otherwise "".
- note: other useful remarks from the input (where to watch, "with kids") in the input's language. Otherwise "".
- confidence: 0–1, how sure you are this is the film the person meant.
If the input is a link or a screenshot of a single film, return that one film. Skip anything that is not a film or a series (books, podcasts). Return {"films": []} if nothing matches.`;

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['films'],
  properties: {
    films: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'original_title', 'english_title', 'russian_title', 'original_language', 'year', 'kind', 'imdb_id',
          'directors', 'countries', 'genres', 'description', 'recommended_by', 'note', 'confidence',
        ],
        properties: {
          original_title: { type: 'string' },
          english_title: { type: 'string' },
          russian_title: { type: 'string' },
          original_language: { type: 'string' },
          year: { type: 'integer' },
          kind: { type: 'string', enum: ['movie', 'series', 'miniseries', 'short', 'special'] },
          imdb_id: { type: 'string' },
          directors: { type: 'array', items: { type: 'string' } },
          countries: { type: 'array', items: { type: 'string' } },
          genres: { type: 'array', items: { type: 'string' } },
          description: { type: 'string' },
          recommended_by: { type: 'string' },
          note: { type: 'string' },
          confidence: { type: 'number' },
        },
      },
    },
  },
};

export class AiError extends Error {}

function explain(status: number, body: string): string {
  if (status === 401) return 'OpenRouter rejected the API key. Check it in Settings.';
  if (status === 402) return 'Your OpenRouter balance is empty. Add credits at openrouter.ai/settings/credits.';
  if (status === 429) return 'OpenRouter rate limit hit. Wait a moment and try again.';
  try {
    const msg = JSON.parse(body)?.error?.message;
    if (msg) return `OpenRouter: ${msg}`;
  } catch {
    // not JSON
  }
  return `OpenRouter error ${status}.`;
}

function parseJson(content: string): { films?: AiFilm[] } {
  try {
    return JSON.parse(content);
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new AiError('The model did not return valid JSON. Try again or switch models in Settings.');
  }
}

export async function identifyFilms(
  input: { text: string; image: string | null; hint?: string },
  settings: AiSettings,
  signal?: AbortSignal,
): Promise<AiFilm[]> {
  if (!settings.openrouterKey) throw new AiError('Add your OpenRouter API key in Settings first.');
  if (import.meta.env.DEV && settings.openrouterKey === 'mock') {
    // Dev-only stand-in for the model (see DEV_OWNER): one "film" per line or comma, resolved via Cinemeta.
    return input.text
      .split(/[\n,]/)
      .map((t) => t.trim())
      .filter(Boolean)
      .map((t) => ({
        original_title: t, english_title: t, russian_title: '', original_language: 'en', year: 0, kind: 'movie' as const,
        imdb_id: '', directors: [], countries: [], genres: [], description: `(mock description for ${t})`,
        recommended_by: '', note: '', confidence: 0.9,
      }));
  }
  const text = [
    input.text.trim() || (input.image ? 'Identify the film(s) in this screenshot.' : ''),
    input.hint ? `Extra context: ${input.hint}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
  const content: unknown[] = [{ type: 'text', text }];
  if (input.image) content.push({ type: 'image_url', image_url: { url: input.image } });

  const res = await fetch(`${OPENROUTER}/chat/completions`, {
    method: 'POST',
    signal,
    headers: {
      Authorization: `Bearer ${settings.openrouterKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': location.origin,
      'X-Title': 'movies.ezhdanov.com',
    },
    body: JSON.stringify({
      model: settings.model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content },
      ],
      plugins: settings.webSearch ? [{ id: 'web', max_results: 5 }] : undefined,
      response_format: { type: 'json_schema', json_schema: { name: 'films', strict: true, schema: SCHEMA } },
      max_tokens: 4000,
    }),
  });
  const body = await res.text();
  if (!res.ok) throw new AiError(explain(res.status, body));
  const content0 = JSON.parse(body)?.choices?.[0]?.message?.content;
  if (typeof content0 !== 'string') throw new AiError('Empty answer from the model. Try again.');
  return (parseJson(content0).films ?? []).filter((f) => f?.original_title);
}

/** Checks the key without spending anything. Returns a short status line. */
export async function checkKey(key: string): Promise<string> {
  const res = await fetch(`${OPENROUTER}/key`, { headers: { Authorization: `Bearer ${key}` } });
  const body = await res.text();
  if (!res.ok) throw new AiError(explain(res.status, body));
  const data = JSON.parse(body)?.data ?? {};
  const used = typeof data.usage === 'number' ? `$${data.usage.toFixed(2)} used` : 'key works';
  const limit = typeof data.limit === 'number' ? ` of $${data.limit.toFixed(2)} limit` : '';
  return `Key works — ${used}${limit}.`;
}

const VALID_ID = /^tt\d{5,10}$/;

/** Confirms the AI's pick on Cinemeta, preferring the IMDb id, then a title search. */
export async function findMeta(ai: AiFilm): Promise<Meta | null> {
  const series = ai.kind === 'series' || ai.kind === 'miniseries';
  if (VALID_ID.test(ai.imdb_id)) {
    const meta = await metaById(ai.imdb_id, series);
    if (meta && (!meta.year || !ai.year || Math.abs(meta.year - ai.year) <= 1)) return meta;
  }
  for (const title of [ai.english_title, ai.original_title]) {
    if (!title) continue;
    const meta = await searchMeta(title, ai.year || null, series);
    if (meta) return meta;
  }
  return null;
}

export interface Draft {
  film: Film;
  confidence: number;
  matched: boolean;
}

/** Builds a film record from the AI answer plus Cinemeta data. */
export async function buildDraft(
  ai: AiFilm,
  opts: { status: FilmStatus; rating: number | null; recommendedBy: string; sourceText: string },
): Promise<Draft> {
  const meta = await findMeta(ai);
  const kind: FilmKind =
    meta?.type === 'series' && ai.kind !== 'miniseries' ? 'series' : (ai.kind as FilmKind) || 'movie';
  let poster = meta?.poster ?? null;
  if (!poster) poster = await wikipediaPoster(ai.english_title || ai.original_title, ai.year || null);
  const now = new Date().toISOString();
  const watched = opts.status === 'watched';
  const film: Film = {
    id: meta?.imdbId ?? `${slugify(ai.original_title)}-${ai.year || 'x'}`,
    status: opts.status,
    myRating: watched ? opts.rating : null,
    recommendedBy: opts.recommendedBy.trim() || ai.recommended_by.trim() || null,
    note: ai.note.trim() || null,
    originalTitle: ai.original_title.trim(),
    englishTitle: ai.english_title.trim() || meta?.name || null,
    russianTitle: ai.russian_title.trim() || (ai.original_language === 'ru' ? ai.original_title.trim() : null),
    originalLanguage: ai.original_language || null,
    year: ai.year || meta?.year || null,
    endYear: kind === 'series' ? (meta?.endYear ?? null) : null,
    kind,
    genres: meta?.genres.length ? meta.genres : ai.genres,
    countries: meta?.countries.length ? meta.countries : ai.countries,
    directors: meta?.directors.length ? meta.directors : ai.directors,
    cast: meta?.cast ?? [],
    runtime: meta?.runtime ?? null,
    imdbId: meta?.imdbId ?? null,
    imdbRating: meta?.imdbRating ?? null,
    poster,
    description: ai.description.trim() || null,
    addedAt: now,
    watchedAt: watched ? now : null,
    source: 'ai',
    sourceText: opts.sourceText.trim() ? [opts.sourceText.trim().slice(0, 300)] : [],
    needsReview: !meta,
    reviewNote: meta ? null : 'Not found on IMDb — check the details.',
    hidden: false,
  };
  return { film, confidence: ai.confidence ?? 0.5, matched: Boolean(meta) };
}

/** Re-reads IMDb rating, genres, poster etc. for a film that has an IMDb id. */
export async function refreshFromImdb(film: Film): Promise<Film> {
  if (!film.imdbId) return film;
  const meta = await metaById(film.imdbId, film.kind === 'series' || film.kind === 'miniseries');
  if (!meta) return film;
  return {
    ...film,
    imdbRating: meta.imdbRating ?? film.imdbRating,
    genres: meta.genres.length ? meta.genres : film.genres,
    countries: meta.countries.length ? meta.countries : film.countries,
    directors: meta.directors.length ? meta.directors : film.directors,
    cast: meta.cast.length ? meta.cast : film.cast,
    runtime: meta.runtime ?? film.runtime,
    endYear: film.kind === 'series' ? (meta.endYear ?? film.endYear) : film.endYear,
    poster: film.poster ?? meta.poster,
  };
}
