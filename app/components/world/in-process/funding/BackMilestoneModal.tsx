'use client';

/* The backing sheet.
 *
 * Overlay rules follow what the messages cluster taught this repo the hard way:
 * portalled to document.body, full-screen takeover on mobile using lvh (never
 * vh, which the iOS keyboard breaks), centered card from sm: up, and ZERO
 * visualViewport code. Let the browser handle the keyboard.
 *
 * The fee breakdown is shown BEFORE the button and the total is repeated in the
 * button label, because the charge is higher than the amount chosen — fees are
 * added on top so the creator receives 100%. Discovering that on Stripe's page
 * would read as a switch.
 */

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { btnLime, btnGhost, inputCls, labelCls } from '../../InProcessFields';
import { usd } from './format';
import type { FundingGoalView } from './types';

interface Breakdown {
  contributionCents: number;
  platformFeeCents: number;
  processingFeeCents: number;
  totalCents: number;
}

/** Client-side mirror of lib/payments/fees.ts, for the live preview only. The
 *  server recomputes everything and its numbers are the ones charged. */
function previewTotal(cents: number): Breakdown {
  const platformFeeCents = Math.round(cents * 0.05);
  const gross = cents + platformFeeCents;
  const totalCents = Math.ceil((gross + 30) * 10000 / (10000 - 290));
  return { contributionCents: cents, platformFeeCents, processingFeeCents: totalCents - gross, totalCents };
}

/** Presets derived from the goal so they feel proportionate — backing a $500
 *  milestone and a $50,000 one shouldn't offer the same three numbers. */
function presetsFor(goalCents: number | null): number[] {
  if (!goalCents || goalCents <= 0) return [2500, 5000, 10000];
  const raw = [goalCents / 50, goalCents / 20, goalCents / 10];
  const rounded = raw.map((n) => {
    const mag = Math.pow(10, Math.max(0, String(Math.round(n / 100)).length - 2));
    return Math.max(500, Math.round(n / 100 / mag) * mag * 100);
  });
  return [...new Set(rounded)].slice(0, 3);
}

