import type { Film } from '../types';
import { kindLabel, titles } from '../lib/text';
import { Icon, MyRating } from './ui';

function Row({ film, isOwner, onOpen }: { film: Film; isOwner: boolean; onOpen: () => void }) {
  const { main, sub } = titles(film);
  const kind = kindLabel(film.kind);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition hover:bg-surface"
    >
      <MyRating value={film.myRating} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-medium text-ink">
          {main}
          {sub && <span className="font-normal text-muted"> · {sub}</span>}
        </span>
      </span>
      {isOwner && film.needsReview && <Icon.Flag className="text-danger" />}
      {kind && <span className="hidden text-[11px] font-medium uppercase tracking-wide text-faint sm:inline">{kind}</span>}
      <span className="w-[4.5ch] shrink-0 text-right text-[13px] tabular-nums text-faint">{film.year ?? ''}</span>
    </button>
  );
}

/** Grouped by my rating (10 → 1, then unrated) — or a flat list for other sort orders. */
export function WatchedList({
  films,
  grouped,
  isOwner,
  onOpen,
}: {
  films: Film[];
  grouped: boolean;
  isOwner: boolean;
  onOpen: (f: Film) => void;
}) {
  if (!grouped) {
    return (
      <div className="grid gap-x-6 md:grid-cols-2">
        {films.map((f) => (
          <Row key={f.id} film={f} isOwner={isOwner} onOpen={() => onOpen(f)} />
        ))}
      </div>
    );
  }

  const groups = new Map<number | null, Film[]>();
  for (const f of films) {
    const list = groups.get(f.myRating) ?? [];
    list.push(f);
    groups.set(f.myRating, list);
  }
  const order = [...groups.keys()].sort((a, b) => (b ?? -1) - (a ?? -1));

  return (
    <div className="space-y-7">
      {order.map((rating) => (
        <section key={rating ?? 'none'}>
          <h2 className="mb-1.5 flex items-baseline gap-2.5 border-b border-line pb-2 pl-2.5">
            <span className="font-display text-2xl font-semibold text-ink">{rating === null ? 'Not rated yet' : rating}</span>
            {rating !== null && <span className="text-sm text-faint">/ 10</span>}
            <span className="ml-auto pr-2.5 text-[13px] tabular-nums text-faint">{groups.get(rating)!.length}</span>
          </h2>
          <div className="grid gap-x-6 md:grid-cols-2">
            {groups.get(rating)!.map((f) => (
              <Row key={f.id} film={f} isOwner={isOwner} onOpen={() => onOpen(f)} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
