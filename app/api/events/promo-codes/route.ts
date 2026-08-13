import { NextRequest, NextResponse } from 'next/server';
import { and, asc, eq } from 'drizzle-orm';
import { db, eventPromoCodes, eventTicketTypes } from '@/lib/db';
import { requireManager } from '@/lib/events/auth';
import { normalizeCode } from '@/lib/payments/promo';

// Host-only CRUD for an event's promo codes. Buyers never hit this route —
// they validate codes through /api/events/promo-codes/validate.

function sanitizeDiscount(discountType: unknown, discountValue: unknown): { type: 'percent' | 'fixed'; value: number } | { error: string } {
  const type = discountType === 'fixed' ? 'fixed' : discountType === 'percent' ? 'percent' : null;
  if (!type) return { error: 'discountType must be "percent" or "fixed"' };
  const value = Math.round(Number(discountValue));
  if (!Number.isFinite(value) || value < 1) return { error: 'Enter a valid discount' };
  if (type === 'percent' && value > 100) return { error: 'Percent discount can be at most 100' };
  return { type, value };
}

function parseDate(raw: unknown): Date | null | { error: string } {
  if (raw == null || raw === '') return null;
  const d = new Date(String(raw));
  if (Number.isNaN(d.getTime())) return { error: 'Invalid date' };
  return d;
}

// GET /api/events/promo-codes?eventId=...&privyId=...  (host only)
export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const eventId = sp.get('eventId');
    const privyId = sp.get('privyId') ?? undefined;
    if (!eventId) return NextResponse.json({ error: 'Missing eventId' }, { status: 400 });

    const auth = await requireManager(privyId, eventId);
    if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const rows = await db
      .select()
      .from(eventPromoCodes)
      .where(eq(eventPromoCodes.eventId, eventId))
      .orderBy(asc(eventPromoCodes.createdAt));

    return NextResponse.json({ promoCodes: rows });
  } catch (error) {
    console.error('GET promo-codes:', error);
    return NextResponse.json({ error: 'Failed to fetch promo codes' }, { status: 500 });
  }
}

// POST /api/events/promo-codes — create a code (host only)
// Body: { privyId, eventId, code, discountType, discountValue, ticketTypeId?,
//         maxRedemptions?, startsAt?, expiresAt? }
export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    if (!data.eventId || !data.code) {
      return NextResponse.json({ error: 'eventId and code are required' }, { status: 400 });
    }
    const auth = await requireManager(data.privyId, data.eventId);
    if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const code = normalizeCode(String(data.code)).slice(0, 40);
    if (!/^[A-Z0-9-]{2,40}$/.test(code)) {
      return NextResponse.json({ error: 'Codes are 2–40 letters, numbers or dashes' }, { status: 400 });
    }

    const discount = sanitizeDiscount(data.discountType, data.discountValue);
    if ('error' in discount) return NextResponse.json({ error: discount.error }, { status: 400 });

    const startsAt = parseDate(data.startsAt);
    if (startsAt && 'error' in startsAt) return NextResponse.json({ error: 'Invalid start date' }, { status: 400 });
    const expiresAt = parseDate(data.expiresAt);
    if (expiresAt && 'error' in expiresAt) return NextResponse.json({ error: 'Invalid expiry date' }, { status: 400 });

    // Optional tier restriction must point at a tier of this event.
    let ticketTypeId: string | null = null;
    if (data.ticketTypeId) {
      const [tier] = await db
        .select({ id: eventTicketTypes.id })
        .from(eventTicketTypes)
        .where(and(eq(eventTicketTypes.id, data.ticketTypeId), eq(eventTicketTypes.eventId, data.eventId)));
      if (!tier) return NextResponse.json({ error: 'Ticket type not found on this event' }, { status: 400 });
      ticketTypeId = tier.id;
    }

    const [existing] = await db
      .select({ id: eventPromoCodes.id })
      .from(eventPromoCodes)
      .where(and(eq(eventPromoCodes.eventId, data.eventId), eq(eventPromoCodes.code, code)));
    if (existing) return NextResponse.json({ error: 'That code already exists on this event' }, { status: 409 });

    const [created] = await db
      .insert(eventPromoCodes)
      .values({
        eventId: data.eventId,
        ticketTypeId,
        code,
        discountType: discount.type,
        discountValue: discount.value,
        maxRedemptions:
          data.maxRedemptions == null || data.maxRedemptions === ''
            ? null
            : Math.max(1, Math.round(Number(data.maxRedemptions))),
        startsAt,
        expiresAt,
        isActive: data.isActive ?? true,
      })
      .returning();

    return NextResponse.json({ promoCode: created }, { status: 201 });
  } catch (error) {
    console.error('POST promo-codes:', error);
    return NextResponse.json({ error: 'Failed to create promo code' }, { status: 500 });
  }
}

