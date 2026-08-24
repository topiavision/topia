import { NextRequest, NextResponse } from 'next/server';
import { db, users, eventRsvps, ticketOrders, eventTicketTypes } from '@/lib/db';
import { eq, and, count, desc, inArray } from 'drizzle-orm';
import { requireManager } from '@/lib/events/auth';
import { promoteFromWaitlist } from '@/lib/events/waitlist';

// GET /api/events/rsvps?eventId=X&privyId=Y — RSVP list + counts + answers.
// Public data (counts, viewer's own status) is always returned. The full RSVP
// list with emails, phones, and responses is only returned to managers.
export async function GET(request: NextRequest) {
  try {
    const eventId = request.nextUrl.searchParams.get('eventId');
    const privyId = request.nextUrl.searchParams.get('privyId') ?? undefined;
    if (!eventId) return NextResponse.json({ error: 'Missing eventId' }, { status: 400 });

    // Per-status counts (public)
    const counts = await db
      .select({ status: eventRsvps.status, value: count() })
      .from(eventRsvps)
      .where(eq(eventRsvps.eventId, eventId))
      .groupBy(eventRsvps.status);
    const byStatus: Record<string, number> = {};
    for (const c of counts) byStatus[c.status] = c.value;
    const goingCount = byStatus['going'] || 0;
    const pendingCount = byStatus['pending'] || 0;
    const waitlistedCount = byStatus['waitlisted'] || 0;

    // Viewer's own RSVP status
    let userRsvped = false;
    let userStatus: string | null = null;
    if (privyId) {
      const [viewer] = await db.select({ id: users.id }).from(users).where(eq(users.privyId, privyId));
      if (viewer) {
        const [rsvp] = await db
          .select({ status: eventRsvps.status })
          .from(eventRsvps)
          .where(and(eq(eventRsvps.eventId, eventId), eq(eventRsvps.userId, viewer.id)));
        if (rsvp) { userRsvped = true; userStatus = rsvp.status; }
      }
    }

    // Full list with status + answers — managers only.
    const auth = await requireManager(privyId, eventId);
    const isManager = !('error' in auth);

    let rsvps: unknown[] = [];
    if (isManager) {
      const rows = await db
        .select({
          userId: eventRsvps.userId,
          name: users.name,
          username: users.username,
          avatarUrl: users.avatarUrl,
          email: users.email,
          phone: users.phone,
          status: eventRsvps.status,
          responses: eventRsvps.responses,
          createdAt: eventRsvps.createdAt,
        })
        .from(eventRsvps)
        .leftJoin(users, eq(eventRsvps.userId, users.id))
        .where(eq(eventRsvps.eventId, eventId));

      // Ticket buyers never fill in the RSVP form — fulfillOrder puts them
      // straight on the list — so their name and email live on the order, not
      // the profile. Overlay the paid order (newest per buyer) so the host sees
      // who they actually are and what they bought, instead of whatever Privy
      // happened to capture at login.
      const buyerIds = rows.map((r) => r.userId);
      const orders = buyerIds.length
        ? await db
            .select({
              buyerId: ticketOrders.buyerId,
              orderId: ticketOrders.id,
              firstName: ticketOrders.buyerFirstName,
              lastName: ticketOrders.buyerLastName,
              buyerEmail: ticketOrders.buyerEmail,
              quantity: ticketOrders.quantity,
              amountCents: ticketOrders.amountCents,
              promoCode: ticketOrders.promoCode,
              tierName: eventTicketTypes.name,
              purchasedAt: ticketOrders.createdAt,
            })
            .from(ticketOrders)
            .leftJoin(eventTicketTypes, eq(ticketOrders.ticketTypeId, eventTicketTypes.id))
            .where(and(
              eq(ticketOrders.eventId, eventId),
              eq(ticketOrders.status, 'paid'),
              inArray(ticketOrders.buyerId, buyerIds),
            ))
            .orderBy(desc(ticketOrders.createdAt))
        : [];

      // A buyer can hold several orders; keep the newest for the name/email
      // overlay but total the tickets and spend across all of them.
      const orderByBuyer = new Map<string, typeof orders[number]>();
      const totals = new Map<string, { tickets: number; spentCents: number }>();
      for (const o of orders) {
        if (!orderByBuyer.has(o.buyerId)) orderByBuyer.set(o.buyerId, o);
        const t = totals.get(o.buyerId) ?? { tickets: 0, spentCents: 0 };
        t.tickets += o.quantity;
        t.spentCents += o.amountCents;
        totals.set(o.buyerId, t);
      }

      rsvps = rows.map((r) => {
        const o = orderByBuyer.get(r.userId);
        const t = totals.get(r.userId);
        const fullName = o ? [o.firstName, o.lastName].filter(Boolean).join(' ') : '';
        return {
          ...r,
          // Order fields win for display only where the profile is blank —
          // a host who set a name on the profile still sees that name.
          name: r.name?.trim() || fullName || null,
          email: r.email?.trim() || o?.buyerEmail || null,
          firstName: o?.firstName ?? null,
          lastName: o?.lastName ?? null,
          ticket: o
            ? {
                tierName: o.tierName,
                tickets: t?.tickets ?? o.quantity,
                spentCents: t?.spentCents ?? o.amountCents,
                promoCode: o.promoCode,
                purchasedAt: o.purchasedAt,
              }
            : null,
        };
      });
    }

    return NextResponse.json({
      rsvps,
      rsvpCount: goingCount,
      goingCount,
      pendingCount,
      waitlistedCount,
      userRsvped,
      userStatus,
    });
  } catch (error) {
    console.error('GET event RSVPs:', error);
    return NextResponse.json({ error: 'Failed to fetch RSVPs' }, { status: 500 });
  }
}

// DELETE /api/events/rsvps?eventId=X&guestUserId=Y&privyId=Z
// Host removes a guest from the list (any status). Deletes the RSVP row, which
// also frees a capacity slot when the guest was 'going'.
export async function DELETE(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const eventId = sp.get('eventId');
    const guestUserId = sp.get('guestUserId');
    const privyId = sp.get('privyId');
    if (!eventId || !guestUserId || !privyId) {
      return NextResponse.json({ error: 'eventId, guestUserId and privyId are required' }, { status: 400 });
    }

    const auth = await requireManager(privyId, eventId);
    if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const deleted = await db
      .delete(eventRsvps)
      .where(and(eq(eventRsvps.eventId, eventId), eq(eventRsvps.userId, guestUserId)))
      .returning({ userId: eventRsvps.userId, status: eventRsvps.status });
    if (deleted.length === 0) return NextResponse.json({ error: 'RSVP not found' }, { status: 404 });

    // Removing a confirmed guest frees a slot — hand it to the waitlist.
    if (deleted.some((d) => d.status === 'going')) {
      try {
        await promoteFromWaitlist(eventId, request.nextUrl.origin);
      } catch (e) {
        console.error('[rsvps] waitlist promotion after host removal failed:', e);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('DELETE event RSVP (host remove):', error);
    return NextResponse.json({ error: 'Failed to remove guest' }, { status: 500 });
  }
}
