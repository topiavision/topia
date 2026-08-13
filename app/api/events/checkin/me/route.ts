import { NextRequest, NextResponse } from 'next/server';
import { db, users, eventRsvps, eventCheckins, tickets } from '@/lib/db';
import { eq, and, inArray, lte, count } from 'drizzle-orm';

// GET /api/events/checkin/me?eventId=X&privyId=Y — the viewer's own door
// state for an event: on the list? checked in? Powers Event Mode's
// locked/unlocked quest gate. Identification only (no authorization needed —
// it reveals nothing beyond the viewer's own rows).
export async function GET(request: NextRequest) {
  try {
    const eventId = request.nextUrl.searchParams.get('eventId');
    const privyId = request.nextUrl.searchParams.get('privyId');
    if (!eventId) return NextResponse.json({ error: 'Missing eventId' }, { status: 400 });
    if (!privyId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const [viewer] = await db.select({ id: users.id }).from(users).where(eq(users.privyId, privyId)).limit(1);
    if (!viewer) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const [[rsvp], [ticketAgg], [checkin]] = await Promise.all([
      db.select({ status: eventRsvps.status }).from(eventRsvps)
        .where(and(eq(eventRsvps.eventId, eventId), eq(eventRsvps.userId, viewer.id))).limit(1),
      db.select({ value: count() }).from(tickets)
        .where(and(eq(tickets.eventId, eventId), eq(tickets.ownerId, viewer.id), inArray(tickets.status, ['valid', 'checked_in']))),
      db.select({ createdAt: eventCheckins.createdAt }).from(eventCheckins)
        .where(and(eq(eventCheckins.eventId, eventId), eq(eventCheckins.userId, viewer.id))).limit(1),
    ]);
    const ticketCount = Number(ticketAgg?.value ?? 0);

    // Check-in ordinal (1 = first through the door) — powers "first N"
    // prizes ("you're #12, you qualify").
    let checkinPosition: number | null = null;
    if (checkin) {
      const [row] = await db.select({ value: count() }).from(eventCheckins)
        .where(and(eq(eventCheckins.eventId, eventId), lte(eventCheckins.createdAt, checkin.createdAt)));
      checkinPosition = Number(row?.value ?? 0) || null;
    }

    return NextResponse.json(
      {
        onList: rsvp?.status === 'going' || ticketCount > 0,
        ticketCount,
        rsvpStatus: rsvp?.status ?? null,
        checkedIn: !!checkin,
        checkedInAt: checkin?.createdAt ?? null,
        checkinPosition,
      },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    console.error('[checkin] GET me failed:', error);
    return NextResponse.json({ error: 'Failed to load check-in state' }, { status: 500 });
  }
}
