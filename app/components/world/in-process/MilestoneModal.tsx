'use client';

import { useState } from 'react';
import { EraDateField, ImageField, inputCls, labelCls, btnLime, btnGhost, MILESTONE_STATUSES, type Precision } from '../InProcessFields';
import { ORANGE } from './constants';
import type { EraMilestoneView } from './types';
import { GoalFieldset } from './funding/GoalFieldset';
import type { FundingGoalView } from './funding/types';
/* ── Milestone add/edit modal (builders only) ──────────────────────
 * Reading a milestone happens inline on the timeline — selecting a
 * card opens its detail panel and filters the log. This modal is
 * purely the form. */
/* Dollars as typed → integer cents, or null for "no goal". Mirrors the
 * server's cleanGoalCents so the creator sees the problem before the round
 * trip; the route validates again regardless. */
function parseGoalDollars(raw: string): { cents: number | null; error?: string } {
  const trimmed = raw.replace(/[$,\s]/g, '');
  if (trimmed === '') return { cents: null };
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) return { cents: null, error: 'Enter a valid amount' };
  const cents = Math.round(n * 100);
  if (cents === 0) return { cents: null };
  if (cents < 100) return { cents: null, error: 'A goal has to be at least $1' };
  if (cents > 100_000_000) return { cents: null, error: 'Goals top out at $1,000,000' };
  return { cents };
}

export function MilestoneModal({ eraId, milestones, existing, nextIndex, privyId, goal, canFund, accessToken, onClose, onChanged }: {
  eraId: string; milestones: EraMilestoneView[]; existing?: EraMilestoneView; nextIndex?: number; privyId: string;
  /** Existing funding goal for this milestone, if any. */
  goal?: FundingGoalView;
  /** Whether this world's admin has funding access at all. When false the
   *  fieldset is hidden entirely rather than shown and refused. */
  canFund?: boolean;
  accessToken?: string | null;
  onClose: () => void; onChanged: () => void;
}) {
  const [draft, setDraft] = useState({
    title: existing?.title ?? '',
    description: existing?.description ?? '',
    details: existing?.details ?? '',
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
  // Funding is optional: these start empty and an untouched fieldset saves a
  // perfectly normal, unfunded milestone.
  const [goalDollars, setGoalDollars] = useState(
    goal?.goalCents != null ? String(goal.goalCents / 100) : '',
  );
  const [externalDollars, setExternalDollars] = useState(
    goal?.externalRaisedCents ? String(goal.externalRaisedCents / 100) : '',
  );
  const [blurb, setBlurb] = useState(goal?.blurb ?? '');
  const [goalError, setGoalError] = useState<string | null>(null);
  const otherNow = milestones.filter((milestone) => milestone.status === 'now' && milestone.id !== existing?.id);

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

      /* Persist the goal against the saved milestone. Only when the creator
       * actually engaged with funding — an untouched fieldset must not create
       * an empty goal row, and must not fail the milestone save either. */
      const touchedFunding = goalDollars.trim() !== '' || blurb.trim() !== '' || externalDollars.trim() !== '' || Boolean(goal);
      if (canFund && touchedFunding) {
        const saved = await res.json().catch(() => ({}));
        const milestoneId = existing?.id ?? saved?.milestone?.id;
        const parsed = parseGoalDollars(goalDollars);
        if (parsed.error) { setGoalError(parsed.error); return; }
        const external = parseGoalDollars(externalDollars);
        if (external.error) { setGoalError(`Outside-Topia amount: ${external.error.toLowerCase()}`); return; }
        if (milestoneId) {
          const gRes = await fetch('/api/funding/goals', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
            },
            body: JSON.stringify({
              privyId,
              targetType: 'milestone',
              targetId: milestoneId,
              goalCents: parsed.cents,
              externalRaisedCents: external.cents ?? 0,
              blurb: blurb.trim() || null,
            }),
          });
          if (!gRes.ok) {
            const d = await gRes.json().catch(() => ({}));
            // The milestone itself saved; surface the funding problem without
            // pretending the whole edit failed.
            setGoalError(d.error || 'Milestone saved, but the funding goal could not be.');
            onChanged();
            return;
          }
        }
      }

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
          <div>
            <label className={labelCls}>The full picture (optional)</label>
            {/* Latashá's brief: a stage like Ideation carries real open
                questions — backers need room to read what they're funding.
                The one-liner above stays the card summary; this shows on the
                expanded milestone view. */}
            <textarea
              value={draft.details}
              onChange={(e) => setDraft({ ...draft, details: e.target.value })}
              placeholder="What is this stage really? The program? The look? The budget? Say it all here."
              rows={4}
              className={`${inputCls} resize-y min-h-[88px] leading-relaxed`}
            />
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
            {draft.status === 'now' && otherNow.length > 0 && (
              <p className="mt-2 rounded-md border border-orange/35 bg-orange/[0.04] px-3 py-2 font-mono text-[10px] leading-relaxed text-orange">
                Saving makes this the only milestone in motion. Earlier current work becomes Done; later current work returns to Upcoming.
              </p>
            )}
          </div>
          <ImageField value={draft.imageUrl} onChange={(url) => setDraft({ ...draft, imageUrl: url })} />

          {canFund && (
            <GoalFieldset
              existing={goal}
              goalDollars={goalDollars}
              onGoalDollarsChange={(v) => { setGoalDollars(v); setGoalError(null); }}
              blurb={blurb}
              onBlurbChange={setBlurb}
              externalDollars={externalDollars}
              onExternalDollarsChange={(v) => { setExternalDollars(v); setGoalError(null); }}
              error={goalError}
            />
          )}
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
