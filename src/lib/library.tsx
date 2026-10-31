import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import seedData from '../data/films.seed.json';
import { firebaseConfig } from '../config';
import { DEV_OWNER } from './session';
import type { Film } from '../types';

export const SEED = seedData as unknown as Film[];
const CACHE_KEY = 'movies.library.v1';

interface Cache {
  version: number;
  films: Film[];
}

function readCache(): Cache | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as Cache) : null;
  } catch {
    return null;
  }
}

function writeCache(cache: Cache | null) {
  try {
    if (cache) localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    else localStorage.removeItem(CACHE_KEY);
  } catch {
    // storage full or blocked — the list still works, just without the cache
  }
}

interface LibraryValue {
  films: Film[];
  loading: boolean;
  /** Firebase is configured but the library hasn't been imported into it yet. */
  needsImport: boolean;
  error: string | null;
  save(films: Film[], deleteIds?: string[]): Promise<void>;
  importSeed(): Promise<void>;
}

const LibraryContext = createContext<LibraryValue | null>(null);

export function LibraryProvider({ children }: { children: ReactNode }) {
  const [films, setFilms] = useState<Film[]>(() => (firebaseConfig ? readCache()?.films : null) ?? SEED);
  const [loading, setLoading] = useState(Boolean(firebaseConfig));
  const [needsImport, setNeedsImport] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Visitors pay one read for meta/library; the full list is only re-read when
  // its version differs from the cached copy.
  const load = useCallback(async () => {
    if (!firebaseConfig) return;
    try {
      const store = await import('./firestore');
      const version = await store.fetchLibraryVersion();
      if (version === null) {
        setFilms(SEED);
        setNeedsImport(true);
        writeCache(null);
        return;
      }
      setNeedsImport(false);
      const cache = readCache();
      if (cache?.version === version) {
        setFilms(cache.films);
        return;
      }
      const fresh = await store.fetchFilms();
      writeCache({ version, films: fresh });
      setFilms(fresh);
      setError(null);
    } catch (e) {
      console.error(e);
      setError('Couldn’t reach the database — showing the last saved copy.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = useCallback(async (changed: Film[], deleteIds: string[] = []) => {
    if (!DEV_OWNER) {
      const store = await import('./firestore');
      await store.saveFilms(changed, deleteIds);
      writeCache(null);
    }
    setFilms((prev) => {
      const byId = new Map(prev.map((f) => [f.id, f]));
      for (const id of deleteIds) byId.delete(id);
      for (const f of changed) byId.set(f.id, f);
      return [...byId.values()];
    });
  }, []);

  const importSeed = useCallback(async () => {
    const store = await import('./firestore');
    await store.saveFilms(SEED);
    writeCache(null);
    await load();
  }, [load]);

  const value = useMemo(
    () => ({ films, loading, needsImport, error, save, importSeed }),
    [films, loading, needsImport, error, save, importSeed],
  );
  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>;
}

export function useLibrary(): LibraryValue {
  const ctx = useContext(LibraryContext);
  if (!ctx) throw new Error('useLibrary outside LibraryProvider');
  return ctx;
}
