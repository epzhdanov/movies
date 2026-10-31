// Builds src/data/films.seed.json from the hand-curated data/curated.json.
// For every entry it resolves the IMDb id (IMDb search), then pulls rating,
// genres, runtime, director, cast and poster from Cinemeta.
// Usage: node scripts/enrich-seed.mjs   (responses are cached in scripts/.cache)
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

const CACHE_DIR = new URL('./.cache/', import.meta.url);
const CURATED = new URL('../data/curated.json', import.meta.url);
const OUT = new URL('../src/data/films.seed.json', import.meta.url);
const IMPORT_TIME = Date.parse('2026-10-31T12:00:00Z');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function cachedJson(url, delayMs) {
  await mkdir(CACHE_DIR, { recursive: true });
  const file = new URL(createHash('sha1').update(url).digest('hex') + '.json', CACHE_DIR);
  if (existsSync(file)) return JSON.parse(await readFile(file, 'utf8'));
  await sleep(delayMs);
  const res = await fetch(url);
  const data = res.ok ? await res.json() : null;
  await writeFile(file, JSON.stringify(data));
  return data;
}

const norm = (s) =>
  (s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

const KIND = {
  feature: 'movie',
  'TV movie': 'movie',
  video: 'movie',
  'TV special': 'special',
  short: 'short',
  'TV series': 'series',
  'TV mini-series': 'miniseries',
};

async function imdbSearch(query) {
  const url = `https://v3.sg.media-imdb.com/suggestion/x/${encodeURIComponent(query.toLowerCase())}.json`;
  const data = await cachedJson(url, 300);
  return (data?.d || []).filter((x) => x.id?.startsWith('tt') && KIND[x.q]);
}

function pick(results, entry) {
  const names = [entry.orig, entry.en, entry.ru, entry.q].filter(Boolean).map(norm);
  let best = null;
  results.forEach((r, rank) => {
    const dy = r.y && entry.y ? Math.abs(r.y - entry.y) : 9;
    if (dy > 1) return;
    const t = norm(r.l);
    let score = (dy === 0 ? 4 : 2) - rank * 0.1;
    if (names.includes(t)) score += 2;
    else if (names.some((n) => n && (t.includes(n) || n.includes(t)))) score += 1;
    if (!best || score > best.score) best = { ...r, score };
  });
  return best;
}

async function cinemeta(id, kind) {
  const types = kind === 'series' || kind === 'miniseries' ? ['series', 'movie'] : ['movie', 'series'];
  for (const type of types) {
    const data = await cachedJson(`https://v3-cinemeta.strem.io/meta/${type}/${id}.json`, 100);
    if (data?.meta?.id) return data.meta;
  }
  return null;
}

function imdbPoster(url) {
  if (!url) return null;
  return url.replace(/(\._V1_[^/]*)?\.(jpg|png)$/i, '._V1_QL75_UX300_.$2');
}

async function urlOk(url) {
  try {
    const res = await fetch(url, { method: 'HEAD' });
    return res.ok;
  } catch {
    return false;
  }
}

// Cinemeta returns some names HTML-escaped (e.g. "Pat O&apos;Connor").
function decode(s) {
  const named = { amp: '&', apos: "'", quot: '"', lt: '<', gt: '>', nbsp: ' ' };
  return String(s).replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, code) => {
    if (code[0] !== '#') return named[code.toLowerCase()] ?? m;
    return String.fromCodePoint(code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : Number(code.slice(1)));
  });
}

function slug(s) {
  return norm(s).replace(/\s+/g, '-').slice(0, 60) || 'film';
}

const curated = JSON.parse(await readFile(CURATED, 'utf8'));
const films = [];
const report = [];

