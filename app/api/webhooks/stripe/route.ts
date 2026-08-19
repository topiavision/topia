import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { eq } from 'drizzle-orm';
import { db, ticketOrders } from '@/lib/db';
import { stripeClient, STRIPE_WEBHOOK_SECRET } from '@/lib/stripe';
import { fulfillOrder, failOrder, refundOrder } from '@/lib/payments/tickets';
import { applyStripeCustomerDetails } from '@/lib/payments/buyerIdentity';

// Stripe calls this URL on payment lifecycle events. It is the source of truth
// for finalizing orders: the status endpoint also fulfills as a fallback after
// the success redirect, but the webhook guarantees fulfillment even if the
// buyer never returns to the site. fulfillOrder() is idempotent, so both
// firing is safe.
//
// Configure the endpoint in the Stripe dashboard:
//   Developers → Webhooks → Add endpoint
//   URL: https://<your-domain>/api/webhooks/stripe
//   Events: checkout.session.completed, checkout.session.expired, charge.refunded
//   Then set STRIPE_WEBHOOK_SECRET (whsec_…) in env.
// Local dev: `stripe listen --forward-to localhost:3000/api/webhooks/stripe`.
export async function POST(request: NextRequest) {
  const body = await request.text(); // raw body required for signature check
  const signature = request.headers.get('stripe-signature') ?? '';

  let event: Stripe.Event;
  if (STRIPE_WEBHOOK_SECRET) {
    try {
      event = await stripeClient().webhooks.constructEventAsync(body, signature, STRIPE_WEBHOOK_SECRET);
    } catch {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }
  } else {
    console.warn('STRIPE_WEBHOOK_SECRET not set — skipping signature verification');
    event = JSON.parse(body) as Stripe.Event;
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const orderId = session.metadata?.orderId ?? session.client_reference_id;
        if (orderId && session.payment_status === 'paid') {
          // Reconcile identity BEFORE fulfilling: fulfillOrder sends the ticket
          // confirmation off order.buyerEmail, so a blank filled here is the
          // difference between the buyer getting their ticket and not. Fills
          // blanks only — never overwrites what they entered on Topia.
          try {
            await applyStripeCustomerDetails(orderId, session.customer_details);
          } catch (err) {
            console.error('[stripe-webhook] buyer identity reconcile failed:', err);
          }
          await fulfillOrder(orderId, {
            stripeCheckoutSessionId: session.id,
            stripePaymentIntentId:
              typeof session.payment_intent === 'string'
                ? session.payment_intent
                : session.payment_intent?.id,
          });
        }
        break;
      }

      case 'checkout.session.expired': {
        const session = event.data.object as Stripe.Checkout.Session;
        const orderId = session.metadata?.orderId ?? session.client_reference_id;
        if (orderId) {
          const [order] = await db
            .select({ status: ticketOrders.status })
            .from(ticketOrders)
            .where(eq(ticketOrders.id, orderId));
          if (order?.status === 'pending') await failOrder(orderId, 'cancelled');
        }
        break;
      }

      case 'charge.refunded': {
        // Only full refunds void tickets; a partial refund is a dashboard
        // decision that shouldn't revoke admission.
        const charge = event.data.object as Stripe.Charge;
        if (!charge.refunded) break;
        let orderId = charge.metadata?.orderId as string | undefined;
        if (!orderId && charge.payment_intent) {
          const pi =
            typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent.id;
          const [order] = await db
            .select({ id: ticketOrders.id })
            .from(ticketOrders)
            .where(eq(ticketOrders.stripePaymentIntentId, pi));
          orderId = order?.id;
        }
        if (orderId) await refundOrder(orderId);
        break;
      }

      default:
        break; // unrecognized events are acknowledged and ignored
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('POST webhooks/stripe:', error);
    // 500 → Stripe retries with backoff; handlers are idempotent so that's safe.
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
  }
}
