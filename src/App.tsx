import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Film, FilmStatus } from './types';
import { SITE } from './config';
import { LibraryProvider, useLibrary } from './lib/library';
import { SessionProvider, useSession } from './lib/session';
import { matches, titles } from './lib/text';
import { FilmCard } from './components/FilmCard';
import { WatchedList } from './components/WatchedList';
import { FilmDialog } from './components/FilmDialog';
import { AddDialog } from './components/AddDialog';
import { WatchedDialog } from './components/WatchedDialog';
import { RateDialog } from './components/RateDialog';
import { EditDialog } from './components/EditDialog';
import { SettingsDialog } from './components/SettingsDialog';
import { SignInDialog } from './components/SignInDialog';
import { Button, Chip, Icon, Spinner, cx, fieldClass, useToast } from './components/ui';

type Tab = 'watched' | 'watchlist';
const TAB_HASH: Record<Tab, string> = { watched: '#/watched', watchlist: '#/to-watch' };

type DialogState =
  | { type: 'add'; text?: string; status?: FilmStatus; replaceId?: string }
  | { type: 'watched' }
  | { type: 'rate'; id: string }
  | { type: 'edit'; id: string }
  | { type: 'settings' }
  | { type: 'signin' };

type WatchedSort = 'rating' | 'recent' | 'title' | 'year' | 'imdb';
type WatchlistSort = 'added' | 'imdb' | 'year' | 'title';

function parseHash(): { tab: Tab | null; filmId: string | null } {
  const h = location.hash;
  if (h.startsWith('#/film/')) return { tab: null, filmId: decodeURIComponent(h.slice(7)) };
  if (h === TAB_HASH.watchlist) return { tab: 'watchlist', filmId: null };
  if (h === TAB_HASH.watched) return { tab: 'watched', filmId: null };
  return { tab: null, filmId: null };
}

const byTitle = (a: Film, b: Film) => titles(a).main.localeCompare(titles(b).main, 'ru');
const byImdb = (a: Film, b: Film) => (b.imdbRating ?? -1) - (a.imdbRating ?? -1);
const byYear = (a: Film, b: Film) => (b.year ?? 0) - (a.year ?? 0);

function UserMenu({ onSettings }: { onSettings: () => void }) {
  const { user, isOwner, signOut } = useSession();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  if (!user) return null;
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="grid size-10 place-items-center overflow-hidden rounded-full border border-line bg-surface-2 text-sm font-semibold"
        aria-label="Account"
      >
        {user.photo ? <img src={user.photo} alt="" referrerPolicy="no-referrer" className="size-full object-cover" /> : user.name.slice(0, 1)}
      </button>
      {open && (
        <div className="absolute right-0 top-12 z-40 w-60 overflow-hidden rounded-2xl border border-line bg-surface p-1.5 shadow-xl animate-rise">
          <div className="px-3 py-2">
            <div className="truncate text-sm font-medium">{user.name}</div>
            <div className="truncate text-[12px] text-faint">{isOwner ? 'Owner' : 'View only'}</div>
          </div>
          {isOwner && (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onSettings();
              }}
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm hover:bg-surface-2"
            >
              <Icon.Gear /> Settings
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              void signOut();
            }}
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm hover:bg-surface-2"
          >
            <Icon.Out /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}

