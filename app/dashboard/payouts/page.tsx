'use client';

/* Payouts — one page, one Stripe account, per person.
 *
 * Deliberately in the PERSONAL dashboard nav rather than under a world: a
 * Stripe Express account is a KYC'd individual or business, so a creator
 * connects once and every world they admin and every event they host pays out
 * through it. Per-world and per-event surfaces show status and link here
 * instead of duplicating this. */

import { useCallback, useEffect, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useDashboard } from '../_components/DashboardContext';

interface AccountView {
  onboardingStatus: 'pending' | 'restricted' | 'active' | 'disabled' | 'deauthorized';
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  transfersActive: boolean;
  detailsSubmitted: boolean;
  requirementsDue: string[];
  disabledReason: string | null;
  country: string;
  currency: string;
}

interface StatusPayload {
  configured: boolean;
  canAccept: boolean;
  platformFeeBps: number;
  account: AccountView | null;
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border border-ink/[0.08] rounded-lg overflow-hidden mb-5">
      <div className="bg-[var(--page-bg)] border-b border-ink/[0.06] px-4 py-2">
        <span className="font-mono text-[11px] uppercase tracking-[2px] text-ink/40">{title}</span>
      </div>
      <div className="bg-[var(--page-bg)] p-4 sm:p-5">{children}</div>
    </div>
  );
}

/** Stripe's requirement keys are machine-shaped ("individual.verification.document").
 *  Show something a person can act on without turning it into a translation table. */
function humanizeRequirement(key: string): string {
  const tail = key.split('.').slice(-2).join(' ').replace(/_/g, ' ');
  return tail.charAt(0).toUpperCase() + tail.slice(1);
}

const btnLime =
  'font-mono text-[11px] uppercase tracking-[2px] bg-lime text-obsidian font-bold px-5 py-2 rounded-sm hover:opacity-90 transition disabled:opacity-40 cursor-pointer border-none';
const btnGhost =
  'font-mono text-[11px] uppercase tracking-[2px] text-ink/60 border border-ink/15 hover:border-ink/40 hover:text-ink px-4 py-2 rounded-sm transition cursor-pointer bg-transparent disabled:opacity-40';

