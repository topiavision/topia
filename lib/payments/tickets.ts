// Ticket issuance — the single place an order turns into admissions. The
// Stripe webhook, the post-redirect status endpoint, and the free-ticket path
// all call fulfillOrder(); it is idempotent so duplicate calls (webhook
// retries, double confirms) never double-issue tickets or over-count
// quantitySold / promo redemptions.
import { randomBytes } from 'crypto';
import { eq, sql } from 'drizzle-orm';
import { db, tickets, ticketOrders, eventTicketTypes, eventPromoCodes, events, users } from '@/lib/db';
import { sendTicketConfirmation } from '@/lib/notify/email';

// Crockford-ish base32 (no I/O/0/1) — unambiguous when read off a screen/QR.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function generateTicketCode(): string {
  const bytes = randomBytes(10);
  let out = '';
  for (let i = 0; i < 10; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return `TPA-${out.slice(0, 5)}-${out.slice(5)}`;
}

export type FulfillResult = {
  orderId: string;
  ticketCount: number;
  alreadyFulfilled: boolean;
};

// Emails link back to the site; webhooks have no request origin, so fall back
// to the canonical domain.
function siteOrigin(): string {
  return process.env.NEXT_PUBLIC_SITE_URL || 'https://topia.vision';
}

/**
 * Mark a pending order paid, issue one ticket per unit, increment the tier's
 * quantitySold and the promo code's redemptionCount — atomically. If the order
 * is already 'paid' this is a no-op that reports the existing ticket count.
 * On first fulfillment, a confirmation email is sent best-effort (never
 * throws, never blocks the payment result).
 *
 * @param paymentRef Stripe ids to stamp on the order when it flips to paid
 */
export async function fulfillOrder(
  orderId: string,
  paymentRef?: Partial<{
    stripeCheckoutSessionId: string;
    stripePaymentIntentId: string;
  }>,
): Promise<FulfillResult> {
  const result = await db.transaction(async (tx) => {
    const [order] = await tx
      .select()
      .from(ticketOrders)
      .where(eq(ticketOrders.id, orderId));

    if (!order) throw new Error(`Order ${orderId} not found`);

    if (order.status === 'paid') {
      const existing = await tx
        .select({ id: tickets.id })
        .from(tickets)
        .where(eq(tickets.orderId, orderId));
      return { orderId, ticketCount: existing.length, alreadyFulfilled: true, order };
    }

    const rows = Array.from({ length: order.quantity }, () => ({
      orderId: order.id,
      eventId: order.eventId,
      ticketTypeId: order.ticketTypeId,
      ownerId: order.buyerId,
      code: generateTicketCode(),
    }));
    await tx.insert(tickets).values(rows);

    await tx
      .update(ticketOrders)
      .set({ status: 'paid', updatedAt: new Date(), ...(paymentRef ?? {}) })
      .where(eq(ticketOrders.id, orderId));

    await tx
      .update(eventTicketTypes)
      .set({ quantitySold: sql`${eventTicketTypes.quantitySold} + ${order.quantity}` })
      .where(eq(eventTicketTypes.id, order.ticketTypeId));

    if (order.promoCodeId) {
      await tx
        .update(eventPromoCodes)
        .set({ redemptionCount: sql`${eventPromoCodes.redemptionCount} + 1`, updatedAt: new Date() })
        .where(eq(eventPromoCodes.id, order.promoCodeId));
    }

    return { orderId, ticketCount: rows.length, alreadyFulfilled: false, order };
  });

  if (!result.alreadyFulfilled && result.order.buyerEmail) {
    try {
      const [[ev], [buyer]] = await Promise.all([
        db
          .select({ eventName: events.eventName, slug: events.slug })
          .from(events)
          .where(eq(events.id, result.order.eventId)),
        db.select({ name: users.name }).from(users).where(eq(users.id, result.order.buyerId)),
      ]);
      if (ev) {
        await sendTicketConfirmation({
          to: result.order.buyerEmail,
          origin: siteOrigin(),
          slug: ev.slug,
          eventName: ev.eventName,
          guestName: buyer?.name,
          ticketCount: result.ticketCount,
          totalCents: result.order.amountCents,
        });
      }
    } catch (err) {
      console.error('ticket confirmation email failed:', err);
    }
  }

  return { orderId: result.orderId, ticketCount: result.ticketCount, alreadyFulfilled: result.alreadyFulfilled };
}

/** Mark a pending order failed/cancelled (e.g. declined card, abandoned). */
export async function failOrder(orderId: string, status: 'failed' | 'cancelled' = 'failed') {
  await db
    .update(ticketOrders)
    .set({ status, updatedAt: new Date() })
    .where(eq(ticketOrders.id, orderId));
}

/**
 * Full refund: flip the order to 'refunded', void its tickets, and release the
 * tier supply. Idempotent — a second call is a no-op. Triggered by Stripe's
 * charge.refunded webhook (refunds themselves are issued from the Stripe
 * dashboard).
 */
export async function refundOrder(orderId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [order] = await tx
      .select()
      .from(ticketOrders)
      .where(eq(ticketOrders.id, orderId));
    if (!order || order.status === 'refunded') return;

    await tx
      .update(ticketOrders)
      .set({ status: 'refunded', updatedAt: new Date() })
      .where(eq(ticketOrders.id, orderId));

    await tx
      .update(tickets)
      .set({ status: 'refunded' })
      .where(eq(tickets.orderId, orderId));

    // Only release supply that fulfillment actually took.
    if (order.status === 'paid') {
      await tx
        .update(eventTicketTypes)
        .set({ quantitySold: sql`GREATEST(${eventTicketTypes.quantitySold} - ${order.quantity}, 0)` })
        .where(eq(eventTicketTypes.id, order.ticketTypeId));
    }
  });
}
