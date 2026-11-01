import { useEffect, useMemo, useRef, useState } from 'react';
import type { Film, FilmStatus } from '../types';
import { useLibrary } from '../lib/library';
import { useSession } from '../lib/session';
import { AiError, buildDraft, identifyFilms, type Draft } from '../lib/ai';
import { kindLabel, slugify, titles, yearLabel } from '../lib/text';
import { Poster } from './Poster';
import { Button, Icon, ImdbRating, Label, Modal, RatingPicker, Segmented, Spinner, cx, fieldClass, inputClass } from './ui';

interface Candidate extends Draft {
  include: boolean;
  /** Film already in the list with the same IMDb id. */
  existing: Film | null;
}

/** Shrinks big screenshots before sending them to the model (fewer tokens, faster). */
async function imageToDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.85);
}

export function AddDialog({
  initialText = '',
  initialStatus = 'watchlist',
  onClose,
  onOpenSettings,
  notify,
}: {
  initialText?: string;
  initialStatus?: FilmStatus;
  onClose: () => void;
  onOpenSettings: () => void;
  notify: (msg: string, tone?: 'ok' | 'error') => void;
}) {
  const { films, save } = useLibrary();
  const { settings } = useSession();
  const [text, setText] = useState(initialText);
  const [image, setImage] = useState<string | null>(null);
  const [status, setStatus] = useState<FilmStatus>(initialStatus);
  const [rating, setRating] = useState<number | null>(null);
  const [recommendedBy, setRecommendedBy] = useState('');
  const [phase, setPhase] = useState<'input' | 'thinking' | 'review' | 'saving'>('input');
  const [error, setError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const abort = useRef<AbortController | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const recommenders = useMemo(
    () => [...new Set(films.map((f) => f.recommendedBy).filter((r): r is string => Boolean(r)))].sort(),
    [films],
  );

  async function takeImage(file: File | null | undefined) {
    if (!file || !file.type.startsWith('image/')) return;
    try {
      setImage(await imageToDataUrl(file));
      setError(null);
    } catch {
      setError('Couldn’t read that image.');
    }
  }

  // Paste a screenshot anywhere while the dialog is open.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const item = [...(e.clipboardData?.items ?? [])].find((i) => i.type.startsWith('image/'));
      if (item) {
        e.preventDefault();
        void takeImage(item.getAsFile());
      }
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, []);

  useEffect(() => () => abort.current?.abort(), []);

  function existingFor(film: Film): Film | null {
    return films.find((f) => (film.imdbId && f.imdbId === film.imdbId) || f.id === film.id) ?? null;
  }

  async function find() {
    setError(null);
    setPhase('thinking');
    const ctrl = new AbortController();
    abort.current = ctrl;
    try {
      const found = await identifyFilms({ text, image }, settings, ctrl.signal);
      if (!found.length) throw new AiError('No film recognised. Add a detail (year, director, an actor) and try again.');
      const drafts = await Promise.all(
        found.slice(0, 12).map((ai) =>
          buildDraft(ai, { status, rating: found.length === 1 ? rating : null, recommendedBy, sourceText: text }),
        ),
      );
      setCandidates(
        drafts.map((d) => {
          const existing = existingFor(d.film);
          const upgrade = existing?.status === 'watchlist' && status === 'watched';
          return { ...d, existing, include: !existing || upgrade };
        }),
      );
      setPhase('review');
    } catch (e) {
      if (ctrl.signal.aborted) return setPhase('input');
      setError(e instanceof Error ? e.message : 'Something went wrong.');
      setPhase('input');
    }
  }

  function update(i: number, patch: Partial<Candidate> | ((c: Candidate) => Partial<Candidate>)) {
    setCandidates((cs) => cs.map((c, j) => (j === i ? { ...c, ...(typeof patch === 'function' ? patch(c) : patch) } : c)));
  }

  async function saveAll() {
    const chosen = candidates.filter((c) => c.include);
    if (!chosen.length) return;
    setPhase('saving');
    const now = new Date().toISOString();
    const out = chosen.map(({ film, existing }) =>
      existing
        ? {
            ...existing,
            status: film.status,
            myRating: film.myRating ?? existing.myRating,
            watchedAt: film.status === 'watched' ? (existing.watchedAt ?? now) : null,
          }
        : film,
    );
    try {
      await save(out);
      const name = titles(out[0]).main;
      notify(
        out.length === 1
          ? `${status === 'watched' ? 'Added to Watched' : 'Added'}: ${name}`
          : `Added ${out.length} films`,
      );
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Saving failed.');
      setPhase('review');
    }
  }

  /** Fallback when AI is unavailable: save the title as typed, flagged for review. */
  async function savePlain() {
    const title = text.trim().split('\n')[0].slice(0, 120);
    if (!title) return;
    const now = new Date().toISOString();
    const film: Film = {
      id: `${slugify(title)}-${Date.now().toString(36)}`,
      status,
      myRating: status === 'watched' ? rating : null,
      recommendedBy: recommendedBy.trim() || null,
      note: null,
      originalTitle: title,
      englishTitle: null,
      russianTitle: null,
      originalLanguage: /[а-яё]/i.test(title) ? 'ru' : 'en',
      year: null,
      endYear: null,
      kind: 'movie',
      genres: [],
      countries: [],
      directors: [],
      cast: [],
      runtime: null,
      imdbId: null,
      imdbRating: null,
      poster: null,
      description: null,
      addedAt: now,
      watchedAt: status === 'watched' ? now : null,
      source: 'manual',
      sourceText: [text.trim().slice(0, 300)],
      needsReview: true,
      reviewNote: 'Saved without AI — use “Fix with AI” to fill in the details.',
      hidden: false,
    };
    setPhase('saving');
    try {
      await save([film]);
      notify(`Saved “${title}” — details pending`);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Saving failed.');
      setPhase('input');
    }
  }

  const noKey = !settings.openrouterKey;
  const chosenCount = candidates.filter((c) => c.include).length;

  if (phase === 'review' || (phase === 'saving' && candidates.length)) {
    return (
      <Modal
        wide
        onClose={onClose}
        title={candidates.length === 1 ? 'Found it' : `Found ${candidates.length} films`}
        footer={
          <>
            <Button variant="ghost" className="mr-auto" onClick={() => setPhase('input')} disabled={phase === 'saving'}>
              Back
            </Button>
            <Button variant="primary" onClick={saveAll} disabled={!chosenCount || phase === 'saving'}>
              {phase === 'saving' ? <Spinner /> : <Icon.Check />}
              {status === 'watched' ? 'Save to Watched' : chosenCount > 1 ? `Add ${chosenCount} films` : 'Add to list'}
            </Button>
          </>
        }
      >
        {error && <p className="mb-3 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
        <ul className="space-y-3">
          {candidates.map((c, i) => {
            const { main, sub } = titles(c.film);
            const kind = kindLabel(c.film.kind);
            const sameStatus = c.existing && c.existing.status === c.film.status;
            const alreadySeen = c.existing?.status === 'watched' && c.film.status === 'watchlist';
            const locked = Boolean(sameStatus || alreadySeen);
            return (
              <li
                key={c.film.id + i}
                className={cx(
                  'rounded-2xl border p-3 transition',
                  c.include ? 'border-accent/60 bg-accent/5' : 'border-line',
                )}
              >
                <div className="flex gap-3">
                  {candidates.length > 1 && (
                    <input
                      type="checkbox"
                      checked={c.include}
                      disabled={locked}
                      onChange={(e) => update(i, { include: e.target.checked })}
                      className="mt-1 size-5 shrink-0 accent-[var(--accent)]"
                      aria-label={`Include ${main}`}
                    />
                  )}
                  <Poster film={c.film} className="aspect-[2/3] w-16 shrink-0 rounded-lg sm:w-20" />
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold leading-snug">
                      {main}
                      {sub && <span className="font-normal text-muted"> · {sub}</span>}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] text-muted">
                      {yearLabel(c.film) && <span>{yearLabel(c.film)}</span>}
                      {kind && <span>{kind}</span>}
                      <ImdbRating value={c.film.imdbRating} imdbId={c.film.imdbId} />
                      {c.film.genres.length > 0 && <span>{c.film.genres.slice(0, 3).join(', ')}</span>}
                      {c.film.directors.length > 0 && <span>dir. {c.film.directors.slice(0, 2).join(', ')}</span>}
                    </div>
                    {c.film.description && <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">{c.film.description}</p>}
                    <div className="mt-2 flex flex-wrap gap-2 text-[12px]">
                      {!c.matched && (
                        <span className="rounded-full bg-danger/10 px-2 py-0.5 font-medium text-danger">
                          Not found on IMDb — saved for review
                        </span>
                      )}
                      {c.confidence < 0.6 && (
                        <span className="rounded-full bg-surface-2 px-2 py-0.5 text-muted">AI isn’t sure — check it</span>
                      )}
                      {c.existing && sameStatus && (
                        <span className="rounded-full bg-surface-2 px-2 py-0.5 text-muted">
                          Already in {c.existing.status === 'watched' ? 'Watched' : 'Want to watch'}
                        </span>
                      )}
                      {alreadySeen && (
                        <span className="rounded-full bg-surface-2 px-2 py-0.5 text-muted">
                          You’ve watched it{c.existing?.myRating ? ` (rated ${c.existing.myRating})` : ''}
                        </span>
                      )}
                      {c.existing?.status === 'watchlist' && c.film.status === 'watched' && (
                        <span className="rounded-full bg-good/15 px-2 py-0.5 font-medium text-good">Moves from your watchlist</span>
                      )}
                    </div>
                  </div>
                </div>
                {c.include && (
                  <div className="mt-3 space-y-3 border-t border-line pt-3">
                    {c.film.status === 'watched' ? (
                      <div>
                        <Label hint="optional">Your rating</Label>
                        <RatingPicker
                          value={c.film.myRating}
                          onPick={(r) => update(i, (cur) => ({ film: { ...cur.film, myRating: cur.film.myRating === r ? null : r } }))}
                        />
                      </div>
                    ) : (
                      <div className="flex items-center gap-3">
                        <span className="shrink-0 text-[13px] text-muted">Recommended by</span>
                        <input
                          className={cx(fieldClass, 'w-full rounded-lg bg-bg px-3 py-1.5 text-sm')}
                          list="recommenders"
                          value={c.film.recommendedBy ?? ''}
                          placeholder="nobody / me"
                          onChange={(e) => update(i, (cur) => ({ film: { ...cur.film, recommendedBy: e.target.value || null } }))}
                        />
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        <datalist id="recommenders">
          {recommenders.map((r) => (
            <option key={r} value={r} />
          ))}
        </datalist>
      </Modal>
    );
  }

  const thinking = phase === 'thinking';
  return (
    <Modal
      onClose={onClose}
      title={status === 'watched' ? 'I watched…' : 'Add a film'}
      footer={
        <>
          {error && !thinking && text.trim() && (
            <Button variant="ghost" size="sm" className="mr-auto" onClick={savePlain}>
              Save title without AI
            </Button>
          )}
          {thinking ? (
            <Button variant="ghost" onClick={() => abort.current?.abort()}>
              Cancel
            </Button>
          ) : null}
          <Button variant="primary" onClick={find} disabled={thinking || noKey || (!text.trim() && !image)}>
            {thinking ? <Spinner /> : <Icon.Sparkle />}
            {thinking ? 'Looking it up…' : 'Find with AI'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {noKey && (
          <div className="flex items-center gap-3 rounded-xl border border-accent/40 bg-accent/8 px-3 py-2.5 text-[13.5px]">
            <span className="flex-1">Add your OpenRouter API key to use AI.</span>
            <Button size="sm" variant="primary" onClick={onOpenSettings}>
              <Icon.Gear /> Settings
            </Button>
          </div>
        )}

        <div>
          <Label hint="or paste a screenshot (⌘V / Ctrl+V)">Film name, message or link</Label>
          <textarea
            autoFocus
            rows={3}
            value={text}
            disabled={thinking}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !noKey && (text.trim() || image)) void find();
            }}
            placeholder="e.g. «Левиафан», “that Jarmusch one Masha liked”, or paste a whole message"
            className={cx(inputClass, 'resize-none')}
          />
        </div>

        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            void takeImage(e.dataTransfer.files?.[0]);
          }}
        >
          {image ? (
            <div className="relative inline-block">
              <img src={image} alt="Pasted screenshot" className="max-h-48 rounded-xl border border-line" />
              <button
                type="button"
                onClick={() => setImage(null)}
                className="absolute -right-2 -top-2 grid size-7 place-items-center rounded-full bg-ink text-bg shadow"
                aria-label="Remove screenshot"
              >
                <Icon.X className="size-4" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              disabled={thinking}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-line px-3 py-3 text-[13.5px] text-muted transition hover:border-faint hover:text-ink"
            >
              <Icon.Image /> Drop, paste or choose a screenshot
            </button>
          )}
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              void takeImage(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </div>

        <div className="space-y-3">
          <Segmented
            value={status}
            onChange={setStatus}
            options={[
              { value: 'watchlist', label: 'Want to watch' },
              { value: 'watched', label: 'Already watched' },
            ]}
          />
          {status === 'watched' ? (
            <div>
              <Label hint="optional — you can rate later">Your rating</Label>
              <RatingPicker value={rating} onPick={(r) => setRating(rating === r ? null : r)} />
            </div>
          ) : (
            <div>
              <Label hint="optional">Recommended by</Label>
              <input
                className={inputClass}
                list="recommenders-input"
                value={recommendedBy}
                onChange={(e) => setRecommendedBy(e.target.value)}
                placeholder="Who told you about it?"
              />
              <datalist id="recommenders-input">
                {recommenders.map((r) => (
                  <option key={r} value={r} />
                ))}
              </datalist>
            </div>
          )}
        </div>

        {thinking && (
          <p className="flex items-center gap-2 text-[13px] text-muted">
            <Spinner className="text-accent" />
            {settings.webSearch ? 'Identifying and checking the web' : 'Identifying'} with {settings.model.split('/')[1]} — usually 5–20 seconds.
          </p>
        )}
        {error && <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
      </div>
    </Modal>
  );
}
