import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

/* ---------- icons (24px grid, stroke) ---------- */

function Svg({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={cx('size-[1.15em] shrink-0', className)}
    >
      {children}
    </svg>
  );
}

export const Icon = {
  Plus: (p: { className?: string }) => <Svg {...p}><path d="M12 5v14M5 12h14" /></Svg>,
  Check: (p: { className?: string }) => <Svg {...p}><path d="M5 12.5l4.5 4.5L19 7.5" /></Svg>,
  Search: (p: { className?: string }) => <Svg {...p}><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4.2-4.2" /></Svg>,
  X: (p: { className?: string }) => <Svg {...p}><path d="M6 6l12 12M18 6L6 18" /></Svg>,
  Star: (p: { className?: string }) => (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={cx('size-[1em] shrink-0', p.className)}>
      <path fill="currentColor" d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4L2.8 9.5l6.4-.8z" />
    </svg>
  ),
  Edit: (p: { className?: string }) => <Svg {...p}><path d="M4 20h4L19 9l-4-4L4 16v4z" /><path d="M13.5 6.5l4 4" /></Svg>,
  Trash: (p: { className?: string }) => <Svg {...p}><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></Svg>,
  Refresh: (p: { className?: string }) => <Svg {...p}><path d="M20 11a8 8 0 10-2.3 5.7" /><path d="M20 5v6h-6" /></Svg>,
  Gear: (p: { className?: string }) => (
    <Svg {...p}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" />
    </Svg>
  ),
  Sparkle: (p: { className?: string }) => <Svg {...p}><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z" /></Svg>,
  Image: (p: { className?: string }) => <Svg {...p}><rect x="3" y="4" width="18" height="16" rx="2.5" /><circle cx="9" cy="10" r="1.8" /><path d="M21 16l-5-5-9 9" /></Svg>,
  External: (p: { className?: string }) => <Svg {...p}><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5" /></Svg>,
  Eye: (p: { className?: string }) => <Svg {...p}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></Svg>,
  Out: (p: { className?: string }) => <Svg {...p}><path d="M15 4h4a1 1 0 011 1v14a1 1 0 01-1 1h-4M10 17l5-5-5-5M15 12H3" /></Svg>,
  Flag: (p: { className?: string }) => <Svg {...p}><path d="M5 21V4M5 4h11l-2 4 2 4H5" /></Svg>,
  Download: (p: { className?: string }) => <Svg {...p}><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></Svg>,
  Clapper: (p: { className?: string }) => (
    <Svg {...p}>
      <rect x="3" y="9" width="18" height="11" rx="2" />
      <path d="M3 9l1.5-4.5 15-2L21 7z" />
      <path d="M8.5 4.2L10 8.5M14 3.5l1.5 4.3" />
    </Svg>
  ),
};

/* ---------- buttons ---------- */

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

export function Button({
  variant = 'secondary',
  size = 'md',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <button
      type="button"
      {...props}
      className={cx(
        'inline-flex items-center justify-center gap-1.5 rounded-full font-medium transition select-none',
        'disabled:opacity-45 disabled:pointer-events-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        size === 'sm' && 'h-8 px-3 text-[13px]',
        size === 'md' && 'h-10 px-3.5 text-sm sm:px-4',
        size === 'lg' && 'h-12 px-5 text-[15px]',
        variant === 'primary' && 'bg-accent text-accent-ink hover:brightness-110 shadow-sm',
        variant === 'secondary' && 'bg-surface-2 text-ink hover:bg-line',
        variant === 'ghost' && 'text-muted hover:text-ink hover:bg-surface-2',
        variant === 'danger' && 'bg-transparent text-danger hover:bg-danger/10',
        className,
      )}
    />
  );
}

export function Chip({
  active,
  children,
  onClick,
  count,
}: {
  active?: boolean;
  children: ReactNode;
  onClick?: () => void;
  count?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cx(
        'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] transition',
        active
          ? 'border-ink bg-ink text-bg'
          : 'border-line text-muted hover:border-faint hover:text-ink',
      )}
    >
      {children}
      {count !== undefined && <span className={cx('tabular-nums', active ? 'opacity-70' : 'text-faint')}>{count}</span>}
    </button>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cx('inline-block size-4 animate-spin rounded-full border-2 border-current border-r-transparent', className)}
      aria-label="Loading"
    />
  );
}

/* ---------- ratings ---------- */

/** Background/text pair for my 1–10 rating. */
export function ratingTone(r: number | null): string {
  if (r === null) return 'bg-surface-2 text-faint';
  if (r >= 9) return 'bg-gold text-gold-ink';
  if (r >= 7) return 'bg-good text-white';
  if (r >= 5) return 'bg-meh text-white';
  return 'bg-bad text-white';
}