export function BackMilestoneModal({
  goal, milestoneLabel, worldTitle, privyId, onClose,
}: {
  goal: FundingGoalView;
  milestoneLabel: string;
  worldTitle?: string;
  privyId?: string | null;
  onClose: () => void;
}) {
  const presets = useMemo(() => presetsFor(goal.goalCents), [goal.goalCents]);
  const [amountCents, setAmountCents] = useState<number>(presets[1] ?? 5000);
  const [custom, setCustom] = useState('');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [anonymous, setAnonymous] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const fees = previewTotal(amountCents);

  function chooseCustom(v: string) {
    setCustom(v);
    const n = Number(v.replace(/[$,\s]/g, ''));
    if (Number.isFinite(n) && n > 0) setAmountCents(Math.round(n * 100));
  }

  async function submit() {
    setError('');
    if (amountCents < 100) { setError('Minimum is $1.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Enter an email — it is where your receipt goes.');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/checkout/contribution', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goalId: goal.id,
          amountCents,
          backerEmail: email.trim(),
          backerName: name.trim() || null,
          message: message.trim() || null,
          anonymous,
          privyId: privyId ?? undefined,
          // Return the backer to exactly where they were.
          returnPath: window.location.pathname + window.location.hash,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) {
        setError(data.error || 'Could not start checkout — try again.');
        return;
      }
      window.location.href = data.url;
    } catch {
      setError('Could not start checkout — try again.');
    } finally {
      setBusy(false);
    }
  }

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[2400] flex items-stretch sm:items-center justify-center sm:p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.72)' }}
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md h-[100lvh] sm:h-auto sm:max-h-[88lvh] overflow-y-auto bg-[var(--page-bg)] sm:rounded-2xl border border-ink/[0.1] p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-3">
          <p className="font-mono text-[10px] font-bold uppercase tracking-[2px] text-ink/50">Back this milestone</p>
          <button onClick={onClose} aria-label="Close" className="bg-transparent border-none cursor-pointer text-[18px] leading-none p-0 text-ink/50">×</button>
        </div>

        <p className="font-mono text-[10px] font-bold uppercase tracking-[2px]" style={{ color: 'var(--orange)' }}>{milestoneLabel}</p>
        <h4 className="font-basement font-black text-[19px] uppercase leading-tight text-ink mt-1">{goal.titleSnapshot}</h4>
        {worldTitle && <p className="font-mono text-[11px] text-ink/45 mt-1">{worldTitle}</p>}

        <div className="mt-4">
          <label className={labelCls}>Your contribution</label>
          <div className="grid grid-cols-4 gap-2">
            {presets.map((p) => (
              <button
                key={p}
                onClick={() => { setAmountCents(p); setCustom(''); }}
                className="font-mono text-[13px] py-2 rounded-sm cursor-pointer bg-transparent transition"
                style={{
                  border: amountCents === p && !custom ? '2px solid var(--accent-ink)' : '1px solid color-mix(in srgb, var(--page-text) 15%, transparent)',
                  backgroundColor: amountCents === p && !custom ? 'color-mix(in srgb, var(--lime) 26%, transparent)' : 'transparent',
                }}
              >
                {usd(p)}
              </button>
            ))}
            <input
              value={custom}
              onChange={(e) => chooseCustom(e.target.value)}
              inputMode="decimal"
              placeholder="Other"
              aria-label="Custom amount in dollars"
              className={`${inputCls} text-center`}
              style={{ padding: '8px 4px' }}
            />
          </div>
        </div>

        {/* Fees are added on top, so show the arithmetic before the button. */}
        <div className="mt-3.5 rounded-lg border border-ink/[0.12] overflow-hidden">
          {[
            ['Your contribution', fees.contributionCents, true],
            ['Topia platform fee (5%)', fees.platformFeeCents, false],
            ['Card processing (est.)', fees.processingFeeCents, false],
          ].map(([label, cents, strong]) => (
            <div key={label as string} className="flex justify-between gap-3 px-3 py-2 font-mono text-[12.5px]">
              <span className={strong ? 'text-ink' : 'text-ink/55'}>{label as string}</span>
              <span className={`tabular-nums ${strong ? 'text-ink' : 'text-ink/55'}`}>{usd(cents as number)}</span>
            </div>
          ))}
          <div className="flex justify-between gap-3 px-3 py-2.5 font-mono text-[13.5px] font-bold border-t border-ink/[0.12] bg-ink/[0.03]">
            <span>Total charged</span>
            <span className="tabular-nums">{usd(fees.totalCents)}</span>
          </div>
        </div>

        <p className="font-mono text-[11.5px] mt-2.5" style={{ color: 'var(--accent-ink)' }}>
          {worldTitle ?? 'The creator'} receives the full {usd(fees.contributionCents)}.
        </p>

        <div className="mt-3.5 space-y-2.5">
          <div>
            <label className={labelCls}>Email — for your receipt</label>
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="you@example.com" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Your name (optional)</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="How you'd like to be credited" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Note to the creator (optional)</label>
            <input value={message} onChange={(e) => setMessage(e.target.value.slice(0, 200))} placeholder="Say something…" className={inputCls} />
          </div>
          <label className="flex items-center gap-2.5 cursor-pointer">
            <input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} />
            <span className="font-mono text-[12px] text-ink/60">Show me as anonymous</span>
          </label>
        </div>

        {error && <p className="font-mono text-[11.5px] mt-3" style={{ color: 'var(--orange)' }}>{error}</p>}

        <div className="flex items-center gap-3 mt-4 flex-wrap">
          <button onClick={submit} disabled={busy} className={btnLime}>
            {busy ? 'Starting…' : `Continue · ${usd(fees.totalCents)}`}
          </button>
          <button onClick={onClose} className={btnGhost}>Cancel</button>
        </div>
        <p className="font-mono text-[10.5px] text-ink/40 mt-2.5 leading-relaxed">
          Card handled by Stripe — Topia never sees it. Fees are added on top so 100% of your
          contribution reaches the creator.
        </p>
      </div>
    </div>,
    document.body,
  );
}
