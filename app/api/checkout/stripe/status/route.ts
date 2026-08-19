import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db, ticketOrders, tickets, users } from '@/lib/db';
import { stripeClient, isStripeConfigured } from '@/lib/stripe';
import { fulfillOrder, failOrder } from '@/lib/payments/tickets';
import { applyStripeCustomerDetails } from '@/lib/payments/buyerIdentity';

// GET /api/checkout/stripe/status?orderId=...&privyId=...
//
// Polled by the event page after Stripe redirects back with
// ?checkout=success. The webhook is the source of truth, but it can lag the
// redirect by a few seconds — and if it was never delivered, this endpoint
// self-heals: for a still-pending order it retrieves the Checkout Session
// directly from Stripe and fulfills if the payment is complete
// (fulfillOrder is idempotent, so racing the webhook is harmless).
export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const orderId = sp.get('orderId');
    const privyId = sp.get('privyId');
    if (!orderId || !privyId) {
      return NextResponse.json({ error: 'Missing orderId or privyId' }, { status: 400 });
    }

    const [buyer] = await db.select({ id: users.id }).from(users).where(eq(users.privyId, privyId));
    if (!buyer) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const [order] = await db
      .select()
      .from(ticketOrders)
      .where(and(eq(ticketOrders.id, orderId), eq(ticketOrders.buyerId, buyer.id)));
    if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });

    let status = order.status;

    if (status === 'pending' && order.stripeCheckoutSessionId && isStripeConfigured()) {
      try {
        const session = await stripeClient().checkout.sessions.retrieve(order.stripeCheckoutSessionId);
        if (session.payment_status === 'paid') {
          // Same blank-fill reconcile the webhook does — this path runs when
          // the webhook never arrived, so it has to stand on its own.
          try {
            await applyStripeCustomerDetails(order.id, session.customer_details);
          } catch (err) {
            console.error('[checkout-status] buyer identity reconcile failed:', err);
          }
          await fulfillOrder(order.id, {
            stripePaymentIntentId:
              typeof session.payment_intent === 'string'
                ? session.payment_intent
                : session.payment_intent?.id,
          });
          status = 'paid';
        } else if (session.status === 'expired') {
          await failOrder(order.id, 'cancelled');
          status = 'cancelled';
        }
      } catch (err) {
        console.error('stripe status retrieve failed:', err);
      }
    }

    const issued =
      status === 'paid'
        ? await db.select({ id: tickets.id }).from(tickets).where(eq(tickets.orderId, order.id))
        : [];

    return NextResponse.json({
      ok: true,
      orderId: order.id,
      status,
      ticketCount: issued.length,
      quantity: order.quantity,
      amountCents: order.amountCents,
      discountCents: order.discountCents,
    });
  } catch (error) {
    console.error('GET checkout/stripe/status:', error);
    return NextResponse.json({ error: 'Could not check order status' }, { status: 500 });
  }
}