export function MyRating({ value, size = 'md' }: { value: number | null; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <span
      className={cx(
        'inline-flex shrink-0 items-center justify-center rounded-lg font-semibold tabular-nums',
        ratingTone(value),
        size === 'sm' && 'h-6 min-w-6 px-1 text-xs',
        size === 'md' && 'h-8 min-w-8 px-1.5 text-sm',
        size === 'lg' && 'h-12 min-w-12 px-2 text-xl',
      )}
      title={value === null ? 'Not rated yet' : `My rating: ${value}/10`}
    >
      {value ?? '–'}
    </span>
  );
}

export function ImdbRating({ value, imdbId }: { value: number | null; imdbId?: string | null }) {
  if (value === null) return null;
  const body = (
    <>
      <span className="rounded-[3px] bg-imdb px-1 text-[10px] font-extrabold leading-[15px] tracking-tight text-black">IMDb</span>
      <span className="font-semibold tabular-nums text-ink">{value.toFixed(1)}</span>
    </>
  );
  return imdbId ? (
    <a
      href={`https://www.imdb.com/title/${imdbId}/`}
      target="_blank"
      rel="noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="inline-flex items-center gap-1.5 text-[13px] hover:underline"
      title="Open on IMDb"
    >
      {body}
    </a>
  ) : (
    <span className="inline-flex items-center gap-1.5 text-[13px]">{body}</span>
  );
}

export function RatingPicker({
  value,
  onPick,
  disabled,
}: {
  value: number | null;
  onPick: (r: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid grid-cols-5 gap-1.5 sm:grid-cols-10" role="radiogroup" aria-label="Your rating">
      {Array.from({ length: 10 }, (_, i) => i + 1).map((r) => (
        <button
          key={r}
          type="button"
          role="radio"
          aria-checked={value === r}
          disabled={disabled}
          onClick={() => onPick(r)}
          className={cx(
            'h-11 rounded-xl text-base font-semibold tabular-nums transition disabled:opacity-50',
            value === r ? ratingTone(r) + ' ring-2 ring-ink/30' : 'bg-surface-2 text-ink hover:bg-line',
          )}
        >
          {r}
        </button>
      ))}
    </div>
  );
}

/* ---------- modal ---------- */

export function Modal({
  title,
  onClose,
  children,
  footer,
  wide,
}: {
  title?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current();
    };
    document.addEventListener('keydown', onKey);
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    const focusable = panel.current?.querySelector<HTMLElement>('[autofocus], input, textarea, select');
    (focusable ?? panel.current)?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      prev?.focus?.();
    };
  }, []);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <div className="absolute inset-0 bg-black/55 backdrop-blur-[2px] animate-fade" onClick={onClose} />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className={cx(
          'relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl bg-surface shadow-2xl outline-none animate-rise',
          'sm:rounded-3xl',
          wide ? 'sm:max-w-3xl' : 'sm:max-w-lg',
        )}
      >
        <div className="flex items-start gap-3 px-5 pt-5 sm:px-6">
          <div className="min-w-0 flex-1 text-lg font-semibold leading-snug">{title}</div>
          <button
            type="button"
            onClick={onClose}
            className="-mr-2 -mt-1 grid size-9 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-ink"
            aria-label="Close"
          >
            <Icon.X />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-3 sm:px-6">{children}</div>
        {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-3 sm:px-6">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/* ---------- form bits ---------- */

/** Border, colors and focus ring only — size, shape and background are up to the caller. */
export const fieldClass =
  'border border-line text-ink placeholder:text-faint outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/25';

export const inputClass = `${fieldClass} w-full rounded-xl bg-bg px-3 py-2.5 text-[15px]`;

export function Label({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="mb-1.5 flex items-baseline justify-between gap-2 text-[13px] font-medium text-muted">
      <span>{children}</span>
      {hint && <span className="font-normal text-faint">{hint}</span>}
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-full bg-surface-2 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={cx(
            'h-8 rounded-full px-3.5 text-[13px] font-medium transition',
            value === o.value ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Small transient message at the bottom of the screen. */
export function useToast(): [ReactNode, (msg: string, tone?: 'ok' | 'error') => void] {
  const [toast, setToast] = useState<{ msg: string; tone: 'ok' | 'error'; key: number } | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), toast.tone === 'error' ? 6000 : 2800);
    return () => clearTimeout(t);
  }, [toast]);
  const node = toast ? (
    <div
      key={toast.key}
      role="status"
      className={cx(
        'fixed bottom-5 left-1/2 z-[60] max-w-[calc(100vw-32px)] -translate-x-1/2 rounded-full px-4 py-2.5 text-sm font-medium shadow-lg animate-rise',
        toast.tone === 'error' ? 'bg-danger text-white' : 'bg-ink text-bg',
      )}
    >
      {toast.msg}
    </div>
  ) : null;
  return [node, (msg, tone = 'ok') => setToast({ msg, tone, key: Date.now() })];
}
