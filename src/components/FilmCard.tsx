import type { Film } from '../types';
import { formatDate, kindLabel, titles, yearLabel } from '../lib/text';
import { Poster } from './Poster';
import { Button, Icon, ImdbRating } from './ui';

export function FilmCard({
  film,
  isOwner,
  onOpen,
  onWatched,
}: {
  film: Film;
  isOwner: boolean;
  onOpen: () => void;
  onWatched: () => void;
}) {
  const { main, sub } = titles(film);
  const kind = kindLabel(film.kind);
  return (
    <article
      onClick={onOpen}
      className="group flex cursor-pointer gap-4 rounded-2xl border border-line bg-surface p-3 transition hover:border-faint hover:shadow-md sm:p-3.5"
    >
      <Poster film={film} className="aspect-[2/3] w-[84px] shrink-0 rounded-xl sm:w-[96px]" />
      <div className="flex min-w-0 flex-1 flex-col">
        <h3 className="text-[15.5px] font-semibold leading-snug text-ink">
          <a
            href={`#/film/${encodeURIComponent(film.id)}`}
            onClick={(e) => {
              e.preventDefault();
            }}
            className="outline-none"
          >
            {main}
          </a>
          {sub && <span className="font-normal text-muted"> · {sub}</span>}
        </h3>
        <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] text-muted">
          {yearLabel(film) && <span className="tabular-nums">{yearLabel(film)}</span>}
          {kind && <span className="rounded-md bg-surface-2 px-1.5 py-px text-[11px] font-medium uppercase tracking-wide">{kind}</span>}
          <ImdbRating value={film.imdbRating} />
          {film.genres.length > 0 && <span className="truncate">{film.genres.slice(0, 3).join(', ')}</span>}
        </div>
        {film.description && (
          <p className="mt-2 line-clamp-3 text-[13.5px] leading-relaxed text-muted">{film.description}</p>
        )}
        <div className="mt-auto flex flex-wrap items-center gap-2 pt-2.5">
          {film.recommendedBy && (
            <span className="inline-flex items-center gap-1 rounded-full bg-accent/12 px-2.5 py-0.5 text-[12px] font-medium text-accent">
              from {film.recommendedBy}
            </span>
          )}
          {film.note && <span className="truncate text-[12px] text-faint">{film.note}</span>}
          {isOwner && film.needsReview && (
            <span className="inline-flex items-center gap-1 text-[12px] font-medium text-danger">
              <Icon.Flag /> check
            </span>
          )}
          {film.source !== 'import' && (
            <span className="text-[12px] text-faint">added {formatDate(film.addedAt)}</span>
          )}
          {isOwner && (
            <Button
              size="sm"
              variant="secondary"
              className="ml-auto"
              onClick={(e) => {
                e.stopPropagation();
                onWatched();
              }}
            >
              <Icon.Check /> Watched
            </Button>
          )}
        </div>
      </div>
    </article>
  );
}
