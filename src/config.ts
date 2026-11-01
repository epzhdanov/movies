import type { FirebaseOptions } from 'firebase/app';

export const SITE = {
  title: 'Movies',
  owner: 'Evgeniy Zhdanov',
};

// Firebase web-app config (console → Project settings → Your apps → SDK setup).
// These values are public identifiers and safe to commit; access is enforced by
// firestore.rules. While this is null the site runs read-only from the built-in
// library in src/data/films.seed.json and the sign-in button is hidden.
export const firebaseConfig: FirebaseOptions | null = {
  apiKey: 'AIzaSyAL5ibthXPXCrPN0CWG7AjnXzjKJpUabOI',
  authDomain: 'movies-ezhdanov.firebaseapp.com',
  projectId: 'movies-ezhdanov',
  storageBucket: 'movies-ezhdanov.firebasestorage.app',
  messagingSenderId: '28693648990',
  appId: '1:28693648990:web:2e9772499a8e98822dc6cf',
};

export const DEFAULT_MODEL = 'anthropic/claude-haiku-5.5';

export const MODEL_OPTIONS = [
  { id: 'anthropic/claude-haiku-5.5', label: 'Claude Haiku 5.5 — recommended (fast, cheap, reads screenshots)' },
  { id: 'openai/gpt-6-luna', label: 'GPT-6 Luna — same price, good alternative' },
  { id: 'google/gemini-3.8-flash', label: 'Gemini 3.8 Flash — strong vision, ~8× the price' },
  { id: 'anthropic/claude-sonnet-5.5', label: 'Claude Sonnet 5.5 — for hard cases, ~20× the price' },
];
