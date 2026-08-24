'use client';

import { useState } from 'react';
import { EraDateField, ImageField, inputCls, labelCls, btnLime, btnGhost, MILESTONE_STATUSES, type Precision } from '../InProcessFields';
import { ORANGE } from './constants';
import type { EraMilestoneView } from './types';
/* ── Milestone add/edit modal (builders only) ──────────────────────
 * Reading a milestone happens inline on the timeline — selecting a
 * card opens its detail panel and filters the log. This modal is
 * purely the form. */
export function MilestoneModal({ eraId, existing, nextIndex, privyId, onClose, onChanged }: {
  eraId: string; existing?: EraMilestoneView; nextIndex?: number; privyId: string;
  onClose: () => void; onChanged: () => void;
}) {
  const [draft, setDraft] = useState({
    title: existing?.title ?? '',
    description: existing?.description ?? '',
    startDate: existing?.startDate ?? '',
    endDate: existing?.endDate ?? '',
    startPrecision: (existing?.startPrecision ?? 'month') as Precision,
    endPrecision: (existing?.endPrecision ?? 'month') as Precision,
    status: existing?.status ?? 'upcoming',
    imageUrl: existing?.imageUrl ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    if (!draft.title.trim()) return;
    setSaving(true); setError('');
    try {
      const res = await fetch('/api/worlds/eras/milestones', {
        method: existing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(existing
          ? { privyId, milestoneId: existing.id, ...draft }
          : { privyId, eraId, ...draft, sortOrder: nextIndex ?? 0 }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d.error || 'Could not save.'); return; }
      onChanged();
      onClose();
    } finally { setSaving(false); }
  };

  const remove = async () => {
    if (!existing) return;
    await fetch(`/api/worlds/eras/milestones?milestoneId=${existing.id}&privyId=${encodeURIComponent(privyId)}`, { method: 'DELETE' });
    onChanged();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[2300] flex items-end sm:items-center justify-center p-0 sm:p-4" style={{ backgroundColor: 'rgba(0,0,0,0.72)' }} onClick={onClose}>
      <div className="w-full max-w-md rounded-t-2xl sm:rounded-2xl p-5 bg-[var(--page-bg)] border border-ink/[0.1] max-h-[88lvh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 mb-3">
          <p className="font-mono text-[10px] font-bold uppercase tracking-[2px] text-ink/50">
            {existing ? 'Edit milestone' : 'New milestone'}
          </p>
          <button onClick={onClose} aria-label="Close" className="bg-transparent border-none cursor-pointer text-[18px] leading-none p-0 text-ink/50">×</button>
        </div>
        <div className="space-y-2.5">
          <div>
            <label className={labelCls}>What&apos;s the milestone?</label>
            <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="Album Production" className={inputCls} autoFocus />
          </div>
          <div>
            <label className={labelCls}>One line about it (optional)</label>
            <input value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="What this stage is" className={inputCls} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <EraDateField label="Starts" value={draft.startDate} precision={draft.startPrecision}
              onChange={(n) => setDraft({ ...draft, startDate: n.value, startPrecision: n.precision })} />
            <EraDateField label="Ends (optional)" value={draft.endDate} precision={draft.endPrecision}
              onChange={(n) => setDraft({ ...draft, endDate: n.value, endPrecision: n.precision })} />
          </div>
          <div>
            <label className={labelCls}>Where is it?</label>
            <select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })} className={`${inputCls} appearance-none cursor-pointer`}>
              {MILESTONE_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          <ImageField value={draft.imageUrl} onChange={(url) => setDraft({ ...draft, imageUrl: url })} />
          {error && <p className="font-mono text-[11px]" style={{ color: ORANGE }}>{error}</p>}
          <div className="flex items-center gap-3 flex-wrap pt-1">
            <button onClick={save} disabled={saving || !draft.title.trim()} className={btnLime}>
              {saving ? 'Saving…' : existing ? 'Save' : 'Add milestone'}
            </button>
            <button onClick={onClose} className={btnGhost}>Cancel</button>
            {existing && (
              confirmingDelete
                ? <button onClick={remove} className="font-mono text-[11px] uppercase tracking-[1px] px-3 py-1.5 rounded-sm cursor-pointer border-none font-bold" style={{ backgroundColor: ORANGE, color: 'var(--bone)' }}>Really delete?</button>
                : <button onClick={() => setConfirmingDelete(true)} className="font-mono text-[11px] uppercase underline cursor-pointer bg-transparent border-none" style={{ color: ORANGE }}>Delete</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
