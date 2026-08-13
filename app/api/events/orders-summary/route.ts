import { NextRequest, NextResponse } from 'next/server';
import { and, eq, sql } from 'drizzle-orm';
import { db, ticketOrders } from '@/lib/db';
import { requireManager } from '@/lib/events/auth';

// GET /api/events/orders-summary?eventId=...&privyId=...  (host only)
// Compact sales rollup for the manage console: paid orders, tickets sold,
// gross revenue and promo discounts given (all USD cents).
export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const eventId = sp.get('eventId');
    const privyId = sp.get('privyId') ?? undefined;
    if (!eventId) return NextResponse.json({ error: 'Missing eventId' }, { status: 400 });

    const auth = await requireManager(privyId, eventId);
    if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const [paid] = await db
      .select({
        orders: sql<number>`count(*)::int`,
        ticketsSold: sql<number>`coalesce(sum(${ticketOrders.quantity}), 0)::int`,
        grossCents: sql<number>`coalesce(sum(${ticketOrders.amountCents}), 0)::int`,
        discountCents: sql<number>`coalesce(sum(${ticketOrders.discountCents}), 0)::int`,
      })
      .from(ticketOrders)
      .where(and(eq(ticketOrders.eventId, eventId), eq(ticketOrders.status, 'paid')));

    const [refunded] = await db
      .select({ orders: sql<number>`count(*)::int` })
      .from(ticketOrders)
      .where(and(eq(ticketOrders.eventId, eventId), eq(ticketOrders.status, 'refunded')));

    return NextResponse.json({
      summary: {
        paidOrders: paid?.orders ?? 0,
        ticketsSold: paid?.ticketsSold ?? 0,
        grossCents: paid?.grossCents ?? 0,
        discountCents: paid?.discountCents ?? 0,
        refundedOrders: refunded?.orders ?? 0,
      },
    });
  } catch (error) {
    console.error('GET orders-summary:', error);
    return NextResponse.json({ error: 'Failed to fetch sales summary' }, { status: 500 });
  }
}
