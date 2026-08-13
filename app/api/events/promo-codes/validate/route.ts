import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, eventTicketTypes } from '@/lib/db';
import { checkPromoCode } from '@/lib/payments/promo';

// POST /api/events/promo-codes/validate
// Body: { ticketTypeId, code, quantity }
//
// Public preview used by the purchase modal's "Apply" button: reports the
// discount a code would grant without creating anything. The same check runs
// again authoritatively at order creation, so a stale preview can't be
// exploited.
export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    const { ticketTypeId, code } = data;
    if (!ticketTypeId || !code) {
      return NextResponse.json({ error: 'Missing ticketTypeId or code' }, { status: 400 });
    }

    const quantity = Math.max(1, Math.floor(Number(data.quantity) || 1));

    const [tier] = await db
      .select({ id: eventTicketTypes.id, eventId: eventTicketTypes.eventId, priceCents: eventTicketTypes.priceCents })
      .from(eventTicketTypes)
      .where(eq(eventTicketTypes.id, ticketTypeId));
    if (!tier) return NextResponse.json({ error: 'Ticket type not found' }, { status: 404 });

    const subtotalCents = tier.priceCents * quantity;
    const check = await checkPromoCode({ eventId: tier.eventId, code, ticketTypeId: tier.id, subtotalCents });
    if (!check.ok) return NextResponse.json({ valid: false, error: check.error }, { status: 200 });

    return NextResponse.json({
      valid: true,
      code: check.promo.code,
      discountType: check.promo.discountType,
      discountValue: check.promo.discountValue,
      subtotalCents,
      discountCents: check.discountCents,
      totalCents: check.totalCents,
    });
  } catch (error) {
    console.error('POST promo-codes/validate:', error);
    return NextResponse.json({ error: 'Could not validate code' }, { status: 500 });
  }
}
