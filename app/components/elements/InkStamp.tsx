'use client';

import { useMemo } from 'react';

/* ── The ink stamp — confirmation as a physical act ─────────────────
 * An action that changes your standing (RSVP, watch) STAMPS: the mark
 * slams in oversized, settles with a spring, lands at a random slight
 * tilt like real ink. CSS keyframes only; reduced-motion just shows it. */

export function InkStamp({ lines, shape = 'round', tone = 'orange', size = 92 }: {
  /** 2–3 short uppercase lines, e.g. ['ENTRY', 'GRANTED', 'AUG 29']. */
  lines: string[];
  shape?: 'round' | 'square';
  tone?: 'orange' | 'lime';
  size?: number;
}) {
  // A stable-but-random tilt per mount — real stamps never land straight.
  const tilt = useMemo(() => (Math.random() * 16 - 8).toFixed(1), []);
  const color = tone === 'lime' ? 'var(--accent-ink)' : 'var(--orange, #FF5C34)';
  return (
    <span
      className={`ink-stamp inline-flex flex-col items-center justify-center text-center font-mono font-bold uppercase select-none ${
        shape === 'round' ? 'rounded-full' : 'rounded-lg border-dashed'
      }`}
      style={{
        width: size, height: size,
        border: `2.5px solid ${color}`,
        color,
        fontSize: Math.max(8, Math.round(size / 11)),
        letterSpacing: 1,
        lineHeight: 1.35,
        ['--stamp-tilt' as string]: `${tilt}deg`,
      }}
      role="status"
    >
      {lines.map((l) => <span key={l}>{l}</span>)}
    </span>
  );
}