function Movies() {
  const { films, loading, needsImport, error, importSeed } = useLibrary();
  const { configured, user, isOwner, checking } = useSession();
  const [toast, notify] = useToast();

  const initial = parseHash();
  const [tab, setTab] = useState<Tab>(() => {
    if (initial.tab) return initial.tab;
    // A shared film link opens on the list that film belongs to.
    const linked = initial.filmId ? films.find((f) => f.id === initial.filmId) : null;
    return linked?.status === 'watchlist' ? 'watchlist' : 'watched';
  });
  const [filmId, setFilmId] = useState<string | null>(initial.filmId);
  const [dialog, setDialog] = useState<DialogState | null>(null);

  const [query, setQuery] = useState('');
  const [watchedSort, setWatchedSort] = useState<WatchedSort>('rating');
  const [listSort, setListSort] = useState<WatchlistSort>('added');
  const [genre, setGenre] = useState<string | null>(null);
  const [recommender, setRecommender] = useState<string>('');
  const [kind, setKind] = useState<'all' | 'film' | 'series'>('all');
  const [reviewOnly, setReviewOnly] = useState(false);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    const sync = () => {
      const h = parseHash();
      if (h.tab) setTab(h.tab);
      setFilmId(h.filmId);
    };
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);

  const switchTab = (t: Tab) => {
    setTab(t);
    history.replaceState(null, '', TAB_HASH[t]);
  };
  const openFilm = useCallback((f: Film) => {
    history.pushState(null, '', `#/film/${encodeURIComponent(f.id)}`);
    setFilmId(f.id);
  }, []);
  const closeFilm = () => {
    history.replaceState(null, '', TAB_HASH[tab]);
    setFilmId(null);
  };

  useEffect(() => {
    if (!isOwner) setReviewOnly(false);
  }, [isOwner]);

  const visible = useMemo(() => films.filter((f) => isOwner || !f.hidden), [films, isOwner]);
  const reviewCount = useMemo(() => visible.filter((f) => f.needsReview || f.hidden).length, [visible]);

  const searched = useMemo(
    () => visible.filter((f) => (reviewOnly ? f.needsReview || f.hidden : !f.hidden) && matches(f, query)),
    [visible, query, reviewOnly],
  );
  const watchedAll = useMemo(() => searched.filter((f) => f.status === 'watched'), [searched]);
  const watchlistBase = useMemo(() => searched.filter((f) => f.status === 'watchlist'), [searched]);

  const watched = useMemo(() => {
    const list = [...watchedAll];
    if (watchedSort === 'rating') list.sort((a, b) => (b.myRating ?? -1) - (a.myRating ?? -1) || byTitle(a, b));
    if (watchedSort === 'recent')
      list.sort((a, b) => (b.watchedAt ?? b.addedAt).localeCompare(a.watchedAt ?? a.addedAt));
    if (watchedSort === 'title') list.sort(byTitle);
    if (watchedSort === 'year') list.sort((a, b) => byYear(a, b) || byTitle(a, b));
    if (watchedSort === 'imdb') list.sort((a, b) => byImdb(a, b) || byTitle(a, b));
    return list;
  }, [watchedAll, watchedSort]);

  const genres = useMemo(() => {
    const counts = new Map<string, number>();
    for (const f of watchlistBase) for (const g of f.genres) counts.set(g, (counts.get(g) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [watchlistBase]);

  const recommenders = useMemo(() => {
    const counts = new Map<string, number>();
    for (const f of watchlistBase) if (f.recommendedBy) counts.set(f.recommendedBy, (counts.get(f.recommendedBy) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ru'));
  }, [watchlistBase]);

  const watchlist = useMemo(() => {
    const list = watchlistBase.filter(
      (f) =>
        (!genre || f.genres.includes(genre)) &&
        (!recommender || (recommender === '-' ? !f.recommendedBy : f.recommendedBy === recommender)) &&
        (kind === 'all' || (kind === 'series') === (f.kind === 'series' || f.kind === 'miniseries')),
    );
    if (listSort === 'added') list.sort((a, b) => b.addedAt.localeCompare(a.addedAt));
    if (listSort === 'imdb') list.sort((a, b) => byImdb(a, b) || byTitle(a, b));
    if (listSort === 'year') list.sort((a, b) => byYear(a, b) || byTitle(a, b));
    if (listSort === 'title') list.sort(byTitle);
    return list;
  }, [watchlistBase, genre, recommender, kind, listSort]);

  const filtersOn = Boolean(genre || recommender || kind !== 'all' || reviewOnly);
  const clearFilters = () => {
    setGenre(null);
    setRecommender('');
    setKind('all');
    setReviewOnly(false);
    setQuery('');
  };

  const openedFilm = filmId ? films.find((f) => f.id === filmId) ?? null : null;

  // A link to a film that no longer exists (deleted or replaced) falls back to the list.
  useEffect(() => {
    if (filmId && !openedFilm && !loading) {
      history.replaceState(null, '', TAB_HASH[tab]);
      setFilmId(null);
    }
  }, [filmId, openedFilm, loading, tab]);
  const dialogFilm = dialog && 'id' in dialog ? films.find((f) => f.id === dialog.id) ?? null : null;
  const replaceFilm = dialog?.type === 'add' && dialog.replaceId ? films.find((f) => f.id === dialog.replaceId) ?? null : null;
  const canEdit = isOwner && !needsImport;
  const otherCount = tab === 'watched' ? watchlistBase.length : watchedAll.length;

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-line/70 bg-bg/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-2 px-4 sm:gap-3">
          <a href={TAB_HASH[tab]} className="mr-auto flex items-center gap-2.5" onClick={(e) => { e.preventDefault(); clearFilters(); }}>
            <span className="grid size-9 place-items-center rounded-xl bg-ink text-bg">
              <Icon.Clapper className="size-5" />
            </span>
            <span className="leading-none">
              <span className="block font-display text-[21px] font-semibold tracking-tight">{SITE.title}</span>
              <span className="block text-[11.5px] text-faint">{SITE.owner}</span>
            </span>
          </a>
          {loading && <Spinner className="text-faint" />}
          {canEdit && (
            <>
              <Button variant="secondary" onClick={() => setDialog({ type: 'watched' })}>
                <Icon.Check /> <span className="hidden sm:inline">I watched…</span>
              </Button>
              <Button variant="primary" onClick={() => setDialog({ type: 'add' })}>
                <Icon.Plus /> <span className="hidden sm:inline">Add film</span>
              </Button>
            </>
          )}
          {checking && !user && <Spinner className="text-faint" />}
          {user ? (
            <UserMenu onSettings={() => setDialog({ type: 'settings' })} />
          ) : (
            configured &&
            !checking && (
              <Button variant="ghost" onClick={() => setDialog({ type: 'signin' })}>
                Sign in
              </Button>
            )
          )}
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-20">
        {isOwner && needsImport && (
          <div className="mt-5 flex flex-wrap items-center gap-3 rounded-2xl border border-accent/40 bg-accent/8 p-4">
            <div className="min-w-0 flex-1 text-[14.5px]">
              <div className="font-semibold">Your database is empty</div>
              <div className="text-muted">Import the built-in library ({films.length} films) once to start adding and rating.</div>
            </div>
            <Button
              variant="primary"
              disabled={importing}
              onClick={async () => {
                setImporting(true);
                try {
                  await importSeed();
                  notify('Library imported — you can edit now');
                } catch (e) {
                  notify(e instanceof Error ? e.message : 'Import failed', 'error');
                } finally {
                  setImporting(false);
                }
              }}
            >
              {importing ? <Spinner /> : <Icon.Download />} Import library
            </Button>
          </div>
        )}
        {user && !isOwner && !checking && (
          <p className="mt-5 rounded-2xl bg-surface-2 px-4 py-3 text-[14px] text-muted">
            Signed in as {user.email}. This list is view-only for you — only the owner can add films.
          </p>
        )}
        {error && <p className="mt-5 rounded-2xl bg-surface-2 px-4 py-3 text-[14px] text-muted">{error}</p>}

        <section className="pb-6 pt-8 sm:pt-12">
          <h1 className="max-w-2xl font-display text-[30px] leading-[1.12] font-semibold tracking-tight sm:text-[42px]">
            Films I’ve seen, and the ones friends keep telling me to watch.
          </h1>
        </section>

        <nav className="flex items-end gap-6 border-b border-line" aria-label="Lists">
          {(
            [
              ['watched', 'Watched', watchedAll.length],
              ['watchlist', 'Want to watch', watchlistBase.length],
            ] as const
          ).map(([value, label, count]) => (
            <button
              key={value}
              type="button"
              onClick={() => switchTab(value)}
              aria-current={tab === value ? 'page' : undefined}
              className={cx(
                '-mb-px flex items-baseline gap-2 border-b-2 pb-3 text-[17px] font-semibold transition sm:text-lg',
                tab === value ? 'border-ink text-ink' : 'border-transparent text-faint hover:text-muted',
              )}
            >
              {label}
              <span className="text-[13px] font-medium tabular-nums text-faint">{count}</span>
            </button>
          ))}
        </nav>

        <div className="mt-4 flex flex-wrap items-center gap-2.5">
          <div className="relative min-w-0 flex-1 basis-60">
            <Icon.Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-faint" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search in any language — title, director, who recommended"
              className={cx(fieldClass, 'h-11 w-full rounded-full bg-surface pl-10 pr-4 text-[15px]')}
              aria-label="Search films"
            />
          </div>
          {tab === 'watched' ? (
            <select
              value={watchedSort}
              onChange={(e) => setWatchedSort(e.target.value as WatchedSort)}
              className={cx(fieldClass, 'h-11 rounded-full bg-surface pl-4 pr-8 text-[14px]')}
              aria-label="Sort"
            >
              <option value="rating">By my rating</option>
              <option value="recent">Recently watched</option>
              <option value="imdb">By IMDb rating</option>
              <option value="year">By year</option>
              <option value="title">A–Z</option>
            </select>
          ) : (
            <select
              value={listSort}
              onChange={(e) => setListSort(e.target.value as WatchlistSort)}
              className={cx(fieldClass, 'h-11 rounded-full bg-surface pl-4 pr-8 text-[14px]')}
              aria-label="Sort"
            >
              <option value="added">Recently added</option>
              <option value="imdb">By IMDb rating</option>
              <option value="year">By year</option>
              <option value="title">A–Z</option>
            </select>
          )}
          {isOwner && reviewCount > 0 && (
            <Chip active={reviewOnly} onClick={() => setReviewOnly((v) => !v)} count={reviewCount}>
              <Icon.Flag /> Needs review
            </Chip>
          )}
        </div>

        {tab === 'watchlist' && (
          <div className="mt-3 space-y-2.5">
            <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-0.5">
              <Chip active={!genre} onClick={() => setGenre(null)}>
                All genres
              </Chip>
              {genres.map(([g, n]) => (
                <Chip key={g} active={genre === g} onClick={() => setGenre(genre === g ? null : g)} count={n}>
                  {g}
                </Chip>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={recommender}
                onChange={(e) => setRecommender(e.target.value)}
                className={cx(fieldClass, 'h-9 rounded-full bg-surface pl-3.5 pr-8 text-[13.5px]', recommender && '!border-ink')}
                aria-label="Recommended by"
              >
                <option value="">Recommended by anyone</option>
                {recommenders.map(([name, n]) => (
                  <option key={name} value={name}>
                    {name} ({n})
                  </option>
                ))}
                <option value="-">Found it myself</option>
              </select>
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as typeof kind)}
                className={cx(fieldClass, 'h-9 rounded-full bg-surface pl-3.5 pr-8 text-[13.5px]', kind !== 'all' && '!border-ink')}
                aria-label="Type"
              >
                <option value="all">Films & series</option>
                <option value="film">Films only</option>
                <option value="series">Series only</option>
              </select>
              {filtersOn && (
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  <Icon.X /> Clear
                </Button>
              )}
              <span className="ml-auto text-[13px] tabular-nums text-faint">
                {watchlist.length} {watchlist.length === 1 ? 'film' : 'films'}
              </span>
            </div>
          </div>
        )}

        <div className="mt-6">
          {(tab === 'watched' ? watched.length : watchlist.length) === 0 ? (
            <div className="rounded-3xl border border-dashed border-line px-6 py-14 text-center">
              <p className="text-[15px] text-muted">Nothing here matches.</p>
              <div className="mt-3 flex flex-wrap justify-center gap-2">
                {query && otherCount > 0 && (
                  <Button size="sm" onClick={() => switchTab(tab === 'watched' ? 'watchlist' : 'watched')}>
                    {otherCount} found in {tab === 'watched' ? 'Want to watch' : 'Watched'} →
                  </Button>
                )}
                {(query || filtersOn) && (
                  <Button size="sm" variant="ghost" onClick={clearFilters}>
                    Clear search & filters
                  </Button>
                )}
                {canEdit && query && (
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => setDialog({ type: 'add', text: query, status: tab === 'watched' ? 'watched' : 'watchlist' })}
                  >
                    <Icon.Sparkle /> Add “{query}” with AI
                  </Button>
                )}
              </div>
            </div>
          ) : tab === 'watched' ? (
            <WatchedList films={watched} grouped={watchedSort === 'rating'} isOwner={isOwner} onOpen={openFilm} />
          ) : (
            <div className="grid gap-3 sm:gap-4 lg:grid-cols-2">
              {watchlist.map((f) => (
                <FilmCard
                  key={f.id}
                  film={f}
                  isOwner={canEdit}
                  onOpen={() => openFilm(f)}
                  onWatched={() => setDialog({ type: 'rate', id: f.id })}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-6 text-[12.5px] text-faint">
          <span>Ratings, genres and posters from IMDb.</span>
          <span>Descriptions written with AI.</span>
          {configured && !user && (
            <button type="button" className="ml-auto hover:text-ink" onClick={() => setDialog({ type: 'signin' })}>
              Owner sign-in
            </button>
          )}
        </div>
      </footer>

      {openedFilm && !dialog && (
        <FilmDialog
          film={openedFilm}
          isOwner={canEdit}
          onClose={closeFilm}
          onRate={() => setDialog({ type: 'rate', id: openedFilm.id })}
          onEdit={() => setDialog({ type: 'edit', id: openedFilm.id })}
          onFix={() => setDialog({ type: 'add', replaceId: openedFilm.id })}
          notify={notify}
        />
      )}
      {dialog?.type === 'add' && (
        <AddDialog
          initialText={dialog.text}
          initialStatus={dialog.status}
          replace={replaceFilm}
          onClose={() => setDialog(null)}
          onOpenSettings={() => setDialog({ type: 'settings' })}
          notify={notify}
        />
      )}
      {dialog?.type === 'watched' && (
        <WatchedDialog
          onClose={() => setDialog(null)}
          onPick={(f) => setDialog({ type: 'rate', id: f.id })}
          onAskAi={(text) => setDialog({ type: 'add', text, status: 'watched' })}
        />
      )}
      {dialog?.type === 'rate' && dialogFilm && <RateDialog film={dialogFilm} onClose={() => setDialog(null)} notify={notify} />}
      {dialog?.type === 'edit' && dialogFilm && <EditDialog film={dialogFilm} onClose={() => setDialog(null)} notify={notify} />}
      {dialog?.type === 'settings' && <SettingsDialog onClose={() => setDialog(null)} notify={notify} />}
      {dialog?.type === 'signin' && <SignInDialog onClose={() => setDialog(null)} />}
      {toast}
    </div>
  );
}

export default function App() {
  return (
    <SessionProvider>
      <LibraryProvider>
        <Movies />
      </LibraryProvider>
    </SessionProvider>
  );
}
