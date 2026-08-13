'use client';

import { useEffect, useState } from 'react';
import TicketSetup from '../_components/TicketSetup';

interface SalesSummary {
  paidOrders: number;
  ticketsSold: number;
  grossCents: number;
  discountCents: number;
  refundedOrders: number;
}

function usd(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

// Host-only ticketing console — the Tickets tab of the manage page. A sales
// rollup on top, then live tier + promo code management via TicketSetup
// (host-gated server-side on every call).
export default function TicketManager({
  eventId,
  slug,
  privyId,
}: {
  eventId: string;
  slug: string;
  privyId: string;
}) {
  void slug;
  const [summary, setSummary] = useState<SalesSummary | null>(null);

  useEffect(() => {
    fetch(`/api/events/orders-summary?eventId=${eventId}&privyId=${encodeURIComponent(privyId)}`)
      .then((r) => r.json())
      .then((d) => setSummary(d.summary ?? null))
      .catch(() => setSummary(null));
  }, [eventId, privyId]);

  return (
    <div className="mb-8 rounded-lg border p-4" style={{ borderColor: 'var(--border-color)' }}>
      <p className="font-mono text-[12px] uppercase tracking-[0.15em] font-bold opacity-60 mb-3" style={{ color: 'var(--foreground)' }}>
        Tickets &amp; Promo Codes
      </p>

      {summary && (summary.paidOrders > 0 || summary.refundedOrders > 0) && (
        <div className="grid grid-cols-3 gap-2 mb-4">
          {[
            { label: 'Sold', value: String(summary.ticketsSold) },
            { label: 'Gross', value: usd(summary.grossCents) },
            {
              label: 'Discounts',
              value: summary.discountCents > 0 ? `−${usd(summary.discountCents)}` : '—',
            },
          ].map((s) => (
            <div key={s.label} className="rounded-lg border px-3 py-2 text-center" style={{ borderColor: 'var(--border-color)' }}>
              <p className="font-mono text-[14px] font-bold" style={{ color: 'var(--foreground)' }}>{s.value}</p>
              <p className="font-mono text-[10px] uppercase tracking-[1px] opacity-40" style={{ color: 'var(--foreground)' }}>{s.label}</p>
            </div>
          ))}
          {summary.refundedOrders > 0 && (
            <p className="col-span-3 font-mono text-[11px] opacity-50" style={{ color: 'var(--foreground)' }}>
              {summary.refundedOrders} order{summary.refundedOrders > 1 ? 's' : ''} refunded (issue refunds from the Stripe dashboard — tickets void automatically).
            </p>
          )}
        </div>
      )}

      <TicketSetup privyId={privyId} eventId={eventId} />
    </div>
  );
}
