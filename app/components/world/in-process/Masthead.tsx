'use client';

import Link from 'next/link';
import { ORANGE, orangeMix } from './constants';
/* ── Masthead ──────────────────────────────────────────────────────
 * One slim band. The old status legend is gone on purpose: rows carry
 * their status in words (M02 · NOW), so a key has nothing left to
 * explain. The ⛓ story lives where minted posts actually appear. */
export function Masthead({ canEdit, canMint }: { canEdit: boolean; canMint: boolean }) {
  return (
    <div className="border-b pb-3.5" style={{ borderColor: orangeMix(55) }}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 min-w-0">
          <h2 className="font-basement font-black text-[clamp(18px,2.6vw,24px)] uppercase leading-none text-ink">
            In<span style={{ color: ORANGE }}>•</span>Process
          </h2>
          <p className="font-mono text-[11px] text-ink/50">
            Build in public — the roadmap is the spine, the log is the life.
          </p>
        </div>
        <a
          href="https://inprocess.world"
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-[9px] uppercase tracking-[2px] no-underline hover:opacity-75 transition-opacity"
          style={{ color: ORANGE }}
        >
          an inprocess.world integration ↗
        </a>
      </div>

      {canEdit && (
        <p id="tour-ip-legend" className="font-mono text-[10px] text-ink/40 mt-2.5">
          {canMint
            ? <>⛓ Minting is on — any update you post can also publish to your In Process timeline.</>
            : <>Want your updates minted onchain too? <Link href="/profile" className="underline text-ink/60">Connect In Process in your profile</Link>.</>}
        </p>
      )}
    </div>
  );
}
