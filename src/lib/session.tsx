import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { DEFAULT_MODEL, firebaseConfig } from '../config';
import type { AiSettings } from '../types';

// Remembered so returning visitors who never signed in don't download Firebase Auth.
const SIGNED_IN_KEY = 'movies.signedIn';

export interface SessionUser {
  email: string;
  name: string;
  photo: string | null;
}

interface SessionValue {
  /** False until Firebase is configured — the site is then read-only. */
  configured: boolean;
  user: SessionUser | null;
  isOwner: boolean;
  checking: boolean;
  settings: AiSettings;
  signIn(): Promise<void>;
  signOut(): Promise<void>;
  saveSettings(s: AiSettings): Promise<void>;
}

const DEFAULT_SETTINGS: AiSettings = { openrouterKey: '', model: DEFAULT_MODEL, webSearch: true };

const SessionContext = createContext<SessionValue | null>(null);

/** `npm run dev` + `?owner`: act as the owner with in-memory saves and a mock model. Stripped from builds. */
export const DEV_OWNER = import.meta.env.DEV && new URLSearchParams(location.search).has('owner');
const DEV_USER: SessionUser = { email: 'owner@localhost', name: 'Dev owner', photo: null };

function flag(on: boolean) {
  try {
    if (on) localStorage.setItem(SIGNED_IN_KEY, '1');
    else localStorage.removeItem(SIGNED_IN_KEY);
  } catch {
    // ignore
  }
}

function hadSession(): boolean {
  try {
    return localStorage.getItem(SIGNED_IN_KEY) === '1';
  } catch {
    return false;
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const configured = Boolean(firebaseConfig);
  const [user, setUser] = useState<SessionUser | null>(DEV_OWNER ? DEV_USER : null);
  const [isOwner, setIsOwner] = useState(DEV_OWNER);
  const [checking, setChecking] = useState(configured && hadSession());
  const [settings, setSettings] = useState<AiSettings>(
    DEV_OWNER ? { ...DEFAULT_SETTINGS, openrouterKey: 'mock' } : DEFAULT_SETTINGS,
  );
  const [watching, setWatching] = useState(configured && hadSession());

  useEffect(() => {
    if (!watching) return;
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;
    void import('./auth').then(({ watchUser }) => {
      if (cancelled) return;
      unsubscribe = watchUser(async (u) => {
        if (!u) {
          setUser(null);
          setIsOwner(false);
          setChecking(false);
          flag(false);
          return;
        }
        flag(true);
        setUser({ email: u.email ?? '', name: u.displayName ?? u.email ?? '', photo: u.photoURL });
        setChecking(true);
        try {
          // Only the owner may read private/settings (see firestore.rules).
          const { readSettings } = await import('./firestore');
          const stored = await readSettings();
          setSettings({ ...DEFAULT_SETTINGS, ...stored });
          setIsOwner(true);
        } catch {
          setIsOwner(false);
        } finally {
          setChecking(false);
        }
      });
    });
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [watching]);

  const signIn = useCallback(async () => {
    const { signInWithGoogle } = await import('./auth');
    setWatching(true);
    await signInWithGoogle();
  }, []);

  const signOut = useCallback(async () => {
    const { signOut: out } = await import('./auth');
    await out();
    flag(false);
    setSettings(DEFAULT_SETTINGS);
  }, []);

  const saveSettings = useCallback(async (next: AiSettings) => {
    if (!DEV_OWNER) {
      const { writeSettings } = await import('./firestore');
      await writeSettings(next);
    }
    setSettings(next);
  }, []);

  const value = useMemo(
    () => ({ configured, user, isOwner, checking, settings, signIn, signOut, saveSettings }),
    [configured, user, isOwner, checking, settings, signIn, signOut, saveSettings],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession outside SessionProvider');
  return ctx;
}