export default function PayoutsPage() {
  const { user, getAccessToken } = usePrivy();
  const { profile } = useDashboard();
  const privyId = user?.id ?? null;

  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (sync = false) => {
    if (!privyId) return;
    try {
      const token = await getAccessToken();
      const res = await fetch(
        `/api/payouts/account?privyId=${encodeURIComponent(privyId)}${sync ? '&sync=1' : ''}`,
        { headers: token ? { Authorization: `Bearer ${token}` } : undefined },
      );
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error || 'Could not load payout status');
        return;
      }
      setStatus(await res.json());
      setError('');
    } catch {
      setError('Could not load payout status');
    } finally {
      setLoading(false);
    }
  }, [privyId, getAccessToken]);

  // Returning from Stripe onboarding: don't trust the redirect and don't wait
  // on the webhook — ask Stripe directly, then clear the query so a refresh
  // doesn't re-sync.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connect = params.get('connect');
    if (connect) {
      history.replaceState(null, '', window.location.pathname);
      // 'refresh' means the link expired mid-flow; Stripe expects us to mint a
      // new one, which the button below does.
      void load(true);
    } else {
      void load(false);
    }
  }, [load]);

  async function post(path: string) {
    if (!privyId) return;
    setBusy(true);
    setError('');
    try {
      const token = await getAccessToken();
      const res = await fetch(path, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ privyId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) {
        setError(data.error || 'Something went wrong — try again.');
        return;
      }
      window.location.href = data.url;
    } catch {
      setError('Something went wrong — try again.');
    } finally {
      setBusy(false);
    }
  }

  const acct = status?.account ?? null;
  const feePct = status ? (status.platformFeeBps / 100).toFixed(status.platformFeeBps % 100 ? 1 : 0) : '5';

  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h2 className="font-mono text-[13px] font-bold uppercase tracking-[2px] text-ink">Payouts</h2>
          <p className="font-mono text-[11px] text-ink/40 mt-1 max-w-xl">
            Connect once and get paid for everything — milestone funding on the worlds you
            admin, and tickets for the events you host. Money goes to your account, not
            Topia&apos;s.
          </p>
        </div>
      </div>

      {loading && (
        <p className="font-mono text-[11px] uppercase tracking-[2px] text-ink/40">Loading…</p>
      )}

      {!loading && status && !status.configured && (
        <SectionCard title="Payout account">
          <p className="font-mono text-[13px] text-ink">Payouts aren&apos;t switched on yet</p>
          <p className="font-mono text-[11px] text-ink/50 mt-2 max-w-lg">
            Creator payouts are still rolling out. You&apos;ll be able to connect an account
            here as soon as they&apos;re live.
          </p>
        </SectionCard>
      )}

      {!loading && status?.configured && (
        <SectionCard title="Payout account">
          {/* ── Not set up ── */}
          {!acct && (
            <>
              <p className="font-mono text-[14px] font-bold text-ink">No payout account yet</p>
              <p className="font-mono text-[11.5px] text-ink/50 mt-2 max-w-lg leading-relaxed">
                Connect a Stripe account to receive money. It takes about three minutes —
                you&apos;ll need a bank account and an ID. Topia never holds your funds.
              </p>
              <div className="flex items-center gap-3 mt-4 flex-wrap">
                <button onClick={() => post('/api/payouts/connect')} disabled={busy} className={btnLime}>
                  {busy ? 'Opening Stripe…' : 'Connect payout account'}
                </button>
                <span className="font-mono text-[10px] text-ink/35">
                  Powered by Stripe · Topia&apos;s fee is {feePct}%
                </span>
              </div>
            </>
          )}

          {/* ── Onboarding incomplete ── */}
          {acct && (acct.onboardingStatus === 'pending' || acct.onboardingStatus === 'restricted') && (
            <>
              <div className="flex items-center gap-2.5">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: 'var(--orange)' }} />
                <p className="font-mono text-[14px] font-bold text-ink">
                  {acct.detailsSubmitted ? 'Stripe needs a few more details' : 'Setup not finished'}
                </p>
              </div>
              <p className="font-mono text-[11.5px] text-ink/50 mt-2 max-w-lg leading-relaxed">
                Your account exists but can&apos;t accept payments yet. Funding and paid
                tickets stay hidden until this clears.
              </p>
              {acct.requirementsDue.length > 0 && (
                <ul className="mt-3 mb-0 pl-4 space-y-1">
                  {acct.requirementsDue.slice(0, 6).map((r) => (
                    <li key={r} className="font-mono text-[11px] text-ink/60">{humanizeRequirement(r)}</li>
                  ))}
                </ul>
              )}
              <div className="flex items-center gap-3 mt-4 flex-wrap">
                <button onClick={() => post('/api/payouts/connect')} disabled={busy} className={btnLime}>
                  {busy ? 'Opening Stripe…' : 'Finish setup'}
                </button>
                <button onClick={() => load(true)} disabled={busy} className={btnGhost}>Refresh status</button>
              </div>
            </>
          )}

          {/* ── Active ── */}
          {acct && acct.onboardingStatus === 'active' && (
            <>
              <div className="flex items-center gap-2.5 flex-wrap">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: 'var(--green)' }} />
                <p className="font-mono text-[14px] font-bold text-ink">Accepting payments</p>
                <span className="font-mono text-[11px] text-ink/40">
                  {acct.currency.toUpperCase()} · {acct.country}
                </span>
              </div>
              {!acct.payoutsEnabled && (
                <p className="font-mono text-[11px] mt-2" style={{ color: 'var(--orange)' }}>
                  Payouts to your bank are still being verified — money is safe in your Stripe
                  balance meanwhile.
                </p>
              )}
              <div className="flex items-center gap-3 mt-4 flex-wrap">
                <button onClick={() => post('/api/payouts/dashboard')} disabled={busy} className={btnGhost}>
                  {busy ? 'Opening…' : 'Open Stripe dashboard ↗'}
                </button>
                <button onClick={() => load(true)} disabled={busy} className={btnGhost}>Refresh status</button>
              </div>
            </>
          )}

          {/* ── Restricted / disconnected ── */}
          {acct && (acct.onboardingStatus === 'disabled' || acct.onboardingStatus === 'deauthorized') && (
            <>
              <div className="flex items-center gap-2.5">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: 'var(--orange)' }} />
                <p className="font-mono text-[14px] font-bold text-ink">
                  {acct.onboardingStatus === 'deauthorized' ? 'Disconnected from Topia' : 'Action needed'}
                </p>
              </div>
              <p className="font-mono text-[11.5px] text-ink/50 mt-2 max-w-lg leading-relaxed">
                {acct.disabledReason
                  ? `Stripe reports: ${humanizeRequirement(acct.disabledReason)}.`
                  : 'Stripe has paused this account.'}{' '}
                New funding and ticket sales are paused until it&apos;s resolved.
              </p>
              <div className="flex items-center gap-3 mt-4 flex-wrap">
                <button onClick={() => post('/api/payouts/connect')} disabled={busy} className={btnLime}>
                  {busy ? 'Opening Stripe…' : 'Fix in Stripe'}
                </button>
                <button onClick={() => load(true)} disabled={busy} className={btnGhost}>Refresh status</button>
              </div>
            </>
          )}

          {error && <p className="font-mono text-[11px] mt-3" style={{ color: 'var(--orange)' }}>{error}</p>}
        </SectionCard>
      )}

      <SectionCard title="How payouts work">
        <div className="space-y-3 max-w-2xl">
          <p className="font-mono text-[11.5px] text-ink/60 leading-relaxed">
            <span className="text-ink font-bold">You receive 100%.</span> Topia&apos;s {feePct}%
            and the card processing fee are added on top of what a supporter chooses, so
            someone backing you $100 sends you $100.
          </p>
          <p className="font-mono text-[11.5px] text-ink/60 leading-relaxed">
            <span className="text-ink font-bold">Money goes straight to you.</span> Payments
            settle into your own Stripe account on Stripe&apos;s normal schedule. Topia never
            holds your funds.
          </p>
          <p className="font-mono text-[11.5px] text-ink/60 leading-relaxed">
            <span className="text-ink font-bold">Refunds come out of what was paid.</span> If a
            supporter is refunded, the amount is returned to them and reversed from your
            balance.
          </p>
        </div>
      </SectionCard>

      {profile && (
        <p className="font-mono text-[10px] text-ink/30 mt-1">
          Connected as @{profile.username ?? '—'}
        </p>
      )}
    </div>
  );
}
