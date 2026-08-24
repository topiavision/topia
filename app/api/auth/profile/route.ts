import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { users, worldMembers, worlds } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { featuresForUser } from '@/lib/featureAccess';

export async function GET(request: NextRequest) {
  try {
    const username = request.nextUrl.searchParams.get('username');
    const privyId = request.nextUrl.searchParams.get('privyId');

    // ── Username availability lookup ─────────────────────────────
    if (username) {
      const u = username.trim().toLowerCase();
      if (!/^[a-z0-9_]{3,30}$/.test(u)) {
        return NextResponse.json({ available: false, reason: 'invalid' });
      }
      const exists = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.username, u))
        .limit(1);
      const ownerPrivyId = request.nextUrl.searchParams.get('forPrivyId');
      // Allow user to "claim" their own current username
      if (exists.length > 0 && ownerPrivyId) {
        const owner = await db
          .select({ privyId: users.privyId })
          .from(users)
          .where(eq(users.username, u))
          .limit(1);
        if (owner[0]?.privyId === ownerPrivyId) {
          return NextResponse.json({ available: true });
        }
      }
      return NextResponse.json({ available: exists.length === 0 });
    }

    // ── Profile fetch ────────────────────────────────────────────
    if (!privyId) {
      return NextResponse.json({ error: 'Missing privyId or username' }, { status: 400 });
    }

    const result = await db
      .select()
      .from(users)
      .where(eq(users.privyId, privyId))
      .limit(1);

    if (result.length === 0) {
      return NextResponse.json({ user: null, worldMemberships: [] });
    }

    const user = result[0];

    const memberships = await db
      .select({
        worldId: worldMembers.worldId,
        worldTitle: worlds.title,
        worldSlug: worlds.slug,
        worldCategory: worlds.category,
        worldImageUrl: worlds.imageUrl,
        worldPublished: worlds.published,
        role: worldMembers.role,
      })
      .from(worldMembers)
      .innerJoin(worlds, eq(worldMembers.worldId, worlds.id))
      .where(eq(worldMembers.userId, user.id));

    // Phased-rollout grants, so client surfaces can hide what this person
    // can't use yet. Rendering only — every route re-checks server-side.
    const features = await featuresForUser(user.id);

    return NextResponse.json({ user, worldMemberships: memberships, features });
  } catch (error) {
    console.error('Profile fetch error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
