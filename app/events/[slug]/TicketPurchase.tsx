'use client';

import { useEffect, useState, useCallback } from 'react';
import { usePrivy } from '@privy-io/react-auth';

/* ── Types ─────────────────────────────────────────────────────────── */

interface TicketType {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
  currency: string;
  quantityTotal: number | null;
  quantitySold: number;
  maxPerOrder: number | null;
  isActive: boolean;
  remaining: number | null;
  soldOut: boolean;
  salesStartAt: string | null;
  salesEndAt: string | null;
  // 'upcoming' = visible but not on sale yet · 'ended' = visible, crossed out
  saleState: 'upcoming' | 'live' | 'ended';
}

// "Aug 29" — plus the time when it isn't midnight (door tiers often open at
// a specific hour).
function saleDateLabel(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const hasTime = d.getHours() !== 0 || d.getMinutes() !== 0;
  return hasTime
    ? `${date}, ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
    : date;
}

type PromoState =
  | { status: 'none' }
  | { status: 'checking' }
  | { status: 'applied'; code: string; discountCents: number; totalCents: number }
  | { status: 'invalid'; error: string };

// idle → redirecting (handing off to Stripe) · confirming (back from Stripe,
// polling the order) · success / error are terminal until closed.
type Phase = 'idle' | 'redirecting' | 'confirming' | 'success' | 'error';

function usd(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

/* ── Component ─────────────────────────────────────────────────────── */

// Buyer-facing ticket purchase. Card payments run through Stripe-hosted
// Checkout: we create the order server-side, redirect to Stripe, and Stripe
// redirects back here with ?checkout=success&order=<id>, where we poll the
// status endpoint until the webhook (or the endpoint's own fallback) confirms
// payment. No card data ever touches this app.
export default function TicketPurchase({
  eventId,
  slug,
  onTiersLoaded,
  onPurchased,
}: {
  eventId: string;
  slug: string;
  /** Reports tier composition so the page can gate the free-RSVP button. */
  onTiersLoaded?: (info: { count: number; allPaid: boolean }) => void;
  /** Fires once a purchase is confirmed (buyer is now RSVP'd 'going'). */
  onPurchased?: () => void;
}) {
  const { ready, authenticated, user, login } = usePrivy();

  const [tiers, setTiers] = useState<TicketType[] | null>(null);
  // Tickets the viewer already holds for this event — when > 0 the section
  // leads with "your tickets" instead of re-pitching the tier list.
  const [ownedCount, setOwnedCount] = useState(0);
  const [showBuyMore, setShowBuyMore] = useState(false);
  const [selected, setSelected] = useState<TicketType | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [phase, setPhase] = useState<Phase>('idle');
  const [message, setMessage] = useState('');
  const [notice, setNotice] = useState(''); // non-modal banner (e.g. cancelled checkout)
  const [result, setResult] = useState<{ ticketCount: number } | null>(null);

  // Promo code entry.
  const [promoInput, setPromoInput] = useState('');
  const [promo, setPromo] = useState<PromoState>({ status: 'none' });

  // Post-redirect confirmation (order id from the success URL).
  const [returnOrderId, setReturnOrderId] = useState<string | null>(null);

  // Load tiers for this event.
  useEffect(() => {
    fetch(`/api/events/ticket-types?slug=${slug}`)
      .then((r) => r.json())
      .then((d) => {
        const list: TicketType[] = d.ticketTypes ?? [];
        setTiers(list);
        onTiersLoaded?.({ count: list.length, allPaid: list.length > 0 && list.every((t) => t.priceCents > 0) });
      })
      .catch(() => setTiers([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  // How many tickets the viewer already holds (refreshed after purchases).
  const loadOwned = useCallback(() => {
    if (!authenticated || !user?.id) return;
    fetch(`/api/events/checkin/me?eventId=${encodeURIComponent(eventId)}&privyId=${encodeURIComponent(user.id)}`)
      .then((r) => r.json())
      .then((d) => setOwnedCount(Number(d.ticketCount) || 0))
      .catch(() => {});
  }, [eventId, authenticated, user?.id]);

  useEffect(() => {
    if (ready) loadOwned();
  }, [ready, loadOwned]);

  // Detect the return leg from Stripe Checkout and clean the URL so refreshes
  // don't re-trigger it.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const checkout = params.get('checkout');
    const order = params.get('order');
    if (!checkout) return;
    if (checkout === 'success' && order) {
      setReturnOrderId(order);
      setPhase('confirming');
    } else if (checkout === 'cancelled') {
      setNotice('Checkout cancelled — your card was not charged.');
    }
    params.delete('checkout');
    params.delete('order');
    const qs = params.toString();
    window.history.replaceState({}, '', window.location.pathname + (qs ? `?${qs}` : ''));
  }, []);

  // Poll the order after returning from Stripe. The webhook usually lands
  // within seconds; the status endpoint also self-heals if it didn't.
  useEffect(() => {
    if (!returnOrderId || !ready) return;
    if (!authenticated || !user?.id) return; // wait for Privy to restore the session
    let cancelled = false;
    (async () => {
      for (let i = 0; i < 15 && !cancelled; i++) {
        try {
          const res = await fetch(
            `/api/checkout/stripe/status?orderId=${encodeURIComponent(returnOrderId)}&privyId=${encodeURIComponent(user.id)}`,
          );
          const d = await res.json();
          if (res.ok && d.status === 'paid') {
            if (!cancelled) {
              setResult({ ticketCount: d.ticketCount });
              setPhase('success');
              loadOwned();
              onPurchased?.();
            }
            return;
          }
          if (res.ok && (d.status === 'cancelled' || d.status === 'failed')) {
            if (!cancelled) {
              setPhase('idle');
              setNotice('That checkout didn’t complete — your card was not charged.');
              setReturnOrderId(null);
            }
            return;
          }
        } catch {
          /* transient — keep polling */
        }
        await new Promise((r) => setTimeout(r, 2000));
      }
      if (!cancelled) {
        setPhase('idle');
        setNotice('Payment received? It’s taking a moment to confirm — check your email for your tickets.');
        setReturnOrderId(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [returnOrderId, ready, authenticated, user?.id]);

  const close = useCallback(() => {
    setSelected(null);
    setPhase('idle');
    setMessage('');
    setResult(null);
    setQuantity(1);
    setPromoInput('');
    setPromo({ status: 'none' });
    setReturnOrderId(null);
  }, []);

  const openFor = (tier: TicketType) => {
    if (!authenticated) {
      login();
      return;
    }
    setNotice('');
    setSelected(tier);
    setQuantity(1);
    setPhase('idle');
    setMessage('');
    setResult(null);
    setPromoInput('');
    setPromo({ status: 'none' });
  };

  // Quantity changes invalidate an applied promo preview (fixed discounts
  // don't scale) — re-validate against the new subtotal.
  const changeQuantity = (next: number) => {
    setQuantity(next);
    if (promo.status === 'applied' || promo.status === 'invalid') setPromo({ status: 'none' });
  };

  const applyPromo = async () => {
    if (!selected || !promoInput.trim()) return;
    setPromo({ status: 'checking' });
    try {
      const res = await fetch('/api/events/promo-codes/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticketTypeId: selected.id, code: promoInput, quantity }),
      });
      const d = await res.json();
      if (res.ok && d.valid) {
        setPromo({ status: 'applied', code: d.code, discountCents: d.discountCents, totalCents: d.totalCents });
      } else {
        setPromo({ status: 'invalid', error: d.error ?? 'That code isn’t valid' });
      }
    } catch {
      setPromo({ status: 'invalid', error: 'Could not check that code — try again.' });
    }
  };

  const pay = async () => {
    if (!selected || !user?.id) return;
    setPhase('redirecting');
    setMessage('');
    try {
      const res = await fetch('/api/checkout/stripe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          privyId: user.id,
          ticketTypeId: selected.id,
          quantity,
          promoCode: promo.status === 'applied' ? promo.code : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Checkout failed');
      if (data.free) {
        // Free tier or fully discounted — issued instantly, no Stripe leg.
        setResult({ ticketCount: data.ticketCount ?? quantity });
        setPhase('success');
        loadOwned();
        onPurchased?.();
        return;
      }
      if (!data.url) throw new Error('Checkout failed — try again.');
      window.location.href = data.url; // off to Stripe-hosted Checkout
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Checkout failed');
      setPhase('error');
    }
  };

  // Nothing to show for unticketed events — unless we're confirming a
  // just-completed purchase (tiers may still be loading on the return leg).
  const confirmingReturn = phase === 'confirming' || (phase === 'success' && returnOrderId != null);
  if ((!tiers || tiers.length === 0) && !confirmingReturn) return null;

  const subtotalCents = selected ? selected.priceCents * quantity : 0;
  const totalCents = promo.status === 'applied' ? promo.totalCents : subtotalCents;
  const maxQty = selected
    ? Math.min(selected.maxPerOrder ?? 10, selected.remaining ?? selected.maxPerOrder ?? 10)
    : 1;

  const payLabel =
    phase === 'redirecting'
      ? 'Opening secure checkout…'
      : totalCents === 0
        ? 'Get ticket'
        : `Pay ${usd(totalCents)}`;

  return (
    <div className="mb-8">
      <p className="font-mono text-[13px] uppercase tracking-[0.15em] font-bold mb-3 opacity-50" style={{ color: 'var(--foreground)' }}>
        Tickets
      </p>

      {notice && ownedCount === 0 && (
        <p className="font-mono text-[12px] mb-3 px-3 py-2 rounded-lg border" style={{ color: 'var(--foreground)', borderColor: 'var(--border-color)', opacity: 0.8 }}>
          {notice}
        </p>
      )}

      {/* Already holding tickets — lead with that instead of the buy list. */}
      {ownedCount > 0 && (
        <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-lg border mb-2" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--surface-hover)' }}>
          <div className="min-w-0">
            <p className="font-mono text-[14px] font-bold" style={{ color: 'var(--foreground)' }}>
              🎟️ You have {ownedCount} ticket{ownedCount > 1 ? 's' : ''}
            </p>
            <p className="font-mono text-[12px] opacity-60" style={{ color: 'var(--foreground)' }}>
              Open Event Mode at the door to get scanned in.
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <a
              href={`/events/${slug}/live`}
              className="px-4 py-2 font-mono text-[11px] uppercase tracking-widest rounded-lg no-underline font-bold"
              style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-text)' }}
            >
              Event Mode
            </a>
            {!showBuyMore && (
              <button
                onClick={() => setShowBuyMore(true)}
                className="font-mono text-[11px] underline cursor-pointer bg-transparent border-none opacity-60 hover:opacity-100"
                style={{ color: 'var(--foreground)' }}
              >
                Buy more
              </button>
            )}
          </div>
        </div>
      )}

      <div className="space-y-2" style={ownedCount > 0 && !showBuyMore ? { display: 'none' } : undefined}>
        {(tiers ?? []).map((t) => {
          const ended = t.saleState === 'ended';
          const upcoming = t.saleState === 'upcoming';
          // Not-purchasable states are quiet: the whole row greys out, the
          // status reads as a small line under the name, and there's no
          // button-shaped element at all — only live tiers get a Get button.
          return (
            <div
              key={t.id}
              className="flex items-center justify-between gap-3 px-4 py-3 rounded-lg border"
              style={{ borderColor: 'var(--border-color)', opacity: ended || upcoming ? 0.5 : 1 }}
            >
              <div className="min-w-0">
                <p className="font-mono text-[14px] font-bold truncate" style={{ color: 'var(--foreground)', textDecoration: ended ? 'line-through' : undefined }}>
                  {t.name}
                </p>
                {t.description && (
                  <p className="font-mono text-[12px] opacity-60 truncate" style={{ color: 'var(--foreground)' }}>
                    {t.description}
                  </p>
                )}
                {upcoming && (
                  <p className="font-mono text-[11px] uppercase tracking-[1px] opacity-70" style={{ color: 'var(--foreground)' }}>
                    {t.salesStartAt ? `On sale ${saleDateLabel(t.salesStartAt)}` : 'Coming soon'}
                  </p>
                )}
                {ended && (
                  <p className="font-mono text-[11px] uppercase tracking-[1px] opacity-70" style={{ color: 'var(--foreground)' }}>
                    Sale ended
                  </p>
                )}
                {!ended && !upcoming && t.remaining != null && t.remaining <= 10 && !t.soldOut && (
                  <p className="font-mono text-[11px] opacity-50" style={{ color: 'var(--foreground)' }}>
                    {t.remaining} left
                  </p>
                )}
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="font-mono text-[14px] font-bold" style={{ color: 'var(--foreground)', textDecoration: ended ? 'line-through' : undefined }}>
                  {t.priceCents === 0 ? 'Free' : usd(t.priceCents)}
                </span>
                {!ended && !upcoming && (
                  <button
                    onClick={() => openFor(t)}
                    disabled={t.soldOut}
                    className="px-4 py-2 font-mono text-[11px] uppercase tracking-widest rounded-lg cursor-pointer transition border-none font-bold disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{ backgroundColor: 'var(--foreground)', color: 'var(--background)' }}
                  >
                    {t.soldOut ? 'Sold out' : 'Get'}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Post-redirect confirmation (no tier modal open) */}
      {!selected && (phase === 'confirming' || phase === 'success') && (
        <div className="fixed inset-0 z-[2100] flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}>
          <div className="w-full max-w-md rounded-2xl p-6 border text-center" style={{ backgroundColor: 'var(--background)', borderColor: 'var(--border-color)' }}>
            {phase === 'confirming' ? (
              <>
                <p className="font-mono text-[15px] font-bold mb-2" style={{ color: 'var(--foreground)' }}>
                  Confirming your payment…
                </p>
                <p className="font-mono text-[13px] opacity-70" style={{ color: 'var(--foreground)' }}>
                  Hang tight — this usually takes a few seconds.
                </p>
              </>
            ) : (
              <>
                <p className="font-mono text-[15px] font-bold mb-2" style={{ color: 'var(--foreground)' }}>
                  You&apos;re in 🎟️
                </p>
                <p className="font-mono text-[13px] opacity-70 mb-6" style={{ color: 'var(--foreground)' }}>
                  {result?.ticketCount ?? 1} ticket{(result?.ticketCount ?? 1) > 1 ? 's' : ''} confirmed. A receipt is on its way to your email.
                </p>
                <button onClick={close} className="w-full px-4 py-3 font-mono text-[12px] uppercase tracking-widest rounded-lg cursor-pointer border-none font-bold" style={{ backgroundColor: 'var(--foreground)', color: 'var(--background)' }}>
                  Done
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Checkout modal */}
      {selected && (
        <div className="fixed inset-0 z-[2100] flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}>
          <div className="w-full max-w-md rounded-2xl p-6 border" style={{ backgroundColor: 'var(--background)', borderColor: 'var(--border-color)' }}>
            {phase === 'success' ? (
              <div className="text-center py-4">
                <p className="font-mono text-[15px] font-bold mb-2" style={{ color: 'var(--foreground)' }}>
                  You&apos;re in 🎟️
                </p>
                <p className="font-mono text-[13px] opacity-70 mb-6" style={{ color: 'var(--foreground)' }}>
                  {result?.ticketCount ?? quantity} ticket{(result?.ticketCount ?? quantity) > 1 ? 's' : ''} to {selected.name} confirmed.
                </p>
                <button onClick={close} className="w-full px-4 py-3 font-mono text-[12px] uppercase tracking-widest rounded-lg cursor-pointer border-none font-bold" style={{ backgroundColor: 'var(--foreground)', color: 'var(--background)' }}>
                  Done
                </button>
              </div>
            ) : (
              <>
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <p className="font-mono text-[15px] font-bold" style={{ color: 'var(--foreground)' }}>{selected.name}</p>
                    <p className="font-mono text-[12px] opacity-60" style={{ color: 'var(--foreground)' }}>
                      {selected.priceCents === 0 ? 'Free' : `${usd(selected.priceCents)} each`}
                    </p>
                  </div>
                  <button onClick={close} className="font-mono text-[18px] opacity-50 hover:opacity-100 bg-transparent border-none cursor-pointer" style={{ color: 'var(--foreground)' }} aria-label="Close">×</button>
                </div>

                {/* Quantity */}
                <div className="flex items-center justify-between mb-4">
                  <span className="font-mono text-[13px]" style={{ color: 'var(--foreground)' }}>Quantity</span>
                  <div className="flex items-center gap-3">
                    <button onClick={() => changeQuantity(Math.max(1, quantity - 1))} className="w-8 h-8 rounded-lg border font-mono cursor-pointer bg-transparent" style={{ color: 'var(--foreground)', borderColor: 'var(--border-color)' }}>−</button>
                    <span className="font-mono text-[14px] w-6 text-center" style={{ color: 'var(--foreground)' }}>{quantity}</span>
                    <button onClick={() => changeQuantity(Math.min(maxQty, quantity + 1))} className="w-8 h-8 rounded-lg border font-mono cursor-pointer bg-transparent" style={{ color: 'var(--foreground)', borderColor: 'var(--border-color)' }}>+</button>
                  </div>
                </div>

                {selected.priceCents > 0 && (
                  <>
                    {/* Promo code */}
                    <div className="mb-4">
                      <div className="flex gap-2">
                        <input
                          value={promoInput}
                          onChange={(e) => {
                            setPromoInput(e.target.value.toUpperCase());
                            if (promo.status !== 'none') setPromo({ status: 'none' });
                          }}
                          onKeyDown={(e) => { if (e.key === 'Enter') applyPromo(); }}
                          placeholder="Promo code"
                          className="flex-1 min-w-0 px-3 py-2 font-mono text-[13px] uppercase rounded-lg border bg-transparent"
                          style={{ color: 'var(--foreground)', borderColor: 'var(--border-color)' }}
                        />
                        <button
                          onClick={applyPromo}
                          disabled={promo.status === 'checking' || !promoInput.trim()}
                          className="px-4 py-2 font-mono text-[11px] uppercase tracking-widest rounded-lg border cursor-pointer bg-transparent disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                          style={{ color: 'var(--foreground)', borderColor: 'var(--border-color)' }}
                        >
                          {promo.status === 'checking' ? '…' : 'Apply'}
                        </button>
                      </div>
                      {promo.status === 'applied' && (
                        <p className="font-mono text-[12px] mt-2" style={{ color: 'var(--foreground)' }}>
                          <span style={{ color: '#2fbf71' }}>✓ {promo.code}</span>
                          <span className="opacity-70"> — you save {usd(promo.discountCents)}</span>
                        </p>
                      )}
                      {promo.status === 'invalid' && (
                        <p className="font-mono text-[12px] mt-2" style={{ color: '#ff6b6b' }}>{promo.error}</p>
                      )}
                    </div>

                    {/* Order summary */}
                    <div className="mb-4 space-y-1 font-mono text-[12px]" style={{ color: 'var(--foreground)' }}>
                      <div className="flex justify-between opacity-70">
                        <span>{quantity} × {selected.name}</span>
                        <span>{usd(subtotalCents)}</span>
                      </div>
                      {promo.status === 'applied' && (
                        <div className="flex justify-between opacity-70">
                          <span>Promo {promo.code}</span>
                          <span>−{usd(promo.discountCents)}</span>
                        </div>
                      )}
                      <div className="flex justify-between font-bold pt-1 border-t" style={{ borderColor: 'var(--border-color)' }}>
                        <span>Total</span>
                        <span>{totalCents === 0 ? 'Free' : usd(totalCents)}</span>
                      </div>
                    </div>

                    {totalCents > 0 && (
                      <p className="font-mono text-[11px] opacity-50 mb-4" style={{ color: 'var(--foreground)' }}>
                        You&apos;ll be taken to Stripe&apos;s secure checkout to pay by card, Apple Pay or Google Pay.
                      </p>
                    )}
                  </>
                )}

                {message && (
                  <p className="font-mono text-[12px] mb-3" style={{ color: '#ff6b6b' }}>{message}</p>
                )}

                <button
                  onClick={pay}
                  disabled={phase === 'redirecting'}
                  className="w-full px-4 py-3 font-mono text-[12px] uppercase tracking-widest rounded-lg cursor-pointer border-none font-bold disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ backgroundColor: 'var(--foreground)', color: 'var(--background)' }}
                >
                  {payLabel}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
