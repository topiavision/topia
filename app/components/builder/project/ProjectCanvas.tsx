'use client';

import type { DraftProject } from '@/lib/builder/project';

/* The Project Builder's live canvas — the project card assembling as the
 * conversation fills it in: cover, name, one-liner, tag + tool pills,
 * credits row, link. Same drafting-grid ground as every builder canvas. */

const ORANGE = 'var(--orange, #FF5C34)';
const orangeMix = (pct: number) => `color-mix(in srgb, var(--orange) ${pct}%, transparent)`;

export function ProjectCanvas({ draft }: { draft: DraftProject | null }) {
  if (!draft || !draft.name) {
    return (
      <div className="ipb-canvas-bg flex items-center justify-center h-full min-h-[160px] p-8">
        <p className="font-mono text-[11px] uppercase tracking-[2px] text-ink/30 text-center">
          <span className="ipb-orb" style={{ color: ORANGE }}>✦</span>
          <span className="block mt-2">Your project will take shape here</span>
        </p>
      </div>
    );
  }

  return (
    <div className="ipb-canvas-bg min-h-full p-4 sm:p-8 flex items-start justify-center">
      <div className="ipb-materialize w-full max-w-sm rounded-xl border border-ink/10 overflow-hidden bg-[var(--page-bg)]/70 backdrop-blur-[1px]" style={{ boxShadow: `0 0 32px ${orangeMix(10)}` }}>
        {draft.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={draft.imageUrl} alt="" className="ipb-enter w-full aspect-video object-cover" />
        ) : (
          <div className="w-full aspect-video border-b border-dashed border-ink/15 flex items-center justify-center">
            <span className="font-mono text-[9px] uppercase tracking-[2px] text-ink/25">
              {draft.url ? 'Cover — borrowing from your site' : 'Cover — optional'}
            </span>
          </div>
        )}
        <div className="p-4 flex flex-col gap-2.5">
          <h3 className="font-basement font-black text-[clamp(18px,2.5vw,24px)] uppercase leading-none text-ink">
            {draft.name}
          </h3>
          {draft.description && (
            <p className="ipb-enter font-mono text-[12px] text-ink/60 leading-relaxed">{draft.description}</p>
          )}
          {(draft.tags.length > 0 || draft.tools.length > 0) && (
            <div className="flex flex-wrap gap-1.5">
              {draft.tags.map((t) => (
                <span key={`tag-${t}`} className="ipb-enter font-mono text-[9px] uppercase tracking-[1px] px-2 py-0.5 rounded-full border border-ink/15 text-ink/55">
                  {t}
                </span>
              ))}
              {draft.tools.map((t) => (
                <span key={`tool-${t}`} className="ipb-enter font-mono text-[9px] font-bold uppercase tracking-[1px] px-2 py-0.5 rounded-full bg-lime text-obsidian">
                  {t}
                </span>
              ))}
            </div>
          )}
          {draft.credits.length > 0 && (
            <div className="ipb-enter flex flex-col gap-1 pt-1 border-t border-ink/[0.08]">
              {draft.credits.map((c) => (
                <span key={c.userId} className="font-mono text-[11px] text-ink/60">
                  <span className="text-ink font-bold">{c.name}</span>
                  {c.role ? <span className="text-ink/45"> — {c.role}</span> : null}
                </span>
              ))}
            </div>
          )}
          {(draft.url || draft.videoUrl) && (
            <p className="ipb-enter font-mono text-[10px] uppercase tracking-[1px] truncate" style={{ color: ORANGE }}>
              {draft.videoUrl ? '▶ ' : '🔗 '}{(draft.url ?? draft.videoUrl ?? '').replace(/^https?:\/\//, '')}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
