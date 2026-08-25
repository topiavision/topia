import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { worldEras, eraMilestones, worldMembers, users } from '@/lib/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { cleanDate, cleanPrecision } from '@/lib/eraDates';

const NO_STORE = { 'Cache-Control': 'private, no-store' };
const MILESTONE_STATUSES = new Set(['done', 'now', 'upcoming', 'paused']);
const BUILDER_ROLES = ['owner', 'world_builder'];

// Resolve the era's world and check the caller can build there.
async function authorizeEra(privyId: string, eraId: string) {
  const [era] = await db.select({ id: worldEras.id, worldId: worldEras.worldId })
    .from(worldEras).where(eq(worldEras.id, eraId)).limit(1);
  if (!era) return { error: 'Era not found', status: 404 } as const;
  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.privyId, privyId)).limit(1);
  if (!user) return { error: 'Not authorized', status: 403 } as const;
  const [membership] = await db.select({ id: worldMembers.id }).from(worldMembers)
    .where(and(
      eq(worldMembers.worldId, era.worldId),
      eq(worldMembers.userId, user.id),
      inArray(worldMembers.role, BUILDER_ROLES),
    )).limit(1);
  if (!membership) return { error: 'Not authorized', status: 403 } as const;
  return { era } as const;
}

// POST /api/worlds/eras/milestones — add a milestone (builders).
export async function POST(request: Request) {
  try {
    const { privyId, eraId, title, description, details, startDate, endDate, startPrecision, endPrecision, dateLabel, status, imageUrl, sortOrder } = await request.json();
    if (!privyId || !eraId || !title?.trim()) {
      return NextResponse.json({ error: 'eraId and title are required' }, { status: 400 });
    }
    const cleanStatus = String(status || 'upcoming');
    if (!MILESTONE_STATUSES.has(cleanStatus)) {
      return NextResponse.json({ error: 'status must be done, now, upcoming, or paused' }, { status: 400 });
    }
    const auth = await authorizeEra(privyId, eraId);
    if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const [milestone] = await db.insert(eraMilestones).values({
      eraId,
      title: String(title).trim(),
      description: description ? String(description).trim() : null,
      // The multi-line 'full picture'; description above stays the one-liner.
      details: details ? String(details).trim().slice(0, 4000) : null,
      startDate: cleanDate(startDate) ?? null,
      endDate: cleanDate(endDate) ?? null,
      startPrecision: cleanPrecision(startPrecision) ?? null,
      endPrecision: cleanPrecision(endPrecision) ?? null,
      dateLabel: dateLabel ? String(dateLabel).trim() : null,
      status: cleanStatus,
      imageUrl: imageUrl ? String(imageUrl) : null,
      sortOrder: Number.isFinite(Number(sortOrder)) ? Number(sortOrder) : 0,
    }).returning();
    const { goalCents: _g, raisedCents: _r, ...safe } = milestone;
    return NextResponse.json({ milestone: safe }, { headers: NO_STORE });
  } catch (error) {
    console.error('[era-milestones] POST failed:', error);
    return NextResponse.json({ error: 'Failed to add milestone' }, { status: 500 });
  }
}

// PUT /api/worlds/eras/milestones — update (builders).
export async function PUT(request: Request) {
  try {
    const { privyId, milestoneId, details, ...fields } = await request.json();
    if (!privyId || !milestoneId) return NextResponse.json({ error: 'milestoneId is required' }, { status: 400 });

    const [existing] = await db.select({ eraId: eraMilestones.eraId }).from(eraMilestones)
      .where(eq(eraMilestones.id, milestoneId)).limit(1);
    if (!existing) return NextResponse.json({ error: 'Milestone not found' }, { status: 404 });

    const auth = await authorizeEra(privyId, existing.eraId);
    if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    if (fields.status !== undefined && !MILESTONE_STATUSES.has(String(fields.status))) {
      return NextResponse.json({ error: 'status must be done, now, upcoming, or paused' }, { status: 400 });
    }

    const startDate = cleanDate(fields.startDate);
    const endDate = cleanDate(fields.endDate);
    const startPrecision = cleanPrecision(fields.startPrecision);
    const endPrecision = cleanPrecision(fields.endPrecision);
    await db.update(eraMilestones).set({
      ...(fields.title !== undefined ? { title: String(fields.title).trim() } : {}),
      ...(fields.description !== undefined ? { description: fields.description ? String(fields.description).trim() : null } : {}),
      ...(details !== undefined ? { details: details ? String(details).trim().slice(0, 4000) : null } : {}),
      ...(startDate !== undefined ? { startDate } : {}),
      ...(endDate !== undefined ? { endDate } : {}),
      ...(startPrecision !== undefined ? { startPrecision } : {}),
      ...(endPrecision !== undefined ? { endPrecision } : {}),
      ...(fields.dateLabel !== undefined ? { dateLabel: fields.dateLabel ? String(fields.dateLabel).trim() : null } : {}),
      ...(fields.status !== undefined ? { status: String(fields.status) } : {}),
      ...(fields.imageUrl !== undefined ? { imageUrl: fields.imageUrl ? String(fields.imageUrl) : null } : {}),
      ...(fields.sortOrder !== undefined ? { sortOrder: Number(fields.sortOrder) } : {}),
      updatedAt: new Date(),
    }).where(eq(eraMilestones.id, milestoneId));

    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  } catch (error) {
    console.error('[era-milestones] PUT failed:', error);
    return NextResponse.json({ error: 'Failed to update milestone' }, { status: 500 });
  }
}

// DELETE /api/worlds/eras/milestones?milestoneId=X&privyId=Y
export async function DELETE(request: Request) {
  try {
    const sp = new URL(request.url).searchParams;
    const milestoneId = sp.get('milestoneId');
    const privyId = sp.get('privyId');
    if (!privyId || !milestoneId) return NextResponse.json({ error: 'milestoneId is required' }, { status: 400 });

    const [existing] = await db.select({ eraId: eraMilestones.eraId }).from(eraMilestones)
      .where(eq(eraMilestones.id, milestoneId)).limit(1);
    if (!existing) return NextResponse.json({ error: 'Milestone not found' }, { status: 404 });

    const auth = await authorizeEra(privyId, existing.eraId);
    if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    await db.delete(eraMilestones).where(eq(eraMilestones.id, milestoneId));
    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  } catch (error) {
    console.error('[era-milestones] DELETE failed:', error);
    return NextResponse.json({ error: 'Failed to delete milestone' }, { status: 500 });
  }
}
