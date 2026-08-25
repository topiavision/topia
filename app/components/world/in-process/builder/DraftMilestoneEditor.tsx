'use client';

import { useState } from 'react';
import type { BuilderCommand, DraftMilestone, MilestoneStatus } from '@/lib/roadmap-builder/types';
import { MIN_GOAL_CENTS, MAX_GOAL_CENTS } from '@/lib/roadmap-builder/types';
import { EraDateField, MILESTONE_STATUSES, inputCls, labelCls, type Precision } from '../../InProcessFields';
import { ORANGE, orangeMix } from '../constants';
import { GoalFieldset } from '../funding/GoalFieldset';

/* Minimal tap-to-edit for one draft milestone: title, precision date (the
 * sacred picker, reused verbatim), status, optional funding goal (the same
 * GoalFieldset the real milestone modal uses), delete. Edits dispatch the
 * same reducer commands as chat — silently — so canvas and chat can never
 * disagree about the draft. Full editing still exists after save. */

/* Dollars-as-typed → cents | null, mirroring MilestoneModal.parseGoalDollars. */
function parseGoalDollars(raw: string): { cents: number | null; error?: string } {
  const trimmed = raw.replace(/[$,\s]/g, '');
  if (trimmed === '') return { cents: null };
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) return { cents: null, error: 'Enter a valid amount' };
  const cents = Math.round(n * 100);
  if (cents === 0) return { cents: null };
  if (cents < MIN_GOAL_CENTS) return { cents: null, error: 'A goal has to be at least $1' };
  if (cents > MAX_GOAL_CENTS) return { cents: null, error: 'Goals top out at $1,000,000' };
  return { cents };
}

export function DraftMilestoneEditor({ milestone, index, canFund, onCommand, onClose }: {
  milestone: DraftMilestone;
  index: number;
  canFund?: boolean;
  onCommand: (cmd: BuilderCommand) => void;
  onClose: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Held as typed so "12." isn't clobbered mid-keystroke; valid parses commit
  // to the draft immediately.
  const [goalDollars, setGoalDollars] = useState(
    milestone.goalCents != null ? String(milestone.goalCents / 100) : '',
  );
  const [goalError, setGoalError] = useState<string | null>(null);
  const ref = { index } as const;

  return (
    <div className="ipb-enter mt-1.5 rounded-md border p-3 flex flex-col gap-2.5" style={{ borderColor: orangeMix(45), backgroundColor: orangeMix(4) }}>
      <div>
        <label className={labelCls}>Title</label>
        <input
          value={milestone.title}
          onChange={(e) => onCommand({ kind: 'rename_milestone', ref, title: e.target.value })}
          className={inputCls}
        />
      </div>
      <EraDateField
        label="When"
        value={milestone.start?.value ?? ''}
        precision={(milestone.start?.precision ?? 'month') as Precision}
        onChange={({ value, precision }) => {
          if (!value) return;
          onCommand({ kind: 'set_milestone_date', ref, start: { value, precision }, end: null });
        }}
      />
      <div>
        <label className={labelCls}>Status</label>
        <select
          value={milestone.status}
          onChange={(e) => onCommand({ kind: 'set_status', ref, status: e.target.value as MilestoneStatus })}
          className={inputCls}
        >
          {MILESTONE_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </div>
      {canFund && (
        <GoalFieldset
          goalDollars={goalDollars}
          onGoalDollarsChange={(v) => {
            setGoalDollars(v);
            const parsed = parseGoalDollars(v);
            setGoalError(parsed.error ?? null);
            if (!parsed.error) onCommand({ kind: 'set_goal', ref, cents: parsed.cents });
          }}
          blurb={milestone.goalBlurb ?? ''}
          onBlurbChange={(v) => onCommand({ kind: 'set_goal', ref, cents: parseGoalDollars(goalDollars).cents, blurb: v || null })}
          error={goalError}
        />
      )}
      <div className="flex items-center justify-between pt-0.5">
        <button
          onClick={() => {
            if (!confirmDelete) { setConfirmDelete(true); return; }
            onClose();
            onCommand({ kind: 'remove_milestone', ref });
          }}
          className="font-mono text-[10px] uppercase tracking-[1px] underline cursor-pointer bg-transparent border-none"
          style={{ color: ORANGE }}
        >
          {confirmDelete ? 'Really remove?' : 'Remove'}
        </button>
        <button
          onClick={onClose}
          className="font-mono text-[10px] uppercase tracking-[1px] underline cursor-pointer bg-transparent border-none text-ink/50"
        >
          Done
        </button>
      </div>
    </div>
  );
}
