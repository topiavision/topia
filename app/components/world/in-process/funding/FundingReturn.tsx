'use client';

/* What a backer sees on the way back from Stripe.
 *
 * The webhook is authoritative but can lag a second or two, so this polls the
 * status endpoint rather than trusting the redirect — the same self-healing
 * shape the ticket flow uses. Crediting is idempotent, so the poll racing the
 * webhook is harmless.
 *
 * Renders inline under the masthead rather than as a modal: the payoff is
 * landing back inside the story you just funded, not being handed another
 * dialog to dismiss.
 */

import { useCallback, useEffect, useState } from 'react';
import { usd } from './format';

type Phase = 'idle' | 'checking' | 'paid' | 'cancelled' | 'slow';

export function FundingReturn({ onCredited }: {
  /** Called once when a contribution confirms, so the meters refresh. */
  onCredited: (targetId: string | null) => void;
}) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [amountCents, setAmountCents] = useState(0);
  const [title, setTitle] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  const clearQuery = useCallback(() => {
    const url = new URL(window.location.href);
    url.searchParams.delete('backed');
    // Preserve the hash — it is what selects the In Process tab.
    history.replaceState(null, '', url.pathname + url.search + url.hash);
  }, []);

  useEffect(() => {
    const backed = new URLSearchParams(window.location.search).get('backed');
    if (!backed) return;

    if (backed === 'cancelled') {
      setPhase('cancelled');
      clearQuery();
      return;
    }
    if (!backed.startsWith('cs_')) { clearQuery(); return; }

    setPhase('checking');
    clearQuery();

    let cancelled = false;
    let tries = 0;
    const tick = async () => {
      if (cancelled) return;
      tries++;
      try {
        const res = await fetch(`/api/checkout/contribution/status?sessionId=${encodeURIComponent(backed)}`);
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.status === 'paid') {
          setAmountCents(data.amountCents ?? 0);
          setTitle(data.milestoneTitle ?? null);
          setPhase('paid');
          onCredited(data.targetId ?? null);
          return;
        }
        if (res.ok && (data.status === 'failed' || data.status === 'cancelled')) {
          setPhase('cancelled');
          return;
        }
      } catch { /* keep polling */ }
      // ~20s of polling, then stop pretending we know. The webhook will still
      // land; the backer just isn't kept staring at a spinner.
      if (tries >= 13) { setPhase('slow'); return; }
      setTimeout(tick, 1500);
    };
    void tick();
    return () => { cancelled = true; };
  }, [clearQuery, onCredited]);

  if (phase === 'idle' || dismissed) return null;

  const shell = 'mt-4 rounded-lg px-4 py-3 flex items-start justify-between gap-3';

  if (phase === 'paid') {
    return (
      <div
        className={shell}
        style={{
          backgroundColor: 'color-mix(in srgb, var(--lime) 20%, transparent)',
          border: '1px solid color-mix(in srgb, var(--accent-ink) 32%, transparent)',
        }}
      >
        <p className="font-mono text-[12.5px] leading-relaxed" style={{ color: 'var(--accent-ink)' }}>
          <span className="font-bold">Thank you — {usd(amountCents)} backed{title ? ` ${title}` : ''}.</span>
          <span className="text-ink/60"> Your receipt is on its way.</span>
        </p>
        <button onClick={() => setDismissed(true)} aria-label="Dismiss" className="bg-transparent border-none cursor-pointer text-[16px] leading-none p-0 text-ink/40">×</button>
      </div>
    );
  }

  const muted: Record<Exclude<Phase, 'idle' | 'paid'>, string> = {
    checking: 'Confirming your support…',
    slow: 'Still confirming with Stripe — your support is safe, and the meter will catch up shortly.',
    cancelled: 'Checkout cancelled — nothing was charged.',
  };

  return (
    <div className={`${shell} border border-ink/[0.1]`}>
      <p className="font-mono text-[12px] text-ink/55">{muted[phase as Exclude<Phase, 'idle' | 'paid'>]}</p>
      <button onClick={() => setDismissed(true)} aria-label="Dismiss" className="bg-transparent border-none cursor-pointer text-[16px] leading-none p-0 text-ink/40">×</button>
    </div>
  );
}
