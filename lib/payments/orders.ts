// Shared order creation. Validates the tier, checks supply, applies any promo
// code, and snapshots the final price into a 'pending' order. The Stripe
// checkout route starts here, then attaches the Checkout Session.
import { eq } from 'drizzle-orm';
import { db, eventTicketTypes, ticketOrders, users } from '@/lib/db';
import { checkPromoCode } from './promo';

export type Rail = 'stripe';

export type CreateOrderInput = {
  privyId: string;
  ticketTypeId: string;
  quantity: number;
  rail: Rail;
  // Buyer identity for the sales record. Collected on the checkout screen so
  // the host's guest list has a real name and a reachable email even when the
  // buyer signed in with SMS only and has an otherwise empty profile.
  buyerFirstName?: string;
  buyerLastName?: string;
  buyerEmail?: string;
  promoCode?: string;
};

type Tier = typeof eventTicketTypes.$inferSelect;
type Order = typeof ticketOrders.$inferSelect;

export type CreateOrderResult =
  | { ok: true; order: Order; tier: Tier; buyer: { id: string; email: string | null } }
  | { ok: false; status: number; error: string };

export async function createPendingOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
  if (!input.privyId) return { ok: false, status: 401, error: 'Not authenticated' };
  if (!input.ticketTypeId) return { ok: false, status: 400, error: 'Missing ticketTypeId' };

  const quantity = Math.floor(Number(input.quantity));
  if (!Number.isInteger(quantity) || quantity < 1) {
    return { ok: false, status: 400, error: 'Quantity must be a positive integer' };
  }

  const [buyer] = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(eq(users.privyId, input.privyId));
  if (!buyer) return { ok: false, status: 404, error: 'User not found' };

  // Buyer identity is required for a paid admission — the host needs a name at
  // the door and an address to send the ticket to. The checkout screen enforces
  // this too; repeating it here so a direct API call can't create a nameless
  // order. Falls back to the profile email when the form didn't send one.
  const buyerFirstName = input.buyerFirstName?.trim() || '';
  const buyerLastName = input.buyerLastName?.trim() || '';
  const buyerEmail = (input.buyerEmail?.trim() || buyer.email || '').trim();
  if (!buyerFirstName || !buyerLastName) {
    return { ok: false, status: 400, error: 'First and last name are required' };
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(buyerEmail)) {
    return { ok: false, status: 400, error: 'A valid email is required' };
  }

  const [tier] = await db
    .select()
    .from(eventTicketTypes)
    .where(eq(eventTicketTypes.id, input.ticketTypeId));
  if (!tier) return { ok: false, status: 404, error: 'Ticket type not found' };
  if (!tier.isActive) return { ok: false, status: 400, error: 'This ticket is not on sale' };

  // Sale window — the UI greys these out, but enforce here so a direct API
  // call can't buy early or after close.
  const now = new Date();
  if (tier.salesStartAt && now < tier.salesStartAt) {
    return { ok: false, status: 400, error: 'This ticket isn’t on sale yet' };
  }
  if (tier.salesEndAt && now > tier.salesEndAt) {
    return { ok: false, status: 400, error: 'Sales for this ticket have ended' };
  }

  const maxPerOrder = tier.maxPerOrder ?? 10;
  if (quantity > maxPerOrder) {
    return { ok: false, status: 400, error: `You can buy at most ${maxPerOrder} per order` };
  }

  // Supply check. NOTE: quantitySold is incremented only at fulfillment, so a
  // burst of concurrent checkouts could oversell within the pending window.
  // For the foundation this soft-check is sufficient; a follow-up can hold
  // inventory with a row lock or a reserved-until timestamp.
  if (tier.quantityTotal != null) {
    const remaining = tier.quantityTotal - tier.quantitySold;
    if (quantity > remaining) {
      return { ok: false, status: 409, error: `Only ${Math.max(0, remaining)} ticket(s) left` };
    }
  }

  const unitPriceCents = tier.priceCents;
  const subtotalCents = unitPriceCents * quantity;

  // Promo code — resolved server-side; the snapshot on the order is what the
  // buyer is actually charged.
  let promoCodeId: string | null = null;
  let promoCode: string | null = null;
  let discountCents = 0;
  if (input.promoCode?.trim() && subtotalCents > 0) {
    const check = await checkPromoCode({
      eventId: tier.eventId,
      code: input.promoCode,
      ticketTypeId: tier.id,
      subtotalCents,
    });
    if (!check.ok) return { ok: false, status: 400, error: check.error };
    promoCodeId = check.promo.id;
    promoCode = check.promo.code;
    discountCents = check.discountCents;
  }

  const amountCents = subtotalCents - discountCents;

  const [order] = await db
    .insert(ticketOrders)
    .values({
      eventId: tier.eventId,
      ticketTypeId: tier.id,
      buyerId: buyer.id,
      quantity,
      unitPriceCents,
      amountCents,
      currency: tier.currency,
      rail: input.rail,
      status: 'pending',
      buyerFirstName,
      buyerLastName,
      buyerEmail,
      promoCodeId,
      promoCode,
      discountCents,
    })
    .returning();

  return { ok: true, order, tier, buyer };
}
