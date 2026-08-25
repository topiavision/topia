import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { worlds, worldMembers, users } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

// PUT – world builder updates their own world
export async function PUT(request: Request) {
  try {
    const data = await request.json();
    if (!data.worldId || !data.privyId) {
      return NextResponse.json({ error: 'Missing worldId or privyId' }, { status: 400 });
    }

    // Resolve Privy ID to user ID
    const userResult = await db
      .select({ id: users.id, path: users.path })
      .from(users)
      .where(eq(users.privyId, data.privyId))
      .limit(1);

    if (userResult.length === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    // Authorization is membership-based (below) — `path` plays no part.

    const userId = userResult[0].id;

    // Verify user is an owner or world_builder for this world
    const membership = await db
      .select({ role: worldMembers.role })
      .from(worldMembers)
      .where(
        and(
          eq(worldMembers.worldId, data.worldId),
          eq(worldMembers.userId, userId),
        )
      )
      .limit(1);

    if (membership.length === 0 || (membership[0].role !== 'owner' && membership[0].role !== 'world_builder')) {
      return NextResponse.json({ error: 'Not authorized — you are not a world builder for this world' }, { status: 403 });
    }

    // Update allowed fields only (world builders can't change slug, published, displayOrder, etc.)
    const result = await db.update(worlds).set({
      shortDescription: data.shortDescription ?? undefined,
      description: data.description ?? undefined,
      imageUrl: data.imageUrl ?? undefined,
      headerImageUrl: data.headerImageUrl ?? undefined,
      tools: data.tools ?? undefined,
      socialLinks: data.socialLinks ?? undefined,
      updatedAt: new Date(),
    }).where(eq(worlds.id, data.worldId)).returning();

    return NextResponse.json({ world: result[0] });
  } catch (error) {
    console.error('World builder PUT:', error);
    return NextResponse.json({ error: (error as Error).message || 'Failed to update world' }, { status: 500 });
  }
}
