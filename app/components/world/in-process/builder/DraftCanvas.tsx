'use client';

import type { BuilderCommand, DraftRoadmap } from '@/lib/roadmap-builder/types';
import { usdShort } from '@/lib/roadmap-builder/commands';
import { eraDateRange, formatEraDate } from '@/lib/eraDates';
import { ORANGE, STATUS_META, orangeMix } from '../constants';
import { Node } from '../Node';
import { DraftMilestoneEditor } from './DraftMilestoneEditor';

/* The live canvas — renders the draft in the roadmap's own visual language
 * (orange node timeline: filled done / ring now / hollow upcoming) over a
 * faint drafting grid, so what the user watches assemble IS what saves.
 * Milestones materialize in via .ipb-materialize keyed by DraftMilestone.key:
 * new keys mount and play the entrance, existing keys reorder without
 * re-animating. Vertical here (reads well in the mobile band and the desktop
 * pane); the saved roadmap renders in the real horizontal timeline. */

export function DraftCanvas({ draft, selectedKey, onSelect, onCommand, canFund }: {
  draft: DraftRoadmap | null;
  selectedKey: string | null;
  onSelect: (key: string | null) => void;
  onCommand: (cmd: BuilderCommand) => void;
  canFund?: boolean;
}) {
  if (!draft) {
    return (
      <div className="ipb-canvas-bg flex items-center justify-center h-full min-h-[160px] p-8">
        <p className="font-mono text-[11px] uppercase tracking-[2px] text-ink/30 text-center">
          <span className="ipb-orb" style={{ color: ORANGE }}>✦</span>
          <span className="block mt-2">Your roadmap will build here as you chat</span>
        </p>
      </div>
    );
  }

  const range = eraDateRange({
    startDate: draft.start?.value, startPrecision: draft.start?.precision,
    endDate: draft.end?.value, endPrecision: draft.end?.precision,
  });
  const nowIndex = draft.milestones.findIndex((m) => m.status === 'now');
  const lastDone = draft.milestones.reduce((acc, m, i) => (m.status === 'done' ? i : acc), -1);
  const litThrough = nowIndex >= 0 ? nowIndex : lastDone;
  const projectLabel = draft.project.mode === 'existing' ? draft.project.name
    : draft.project.mode === 'new' ? (draft.project.name ? `${draft.project.name} · new` : 'New project')
    : null;

  return (
    <div className="ipb-canvas-bg min-h-full p-4 sm:p-6">
      <div className="ipb-enter">
        {projectLabel && (
          <span
            className="inline-block font-mono text-[9px] font-bold uppercase tracking-[2px] px-2 py-0.5 rounded-sm border"
            style={{ color: ORANGE, borderColor: orangeMix(55) }}
          >
            Project · {projectLabel}
          </span>
        )}
        <h3 className="font-basement font-black text-[clamp(18px,2.5vw,26px)] uppercase leading-none text-ink mt-1.5">
          {draft.title}
        </h3>
        {draft.description && <p className="font-mono text-[12px] text-ink/55 mt-1">{draft.description}</p>}
        {range && <p className="font-mono text-[11px] uppercase tracking-[1px] text-ink/45 mt-1">{range}</p>}
      </div>

      <div className="mt-5 flex flex-col">
        {draft.milestones.map((m, i) => {
          const nodeState = m.status === 'done' ? 'done' : m.status === 'now' ? 'now' : 'future';
          const lit = i <= litThrough;
          const selected = m.key === selectedKey;
          return (
            <div key={m.key} className="ipb-materialize" style={{ ['--d' as string]: `${Math.min(i, 10) * 55}ms` }}>
              <div className="flex items-stretch gap-3">
                {/* Node + connector column */}
                <div className="flex flex-col items-center w-4 shrink-0">
                  <div className="pt-2">
                    {nodeState === 'now'
                      ? <span className="ipb-now-glow inline-flex"><Node state="now" small /></span>
                      : <Node state={nodeState} small />}
                  </div>
                  {i < draft.milestones.length - 1 && (
                    <span
                      className="w-px flex-1 min-h-[14px] transition-colors duration-500"
                      style={{ backgroundColor: lit ? orangeMix(60) : 'color-mix(in srgb, currentColor 15%, transparent)' }}
                    />
                  )}
                </div>
                <div className="flex-1 min-w-0 pb-3">
                  <button
                    onClick={() => onSelect(selected ? null : m.key)}
                    className={`w-full text-left rounded-md border px-3 py-2 cursor-pointer transition-all duration-300 bg-[var(--page-bg)]/60 backdrop-blur-[1px] ${
                      selected ? '' : 'border-ink/10 hover:border-ink/30 hover:-translate-y-px'
                    }`}
                    style={selected
                      ? { borderColor: orangeMix(70), backgroundColor: orangeMix(6), boxShadow: `0 0 16px ${orangeMix(14)}` }
                      : m.status === 'now' ? { borderColor: orangeMix(45) } : undefined}
                  >
                    <span className="flex items-baseline justify-between gap-2">
                      <span className={`font-mono text-[12px] font-bold ${m.status === 'done' ? 'text-ink/45' : 'text-ink'}`}>
                        {m.title}
                      </span>
                      <span className="font-mono text-[9px] uppercase tracking-[1px] shrink-0" style={{ color: m.status === 'now' ? ORANGE : undefined }}>
                        <span className={m.status === 'now' ? '' : 'text-ink/40'}>{STATUS_META[m.status] ?? m.status}</span>
                      </span>
                    </span>
                    <span className="flex items-center justify-between gap-2 mt-0.5">
                      {m.start ? (
                        <span className="font-mono text-[10px] uppercase tracking-[1px] text-ink/40">
                          {formatEraDate(m.start.value, m.start.precision)}{m.datePinned ? ' ·  pinned' : ''}
                        </span>
                      ) : <span />}
                      {m.goalCents != null && (
                        <span className="font-mono text-[9px] font-bold uppercase tracking-[1px] shrink-0" style={{ color: 'var(--accent-ink)' }}>
                          ◈ {usdShort(m.goalCents)} goal
                        </span>
                      )}
                    </span>
                  </button>
                  {selected && (
                    <DraftMilestoneEditor
                      milestone={m}
                      index={i}
                      canFund={canFund}
                      onCommand={onCommand}
                      onClose={() => onSelect(null)}
                    />
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
