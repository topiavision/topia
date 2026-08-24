'use client';

import { ORANGE } from './constants';
/* ── Timeline node ─────────────────────────────────────────────────── */
export function Node({ state, small }: { state: 'done' | 'now' | 'future'; small?: boolean }) {
  const s = small ? 'w-2.5 h-2.5' : 'w-3.5 h-3.5';
  const sNow = small ? 'w-3 h-3 border-2' : 'w-4 h-4 border-[3px]';
  if (state === 'done') return <span className={`${s} rounded-full shrink-0 z-[1]`} style={{ backgroundColor: ORANGE }} />;
  if (state === 'now') return <span className={`${sNow} rounded-full shrink-0 z-[1] bg-[var(--page-bg)]`} style={{ borderColor: ORANGE, borderStyle: 'solid' }} />;
  return <span className={`${s} rounded-full shrink-0 z-[1] border-2 border-ink/25 bg-[var(--page-bg)]`} />;
}
