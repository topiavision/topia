'use client';

import { useState } from 'react';
import type { BuilderCommand, DraftMilestone, MilestoneStatus } from '@/lib/roadmap-builder/types';
import { EraDateField, MILESTONE_STATUSES, inputCls, labelCls, type Precision } from '../../InProcessFields';
import { ORANGE, orangeMix } from '../constants';

/* Minimal tap-to-edit for one draft milestone: title, precision date (the
 * sacred picker, reused verbatim), status, delete. Edits dispatch the same
 * reducer commands as chat — silently — so canvas and chat can never
 * disagree about the draft. Full editing still exists after save. */

export function DraftMilestoneEditor({ milestone, index, onCommand, onClose }: {
  milestone: DraftMilestone;
  index: number;
  onCommand: (cmd: BuilderCommand) => void;
  onClose: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const ref = { index } as const;

  return (
    <div className="mt-1.5 rounded-md border p-3 flex flex-col gap-2.5" style={{ borderColor: orangeMix(45), backgroundColor: orangeMix(4) }}>
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
