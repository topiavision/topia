// Promo code validation + discount math, shared by the public validate
// endpoint (live preview in the purchase modal) and order creation (the
// authoritative application). Always resolve the discount server-side from the
// code — never trust a client-computed amount.
import { and, eq } from 'drizzle-orm';
import { db, eventPromoCodes } from '@/lib/db';

export type PromoCode = typeof eventPromoCodes.$inferSelect;

export type PromoCheck =
  | { ok: true; promo: PromoCode; discountCents: number; totalCents: number }
  | { ok: false; error: string };

export function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase();
}

// Discount for an order subtotal, snapshotted in cents. Percent rounds to the
// nearest cent; both kinds are capped at the subtotal so totals never go
// negative.
export function computeDiscountCents(
  promo: Pick<PromoCode, 'discountType' | 'discountValue'>,
  subtotalCents: number,
): number {
  const raw =
    promo.discountType === 'percent'
      ? Math.round((subtotalCents * promo.discountValue) / 100)
      : promo.discountValue;
  return Math.max(0, Math.min(subtotalCents, raw));
}

// Stripe rejects card charges under $0.50, so a discount may make an order
// free (total 0) but must not strand it in the un-chargeable 1–49¢ band.
export const STRIPE_MIN_CHARGE_CENTS = 50;

/**
 * Look up a code for an event and check every redemption rule. `ticketTypeId`
 * is the tier being purchased (codes may be restricted to one tier);
 * `subtotalCents` is quantity × unit price before discount.
 */
export async function checkPromoCode(opts: {
  eventId: string;
  code: string;
  ticketTypeId: string;
  subtotalCents: number;
}): Promise<PromoCheck> {
  const code = normalizeCode(opts.code);
  if (!code) return { ok: false, error: 'Enter a promo code' };

  const [promo] = await db
    .select()
    .from(eventPromoCodes)
    .where(and(eq(eventPromoCodes.eventId, opts.eventId), eq(eventPromoCodes.code, code)));

  if (!promo || !promo.isActive) return { ok: false, error: 'That code isn’t valid' };

  const now = new Date();
  if (promo.startsAt && now < promo.startsAt) return { ok: false, error: 'That code isn’t active yet' };
  if (promo.expiresAt && now > promo.expiresAt) return { ok: false, error: 'That code has expired' };
  if (promo.maxRedemptions != null && promo.redemptionCount >= promo.maxRedemptions) {
    return { ok: false, error: 'That code has been fully redeemed' };
  }
  if (promo.ticketTypeId && promo.ticketTypeId !== opts.ticketTypeId) {
    return { ok: false, error: 'That code doesn’t apply to this ticket' };
  }

  const discountCents = computeDiscountCents(promo, opts.subtotalCents);
  const totalCents = opts.subtotalCents - discountCents;
  if (totalCents > 0 && totalCents < STRIPE_MIN_CHARGE_CENTS) {
    // e.g. 95% off a $5 ticket → 25¢, below the card minimum. Surface a clear
    // error instead of failing later inside Stripe.
    return { ok: false, error: 'That code brings the total below the $0.50 card minimum' };
  }

  return { ok: true, promo, discountCents, totalCents };
}
