export type FilmStatus = 'watched' | 'watchlist';
export type FilmKind = 'movie' | 'series' | 'miniseries' | 'short' | 'special' | 'opera';

export interface Film {
  id: string;
  status: FilmStatus;
  /** My rating, 1–10. Null = watched but not rated yet. */
  myRating: number | null;
  recommendedBy: string | null;
  note: string | null;
  /** Title in the original language and script. */
  originalTitle: string;
  englishTitle: string | null;
  russianTitle: string | null;
  /** ISO 639-1 code: ru, en, fr, zh… */
  originalLanguage: string | null;
  year: number | null;
  endYear: number | null;
  kind: FilmKind;
  genres: string[];
  countries: string[];
  directors: string[];
  cast: string[];
  runtime: string | null;
  imdbId: string | null;
  imdbRating: number | null;
  poster: string | null;
  description: string | null;
  /** ISO timestamps. */
  addedAt: string;
  watchedAt: string | null;
  source: 'import' | 'ai' | 'manual';
  /** How the film was written in my notes — kept for search and for review. */
  sourceText: string[];
  needsReview: boolean;
  reviewNote: string | null;
  /** Unidentified entries: only the owner sees them, under "Needs review". */
  hidden: boolean;
}

export interface AiSettings {
  openrouterKey: string;
  model: string;
  webSearch: boolean;
}
