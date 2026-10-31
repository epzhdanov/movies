import { useState, type ReactNode } from 'react';
import type { Film, FilmKind } from '../types';
import { useLibrary } from '../lib/library';
import { refreshFromImdb } from '../lib/ai';
import { Button, Icon, Label, Modal, RatingPicker, Segmented, Spinner, cx, inputClass } from './ui';

const KINDS: { value: FilmKind; label: string }[] = [
  { value: 'movie', label: 'Film' },
  { value: 'series', label: 'Series' },
  { value: 'miniseries', label: 'Mini-series' },
  { value: 'short', label: 'Short' },
  { value: 'special', label: 'Special' },
  { value: 'opera', label: 'Opera' },
];

const list = (s: string) =>
  s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);

function Field({ label, hint, children, className }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cx('block', className)}>
      <Label hint={hint}>{label}</Label>
      {children}
    </label>
  );
}

export function EditDialog({
  film,
  onClose,
  notify,
}: {
  film: Film;
  onClose: () => void;
  notify: (msg: string, tone?: 'ok' | 'error') => void;
}) {
  const { save } = useLibrary();
  const [f, setF] = useState<Film>(film);
  const [genres, setGenres] = useState(film.genres.join(', '));
  const [directors, setDirectors] = useState(film.directors.join(', '));
  const [busy, setBusy] = useState<'save' | 'imdb' | null>(null);
  const set = <K extends keyof Film>(key: K, value: Film[K]) => setF((cur) => ({ ...cur, [key]: value }));
  const text = (v: string) => v.trim() || null;

  async function fetchImdb() {
    if (!f.imdbId) return;
    setBusy('imdb');
    try {
      const next = await refreshFromImdb({ ...f, poster: null });
      setF(next);
      setGenres(next.genres.join(', '));
      setDirectors(next.directors.join(', '));
      notify('Pulled the latest IMDb data');
    } finally {
      setBusy(null);
    }
  }

  async function submit() {
    setBusy('save');
    try {
      await save([
        {
          ...f,
          originalTitle: f.originalTitle.trim() || film.originalTitle,
          genres: list(genres),
          directors: list(directors),
          myRating: f.status === 'watched' ? f.myRating : null,
          watchedAt: f.status === 'watched' ? (f.watchedAt ?? new Date().toISOString()) : null,
        },
      ]);
      notify('Saved');
      onClose();
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Saving failed', 'error');
      setBusy(null);
    }
  }

  return (
    <Modal
      wide
      title="Edit film"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} disabled={Boolean(busy)}>
            {busy === 'save' ? <Spinner /> : <Icon.Check />} Save
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Original title" hint="original language & script">
          <input className={inputClass} value={f.originalTitle} onChange={(e) => set('originalTitle', e.target.value)} />
        </Field>
        <Field label="English title">
          <input className={inputClass} value={f.englishTitle ?? ''} onChange={(e) => set('englishTitle', text(e.target.value))} />
        </Field>
        <Field label="Russian title">
          <input className={inputClass} value={f.russianTitle ?? ''} onChange={(e) => set('russianTitle', text(e.target.value))} />
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Language">
            <input className={inputClass} placeholder="ru, en…" value={f.originalLanguage ?? ''} onChange={(e) => set('originalLanguage', text(e.target.value.toLowerCase()))} />
          </Field>
          <Field label="Year">
            <input className={inputClass} inputMode="numeric" value={f.year ?? ''} onChange={(e) => set('year', Number(e.target.value) || null)} />
          </Field>
          <Field label="Type">
            <select className={inputClass} value={f.kind} onChange={(e) => set('kind', e.target.value as FilmKind)}>
              {KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="sm:col-span-2">
          <Label>Status</Label>
          <Segmented
            value={f.status}
            onChange={(v) => set('status', v)}
            options={[
              { value: 'watchlist', label: 'Want to watch' },
              { value: 'watched', label: 'Watched' },
            ]}
          />
        </div>
        {f.status === 'watched' && (
          <div className="sm:col-span-2">
            <Label hint="tap again to clear">My rating</Label>
            <RatingPicker value={f.myRating} onPick={(r) => set('myRating', f.myRating === r ? null : r)} />
          </div>
        )}

        <Field label="Recommended by">
          <input className={inputClass} value={f.recommendedBy ?? ''} onChange={(e) => set('recommendedBy', text(e.target.value))} />
        </Field>
        <Field label="Note">
          <input className={inputClass} value={f.note ?? ''} onChange={(e) => set('note', text(e.target.value))} />
        </Field>
        <Field label="Genres" hint="comma-separated">
          <input className={inputClass} value={genres} onChange={(e) => setGenres(e.target.value)} />
        </Field>
        <Field label="Directed by" hint="comma-separated">
          <input className={inputClass} value={directors} onChange={(e) => setDirectors(e.target.value)} />
        </Field>
        <Field label="Short description" className="sm:col-span-2">
          <textarea rows={3} className={cx(inputClass, 'resize-y')} value={f.description ?? ''} onChange={(e) => set('description', text(e.target.value))} />
        </Field>
        <Field label="IMDb id" hint="tt1234567">
          <div className="flex gap-2">
            <input className={inputClass} value={f.imdbId ?? ''} onChange={(e) => set('imdbId', text(e.target.value))} />
            <Button onClick={fetchImdb} disabled={!f.imdbId || Boolean(busy)} title="Fetch rating, genres and poster for this id">
              {busy === 'imdb' ? <Spinner /> : <Icon.Refresh />}
            </Button>
          </div>
        </Field>
        <Field label="Poster URL">
          <input className={inputClass} value={f.poster ?? ''} onChange={(e) => set('poster', text(e.target.value))} />
        </Field>
      </div>
    </Modal>
  );
}
