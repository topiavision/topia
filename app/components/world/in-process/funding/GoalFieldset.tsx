'use client';

/* The optional funding fieldset inside the milestone editor.
 *
 * OPTIONAL IS THE POINT. Plenty of milestones need no money — a release date,
 * a rehearsal, a thing already paid for — so this:
 *   - starts collapsed when no goal is set, as a single quiet line
 *   - never blocks saving; leaving it untouched is a complete, valid milestone
 *   - clears back to "no goal" by emptying the field
 *
 * It also saves whether or not the creator has connected Stripe, because
 * someone planning a roadmap on a Sunday shouldn't be dead-ended by an
 * onboarding flow they can do later.
 */

import { useState } from 'react';
import { inputCls, labelCls } from '../../InProcessFields';
import { usd } from './format';
import type { FundingGoalView } from './types';

export function GoalFieldset({
  existing,
  goalDollars,
  onGoalDollarsChange,
  blurb,
  onBlurbChange,
  externalDollars,
  onExternalDollarsChange,
  error,
}: {
  existing?: FundingGoalView;
  /** Dollars as typed, held as a string so a half-typed "12." isn't clobbered. */
  goalDollars: string;
  onGoalDollarsChange: (v: string) => void;
  blurb: string;
  onBlurbChange: (v: string) => void;
  /** Money raised outside Topia, as typed. Omit both to hide the field
   *  (surfaces that don't support it yet). */
  externalDollars?: string;
  onExternalDollarsChange?: (v: string) => void;
  error?: string | null;
}) {
  const raised = existing?.raisedCents ?? 0;
  // Open if this milestone already has funding, so an existing goal is never
  // hidden behind a disclosure the creator has to remember to expand.
  const [open, setOpen] = useState(Boolean(existing?.goalCents || raised > 0));

  return (
    <div className="pt-3 mt-1 border-t border-ink/[0.08]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 bg-transparent border-none p-0 cursor-pointer font-mono text-[10px] font-bold uppercase tracking-[2px]"
        style={{ color: open ? 'var(--accent-ink)' : undefined }}
      >
        <span
          className="inline-block transition-transform"
          style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }}
        >
          ›
        </span>
        <span className={open ? '' : 'text-ink/40'}>
          Funding {existing?.goalCents ? `· ${usd(existing.goalCents)} goal` : '· optional'}
        </span>
      </button>

      {!open && (
        <p className="font-mono text-[10.5px] text-ink/35 mt-1.5 ml-4">
          Not every milestone needs money. Skip this unless this one does.
        </p>
      )}

      {open && (
        <div className="mt-3 space-y-2.5">
          <div>
            <label className={labelCls}>Funding goal</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-[13px] text-ink/40 pointer-events-none">
                $
              </span>
              <input
                value={goalDollars}
                onChange={(e) => onGoalDollarsChange(e.target.value)}
                inputMode="decimal"
                placeholder="8,000"
                className={inputCls}
                style={{ paddingLeft: 26 }}
              />
            </div>
            <p className="font-mono text-[10.5px] text-ink/40 mt-1">
              Leave empty for no goal — this milestone simply won&apos;t ask for support.
            </p>
          </div>

          <div>
            <label className={labelCls}>What support pays for</label>
            <input
              value={blurb}
              onChange={(e) => onBlurbChange(e.target.value)}
              placeholder="Engineer time, session players, the master"
              className={inputCls}
            />
          </div>

          {onExternalDollarsChange !== undefined && (
            <div>
              <label className={labelCls}>Already raised outside Topia (optional)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-[13px] text-ink/40 pointer-events-none">$</span>
                <input
                  value={externalDollars ?? ''}
                  onChange={(e) => onExternalDollarsChange(e.target.value)}
                  inputMode="decimal"
                  placeholder="2,500"
                  className={inputCls}
                  style={{ paddingLeft: 26 }}
                />
              </div>
              <p className="font-mono text-[10.5px] text-ink/40 mt-1">
                Grants, patrons, your own money. It counts toward the bar and is always
                shown as raised elsewhere — most projects don&apos;t start at zero.
              </p>
            </div>
          )}

          {raised > 0 && (
            <p className="font-mono text-[11px]" style={{ color: 'var(--accent-ink)' }}>
              {usd(raised)} already backed by {existing?.patronCount ?? 0}{' '}
              {existing?.patronCount === 1 ? 'person' : 'people'}. Lowering the goal is fine — the
              meter just reads over 100%.
            </p>
          )}

          {error && (
            <p className="font-mono text-[11px]" style={{ color: 'var(--orange)' }}>{error}</p>
          )}
        </div>
      )}
    </div>
  );
}
