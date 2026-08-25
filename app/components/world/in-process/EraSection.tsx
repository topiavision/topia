'use client';

import { useState } from 'react';
import Link from 'next/link';
import { eraDateRange } from '@/lib/eraDates';
import { btnGhost } from '../InProcessFields';
import { ORANGE, STATUS_META, orangeMix } from './constants';
import { Node } from './Node';
import { EraForm } from './EraForm';
import { MilestoneModal } from './MilestoneModal';
import { MilestoneDetail } from './MilestoneDetail';
import { ProcessLog } from './ProcessLog';
import { PostComposer } from './PostComposer';
import type { EraMilestoneView, EraView, ProjectOption } from './types';
import { RoadmapFundingBar } from './funding/RoadmapFundingBar';
import { FundingMeter } from './funding/FundingMeter';
import type { GoalMap } from './funding/types';
/* ── One era section: header + node timeline + log ─────────────────── */
export function EraSection({ era, worldId, worldSlug, projects, privyId, canEdit, canMint, onChanged, hideProjectChip, tourAnchor, goals, canFund, acceptingSupport, payeeMissing, worldTitle, accessToken, onGoalsChanged }: {
  era: EraView; worldId: string; worldSlug: string; projects: ProjectOption[]; privyId: string;
  canEdit: boolean; canMint: boolean; onChanged: () => void; hideProjectChip?: boolean;
  /** Funding goals for this world, keyed by the id of what they fund. Empty
   *  for the common case of a roadmap with no funding at all. */
  goals?: GoalMap;
  /** Whether this world's admin has funding access (phased rollout). */
  canFund?: boolean;
  /** Server-computed: this world's payee can actually receive money. */
  acceptingSupport?: boolean;
  /** The world has no owner, so nothing here can be funded. Builders-only. */
  payeeMissing?: boolean;
  worldTitle?: string;
  accessToken?: string | null;
  onGoalsChanged?: () => void;
  /** First rendered era carries the walkthrough's spotlight anchors. */
  tourAnchor?: boolean;
}) {
  const [editingEra, setEditingEra] = useState(false);
  const [milestoneModal, setMilestoneModal] = useState<{ existing?: EraMilestoneView } | null>(null);
  const [selectedMsId, setSelectedMsId] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);

  const nowIndex = era.milestones.findIndex((m) => m.status === 'now');
  const lastDone = era.milestones.reduce((acc, m, i) => (m.status === 'done' ? i : acc), -1);
  const litThrough = nowIndex >= 0 ? nowIndex : lastDone; // connector lights up to here

  const selectedIndex = selectedMsId ? era.milestones.findIndex((m) => m.id === selectedMsId) : -1;
  const selectedMs = selectedIndex >= 0 ? era.milestones[selectedIndex] : null;
  const selectedUpdateCount = selectedMs ? era.posts.filter((p) => p.milestoneId === selectedMs.id).length : 0;

  return (
    <div>
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          {!hideProjectChip && era.projectName && era.projectSlug && (
            <Link
              href={`/worlds/${worldSlug}/projects/${era.projectSlug}`}
              className="inline-block font-mono text-[9px] font-bold uppercase tracking-[2px] px-2 py-0.5 rounded-sm no-underline border hover:opacity-75 transition-opacity"
              style={{ color: ORANGE, borderColor: orangeMix(55) }}
            >
              Project · {era.projectName}
            </Link>
          )}
          <h3 className="font-basement font-black text-[clamp(20px,3vw,30px)] uppercase leading-none text-ink mt-1">
            {era.title}
          </h3>
          {era.description && <p className="font-mono text-[12px] text-ink/55 mt-1">{era.description}</p>}
        </div>
        <div className="text-right shrink-0">
          {eraDateRange(era) && (
            <p className="font-mono text-[11px] uppercase tracking-[1px] text-ink/45">{eraDateRange(era)}</p>
          )}
          {era.status === 'active' && nowIndex >= 0 && (
            <p className="font-mono text-[10px] font-bold uppercase tracking-[2px] mt-0.5" style={{ color: ORANGE }}>● In motion</p>
          )}
          {era.status === 'complete' && (
            <p className="font-mono text-[10px] font-bold uppercase tracking-[2px] mt-0.5 text-ink/40">✓ Past era</p>
          )}
          {era.status === 'archived' && (
            <p className="font-mono text-[10px] font-bold uppercase tracking-[2px] mt-0.5" style={{ color: ORANGE }}>Archived — only builders see this</p>
          )}
          <span className="inline-flex items-center gap-3 mt-1">
            {!hideProjectChip && era.projectSlug && (
              <Link
                href={`/worlds/${worldSlug}/projects/${era.projectSlug}`}
                className="font-mono text-[10px] uppercase tracking-[1px] no-underline hover:opacity-75 transition-opacity"
                style={{ color: ORANGE }}
              >
                View full project ↗
              </Link>
            )}
            {canEdit && (
              <button onClick={() => setEditingEra((e) => !e)} className="font-mono text-[10px] uppercase tracking-[1px] underline cursor-pointer bg-transparent border-none text-ink/50">
                {editingEra ? 'Close' : '✎ Edit'}
              </button>
            )}
          </span>
        </div>
      </div>

      {editingEra && (
        <div className="mt-3">
          <EraForm worldId={worldId} projects={projects} existing={era} privyId={privyId}
            onClose={() => setEditingEra(false)} onChanged={onChanged} />
        </div>
      )}

      {/* Node timeline — the mockup's connected dots + cards */}
      {payeeMissing && (
        <p
          className="mt-3 font-mono text-[11px] leading-relaxed rounded-lg px-3.5 py-2.5"
          style={{
            color: 'var(--orange)',
            border: '1px solid color-mix(in srgb, var(--orange) 40%, transparent)',
          }}
        >
          This world has no owner set, so there&apos;s nobody to pay — funding is
          unavailable until one is assigned on the Members page.
        </p>
      )}

      {goals && goals.size > 0 && (
        <RoadmapFundingBar
          milestones={era.milestones}
          goals={goals}
          projectGoalId={era.projectId ?? null}
        />
      )}

      <div id={tourAnchor ? 'tour-ip-timeline' : undefined} className="overflow-x-auto mt-5 pb-1" style={{ scrollbarWidth: 'thin' }}>
        <div className="flex min-w-max">
          {era.milestones.map((m, i) => {
            const isNow = m.status === 'now';
            const nodeState = m.status === 'done' ? 'done' : isNow ? 'now' : 'future';
            const lit = i <= litThrough;
            return (
              <div key={m.id} className="w-[236px] shrink-0 pr-3">
                {/* node + connector */}
                <div className="relative h-5 flex items-center">
                  <Node state={nodeState} />
                  {i < era.milestones.length - 1 && (
                    <span className="absolute top-1/2 -translate-y-1/2 h-[2px]" style={{ left: 18, right: -12, backgroundColor: lit && i < litThrough + (nowIndex >= 0 ? 0 : 1) ? ORANGE : 'color-mix(in srgb, var(--page-text) 14%, transparent)' }} />
                  )}
                </div>
                {/* card — tap to select: detail opens below, log filters to it */}
                <button
                  onClick={() => setSelectedMsId((prev) => (prev === m.id ? null : m.id))}
                  aria-pressed={selectedMsId === m.id}
                  className="block w-full text-left mt-2 rounded-sm px-3.5 py-3 cursor-pointer transition-colors hover:bg-ink/[0.04]"
                  style={{
                    border: `${isNow || selectedMsId === m.id ? 2 : 1}px solid ${isNow || selectedMsId === m.id ? ORANGE : 'color-mix(in srgb, var(--page-text) 10%, transparent)'}`,
                    backgroundColor: selectedMsId === m.id ? orangeMix(9) : 'transparent',
                    opacity: m.status === 'paused' ? 0.55 : 1,
                  }}
                >
                  <p className="font-mono text-[9px] font-bold uppercase tracking-[2px]" style={{ color: m.status === 'done' || isNow ? ORANGE : 'color-mix(in srgb, var(--page-text) 40%, transparent)' }}>
                    M{String(i + 1).padStart(2, '0')} · {STATUS_META[m.status] ?? m.status.toUpperCase()}
                  </p>
                  <p className="font-mono text-[14px] font-bold text-ink leading-tight mt-1.5">{m.title}</p>
                  {(eraDateRange(m) ?? m.dateLabel) && (
                    <p className="font-mono text-[10px] uppercase tracking-[1px] text-ink/40 mt-1">{eraDateRange(m) ?? m.dateLabel}</p>
                  )}
                  {isNow && m.imageUrl && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={m.imageUrl} alt="" className="w-full h-[96px] object-cover rounded-sm mt-2" loading="lazy" />
                  )}
                  {m.description && <p className="font-mono text-[11px] text-ink/50 mt-2 line-clamp-3">{m.description}</p>}
                  {/* Funding is per-milestone and optional — a milestone with
                    * no goal renders exactly as it always has. */}
                  {(() => {
                    const g = goals?.get(m.id);
                    if (!g || (g.goalCents == null && g.raisedCents === 0)) return null;
                    return (
                      <FundingMeter
                        raisedCents={g.raisedCents}
                        goalCents={g.goalCents}
                        size="sm"
                        className="mt-2.5"
                      />
                    );
                  })()}
                </button>
              </div>
            );
          })}

          {/* Add-milestone ghost card */}
          {canEdit && (
            <div className="w-[180px] shrink-0">
              <div className="relative h-5 flex items-center">
                <span className="w-3.5 h-3.5 rounded-full border-2 border-dashed border-ink/25 shrink-0" />
              </div>
              <button
                onClick={() => setMilestoneModal({})}
                className="w-full mt-2 rounded-sm border-2 border-dashed border-ink/20 px-3.5 py-6 bg-transparent cursor-pointer font-mono text-[11px] uppercase tracking-[1px] text-ink/45 hover:border-ink/40 hover:text-ink/70 transition"
              >
                + Milestone
              </button>
            </div>
          )}
        </div>
      </div>
      {era.milestones.length === 0 && !canEdit && (
        <p className="font-mono text-[11px] text-ink/35 mt-2">No milestones yet.</p>
      )}

      {selectedMs && (
        <MilestoneDetail
          goal={selectedMs ? goals?.get(selectedMs.id) : undefined}
          acceptingSupport={acceptingSupport}
          worldTitle={worldTitle}
          privyId={privyId}
          m={selectedMs}
          index={selectedIndex}
          updateCount={selectedUpdateCount}
          canEdit={canEdit}
          onEdit={() => setMilestoneModal({ existing: selectedMs })}
          onClose={() => setSelectedMsId(null)}
        />
      )}

      <div id={tourAnchor ? 'tour-ip-log' : undefined}>
        <ProcessLog
          era={era}
          privyId={privyId}
          canEdit={canEdit}
          onChanged={onChanged}
          filter={selectedMs ? { id: selectedMs.id, index: selectedIndex, title: selectedMs.title } : null}
          onClearFilter={() => setSelectedMsId(null)}
        />
      </div>

      {canEdit && !composing && (
        <button onClick={() => setComposing(true)} className={`${btnGhost} mt-3`}>
          + Post an update{selectedMs ? ` to M${String(selectedIndex + 1).padStart(2, '0')}` : ''}
        </button>
      )}
      {composing && (
        <PostComposer
          era={era}
          privyId={privyId}
          canMint={canMint}
          initialMilestoneId={selectedMs?.id ?? ''}
          onClose={() => setComposing(false)}
          onChanged={onChanged}
        />
      )}

      {milestoneModal && (
        <MilestoneModal
          goal={milestoneModal.existing ? goals?.get(milestoneModal.existing.id) : undefined}
          canFund={canFund}
          accessToken={accessToken}
          eraId={era.id}
          existing={milestoneModal.existing}
          nextIndex={era.milestones.length}
          privyId={privyId}
          onClose={() => setMilestoneModal(null)}
          onChanged={() => { onChanged(); onGoalsChanged?.(); }}
        />
      )}
    </div>
  );
}
