# movies.ezhdanov.com

Films I've watched (with my 1–10 ratings) and films friends recommended that I want to see.
Anyone can browse; only the owner signs in (Google) to add films, rate them and use the AI helper.

## How it works

| Piece | What it does |
| --- | --- |
| **GitHub Pages** | Hosts the static site (React + Vite + Tailwind), deployed by `.github/workflows/deploy.yml` on every push to `main`. |
| **Firebase** (free Spark plan) | Google sign-in + Firestore database. `films/*` is public-read, owner-write; `private/settings` (OpenRouter key) is owner-only — see `firestore.rules`. |
| **OpenRouter** | AI that identifies films from a title, a pasted message or a screenshot. Called from the owner's browser with the key stored in `private/settings`. Default model: `anthropic/claude-haiku-5.5` with web search. |
| **Cinemeta** (open IMDb-based API) | Confirms the IMDb id and supplies IMDb rating, genres, cast, runtime and poster. Wikipedia is the poster fallback. |

Until `firebaseConfig` is filled in `src/config.ts`, the site runs read-only from the built-in library
(`src/data/films.seed.json`) and the sign-in button is hidden.

Visitors' browsers cache the list and only re-download it when `meta/library.version` changes, so a page
view usually costs one Firestore read (free tier: 50,000/day).

## One-time setup

1. **Firebase** — [console.firebase.google.com](https://console.firebase.google.com) → *Add project* (Analytics off).
   - *Build → Authentication → Get started → Sign-in method → Google → Enable*.
   - *Authentication → Settings → Authorized domains → Add* `movies.ezhdanov.com` (and `epzhdanov.github.io`).
   - *Build → Firestore Database → Create database* (production mode, a region near you).
   - *Firestore → Rules*: paste `firestore.rules` with `OWNER_EMAIL` replaced by your Google address → *Publish*.
   - *Project settings → Your apps → Web (`</>`)* → register → copy the `firebaseConfig` object into `src/config.ts`.
2. **Domain** — at the DNS host for `ezhdanov.com` (WordPress.com → Domains → DNS records) add
   `CNAME  movies  →  epzhdanov.github.io`. Then in the repo: *Settings → Pages → Custom domain* `movies.ezhdanov.com`,
   and tick *Enforce HTTPS* once the certificate is issued.
3. **OpenRouter** — create a key at [openrouter.ai/settings/keys](https://openrouter.ai/settings/keys) (set a monthly
   credit limit), add a few dollars of credit, then on the site: *Sign in → avatar → Settings → paste key → Test → Save*.
4. **Import** — the first time you sign in, click *Import library* to copy the built-in films into Firestore.

## Using it

- **Add film** — type a title (any language), paste a friend's message, or paste/drop a screenshot (⌘V).
  The AI finds every film in it; you confirm, set who recommended it, and save.
- **I watched…** — start typing; pick the film from your watchlist and tap a rating. Not in the list?
  *Find with AI* adds it straight to Watched with your rating.
- **Wrong film?** (owner only) — open any film → *Wrong film? Find the right one*, add a hint ("the French one",
  a year, an actor) and the AI suggests up to five films, each checked on IMDb. The one you pick replaces the match
  and keeps your rating, notes and who recommended it; if it's already in the list, the two entries are merged.
- **Needs review** (owner only) — matches the AI/import wasn't sure about. Open one → *It's correct* or *Fix with AI*
  (the same option search).
- **Settings** — OpenRouter key and model, web search on/off, refresh all IMDb ratings, download a JSON backup.

Titles follow one rule: Russian and English films show their original title; anything else shows
*original title · English title*. Search matches original, English and Russian titles, directors and recommenders.

## Development

```bash
npm install
npm run dev          # http://localhost:5173
```

Open `http://localhost:5173/?owner` to act as the owner locally: saves stay in memory and AI lookups use a
mock model backed by real Cinemeta data (dev server only — stripped from production builds).

`data/curated.json` is the hand-curated import (identification, descriptions, ratings from Obsidian, who
recommended what). `npm run enrich` rebuilds `src/data/films.seed.json` from it with IMDb ids, ratings, genres,
cast and posters.
