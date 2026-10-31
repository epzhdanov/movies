import { useMemo, useState } from 'react';
import type { Film } from '../types';
import { useLibrary } from '../lib/library';
import { matches, titles } from '../lib/text';
import { Poster } from './Poster';
import { Button, Icon, Modal, MyRating, cx, inputClass } from './ui';

/**
 * "I watched…": find the film in the watchlist and rate it in two taps. If it
 * isn't in the list, hand the text over to the AI flow.
 */
export function WatchedDialog({
  onClose,
  onPick,
  onAskAi,
}: {
  onClose: () => void;
  onPick: (film: Film) => void;
  onAskAi: (text: string) => void;
}) {
  const { films } = useLibrary();
  const [query, setQuery] = useState('');

  const results = useMemo(() => {
    const visible = films.filter((f) => !f.hidden);
    if (!query.trim()) {
      return visible
        .filter((f) => f.status === 'watchlist')
        .sort((a, b) => b.addedAt.localeCompare(a.addedAt))
        .slice(0, 6);
    }
    return visible
      .filter((f) => matches(f, query))
      .sort((a, b) => (a.status === b.status ? 0 : a.status === 'watchlist' ? -1 : 1))
      .slice(0, 8);
  }, [films, query]);

  return (
    <Modal title="What did you watch?" onClose={onClose}>
      <div className="relative">
        <Icon.Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              if (results.length === 1) onPick(results[0]);
              else if (!results.length && query.trim()) onAskAi(query.trim());
            }
          }}
          placeholder="Start typing a title — Russian or English"
          className={cx(inputClass, 'pl-10')}
        />
      </div>

      <div className="mt-3">
        {!query.trim() && results.length > 0 && <div className="mb-1 px-1 text-[12px] font-medium uppercase tracking-wide text-faint">Recently added to your watchlist</div>}
        <ul className="-mx-1">
          {results.map((f) => {
            const { main, sub } = titles(f);
            return (
              <li key={f.id}>
                <button
                  type="button"
                  onClick={() => onPick(f)}
                  className="flex w-full items-center gap-3 rounded-xl px-1.5 py-1.5 text-left hover:bg-surface-2"
                >
                  <Poster film={f} className="aspect-[2/3] w-9 shrink-0 rounded-md" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-medium">
                      {main}
                      {sub && <span className="font-normal text-muted"> · {sub}</span>}
                    </span>
                    <span className="text-[12.5px] text-faint">
                      {f.year ?? ''} {f.status === 'watched' ? '· already watched — change rating' : '· in your watchlist'}
                    </span>
                  </span>
                  {f.status === 'watched' ? <MyRating value={f.myRating} size="sm" /> : <Icon.Check className="text-faint" />}
                </button>
              </li>
            );
          })}
        </ul>
        {query.trim() && (
          <div className={cx('rounded-2xl border border-dashed border-line p-3', results.length > 0 && 'mt-3')}>
            <p className="text-[13.5px] text-muted">
              {results.length ? 'Not one of these?' : 'Not in your list yet.'} AI will find “{query.trim()}”, fill in the details and save it to Watched.
            </p>
            <Button variant="primary" size="sm" className="mt-2" onClick={() => onAskAi(query.trim())}>
              <Icon.Sparkle /> Find with AI
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
}
