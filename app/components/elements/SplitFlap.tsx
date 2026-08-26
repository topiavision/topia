'use client';

import { useEffect, useRef, useState } from 'react';

/* ── Split-flap text — the departures-board clatter ─────────────────
 * Each cell cycles through the alphabet toward its target character with
 * a per-cell stagger, the way airport boards resolve. Pure DOM/CSS: a
 * cell is a fixed box whose glyph swaps on an interval; the horizontal
 * midline seam sells the flap. Respects prefers-reduced-motion (renders
 * the target immediately). */

const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 ·:—';

export function SplitFlap({ text, tone = 'dark', size = 'md', delay = 0 }: {
  text: string;
  /** dark cells (default) · lime = status-positive · orange = status-hot. */
  tone?: 'dark' | 'lime' | 'orange';
  size?: 'sm' | 'md';
  /** ms before this word starts resolving — stagger rows with it. */
  delay?: number;
}) {
  const target = text.toUpperCase();
  const [chars, setChars] = useState<string[]>(() => target.split('').map(() => ' '));
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setChars(target.split(''));
      return;
    }
    const timers: ReturnType<typeof setInterval>[] = [];
    const start = setTimeout(() => {
      target.split('').forEach((ch, i) => {
        // Each cell spins a few glyphs then lands; later cells spin longer.
        let spins = 0;
        const total = 3 + Math.floor(i * 1.2) + Math.floor(Math.random() * 3);
        const t = setInterval(() => {
          spins += 1;
          setChars((prev) => {
            const next = [...prev];
            next[i] = spins >= total ? ch : GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
            return next;
          });
          if (spins >= total) clearInterval(t);
        }, 55);
        timers.push(t);
      });
    }, delay);
    return () => { clearTimeout(start); timers.forEach(clearInterval); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cell = size === 'sm' ? 'w-[13px] h-[19px] text-[11px]' : 'w-[16px] h-[23px] text-[13px]';
  const toneStyle = tone === 'lime'
    ? { backgroundColor: '#e4fe52', color: '#1a1a1a' }
    : tone === 'orange'
      ? { backgroundColor: 'var(--orange, #FF5C34)', color: '#141414' }
      : { backgroundColor: '#232323', color: '#f5f0e8' };

  return (
    <span className="inline-flex" aria-label={target} role="text">
      {chars.map((ch, i) => (
        <span
          key={i}
          aria-hidden="true"
          className={`flap-cell relative inline-flex items-center justify-center font-mono font-bold rounded-[2px] mr-[2px] overflow-hidden ${cell}`}
          style={toneStyle}
        >
          {ch}
          <span className="absolute left-0 right-0 top-1/2 h-px" style={{ backgroundColor: 'rgba(0,0,0,0.55)' }} />
        </span>
      ))}
    </span>
  );
}
