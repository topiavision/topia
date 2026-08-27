'use client';

import { useState } from 'react';
import Link from 'next/link';
import { eraDateRange } from '@/lib/eraDates';
import { ORANGE, STATUS_META, orangeMix } from './constants';
import { Node } from './Node';
import { EraForm } from './EraForm';
import { MilestoneModal } from './MilestoneModal';
import { MilestoneDetail } from './MilestoneDetail';
import { NowUnit } from './NowUnit';
import { ProcessLog } from './ProcessLog';
import { PostComposer } from './PostComposer';
import type { EraMilestoneView, EraView, ProjectOption } from './types';
import { usd } from './funding/format';
import { totalRaisedCents, type FundingGoalView, type GoalMap } from './funding/types';
/* ── One era: the spine (identity + vertical milestone rail) on the
 * left, the living log (NOW unit + feed) on the right. Mobile stacks
 * era → happening-now → rail → log, per the approved redesign. ────── */
export function EraSection({ era, worldId, worldSlug, projects, privyId, canEdit, canMint, onChanged, hideProjectChip, tourAnchor, goals, canFund, acceptingSupport, payeeMissing, worldTitle, accessToken, onGoalsChanged, orientation = 'horizontal' }: {
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
  /** Desktop defaults to a horizontal roadmap. Mobile always uses the stacked
   *  rail, regardless of this preference. */
  orientation?: 'horizontal' | 'vertical';
  /** First rendered era carries the walkthrough's spotlight anchors. */
  tourAnchor?: boolean;
}) {
  const [editingEra, setEditingEra] = useState(false);
  const [milestoneModal, setMilestoneModal] = useState<{ existing?: EraMilestoneView } | null>(null);
  const [selectedMsId, setSelectedMsId] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);

  // Exactly ONE milestone reads as "now" — the first. Later rows that also
  // carry the status keep their orange word without the shouting box.
  const nowMilestones = era.milestones.filter((m) => m.status === 'now');
  const nowIndex = era.milestones.findIndex((m) => m.status === 'now');
  const lastDone = era.milestones.reduce((acc, m, i) => (m.status === 'done' ? i : acc), -1);
  const litThrough = nowIndex >= 0 ? nowIndex : lastDone; // connector lights up to here
  // The NOW unit's subject: the in-motion milestone, else the latest done,
  // else the first step — a fresh roadmap still opens with something honest.
  const currentIndex = nowIndex >= 0 ? nowIndex : lastDone >= 0 ? lastDone : era.milestones.length > 0 ? 0 : -1;
  const currentMs = currentIndex >= 0 ? era.milestones[currentIndex] : null;

  const selectedIndex = selectedMsId ? era.milestones.findIndex((m) => m.id === selectedMsId) : -1;
  const selectedMs = selectedIndex >= 0 ? era.milestones[selectedIndex] : null;
  const updateCount = (id: string) => era.posts.filter((p) => p.milestoneId === id).length;

  // Aggregate support: a quiet sentence once money exists, never a $0 slab.
  const eraGoals = [
    ...era.milestones.map((m) => goals?.get(m.id)),
    era.projectId ? goals?.get(era.projectId) : undefined,
  ].filter((g): g is FundingGoalView => !!g);
  const raisedTotal = eraGoals.reduce((sum, g) => sum + totalRaisedCents(g), 0);
  const backerTotal = eraGoals.reduce((sum, g) => sum + g.patronCount, 0);

  const openMilestone = (id: string) => setSelectedMsId((prev) => (prev === id ? null : id));

  /* ── shared fragments ─────────────────────────────────────────────── */

  const eraIdentity = (
    <div>
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
          <h3 className="font-basement font-black text-[clamp(20px,2.6vw,26px)] uppercase leading-none text-ink mt-1.5">
            {era.title}
          </h3>
          {era.description && <p className="font-mono text-[12px] text-ink/55 mt-1.5">{era.description}</p>}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2">
            {eraDateRange(era) && (
              <p className="font-mono text-[11px] uppercase tracking-[1px] text-ink/45">{eraDateRange(era)}</p>
            )}
            {era.status === 'active' && nowIndex >= 0 && (
              <p className="font-mono text-[10px] font-bold uppercase tracking-[2px]" style={{ color: ORANGE }}>● In motion</p>
            )}
            {era.status === 'complete' && (
              <p className="font-mono text-[10px] font-bold uppercase tracking-[2px] text-ink/40">✓ Past roadmap</p>
            )}
            {era.status === 'archived' && (
              <p className="font-mono text-[10px] font-bold uppercase tracking-[2px]" style={{ color: ORANGE }}>Archived — only builders see this</p>
            )}
            {canEdit && (
              <button onClick={() => setEditingEra((e) => !e)} className="font-mono text-[10px] uppercase tracking-[1px] underline cursor-pointer bg-transparent border-none text-ink/50">
                {editingEra ? 'Close' : '✎ Edit'}
              </button>
            )}
          </div>
        </div>
      </div>

      {editingEra && (
        <div className="mt-3">
          <EraForm worldId={worldId} projects={projects} existing={era} privyId={privyId}
            onClose={() => setEditingEra(false)} onChanged={onChanged} />
        </div>
      )}

      {canEdit && nowMilestones.length > 1 && (
        <div className="mt-3 rounded-lg border border-orange/35 bg-orange/[0.04] px-3.5 py-3" role="alert">
          <p className="font-mono text-[10px] font-bold uppercase tracking-[1.5px] text-orange">Choose one current milestone</p>
          <p className="font-mono text-[11px] leading-relaxed text-ink/55 mt-1">
            {nowMilestones.length} milestones are marked Now. Edit the real current milestone and save it as “In motion (now)” to clean up the roadmap.
          </p>
        </div>
      )}

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
    </div>
  );

  const nowUnit = currentMs && (
    <NowUnit
      m={currentMs}
      index={currentIndex}
      posts={era.posts}
      goal={goals?.get(currentMs.id)}
      acceptingSupport={acceptingSupport}
      onSupport={() => setSelectedMsId(currentMs.id)}
    />
  );

  const rail = (
    <div id={tourAnchor ? 'tour-ip-timeline' : undefined} className="flex flex-col">
      {era.milestones.map((m, i) => {
        const isTheNow = i === nowIndex;
        const nodeState = m.status === 'done' ? 'done' : m.status === 'now' ? 'now' : 'future';
        const lit = i < litThrough + (nowIndex >= 0 ? 0 : 1);
        const isSelected = selectedMsId === m.id;
        const count = updateCount(m.id);
        const range = eraDateRange(m) ?? m.dateLabel;
        const fuzzy = range && (m.status === 'upcoming' || m.status === 'paused') ? `~${range}` : range;
        const last = i === era.milestones.length - 1 && !canEdit;
        const dim = m.status === 'done' || m.status === 'paused';
        return (
          <div key={m.id} className="flex gap-3.5">
            {/* node + vertical connector */}
            <div className="flex flex-col items-center w-4 shrink-0">
              <span className="pt-[3px]"><Node state={nodeState} /></span>
              {!last && (
                <span
                  className="w-[2px] flex-grow my-0.5"
                  style={{ backgroundColor: lit ? ORANGE : 'color-mix(in srgb, var(--page-text) 14%, transparent)' }}
                />
              )}
            </div>
            <div className={`min-w-0 flex-grow ${last ? '' : 'pb-5'}`}>
              <button
                onClick={() => openMilestone(m.id)}
                aria-pressed={isSelected}
                className={`block w-full text-left cursor-pointer bg-transparent transition-colors ${
                  isTheNow || isSelected
                    ? 'rounded-md px-3 py-2.5 border-2'
                    : 'border-none p-0 hover:opacity-80'
                } ${dim && !isSelected ? 'opacity-55' : ''}`}
                style={isTheNow || isSelected ? {
                  borderColor: ORANGE,
                  backgroundColor: isSelected ? orangeMix(9) : orangeMix(7),
                } : undefined}
              >
                <p className="font-mono text-[9px] font-bold uppercase tracking-[2px]" style={{ color: m.status === 'done' || m.status === 'now' ? ORANGE : 'color-mix(in srgb, var(--page-text) 40%, transparent)' }}>
                  M{String(i + 1).padStart(2, '0')} · {STATUS_META[m.status] ?? m.status.toUpperCase()}
                </p>
                <p className="font-mono text-[13px] font-bold text-ink leading-tight mt-1">{m.title}</p>
                <p className="font-mono text-[10px] uppercase tracking-[1px] text-ink/40 mt-1">
                  {fuzzy}
                  {fuzzy && count > 0 && ' · '}
                  {count > 0 && <>{count} update{count === 1 ? '' : 's'}</>}
                </p>
              </button>
              {/* Expanded IN PLACE — description, funding, backing, edit. */}
              {isSelected && selectedMs && (
                <MilestoneDetail
                  goal={goals?.get(m.id)}
                  acceptingSupport={acceptingSupport}
                  worldTitle={worldTitle}
                  privyId={privyId}
                  m={m}
                  index={i}
                  updateCount={count}
                  canEdit={canEdit}
                  onEdit={() => setMilestoneModal({ existing: m })}
                  onClose={() => setSelectedMsId(null)}
                />
              )}
            </div>
          </div>
        );
      })}

      {canEdit && (
        <div className="flex gap-3.5">
          <div className="flex flex-col items-center w-4 shrink-0 pt-[3px]">
            <span className="w-3.5 h-3.5 rounded-full border-2 border-dashed border-ink/25 shrink-0" />
          </div>
          <button
            onClick={() => setMilestoneModal({})}
            className="rounded-sm border-2 border-dashed border-ink/20 px-4 py-2.5 bg-transparent cursor-pointer font-mono text-[10px] uppercase tracking-[1px] text-ink/45 hover:border-ink/40 hover:text-ink/70 transition self-start"
          >
            + Milestone
          </button>
        </div>
      )}
      {era.milestones.length === 0 && !canEdit && (
        <p className="font-mono text-[11px] text-ink/35">No milestones yet.</p>
      )}
    </div>
  );

  const horizontalRail = (
    <div id={tourAnchor ? 'tour-ip-timeline-horizontal' : undefined} className="overflow-x-auto max-w-full pb-2" style={{ scrollbarWidth: 'thin' }}>
      <div className="flex min-w-max pt-1">
        {era.milestones.map((m, i) => {
          const isTheNow = i === nowIndex;
          const nodeState = m.status === 'done' ? 'done' : m.status === 'now' ? 'now' : 'future';
          const isSelected = selectedMsId === m.id;
          const count = updateCount(m.id);
          const range = eraDateRange(m) ?? m.dateLabel;
          const fuzzy = range && (m.status === 'upcoming' || m.status === 'paused') ? `~${range}` : range;
          const dim = m.status === 'done' || m.status === 'paused';
          return (
            <div key={m.id} className="w-[230px] shrink-0 pr-4 last:pr-0">
              <div className="h-5 flex items-center">
                <Node state={nodeState} />
                {i < era.milestones.length - 1 && (
                  <span className="h-[2px] flex-1 ml-2" style={{ backgroundColor: i < litThrough ? ORANGE : 'color-mix(in srgb, var(--page-text) 14%, transparent)' }} />
                )}
              </div>
              <button
                onClick={() => openMilestone(m.id)}
                aria-pressed={isSelected}
                className={`mt-2 w-full min-h-[112px] text-left rounded-lg px-3 py-3 cursor-pointer transition-colors ${isTheNow || isSelected ? 'border-2' : 'border border-ink/[0.1] bg-transparent hover:border-ink/30'} ${dim && !isSelected ? 'opacity-60' : ''}`}
                style={isTheNow || isSelected ? { borderColor: ORANGE, backgroundColor: orangeMix(isSelected ? 10 : 7) } : undefined}
              >
                <p className="font-mono text-[9px] font-bold uppercase tracking-[2px]" style={{ color: m.status === 'done' || m.status === 'now' ? ORANGE : 'color-mix(in srgb, var(--page-text) 42%, transparent)' }}>M{String(i + 1).padStart(2, '0')} · {STATUS_META[m.status] ?? m.status.toUpperCase()}</p>
                <p className="font-mono text-[13px] font-bold text-ink leading-tight mt-2 line-clamp-2">{m.title}</p>
                <p className="font-mono text-[10px] uppercase tracking-[1px] text-ink/40 mt-2">{fuzzy}{fuzzy && count > 0 && ' · '}{count > 0 && <>{count} update{count === 1 ? '' : 's'}</>}</p>
              </button>
            </div>
          );
        })}
        {canEdit && (
          <div className="w-[190px] shrink-0 pt-7">
            <button onClick={() => setMilestoneModal({})} className="w-full min-h-[112px] rounded-lg border border-dashed border-ink/20 px-4 py-3 bg-transparent cursor-pointer font-mono text-[10px] uppercase tracking-[1px] text-ink/45 hover:border-ink/40 hover:text-ink/70 transition">+ Milestone</button>
          </div>
        )}
      </div>
      {selectedMs && (
        <div className="mt-4 max-w-2xl">
          <MilestoneDetail
            goal={goals?.get(selectedMs.id)}
            acceptingSupport={acceptingSupport}
            worldTitle={worldTitle}
            privyId={privyId}
            m={selectedMs}
            index={selectedIndex}
            updateCount={updateCount(selectedMs.id)}
            canEdit={canEdit}
            onEdit={() => setMilestoneModal({ existing: selectedMs })}
            onClose={() => setSelectedMsId(null)}
          />
        </div>
      )}
      {era.milestones.length === 0 && !canEdit && <p className="font-mono text-[11px] text-ink/35 py-4">No milestones yet.</p>}
    </div>
  );

  const supportLine = (raisedTotal > 0 || (!hideProjectChip && era.projectSlug)) && (
    <div className="mt-5 pt-4 border-t border-ink/[0.08] flex flex-col gap-2 items-start">
      {raisedTotal > 0 && (
        <p className="font-mono text-[11px] text-ink/60">
          {usd(raisedTotal)} raised across this roadmap{backerTotal > 0 && <> · {backerTotal} patron{backerTotal === 1 ? '' : 's'}</>}
        </p>
      )}
      {!hideProjectChip && era.projectSlug && (
        <Link
          href={`/worlds/${worldSlug}/projects/${era.projectSlug}`}
          className="font-mono text-[10px] uppercase tracking-[1px] no-underline hover:opacity-75 transition-opacity"
          style={{ color: ORANGE }}
        >
          View full project ↗
        </Link>
      )}
    </div>
  );

  /* ── layout ───────────────────────────────────────────────────────── */

  return (
    <div className={orientation === 'horizontal' ? 'block' : 'lg:grid lg:grid-cols-[minmax(300px,380px)_minmax(0,1fr)] lg:gap-9 lg:items-start'}>
      {/* THE SPINE */}
      <div className="min-w-0">
        {eraIdentity}
        {/* Mobile leads with liveness — the NOW unit sits between the era
            header and the rail; on lg it lives atop the log column. */}
        {nowUnit && <div className="lg:hidden mt-5">{nowUnit}</div>}
        <div className={`mt-6 ${orientation === 'horizontal' ? 'lg:hidden' : ''}`}>{rail}</div>
        {orientation === 'horizontal' && <div className="hidden lg:block mt-6">{horizontalRail}</div>}
        {supportLine}
      </div>

      {/* THE LIVING LOG */}
      <div className={`min-w-0 mt-8 ${orientation === 'horizontal' ? 'lg:grid lg:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.2fr)] lg:gap-5 lg:items-start' : 'lg:mt-0'}`}>
        {nowUnit && <div className="hidden lg:block">{nowUnit}</div>}
        <div id={tourAnchor ? 'tour-ip-log' : undefined} className={orientation === 'horizontal' ? '' : nowUnit ? 'mt-6' : ''}>
          <ProcessLog
            era={era}
            privyId={privyId}
            canEdit={canEdit}
            onChanged={onChanged}
            onCompose={canEdit ? () => setComposing(true) : undefined}
            filter={selectedMs ? { id: selectedMs.id, index: selectedIndex, title: selectedMs.title } : null}
            onClearFilter={() => setSelectedMsId(null)}
          />
        </div>
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
      </div>

      {milestoneModal && (
        <MilestoneModal
          milestones={era.milestones}
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
