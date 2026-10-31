// Google sign-in. Loaded only when someone signs in (or has signed in before).
import { GoogleAuthProvider, getAuth, onAuthStateChanged, signInWithPopup, signOut as fbSignOut, type User } from 'firebase/auth';
import { firebaseApp } from './firebaseApp';

export function watchUser(callback: (user: User | null) => void): () => void {
  return onAuthStateChanged(getAuth(firebaseApp()), callback);
}

export async function signInWithGoogle(): Promise<void> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  await signInWithPopup(getAuth(firebaseApp()), provider);
}

export async function signOut(): Promise<void> {
  await fbSignOut(getAuth(firebaseApp()));
}
