import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { worlds, creators, worldMembers, users, eventHosts } from '@/lib/db/schema';
import { eq, asc, and } from 'drizzle-orm';
import { isAdminRequest } from '@/lib/adminAuth';

// GET – all worlds (including unpublished) with members
export async function GET(request: Request) {
  if (!(await isAdminRequest(request))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const results = await db
      .select({
        id: worlds.id,
        title: worlds.title,
        slug: worlds.slug,
        shortDescription: worlds.shortDescription,
        description: worlds.description,
        category: worlds.category,
        imageUrl: worlds.imageUrl,
        headerImageUrl: worlds.headerImageUrl,
        country: worlds.country,
        tools: worlds.tools,
        collaborators: worlds.collaborators,
        socialLinks: worlds.socialLinks,
        dateAdded: worlds.dateAdded,
        displayOrder: worlds.displayOrder,
        creatorId: worlds.creatorId,
        published: worlds.published,
        creatorName: creators.name,
      })
      .from(worlds)
      .leftJoin(creators, eq(worlds.creatorId, creators.id))
      .orderBy(asc(worlds.displayOrder), asc(worlds.title));

    // Fetch all world members with user info
    const members = await db
      .select({
        worldId: worldMembers.worldId,
        userId: worldMembers.userId,
        role: worldMembers.role,
        userName: users.name,
        userUsername: users.username,
      })
      .from(worldMembers)
      .innerJoin(users, eq(worldMembers.userId, users.id));

    // Group members by worldId
    const memberMap: Record<string, { userId: string; role: string; userName: string | null; userUsername: string | null }[]> = {};
    for (const m of members) {
      if (!memberMap[m.worldId]) memberMap[m.worldId] = [];
      memberMap[m.worldId].push({
        userId: m.userId,
        role: m.role,
        userName: m.userName,
        userUsername: m.userUsername,
      });
    }

    const worldsWithMembers = results.map((w) => ({
      ...w,
      members: memberMap[w.id] || [],
    }));

    return NextResponse.json({ worlds: worldsWithMembers });
  } catch (error) {
    console.error('Admin GET worlds:', error);
    return NextResponse.json({ error: 'Failed to fetch worlds' }, { status: 500 });
  }
}

// POST – create world
export async function POST(request: Request) {
  if (!(await isAdminRequest(request))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const data = await request.json();
    const result = await db.insert(worlds).values({
      title: data.title,
      slug: data.slug,
      shortDescription: data.shortDescription || null,
      description: data.description || null,
      creatorId: data.creatorId || null,
      category: data.category || null,
      imageUrl: data.imageUrl || null,
      headerImageUrl: data.headerImageUrl || null,
      country: data.country || null,
      tools: data.tools || null,
      collaborators: data.collaborators || null,
      socialLinks: data.socialLinks || null,
      dateAdded: data.dateAdded || null,
      displayOrder: data.displayOrder ?? 0,
      published: data.published ?? true,
    }).returning();

    const world = result[0];

    // Sync world members
    if (data.worldBuilderIds?.length || data.collaboratorIds?.length) {
      await syncWorldMembers(world.id, data.worldBuilderIds || [], data.collaboratorIds || []);
    }

    return NextResponse.json({ world }, { status: 201 });
  } catch (error) {
    console.error('Admin POST world:', error);
    return NextResponse.json({ error: (error as Error).message || 'Failed to create world' }, { status: 500 });
  }
}

// PUT – update world
export async function PUT(request: Request) {
  if (!(await isAdminRequest(request))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const data = await request.json();
    if (!data.id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    // Handle bulk reorder: { reorder: [{ id, displayOrder }] }
    if (data.reorder) {
      for (const item of data.reorder) {
        await db.update(worlds).set({ displayOrder: item.displayOrder }).where(eq(worlds.id, item.id));
      }
      return NextResponse.json({ ok: true });
    }

    const result = await db.update(worlds).set({
      title: data.title,
      slug: data.slug,
      shortDescription: data.shortDescription || null,
      description: data.description || null,
      creatorId: data.creatorId || null,
      category: data.category || null,
      imageUrl: data.imageUrl || null,
      headerImageUrl: data.headerImageUrl || null,
      country: data.country || null,
      tools: data.tools || null,
      collaborators: data.collaborators || null,
      socialLinks: data.socialLinks || null,
      dateAdded: data.dateAdded || null,
      displayOrder: data.displayOrder ?? 0,
      published: data.published ?? true,
    }).where(eq(worlds.id, data.id)).returning();

    // Sync world members
    await syncWorldMembers(data.id, data.worldBuilderIds || [], data.collaboratorIds || []);

    return NextResponse.json({ world: result[0] });
  } catch (error) {
    console.error('Admin PUT world:', error);
    return NextResponse.json({ error: (error as Error).message || 'Failed to update world' }, { status: 500 });
  }
}

// DELETE – delete world
export async function DELETE(request: Request) {
  if (!(await isAdminRequest(request))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const data = await request.json();
    if (!data.id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    // Detach event-host links first — eventHosts.worldId has no cascade, so it
    // would block the delete. Members, invitations and projects cascade via FK.
    await db.update(eventHosts).set({ worldId: null }).where(eq(eventHosts.worldId, data.id));
    await db.delete(worlds).where(eq(worlds.id, data.id));
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Admin DELETE world:', error);
    return NextResponse.json({ error: 'Failed to delete world' }, { status: 500 });
  }
}

/* Sync world members (replace all members for a world).
 *
 * PRESERVES OWNERSHIP. This function deletes and re-inserts every member, and
 * the admin UI only ever sends builders and collaborators — so before this
 * guard, saving a world in the admin dashboard silently demoted its owner to
 * world_builder. That was invisible until creator payouts shipped, at which
 * point it started removing the world's PAYEE: funding goals could no longer
 * be saved, with a confusing "no owner to pay" error and no clue that editing
 * the world had caused it. It is also why most worlds have no owner at all.
 *
 * The owner keeps their row and their role regardless of which lists they
 * appear in. Ownership changes deliberately, via the members page or
 * scripts/set-world-owner.mjs — never as a side effect of an unrelated edit. */
async function syncWorldMembers(worldId: string, worldBuilderIds: string[], collaboratorIds: string[]) {
  const owners = await db
    .select({ userId: worldMembers.userId })
    .from(worldMembers)
    .where(and(eq(worldMembers.worldId, worldId), eq(worldMembers.role, 'owner')));
  const ownerIds = new Set(owners.map((o) => o.userId));

  await db.delete(worldMembers).where(eq(worldMembers.worldId, worldId));

  // Owners first, restored with their role intact.
  for (const userId of ownerIds) {
    await db.insert(worldMembers).values({ worldId, userId, role: 'owner' });
  }

  for (const userId of worldBuilderIds) {
    if (ownerIds.has(userId)) continue; // already restored, and outranks builder
    await db.insert(worldMembers).values({ worldId, userId, role: 'world_builder' });
  }

  for (const userId of collaboratorIds) {
    if (ownerIds.has(userId) || worldBuilderIds.includes(userId)) continue;
    await db.insert(worldMembers).values({ worldId, userId, role: 'collaborator' });
  }
}
