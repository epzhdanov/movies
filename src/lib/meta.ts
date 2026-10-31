// Film metadata from open, CORS-enabled sources:
//  - Cinemeta (Stremio's IMDb-based catalog): IMDb id, rating, genres, cast, poster
//  - Wikipedia: poster fallback for titles Cinemeta has no image for
import { decodeEntities, norm } from './text';

const CINEMETA = 'https://v3-cinemeta.strem.io';

export interface Meta {
  imdbId: string;
  type: 'movie' | 'series';
  name: string;
  year: number | null;
  endYear: number | null;
  imdbRating: number | null;
  genres: string[];
  countries: string[];
  directors: string[];
  cast: string[];
  runtime: string | null;
  poster: string | null;
}

interface CinemetaMeta {
  id?: string;
  imdb_id?: string;
  type?: string;
  name?: string;
  releaseInfo?: string;
  year?: string;
  imdbRating?: string;
  genres?: string[];
  country?: string;
  director?: string[];
  cast?: string[];
  runtime?: string;
  poster?: string;
}

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url);
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

function toMeta(m: CinemetaMeta, type: 'movie' | 'series'): Meta {
  const years = String(m.releaseInfo ?? m.year ?? '').match(/\d{4}/g) ?? [];
  const list = (xs?: string[]) => (xs ?? []).map((x) => decodeEntities(x).trim()).filter(Boolean);
  return {
    imdbId: (m.imdb_id ?? m.id) as string,
    type,
    name: decodeEntities(m.name ?? ''),
    year: years[0] ? Number(years[0]) : null,
    endYear: years[1] ? Number(years[1]) : null,
    imdbRating: m.imdbRating ? Number(m.imdbRating) || null : null,
    genres: list(m.genres),
    countries: list((m.country ?? '').split(',')),
    directors: list(m.director),
    cast: list(m.cast).slice(0, 4),
    runtime: m.runtime ?? null,
    poster: m.poster ? m.poster.replace('/poster/small/', '/poster/medium/') : null,
  };
}

/** Looks an IMDb id up, trying the likelier type first. */
export async function metaById(imdbId: string, preferSeries = false): Promise<Meta | null> {
  const types: ('movie' | 'series')[] = preferSeries ? ['series', 'movie'] : ['movie', 'series'];
  for (const type of types) {
    const data = await getJson<{ meta?: CinemetaMeta }>(`${CINEMETA}/meta/${type}/${imdbId}.json`);
    if (data?.meta?.id || data?.meta?.imdb_id) return toMeta(data.meta, type);
  }
  return null;
}

/** Searches Cinemeta by title and picks the best match for the year (±1). */
export async function searchMeta(title: string, year: number | null, preferSeries = false): Promise<Meta | null> {
  const types: ('movie' | 'series')[] = preferSeries ? ['series', 'movie'] : ['movie', 'series'];
  const want = norm(title);
  let best: { score: number; id: string; type: 'movie' | 'series' } | null = null;
  for (const type of types) {
    const data = await getJson<{ metas?: CinemetaMeta[] }>(
      `${CINEMETA}/catalog/${type}/top/search=${encodeURIComponent(title)}.json`,
    );
    (data?.metas ?? []).slice(0, 10).forEach((m, rank) => {
      const id = m.imdb_id ?? m.id;
      if (!id?.startsWith('tt')) return;
      const y = Number(String(m.releaseInfo ?? m.year ?? '').slice(0, 4)) || null;
      if (year && y && Math.abs(y - year) > 1) return;
      const name = norm(m.name);
      let score = 3 - rank * 0.1 + (type === types[0] ? 0.5 : 0);
      if (name === want) score += 3;
      else if (name.includes(want) || want.includes(name)) score += 1;
      if (year && y === year) score += 2;
      if (!best || score > best.score) best = { score, id, type };
    });
  }
  const found = best as { id: string; type: 'movie' | 'series' } | null;
  return found ? metaById(found.id, found.type === 'series') : null;
}

/** Wikipedia's lead image is the poster for most film articles. */
export async function wikipediaPoster(title: string, year: number | null, lang = 'en'): Promise<string | null> {
  const candidates = year ? [`${title} (${year} film)`, `${title} (film)`, title] : [`${title} (film)`, title];
  for (const page of candidates) {
    const data = await getJson<{ type?: string; description?: string; thumbnail?: { source: string } }>(
      `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(page.replace(/ /g, '_'))}`,
    );
    const aboutFilm = /film|movie|series|documentary|television|фильм|сериал/i.test(data?.description ?? '');
    if (data?.thumbnail?.source && data.type !== 'disambiguation' && aboutFilm) return data.thumbnail.source;
  }
  return null;
}