for (const [idx, e] of curated.entries()) {
  const src = [e.src].flat().filter(Boolean);
  const base = {
    status: e.s === 'seen' ? 'watched' : 'watchlist',
    myRating: e.r ?? null,
    recommendedBy: e.by ?? null,
    note: e.note ?? null,
    originalTitle: e.orig,
    englishTitle: e.en ?? null,
    russianTitle: e.ru ?? (e.lang === 'ru' ? e.orig : null),
    originalLanguage: e.lang ?? null,
    year: e.y ?? null,
    endYear: null,
    kind: e.kind ?? 'movie',
    genres: e.genres ?? [],
    countries: [],
    directors: [],
    cast: [],
    runtime: null,
    imdbId: null,
    imdbRating: null,
    poster: null,
    description: e.d ?? null,
    addedAt: new Date(IMPORT_TIME - (curated.length - 1 - idx) * 60_000).toISOString(),
    watchedAt: null,
    source: 'import',
    sourceText: src,
    needsReview: Boolean(e.rev),
    reviewNote: e.rev ?? null,
    hidden: Boolean(e.hide),
  };

  if (e.hide || e.kind === 'opera') {
    films.push({ id: slug(e.orig + ' ' + (e.y ?? '')), ...base });
    report.push(`${String(idx).padStart(3)} ${base.status.padEnd(9)} ${e.orig} — ${e.hide ? 'HIDDEN' : 'no IMDb'}`);
    continue;
  }

  let match = null;
  if (e.imdb) {
    const hits = await imdbSearch(e.imdb);
    match = hits.find((h) => h.id === e.imdb) ?? { id: e.imdb };
  } else {
    const queries = [e.q, e.en, e.orig, e.ru].filter(Boolean);
    for (const q of [...new Set(queries)]) {
      match = pick(await imdbSearch(q), e);
      if (match) break;
    }
  }

  if (!match) {
    films.push({ id: slug(e.orig + ' ' + (e.y ?? '')), ...base, needsReview: true, reviewNote: base.reviewNote ?? 'IMDb match not found.' });
    report.push(`${String(idx).padStart(3)} ${base.status.padEnd(9)} !! NO MATCH: ${e.orig} (${e.y})`);
    continue;
  }

  const kind = e.kind ?? KIND[match.q] ?? 'movie';
  const meta = await cinemeta(match.id, kind);
  const years = String(meta?.releaseInfo ?? meta?.year ?? '').match(/\d{4}/g) ?? [];
  let poster = imdbPoster(match.i?.imageUrl);
  if (!poster || !(await urlOk(poster))) {
    const alt = meta?.poster?.replace('/poster/small/', '/poster/medium/');
    poster = alt && (await urlOk(alt)) ? alt : null;
  }

  const film = {
    id: match.id,
    ...base,
    englishTitle: e.en ?? match.l ?? meta?.name ?? null,
    kind,
    year: Number(e.fy ?? match.y ?? years[0] ?? e.y) || null,
    endYear: kind === 'series' && years[1] ? Number(years[1]) : null,
    genres: (meta?.genres ?? []).map(decode),
    countries: decode(meta?.country ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    directors: (meta?.director ?? []).map(decode),
    cast: (meta?.cast?.length ? meta.cast : (match.s ?? '').split(',')).map((s) => decode(s).trim()).filter(Boolean).slice(0, 4),
    runtime: meta?.runtime ?? null,
    imdbId: match.id,
    imdbRating: meta?.imdbRating ? Number(meta.imdbRating) : null,
    poster,
  };
  films.push(film);

  const flag = film.year && e.y && Math.abs(film.year - e.y) > 1 ? '!! YEAR ' : '';
  report.push(
    `${String(idx).padStart(3)} ${base.status.padEnd(9)} ${flag}${e.orig} (${e.y}) => ${match.id} “${match.l ?? meta?.name}” ${film.year} ${kind}` +
      ` | ${film.directors.join(', ') || match.s || '-'} | IMDb ${film.imdbRating ?? '-'} | ${film.genres.join('/') || '-'}${poster ? '' : ' | NO POSTER'}`,
  );
}

const ids = new Map();
for (const f of films) {
  if (ids.has(f.id)) report.push(`!! DUPLICATE id ${f.id}: ${ids.get(f.id)} / ${f.originalTitle}`);
  ids.set(f.id, f.originalTitle);
}

await writeFile(OUT, JSON.stringify(films, null, 1) + '\n');
console.log(report.join('\n'));
console.log(`\n${films.length} films written (${films.filter((f) => f.status === 'watched').length} watched, ${films.filter((f) => f.status === 'watchlist' && !f.hidden).length} to watch, ${films.filter((f) => f.hidden).length} hidden)`);
