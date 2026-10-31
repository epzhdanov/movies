import { useState, type ReactNode } from 'react';
import type { Film } from '../types';
import { useLibrary } from '../lib/library';
import { refreshFromImdb } from '../lib/ai';
import { akaTitles, formatDate, kindLabel, titles, yearLabel } from '../lib/text';
import { Poster } from './Poster';
import { Button, Icon, ImdbRating, Modal, MyRating, Spinner } from './ui';

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[7.5rem_1fr] gap-3 py-1.5 text-[14px]">
      <dt className="text-faint">{label}</dt>
      <dd className="min-w-0 text-ink">{children}</dd>
    </div>
  );
}

export function FilmDialog({
  film,
  isOwner,
  onClose,
  onRate,
  onEdit,
  onFix,
  notify,
}: {
  film: Film;
  isOwner: boolean;
  onClose: () => void;
  onRate: () => void;
  onEdit: () => void;
  onFix: () => void;
  notify: (msg: string, tone?: 'ok' | 'error') => void;
}) {
  const { save } = useLibrary();
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { main, sub } = titles(film);
  const aka = akaTitles(film);
  const kind = kindLabel(film.kind);
  const watched = film.status === 'watched';

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label);
    try {
      await fn();
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Something went wrong', 'error');
    } finally {
      setBusy(null);
    }
  }

  const footer = isOwner ? (
    <>
      {confirmDelete ? (
        <Button
          variant="danger"
          size="sm"
          className="mr-auto"
          disabled={Boolean(busy)}
          onClick={() =>
            run('delete', async () => {
              await save([], [film.id]);
              notify('Deleted');
              onClose();
            })
          }
        >
          <Icon.Trash /> Confirm delete
        </Button>
      ) : (
        <Button variant="ghost" size="sm" className="mr-auto" onClick={() => setConfirmDelete(true)}>
          <Icon.Trash /> Delete
        </Button>
      )}
      {film.imdbId && (
        <Button
          variant="ghost"
          size="sm"
          disabled={Boolean(busy)}
          onClick={() =>
            run('refresh', async () => {
              const next = await refreshFromImdb(film);
              await save([next]);
              notify('Updated from IMDb');
            })
          }
        >
          {busy === 'refresh' ? <Spinner /> : <Icon.Refresh />} IMDb
        </Button>
      )}
      <Button variant="secondary" size="sm" onClick={onEdit}>
        <Icon.Edit /> Edit
      </Button>
      {watched ? (
        <>
          <Button
            variant="ghost"
            size="sm"
            disabled={Boolean(busy)}
            onClick={() =>
              run('back', async () => {
                await save([{ ...film, status: 'watchlist', myRating: null, watchedAt: null }]);
                notify('Moved back to “Want to watch”');
              })
            }
          >
            Not watched
          </Button>
          <Button variant="primary" size="sm" onClick={onRate}>
            Change rating
          </Button>
        </>
      ) : (
        <Button variant="primary" size="sm" onClick={onRate}>
          <Icon.Check /> I watched it
        </Button>
      )}
    </>
  ) : undefined;

  return (
    <Modal
      wide
      onClose={onClose}
      footer={footer}
      title={
        <span>
          {main}
          {sub && <span className="font-normal text-muted"> · {sub}</span>}
        </span>
      }
    >
      <div className="flex flex-col gap-5 sm:flex-row">
        <Poster film={film} className="aspect-[2/3] w-36 shrink-0 self-start rounded-2xl shadow-md sm:w-48" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[14px] text-muted">
            {yearLabel(film) && <span className="tabular-nums">{yearLabel(film)}</span>}
            {kind && <span className="rounded-md bg-surface-2 px-1.5 py-px text-[11px] font-medium uppercase tracking-wide">{kind}</span>}
            {film.runtime && <span>{film.runtime}</span>}
            {film.countries.length > 0 && <span>{film.countries.join(', ')}</span>}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-4">
            {watched && (
              <span className="inline-flex items-center gap-2">
                <MyRating value={film.myRating} size="lg" />
                <span className="text-[13px] leading-tight text-muted">
                  my
                  <br />
                  rating
                </span>
              </span>
            )}
            <ImdbRating value={film.imdbRating} imdbId={film.imdbId} />
            {!film.imdbRating && film.imdbId && (
              <a className="inline-flex items-center gap-1 text-[13px] text-muted hover:text-ink" href={`https://www.imdb.com/title/${film.imdbId}/`} target="_blank" rel="noreferrer">
                IMDb <Icon.External />
              </a>
            )}
          </div>

          {film.genres.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {film.genres.map((g) => (
                <span key={g} className="rounded-full border border-line px-2.5 py-0.5 text-[12px] text-muted">
                  {g}
                </span>
              ))}
            </div>
          )}

          {film.description && <p className="mt-4 text-[15px] leading-relaxed text-ink">{film.description}</p>}

          <dl className="mt-4 divide-y divide-line border-y border-line">
            {film.directors.length > 0 && <Fact label="Directed by">{film.directors.join(', ')}</Fact>}
            {film.cast.length > 0 && <Fact label="Starring">{film.cast.join(', ')}</Fact>}
            {aka.length > 0 && <Fact label="Also known as">{aka.join(' · ')}</Fact>}
            {film.recommendedBy && <Fact label="Recommended by">{film.recommendedBy}</Fact>}
            {film.note && <Fact label="Note">{film.note}</Fact>}
            {watched && film.watchedAt && <Fact label="Watched">{formatDate(film.watchedAt)}</Fact>}
            {film.source !== 'import' && <Fact label="Added">{formatDate(film.addedAt)}</Fact>}
            {isOwner && film.sourceText.length > 0 && (
              <Fact label="In my notes">
                <span className="text-muted">{film.sourceText.map((s) => `“${s}”`).join(', ')}</span>
              </Fact>
            )}
          </dl>

          {isOwner && (film.needsReview || film.hidden) && (
            <div className="mt-4 rounded-2xl border border-danger/30 bg-danger/8 p-3.5">
              <div className="flex items-start gap-2 text-[14px] text-ink">
                <Icon.Flag className="mt-0.5 text-danger" />
                <span>{film.reviewNote ?? 'Please check this match.'}</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {!film.hidden && (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={Boolean(busy)}
                    onClick={() =>
                      run('ok', async () => {
                        await save([{ ...film, needsReview: false, reviewNote: null }]);
                        notify('Marked as correct');
                      })
                    }
                  >
                    <Icon.Check /> It’s correct
                  </Button>
                )}
                <Button size="sm" variant="primary" onClick={onFix}>
                  <Icon.Sparkle /> Fix with AI
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
