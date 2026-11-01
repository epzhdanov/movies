import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { Film } from '../types';
import { useLibrary } from '../lib/library';
import { useSession } from '../lib/session';
import { AiError, buildDraft, suggestFilms, type Draft } from '../lib/ai';
import { kindLabel, titles, yearLabel } from '../lib/text';
import { Poster } from './Poster';
import { Button, Icon, ImdbRating, Label, Modal, Spinner, cx, inputClass } from './ui';

interface Option extends Draft {
  /** Another entry in my list that is this same film: picking it merges the two. */
  existing: Film | null;
}

/** 2011 · Series · France · dir. Olivier Nakache · IMDb 8.5 */
function Facts({ film }: { film: Film }) {
  const kind = kindLabel(film.kind);
  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] text-muted">
      {yearLabel(film) && <span className="tabular-nums">{yearLabel(film)}</span>}
      {kind && <span>{kind}</span>}
      {film.countries.length > 0 && <span>{film.countries.slice(0, 2).join(', ')}</span>}
      {film.directors.length > 0 && <span>dir. {film.directors.slice(0, 2).join(', ')}</span>}
      <ImdbRating value={film.imdbRating} imdbId={film.imdbId} />
    </div>
  );
}

function Title({ film }: { film: Film }) {
  const { main, sub } = titles(film);
  return (
    <div className="font-semibold leading-snug">
      {main}
      {sub && <span className="font-normal text-muted"> · {sub}</span>}
    </div>
  );
}

/**
 * "Wrong film?" and "Fix with AI": the AI suggests up to five films the entry may mean,
 * and the one I pick replaces the match, keeping my rating, notes and recommender.
 */
