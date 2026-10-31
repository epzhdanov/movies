// Firestore access. Loaded lazily so the read-only site stays light.
// Layout:  films/{id}       one document per film (public read, owner write)
//          meta/library     { version } — bumped on every write so visitors can
//                            reuse their cached copy until something changes
//          private/settings OpenRouter key + model (owner only)
import {
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  increment,
  serverTimestamp,
  setDoc,
  writeBatch,
} from 'firebase/firestore/lite';
import { firebaseApp } from './firebaseApp';
import type { AiSettings, Film } from '../types';

const db = () => getFirestore(firebaseApp());

export async function fetchLibraryVersion(): Promise<number | null> {
  const snap = await getDoc(doc(db(), 'meta', 'library'));
  return snap.exists() ? Number(snap.data().version ?? 0) : null;
}

export async function fetchFilms(): Promise<Film[]> {
  const snap = await getDocs(collection(db(), 'films'));
  return snap.docs.map((d) => ({ ...(d.data() as Film), id: d.id }));
}

/** Firestore rejects `undefined`, so drop those keys. */
function clean<T extends object>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T;
}

export async function saveFilms(films: Film[], deleteIds: string[] = []): Promise<void> {
  // A batch holds 500 writes; keep one slot for the version bump.
  const ops = [...films.map((f) => ({ f })), ...deleteIds.map((id) => ({ id }))];
  for (let i = 0; i < ops.length || i === 0; i += 400) {
    const batch = writeBatch(db());
    for (const op of ops.slice(i, i + 400)) {
      if ('f' in op) batch.set(doc(db(), 'films', op.f.id), clean(op.f));
      else batch.delete(doc(db(), 'films', op.id));
    }
    batch.set(doc(db(), 'meta', 'library'), { version: increment(1), updatedAt: serverTimestamp() }, { merge: true });
    await batch.commit();
  }
}

/** Throws a permission error for anyone except the owner — that's how we detect the owner. */
export async function readSettings(): Promise<Partial<AiSettings>> {
  const snap = await getDoc(doc(db(), 'private', 'settings'));
  return snap.exists() ? (snap.data() as Partial<AiSettings>) : {};
}

export async function writeSettings(settings: AiSettings): Promise<void> {
  await setDoc(doc(db(), 'private', 'settings'), settings);
}
