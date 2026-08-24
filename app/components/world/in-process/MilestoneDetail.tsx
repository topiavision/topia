'use client';

import { eraDateRange } from '@/lib/eraDates';
import { ORANGE, STATUS_META, orangeMix } from './constants';
import type { EraMilestoneView } from './types';
/* ── Inline milestone detail — appears under the timeline when a node
 * card is selected; the process log below filters to match. ─────────── */
export function MilestoneDetail({ m, index, updateCount, canEdit, onEdit, onClose }: {
  m: EraMilestoneView; index: number; updateCount: number; canEdit: boolean;
  onEdit: () => void; onClose: () => void;
}) {
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
        {m.description && <p className="font-mono text-[12.5px] text-ink/70 leading-relaxed flex-1 min-w-[200px]">{m.description}</p>}
      </div>
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