export function FixDialog({
  film,
  onClose,
  onDone,
  onOpenSettings,
  notify,
}: {
  film: Film;
  onClose: () => void;
  /** Gets the saved film; its id changes along with the IMDb match. */
  onDone: (film: Film) => void;
  onOpenSettings: () => void;
  notify: (msg: string, tone?: 'ok' | 'error') => void;
}) {
  const { films, save } = useLibrary();
  const { settings } = useSession();
  // A film added from a pasted message keeps the whole message as its note; too long for this field.
  const written = film.sourceText.join(' / ');
  const [text, setText] = useState(written && written.length <= 80 ? written : film.originalTitle);
  const [hint, setHint] = useState('');
  const [busy, setBusy] = useState<'search' | 'save' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [options, setOptions] = useState<Option[]>([]);
  const [picked, setPicked] = useState<number | null>(null);
  /** Suggestions I passed over; the next search steers away from them. */
  const shown = useRef(new Map<string, Film>());
  const abort = useRef<AbortController | null>(null);
  const hintInput = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);

  // Runs after Modal's own focus handling, so the hint field gets the cursor.
  useEffect(() => hintInput.current?.focus(), []);
  useEffect(() => () => abort.current?.abort(), []);

  const existingFor = (f: Film) =>
    films.find((x) => x.id !== film.id && ((f.imdbId && x.imdbId === f.imdbId) || x.id === f.id)) ?? null;

  const noKey = !settings.openrouterKey;
  const searching = busy === 'search';
  const canSearch = !busy && !noKey && Boolean(text.trim() || hint.trim());

  async function search() {
    if (!canSearch) return;
    setError(null);
    setBusy('search');
    for (const o of options) shown.current.set(o.film.id, o.film);
    const ctrl = new AbortController();
    abort.current = ctrl;
    try {
      const found = await suggestFilms(film, { text, hint, shown: [...shown.current.values()] }, settings, ctrl.signal);
      const drafts = await Promise.all(
        found
          .slice(0, 5)
          .map((ai) => buildDraft(ai, { status: film.status, rating: null, recommendedBy: '', sourceText: '' })),
      );
      // Drop the rejected match and duplicates: two suggestions can land on the same IMDb title.
      const seen = new Set(film.imdbId ? [film.imdbId] : []);
      const fresh = drafts.filter(({ film: f }) => {
        const key = f.imdbId ?? f.id;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      if (!fresh.length) throw new AiError('Nothing else found. Add a detail (country, year, an actor) and search again.');
      setOptions(fresh.map((d) => ({ ...d, existing: existingFor(d.film) })));
      setPicked(null);
      requestAnimationFrame(() => list.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    } catch (e) {
      if (!ctrl.signal.aborted) setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(null);
    }
  }

  async function apply() {
    const o = picked === null ? null : options[picked];
    if (!o) return;
    setBusy('save');
    const other = o.existing;
    // Keep everything I entered myself; take the identification and metadata from the pick.
    const fixed: Film = other
      ? {
          ...other,
          status: other.status === 'watched' || film.status === 'watched' ? 'watched' : 'watchlist',
          myRating: other.myRating ?? film.myRating,
          watchedAt: other.watchedAt ?? film.watchedAt,
          recommendedBy: other.recommendedBy ?? film.recommendedBy,
          note: other.note ?? film.note,
          addedAt: other.addedAt < film.addedAt ? other.addedAt : film.addedAt,
          sourceText: [...new Set([...other.sourceText, ...film.sourceText])],
        }
      : {
          ...o.film,
          status: film.status,
          myRating: film.myRating,
          watchedAt: film.watchedAt,
          recommendedBy: film.recommendedBy,
          note: film.note,
          addedAt: film.addedAt,
          source: film.source,
          sourceText: film.sourceText,
        };
    try {
      await save([fixed], fixed.id === film.id ? [] : [film.id]);
      notify(`${other ? 'Merged into' : 'Fixed:'} ${titles(fixed).main}`);
      onDone(fixed);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Saving failed.');
      setBusy(null);
    }
  }

  const onEnter = (e: KeyboardEvent) => {
    if (e.key === 'Enter') void search();
  };

  return (
    <Modal
      wide
      title="Find the right film"
      onClose={onClose}
      footer={
        <>
          {searching ? (
            <Button variant="ghost" onClick={() => abort.current?.abort()}>
              Cancel
            </Button>
          ) : (
            !options.length && (
              <Button variant="ghost" onClick={onClose}>
                Cancel
              </Button>
            )
          )}
          <Button variant={options.length ? 'secondary' : 'primary'} onClick={search} disabled={!canSearch}>
            {searching ? <Spinner /> : <Icon.Sparkle />}
            {searching ? 'Searching…' : options.length ? 'Search again' : 'Find options'}
          </Button>
          {options.length > 0 && (
            <Button variant="primary" onClick={apply} disabled={picked === null || Boolean(busy)}>
              {busy === 'save' ? <Spinner /> : <Icon.Check />} Use this film
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex gap-3 rounded-2xl bg-surface-2 p-3">
          <Poster film={film} className="aspect-[2/3] w-11 shrink-0 rounded-md" />
          <div className="min-w-0 text-[14px]">
            <div className="text-[11px] font-medium uppercase tracking-wide text-faint">
              {film.imdbId ? 'Matched now' : film.hidden ? 'Not identified yet' : 'Not confirmed on IMDb'}
            </div>
            <Title film={film} />
            <Facts film={film} />
          </div>
        </div>

        {noKey && (
          <div className="flex items-center gap-3 rounded-xl border border-accent/40 bg-accent/8 px-3 py-2.5 text-[13.5px]">
            <span className="flex-1">Add your OpenRouter API key to use AI.</span>
            <Button size="sm" variant="primary" onClick={onOpenSettings}>
              <Icon.Gear /> Settings
            </Button>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <Label hint="as you wrote it">Title</Label>
            <input className={inputClass} value={text} disabled={searching} onChange={(e) => setText(e.target.value)} onKeyDown={onEnter} />
          </label>
          <label className="block">
            <Label hint="any language">What do you know about it?</Label>
            <input
              ref={hintInput}
              className={inputClass}
              value={hint}
              disabled={searching}
              onChange={(e) => setHint(e.target.value)}
              onKeyDown={onEnter}
              placeholder="e.g. the French one, a year, an actor"
            />
          </label>
        </div>

        {searching && (
          <p className="flex items-center gap-2 text-[13px] text-muted">
            <Spinner className="text-accent" />
            {settings.webSearch ? 'Searching the web' : 'Thinking'} with {settings.model.split('/')[1]} — usually 10–30 seconds.
          </p>
        )}
        {error && <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}

        {options.length > 0 && (
          <div ref={list} className="scroll-mt-3">
            <Label>Which one did you mean?</Label>
            <div role="radiogroup" aria-label="Suggested films" className={cx('space-y-2.5', searching && 'opacity-50')}>
              {options.map((o, i) => {
                const on = picked === i;
                return (
                  <label
                    key={o.film.id}
                    className={cx(
                      'flex cursor-pointer gap-3 rounded-2xl border p-3 transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent/40',
                      on ? 'border-accent bg-accent/8' : 'border-line hover:border-faint',
                    )}
                  >
                    <input
                      type="radio"
                      name="fix-option"
                      className="sr-only"
                      checked={on}
                      disabled={Boolean(busy)}
                      onChange={() => setPicked(i)}
                    />
                    <Poster film={o.film} className="aspect-[2/3] w-14 shrink-0 rounded-lg sm:w-16" />
                    <div className="min-w-0 flex-1">
                      <Title film={o.film} />
                      <Facts film={o.film} />
                      {o.film.description && <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">{o.film.description}</p>}
                      {(!o.matched || o.existing) && (
                        <div className="mt-2 flex flex-wrap gap-2 text-[12px]">
                          {!o.matched && (
                            <span className="rounded-full bg-danger/10 px-2 py-0.5 font-medium text-danger">
                              Not found on IMDb — stays in Needs review
                            </span>
                          )}
                          {o.existing && (
                            <span className="rounded-full bg-surface-2 px-2 py-0.5 text-muted">
                              Already in {o.existing.status === 'watched' ? 'Watched' : 'Want to watch'}
                              {o.existing.myRating ? ` (rated ${o.existing.myRating})` : ''} — the two will be merged
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <span
                      aria-hidden="true"
                      className={cx(
                        'mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border-2 transition',
                        on ? 'border-accent bg-accent text-accent-ink' : 'border-line',
                      )}
                    >
                      {on && <Icon.Check className="size-3" />}
                    </span>
                  </label>
                );
              })}
            </div>
            <p className="mt-3 text-[13px] text-faint">None of these? Add a detail above and search again.</p>
          </div>
        )}
      </div>
    </Modal>
  );
}