// PUT /api/events/promo-codes — update a code (host only)
export async function PUT(request: NextRequest) {
  try {
    const data = await request.json();
    if (!data.id) return NextResponse.json({ error: 'Missing promo code id' }, { status: 400 });

    const [existing] = await db.select().from(eventPromoCodes).where(eq(eventPromoCodes.id, data.id));
    if (!existing) return NextResponse.json({ error: 'Promo code not found' }, { status: 404 });

    const auth = await requireManager(data.privyId, existing.eventId);
    if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const patch: Partial<typeof eventPromoCodes.$inferInsert> = { updatedAt: new Date() };
    if (data.discountType != null || data.discountValue != null) {
      const discount = sanitizeDiscount(
        data.discountType ?? existing.discountType,
        data.discountValue ?? existing.discountValue,
      );
      if ('error' in discount) return NextResponse.json({ error: discount.error }, { status: 400 });
      patch.discountType = discount.type;
      patch.discountValue = discount.value;
    }
    if (data.maxRedemptions !== undefined) {
      patch.maxRedemptions =
        data.maxRedemptions == null || data.maxRedemptions === ''
          ? null
          : Math.max(1, Math.round(Number(data.maxRedemptions)));
    }
    if (data.startsAt !== undefined) {
      const d = parseDate(data.startsAt);
      if (d && 'error' in d) return NextResponse.json({ error: 'Invalid start date' }, { status: 400 });
      patch.startsAt = d;
    }
    if (data.expiresAt !== undefined) {
      const d = parseDate(data.expiresAt);
      if (d && 'error' in d) return NextResponse.json({ error: 'Invalid expiry date' }, { status: 400 });
      patch.expiresAt = d;
    }
    if (data.isActive != null) patch.isActive = Boolean(data.isActive);

    const [updated] = await db
      .update(eventPromoCodes)
      .set(patch)
      .where(eq(eventPromoCodes.id, data.id))
      .returning();

    return NextResponse.json({ promoCode: updated });
  } catch (error) {
    console.error('PUT promo-codes:', error);
    return NextResponse.json({ error: 'Failed to update promo code' }, { status: 500 });
  }
}

// DELETE /api/events/promo-codes?id=...&privyId=...  (host only)
// Deactivates if the code has been redeemed (preserves order history);
// hard-deletes an unused code.
export async function DELETE(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const id = sp.get('id');
    const privyId = sp.get('privyId') ?? undefined;
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    const [existing] = await db.select().from(eventPromoCodes).where(eq(eventPromoCodes.id, id));
    if (!existing) return NextResponse.json({ error: 'Promo code not found' }, { status: 404 });

    const auth = await requireManager(privyId, existing.eventId);
    if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    if (existing.redemptionCount > 0) {
      await db
        .update(eventPromoCodes)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(eventPromoCodes.id, id));
      return NextResponse.json({ deactivated: true });
    }
    await db.delete(eventPromoCodes).where(eq(eventPromoCodes.id, id));
    return NextResponse.json({ deleted: true });
  } catch (error) {
    console.error('DELETE promo-codes:', error);
    return NextResponse.json({ error: 'Failed to delete promo code' }, { status: 500 });
  }
}
