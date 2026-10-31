import { useState } from 'react';
import type { Film } from '../types';
import { cx, Icon } from './ui';

/** Poster with a fallback to Stremio's image mirror, then a placeholder. */
export function Poster({ film, className }: { film: Pick<Film, 'poster' | 'imdbId'>; className?: string }) {
  const sources = [
    film.poster,
    film.imdbId ? `https://images.metahub.space/poster/medium/${film.imdbId}/img` : null,
  ].filter((s): s is string => Boolean(s));
  const [index, setIndex] = useState(0);
  const src = sources[index];

  if (!src) {
    return (
      <div className={cx('grid place-items-center bg-surface-2 text-faint', className)}>
        <Icon.Clapper className="size-7" />
      </div>
    );
  }
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setIndex((i) => i + 1)}
      className={cx('bg-surface-2 object-cover', className)}
    />
  );
}
