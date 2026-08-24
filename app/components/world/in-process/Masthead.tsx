'use client';

import Link from 'next/link';
import { ORANGE, orangeMix } from './constants';
import { Node } from './Node';
/* ── Masthead ──────────────────────────────────────────────────────
 * One branded header for the whole section. A first-time visitor
 * should get the entire system from this alone: what they're looking
 * at, what the node states mean, what ⛓ means, and that In Process
 * (inprocess.world) is the onchain side of it. */
export function Masthead({ canEdit, canMint }: { canEdit: boolean; canMint: boolean }) {
  return (
    <div className="border-b pb-4" style={{ borderColor: orangeMix(55) }}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="font-basement font-black text-[clamp(18px,2.6vw,24px)] uppercase leading-none text-ink">
          In<span style={{ color: ORANGE }}>•</span>Process
        </h2>
        <a
          href="https://inprocess.world"
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-[9px] uppercase tracking-[2px] no-underline text-ink/40 hover:text-ink/70 transition-colors"
        >
          an inprocess.world integration ↗
        </a>
      </div>
      <p className="font-mono text-[12px] text-ink/55 mt-1.5 max-w-2xl">
        Build in public. Each project&apos;s journey, told as a roadmap of milestones and a live log of the
        process — tap any milestone to see the updates behind it.
      </p>

      {/* Legend — the timeline reads itself */}
      <div id="tour-ip-legend" className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-3.5">
        <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[1px] text-ink/55"><Node state="done" small /> Done</span>
        <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[1px] text-ink/55"><Node state="now" small /> In motion</span>
        <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[1px] text-ink/55"><Node state="future" small /> Up next</span>
        <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[1px]" style={{ color: ORANGE }}>⛓ Minted onchain — collectible</span>
      </div>

      {canEdit && (
        <p className="font-mono text-[10px] text-ink/40 mt-3">
          {canMint
            ? <>⛓ Minting is on — any update you post can also publish to your In Process timeline.</>
            : <>Want your updates minted onchain too? <Link href="/profile" className="underline text-ink/60">Connect In Process in your profile</Link>.</>}
        </p>
      )}
    </div>
  );
}
