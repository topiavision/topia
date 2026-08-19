import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, events, ticketOrders } from '@/lib/db';
import { stripeClient, isStripeConfigured } from '@/lib/stripe';
import { createPendingOrder } from '@/lib/payments/orders';
import { fulfillOrder, failOrder } from '@/lib/payments/tickets';
import { formatUsd } from '@/lib/payments/config';

// POST /api/checkout/stripe
// Body: { privyId, ticketTypeId, quantity, promoCode?,
//         buyerFirstName, buyerLastName, buyerEmail }
//
// Creates a pending order (price + promo snapshotted server-side) and a Stripe
// Checkout Session for it, then returns the session URL for the browser to
// redirect to. Stripe hosts the entire card form; we never touch card data.
// Fulfillment happens in the webhook (authoritative) and the status endpoint
// (fallback poll after the success redirect).
export async function POST(request: NextRequest) {
  try {
    if (!isStripeConfigured()) {
      return NextResponse.json({ error: 'Card payments are not configured' }, { status: 503 });
    }

    const data = await request.json();
    const { privyId, ticketTypeId, quantity, promoCode, buyerFirstName, buyerLastName, buyerEmail } = data;

    const result = await createPendingOrder({
      privyId,
      ticketTypeId,
      quantity: Number(quantity) || 1,
      rail: 'stripe',
      buyerFirstName,
      buyerLastName,
      buyerEmail,
      promoCode,
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    const { order, tier } = result;

    // Free (or 100%-discounted) → no charge, issue immediately.
    if (order.amountCents === 0) {
      const f = await fulfillOrder(order.id);
      return NextResponse.json({ ok: true, free: true, orderId: order.id, ticketCount: f.ticketCount });
    }

    const [ev] = await db
      .select({ eventName: events.eventName, slug: events.slug })
      .from(events)
      .where(eq(events.id, order.eventId));
    if (!ev) {
      await failOrder(order.id, 'cancelled');
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    const origin = request.nextUrl.origin;
    const eventUrl = `${origin}/events/${ev.slug}`;
    const description = [
      `${order.quantity} × ${tier.name}`,
      order.discountCents > 0 ? `promo ${order.promoCode} −$${formatUsd(order.discountCents)}` : null,
    ]
      .filter(Boolean)
      .join(' · ');

    try {
      const session = await stripeClient().checkout.sessions.create({
        mode: 'payment',
        client_reference_id: order.id,
        // Always set: createPendingOrder guarantees a valid buyerEmail, so
        // Stripe prefills rather than asking again.
        customer_email: order.buyerEmail ?? undefined,
        // One line item carrying the already-discounted order total: promo
        // math is ours (it must also cover any future rails), so Stripe just
        // charges the final amount.
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: order.currency.toLowerCase(),
              unit_amount: order.amountCents,
              product_data: {
                name: `${ev.eventName} — ${tier.name}`,
                description,
              },
            },
          },
        ],
        metadata: { orderId: order.id },
        payment_intent_data: { metadata: { orderId: order.id } },
        success_url: `${eventUrl}?checkout=success&order=${order.id}`,
        cancel_url: `${eventUrl}?checkout=cancelled&order=${order.id}`,
        // Auto-expire abandoned sessions so pending orders resolve (Stripe
        // minimum is 30 minutes; checkout.session.expired flips the order to
        // 'cancelled' via the webhook).
        expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
      });

      await db
        .update(ticketOrders)
        .set({ stripeCheckoutSessionId: session.id, updatedAt: new Date() })
        .where(eq(ticketOrders.id, order.id));

      return NextResponse.json({ ok: true, orderId: order.id, url: session.url });
    } catch (err) {
      await failOrder(order.id);
      console.error('stripe session create failed:', err);
      return NextResponse.json({ error: 'Could not start checkout — try again.' }, { status: 502 });
    }
  } catch (error) {
    console.error('POST checkout/stripe:', error);
    return NextResponse.json({ error: 'Checkout failed' }, { status: 500 });
  }
}
