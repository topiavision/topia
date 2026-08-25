'use client';

import { eraDateRange } from '@/lib/eraDates';
import { ORANGE, STATUS_META, orangeMix } from './constants';
import type { EraMilestoneView } from './types';
import { useState } from 'react';
import { FundingMeter } from './funding/FundingMeter';
import { BackMilestoneModal } from './funding/BackMilestoneModal';
import { usd } from './funding/format';
import { totalRaisedCents, type FundingGoalView } from './funding/types';
/* ── Inline milestone detail — appears under the timeline when a node
 * card is selected; the process log below filters to match. ─────────── */
export function MilestoneDetail({ m, index, updateCount, canEdit, goal, acceptingSupport, worldTitle, privyId, onEdit, onClose }: {
  m: EraMilestoneView; index: number; updateCount: number; canEdit: boolean;
  /** Funding goal for this milestone. Absent for the many milestones that
   *  need no money — in which case no funding UI renders at all. */
  goal?: FundingGoalView;
  /** Server-computed: whether this goal can actually take money right now.
   *  The UI never re-derives the rule. */
  acceptingSupport?: boolean;
  worldTitle?: string;
  privyId?: string | null;
  onEdit: () => void; onClose: () => void;
}) {
  const [backing, setBacking] = useState(false);
  const accent = m.status === 'done' || m.status === 'now';
  return (
    <div className="mt-3 rounded-lg border-l-[3px] border border-ink/[0.1] p-4" style={{ borderLeftColor: orangeMix(70) }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[10px] font-bold uppercase tracking-[2px]" style={{ color: accent ? ORANGE : 'color-mix(in srgb, var(--page-text) 45%, transparent)' }}>
            M{String(index + 1).padStart(2, '0')} · {STATUS_META[m.status] ?? m.status.toUpperCase()}
          </p>
          <h4 className="font-basement font-black text-[18px] uppercase leading-tight text-ink mt-1">{m.title}</h4>
          {(eraDateRange(m) ?? m.dateLabel) && (
            <p className="font-mono text-[11px] uppercase tracking-[1px] text-ink/45 mt-1">{eraDateRange(m) ?? m.dateLabel}</p>
          )}
        </div>
        <button onClick={onClose} aria-label="Close milestone" className="bg-transparent border-none cursor-pointer text-[18px] leading-none p-0 text-ink/50">×</button>
      </div>
      <div className="flex flex-wrap gap-4 mt-2 items-start">
        {m.imageUrl && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={m.imageUrl} alt="" className="w-full sm:w-[220px] max-h-[160px] object-cover rounded-sm" />
        )}
        {(m.details || m.description) && (
          <div className="flex-1 min-w-[200px]">
            {m.description && <p className="font-mono text-[12.5px] text-ink/70 leading-relaxed">{m.description}</p>}
            {/* The full picture — multi-line, whitespace kept. The one-liner
                above stays the summary; this is the room the brief asked for. */}
            {m.details && (
              <p className="font-mono text-[12px] text-ink/60 leading-relaxed mt-2 whitespace-pre-wrap">{m.details}</p>
            )}
          </div>
        )}
      </div>
      {goal && (goal.goalCents != null || totalRaisedCents(goal) > 0) && (
        <div
          className="mt-3.5 rounded-lg px-4 py-3.5"
          style={{
            backgroundColor: 'color-mix(in srgb, var(--lime) 16%, transparent)',
            border: '1px solid color-mix(in srgb, var(--accent-ink) 28%, transparent)',
          }}
        >
          <p>
            <span className="font-mono text-[20px] font-bold tabular-nums" style={{ color: 'var(--accent-ink)' }}>
              {usd(totalRaisedCents(goal))}
            </span>
            {goal.goalCents != null && (
              <span className="font-mono text-[13px] text-ink/45"> of {usd(goal.goalCents)} goal</span>
            )}
          </p>
          <FundingMeter
            raisedCents={totalRaisedCents(goal)}
            goalCents={goal.goalCents}
            patronCount={goal.patronCount}
            size="lg"
            className="mt-2.5"
          />
          {/* Which part came from outside Topia — always labeled, per the brief. */}
          {(goal.externalRaisedCents ?? 0) > 0 && (
            <p className="font-mono text-[10.5px] text-ink/45 mt-1.5">
              incl. {usd(goal.externalRaisedCents!)} raised outside Topia
            </p>
          )}
          {goal.blurb && (
            <p className="font-mono text-[11.5px] text-ink/60 mt-2.5 leading-relaxed">{goal.blurb}</p>
          )}

          {/* One CTA per milestone, and it lives here — never on the card,
            * which is already a <button>. A goal whose payee hasn't finished
            * connecting shows honest copy rather than a button that fails. */}
          <div className="mt-3.5">
            {acceptingSupport ? (
              <button
                onClick={() => setBacking(true)}
                className="font-mono text-[11px] uppercase tracking-[2px] font-bold px-5 py-2.5 rounded-sm cursor-pointer border-none"
                style={{ backgroundColor: 'var(--lime)', color: 'var(--obsidian)' }}
              >
                {goal.goalCents != null && goal.raisedCents >= goal.goalCents
                  ? 'Back it anyway'
                  : 'Back this milestone'}
              </button>
            ) : (
              <p className="font-mono text-[11px] uppercase tracking-[1px] text-ink/40">
                Backing opens soon
              </p>
            )}
          </div>
        </div>
      )}

      {backing && goal && (
        <BackMilestoneModal
          goal={goal}
          milestoneLabel={`M${String(index + 1).padStart(2, '0')} · ${STATUS_META[m.status] ?? m.status.toUpperCase()}`}
          worldTitle={worldTitle}
          privyId={privyId}
          onClose={() => setBacking(false)}
        />
      )}

      <div className="flex items-center gap-4 mt-3 pt-2.5 border-t border-ink/[0.06]">
        <span className="font-mono text-[10px] uppercase tracking-[1px] text-ink/45">
          {updateCount > 0 ? <>↓ {updateCount} update{updateCount === 1 ? '' : 's'} in the log below</> : 'No updates logged for this yet'}
        </span>
        {canEdit && (
          <button onClick={onEdit} className="font-mono text-[10px] uppercase tracking-[1px] underline cursor-pointer bg-transparent border-none text-ink/50">✎ Edit</button>
        )}
      </div>
    </div>
  );
}
