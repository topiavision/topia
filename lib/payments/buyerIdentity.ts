// Reconciling a ticket order's buyer identity with what Stripe collected.
//
// The checkout screen is the primary capture point — first name, last name and
// email are required there and land on the order before the redirect. This is
// the safety net for the two cases that bypass it: orders placed before that
// screen existed, and buyers who change their email on Stripe's own page.
//
// Everything here FILLS BLANKS ONLY. A value the buyer typed on Topia is never
// overwritten by Stripe's, and a user's profile name/email is never clobbered —
// same rule the RSVP route follows when it patches a user row.
import { eq } from 'drizzle-orm';
import { db, ticketOrders, users } from '@/lib/db';

export type StripeCustomerDetails = {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
} | null | undefined;

/**
 * Split a single "Full Name" string into first/last. Stripe gives one field
 * (the cardholder name), so the first token is the first name and everything
 * after it is the last name — "Ada", "Ada Lovelace", "Ana Maria de la Cruz"
 * all land somewhere sensible. A one-word name yields no last name rather than
 * a fabricated one.
 */
export function splitFullName(full: string | null | undefined): { first: string; last: string } {
  const parts = (full ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: '', last: '' };
  if (parts.length === 1) return { first: parts[0], last: '' };
  return { first: parts[0], last: parts.slice(1).join(' ') };
}

export type ApplyResult = {
  orderPatched: string[];  // ticket_orders columns filled
  userPatched: string[];   // users columns filled
};

/**
 * Fill any blank buyer fields on an order (and on the buyer's user row) from a
 * Stripe Checkout Session's customer_details. Idempotent: re-running once the
 * blanks are filled is a no-op.
 */
export async function applyStripeCustomerDetails(
  orderId: string,
  details: StripeCustomerDetails,
): Promise<ApplyResult> {
  const empty: ApplyResult = { orderPatched: [], userPatched: [] };
  if (!details) return empty;

  const email = details.email?.trim() || '';
  const phone = details.phone?.trim() || '';
  const { first, last } = splitFullName(details.name);
  if (!email && !phone && !first) return empty;

  const [order] = await db
    .select({
      id: ticketOrders.id,
      buyerId: ticketOrders.buyerId,
      buyerFirstName: ticketOrders.buyerFirstName,
      buyerLastName: ticketOrders.buyerLastName,
      buyerEmail: ticketOrders.buyerEmail,
    })
    .from(ticketOrders)
    .where(eq(ticketOrders.id, orderId))
    .limit(1);
  if (!order) return empty;

  const orderPatch: Record<string, string | Date> = {};
  if (first && !order.buyerFirstName?.trim()) orderPatch.buyerFirstName = first;
  if (last && !order.buyerLastName?.trim()) orderPatch.buyerLastName = last;
  if (email && !order.buyerEmail?.trim()) orderPatch.buyerEmail = email;

  const orderPatched = Object.keys(orderPatch);
  if (orderPatched.length > 0) {
    orderPatch.updatedAt = new Date();
    await db.update(ticketOrders).set(orderPatch).where(eq(ticketOrders.id, order.id));
  }

  // Fill the buyer's profile blanks too, so the guest list and every other
  // surface that reads the user row stops showing a bare phone number.
  const [user] = await db
    .select({ id: users.id, name: users.name, email: users.email, phone: users.phone })
    .from(users)
    .where(eq(users.id, order.buyerId))
    .limit(1);

  const userPatch: Record<string, string | Date> = {};
  if (user) {
    const fullName = [first, last].filter(Boolean).join(' ');
    if (fullName && !user.name?.trim()) userPatch.name = fullName;
    // users.email and users.phone are UNIQUE — another row may already own this
    // address, so let the write fail softly rather than 500 the webhook.
    if (email && !user.email?.trim()) userPatch.email = email;
    if (phone && !user.phone?.trim()) userPatch.phone = phone;
  }

  const userPatched = Object.keys(userPatch);
  if (user && userPatched.length > 0) {
    userPatch.updatedAt = new Date();
    try {
      await db.update(users).set(userPatch).where(eq(users.id, user.id));
    } catch (err) {
      console.error(`[buyerIdentity] could not patch user ${user.id} (unique conflict?):`, err);
      return { orderPatched, userPatched: [] };
    }
  }

  return { orderPatched, userPatched };
}
