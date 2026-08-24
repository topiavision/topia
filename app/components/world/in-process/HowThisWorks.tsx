'use client';

import { useState } from 'react';
import Link from 'next/link';
import { replayTour } from '../../Tour';
import { ORANGE } from './constants';
/* ── Plain-language explainer ──────────────────────────────────────
 * "What is In Process?" — one collapsible card that a first-time visitor
 * or a brand-new builder can read and fully get the integration. */
export function HowThisWorks({ canEdit }: { canEdit: boolean }) {
  const [open, setOpen] = useState(false);
  const replay = canEdit ? (
    <button
      onClick={() => replayTour('inprocess')}
      className="font-mono text-[10px] uppercase tracking-[1px] underline cursor-pointer bg-transparent border-none text-ink/45 hover:text-ink/70 transition-colors"
    >
      ↻ Replay the walkthrough
    </button>
  ) : null;
  return (
    <div className="border border-ink/[0.08] rounded-lg">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-transparent border-none cursor-pointer text-left"
      >
        <span className="font-mono text-[11px] font-bold uppercase tracking-[2px] text-ink/60">
          ⓘ How this works — what is In Process?
        </span>
        <span className="font-mono text-[13px] text-ink/40">{open ? '−' : '+'}</span>
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3">
          <div>
            <p className="font-mono text-[10px] font-bold uppercase tracking-[2px] mb-1" style={{ color: ORANGE }}>1 · The roadmap lives on Topia</p>
            <p className="font-mono text-[12px] text-ink/65 leading-relaxed">
              Each project tells its story as milestones — done ✓, in motion now, up next — plus a process log of
              updates (images, thoughts, links). Everything here is Topia-native: no other account needed.
            </p>
          </div>
          <div>
            <p className="font-mono text-[10px] font-bold uppercase tracking-[2px] mb-1" style={{ color: ORANGE }}>2 · In Process is an optional companion</p>
            <p className="font-mono text-[12px] text-ink/65 leading-relaxed">
              <a href="https://inprocess.world" target="_blank" rel="noopener noreferrer" className="underline text-ink">In Process</a> is
              an onchain journal for creatives: you publish (&ldquo;mint&rdquo;) moments of your process permanently,
              and supporters can collect them. A <span style={{ color: ORANGE }}>⛓</span> on a card here means that
              update is minted — open the card to collect it there.
            </p>
          </div>
          <div>
            <p className="font-mono text-[10px] font-bold uppercase tracking-[2px] mb-1" style={{ color: ORANGE }}>3 · How they connect</p>
            <p className="font-mono text-[12px] text-ink/65 leading-relaxed">
              {canEdit ? (
                <>
                  Two directions, both optional. <strong>Mint from Topia:</strong> connect once in your{' '}
                  <Link href="/profile" className="underline text-ink">profile</Link> (&ldquo;Sign in with In•Process&rdquo;) and
                  every update you post here gets a ⛓ mint checkbox. <strong>Sync to Topia:</strong> paste your
                  inprocess.world link on a roadmap and moments you mint over there appear in this log automatically.
                </>
              ) : (
                <>
                  Builders can post updates straight from Topia and optionally mint them onchain, or sync in the
                  moments they already mint on inprocess.world — the log shows both in one place.
                </>
              )}
            </p>
          </div>
          {replay}
        </div>
      )}
    </div>
  );
}
