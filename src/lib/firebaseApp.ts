import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { firebaseConfig } from '../config';

export function firebaseApp(): FirebaseApp {
  if (!firebaseConfig) throw new Error('Firebase is not configured (src/config.ts).');
  return getApps().length ? getApp() : initializeApp(firebaseConfig);
}
