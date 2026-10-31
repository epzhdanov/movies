import { useState } from 'react';
import type { Film } from '../types';
import { useLibrary } from '../lib/library';
import { titles } from '../lib/text';
import { Poster } from './Poster';
import { Button, Modal, RatingPicker, Spinner } from './ui';

/** One tap on a number saves it and moves the film to Watched. */
export function RateDialog({
  film,
  onClose,
  notify,
}: {
  film: Film;
  onClose: () => void;
  notify: (msg: string, tone?: 'ok' | 'error') => void;
}) {
  const { save } = useLibrary();
  const [busy, setBusy] = useState(false);
  const { main, sub } = titles(film);
  const moving = film.status === 'watchlist';

  async function commit(rating: number | null) {
    setBusy(true);
    try {
      await save([
        {
          ...film,
          status: 'watched',
          myRating: rating,
          watchedAt: film.watchedAt ?? new Date().toISOString(),
        },
      ]);
      notify(
        moving
          ? `Moved to Watched${rating ? ` · ${rating}/10` : ''}`
          : rating
            ? `Rated ${rating}/10`
            : 'Rating removed',
      );
      onClose();
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Saving failed', 'error');
      setBusy(false);
    }
  }

  return (
    <Modal title={moving ? 'How was it?' : 'Change rating'} onClose={onClose}>
      <div className="mb-4 flex items-center gap-3">
        <Poster film={film} className="aspect-[2/3] w-12 shrink-0 rounded-lg" />
        <div className="min-w-0">
          <div className="truncate font-semibold">{main}</div>
          {sub && <div className="truncate text-sm text-muted">{sub}</div>}
          {film.year && <div className="text-[13px] text-faint">{film.year}</div>}
        </div>
      </div>
      <RatingPicker value={film.status === 'watched' ? film.myRating : null} onPick={commit} disabled={busy} />
      <div className="mt-4 flex items-center justify-between gap-2">
        <span className="text-[13px] text-faint">{busy ? <Spinner /> : '1 = awful · 10 = all-time favourite'}</span>
        {moving ? (
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => commit(null)}>
            Watched — rate later
          </Button>
        ) : (
          film.myRating !== null && (
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => commit(null)}>
              Remove rating
            </Button>
          )
        )}
      </div>
    </Modal>
  );
}
