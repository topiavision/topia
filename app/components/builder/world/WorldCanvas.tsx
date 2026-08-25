'use client';

import type { DraftWorld } from '@/lib/builder/world';

/* The World Builder's live canvas — the world card assembling on the
 * drafting grid as the conversation fills it in. Same visual language as
 * the world cards on /worlds: cover, basement-black title, category pill,
 * country micro-label, one-liner. */

const ORANGE = 'var(--orange, #FF5C34)';
const orangeMix = (pct: number) => `color-mix(in srgb, var(--orange) ${pct}%, transparent)`;

export function WorldCanvas({ draft }: { draft: DraftWorld | null }) {
  if (!draft || !draft.title) {
    return (
      <div className="ipb-canvas-bg flex items-center justify-center h-full min-h-[160px] p-8">
        <p className="font-mono text-[11px] uppercase tracking-[2px] text-ink/30 text-center">
          <span className="ipb-orb" style={{ color: ORANGE }}>✦</span>
          <span className="block mt-2">Your world will take shape here</span>
        </p>
      </div>
    );
  }

  return (
    <div className="ipb-canvas-bg min-h-full p-4 sm:p-8 flex items-start justify-center">
      <div className="ipb-materialize w-full max-w-sm rounded-xl border border-ink/10 overflow-hidden bg-[var(--page-bg)]/70 backdrop-blur-[1px]" style={{ boxShadow: `0 0 32px ${orangeMix(10)}` }}>
        {/* Cover */}
        {draft.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={draft.imageUrl} alt="" className="ipb-enter w-full aspect-[16/10] object-cover" />
        ) : (
          <div className="w-full aspect-[16/10] border-b border-dashed border-ink/15 flex items-center justify-center">
            <span className="font-mono text-[9px] uppercase tracking-[2px] text-ink/25">Cover — optional</span>
          </div>
        )}
        <div className="p-4 flex flex-col gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-[9px] font-bold uppercase tracking-[2px] px-1.5 py-0.5 rounded-sm bg-lime text-obsidian">Topia://World</span>
            {draft.category && (
              <span className="ipb-enter font-mono text-[9px] font-bold uppercase tracking-[2px] px-2 py-0.5 rounded-sm border" style={{ color: ORANGE, borderColor: orangeMix(55) }}>
                {draft.category}
              </span>
            )}
          </div>
          <h3 className="font-basement font-black text-[clamp(20px,3vw,28px)] uppercase leading-none text-ink">
            {draft.title}
          </h3>
          {draft.shortDescription && (
            <p className="ipb-enter font-mono text-[12px] text-ink/60 leading-relaxed">{draft.shortDescription}</p>
          )}
          {draft.country && (
            <p className="ipb-enter font-mono text-[10px] uppercase tracking-[2px] text-ink/40">📍 {draft.country}</p>
          )}
        </div>
      </div>
    </div>
  );
}
