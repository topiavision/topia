'use client';

import Link from 'next/link';

/**
 * Shared honest async states — the house pattern (see the TV guide's retry
 * block in app/tv/TvClient.tsx). Errors must never dress as emptiness: a
 * failed fetch renders LoadFailed with a retry, never the confident
 * "nothing here yet" empty state.
 */

export function LoadFailed({
  onRetry,
  what,
  className = '',
}: {
  onRetry: () => void;
  what: string;
  className?: string;
}) {
  return (
    <div className={`py-12 px-4 text-center ${className}`}>
      <span className="font-mono text-[12px] uppercase tracking-[2px] text-[var(--text-muted)] block">
        couldn&rsquo;t load {what}
      </span>
      <button
        onClick={onRetry}
        className="mt-3 font-mono text-[11px] uppercase tracking-[2px] text-[var(--accent-ink)] border border-[var(--accent-ink)]/40 hover:opacity-70 px-3 py-1.5 rounded-sm bg-transparent cursor-pointer transition"
      >
        retry
      </button>
    </div>
  );
}

/** Consistent mono empty-state line with an optional CTA link. */
export function EmptyNote({
  children,
  cta,
  className = '',
}: {
  children: React.ReactNode;
  cta?: { href: string; label: string };
  className?: string;
}) {
  return (
    <div className={`py-12 px-4 text-center ${className}`}>
      <span className="font-mono text-[12px] uppercase tracking-[2px] text-[var(--text-muted)] block">{children}</span>
      {cta && (
        <Link
          href={cta.href}
          className="inline-block mt-3 font-mono text-[11px] uppercase tracking-[2px] text-[var(--accent-ink)] border border-[var(--accent-ink)]/40 hover:opacity-70 px-3 py-1.5 rounded-sm no-underline transition"
        >
          {cta.label}
        </Link>
      )}
    </div>
  );
}
