import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  users, worldMembers, worlds, creators, events, tools, eventInvites,
  tvContent, eventGalleryPhotos, tvEpisodes, shortLinks, ticketOrders, tickets,
  userFeatureFlags,
} from '@/lib/db/schema';
import { eq, asc } from 'drizzle-orm';
import { isAdminRequest } from '@/lib/adminAuth';
import { feedbackRef } from '@/lib/feedbackId';

// GET – all users with their world memberships
export async function GET(request: Request) {
  if (!(await isAdminRequest(request))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const allUsers = await db
      .select()
      .from(users)
      .orderBy(asc(users.name));

    // Fetch world memberships for all users
    const memberships = await db
      .select({
        userId: worldMembers.userId,
        worldId: worldMembers.worldId,
        role: worldMembers.role,
        worldTitle: worlds.title,
        worldSlug: worlds.slug,
      })
      .from(worldMembers)
      .innerJoin(worlds, eq(worldMembers.worldId, worlds.id));

    // Feature grants (phased rollout), so the Users tab can show and toggle
    // who has funding ahead of general availability.
    const grants = await db
      .select({ userId: userFeatureFlags.userId, feature: userFeatureFlags.feature })
      .from(userFeatureFlags)
      .where(eq(userFeatureFlags.enabled, true));
    const featureMap: Record<string, string[]> = {};
    for (const g of grants) (featureMap[g.userId] ??= []).push(g.feature);

    // Group memberships by userId
    const membershipMap: Record<string, { worldId: string; role: string; worldTitle: string; worldSlug: string }[]> = {};
    for (const m of memberships) {
      if (!membershipMap[m.userId]) membershipMap[m.userId] = [];
      membershipMap[m.userId].push({
        worldId: m.worldId,
        role: m.role,
        worldTitle: m.worldTitle,
        worldSlug: m.worldSlug,
      });
    }

    const result = allUsers.map((u) => ({
      ...u,
      feedbackRef: feedbackRef(u.id), // opaque ref shown on feedback issues
      worldMemberships: membershipMap[u.id] || [],
      features: featureMap[u.id] || [],
    }));

    return NextResponse.json({ users: result });
  } catch (error) {
    console.error('Admin GET users:', error);
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
  }
}

// PUT – update user profile
export async function PUT(request: Request) {
  if (!(await isAdminRequest(request))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const data = await request.json();
    if (!data.id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    const result = await db.update(users).set({
      name: data.name || null,
      username: data.username || null,
      bio: data.bio || null,
      avatarUrl: data.avatarUrl || null,
      role: data.role || 'user',
      roleTags: data.roleTags || null,
      toolSlugs: data.toolSlugs || null,
      socialWebsite: data.socialWebsite || null,
      socialTwitter: data.socialTwitter || null,
      socialInstagram: data.socialInstagram || null,
      socialSoundcloud: data.socialSoundcloud || null,
      socialSpotify: data.socialSpotify || null,
      socialLinkedin: data.socialLinkedin || null,
      socialSubstack: data.socialSubstack || null,
      updatedAt: new Date(),
    }).where(eq(users.id, data.id)).returning();

    return NextResponse.json({ user: result[0] });
  } catch (error) {
    console.error('Admin PUT user:', error);
    return NextResponse.json({ error: (error as Error).message || 'Failed to update user' }, { status: 500 });
  }
}

// PATCH – publish/unpublish a profile (one-click toggle from the admin table)
export async function PATCH(request: Request) {
  if (!(await isAdminRequest(request))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const { id, published } = await request.json();
    if (!id || typeof published !== 'boolean') {
      return NextResponse.json({ error: 'id and published(boolean) are required' }, { status: 400 });
    }
    const [updated] = await db
      .update(users)
      .set({ published, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning({ id: users.id, published: users.published });
    if (!updated) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    return NextResponse.json({ ok: true, user: updated });
  } catch (error) {
    console.error('Admin PATCH user:', error);
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
  }
}

// DELETE – delete user
export async function DELETE(request: Request) {
  if (!(await isAdminRequest(request))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const data = await request.json();
    if (!data.id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
    const id = data.id as string;

    // Many tables reference users.id. Cascade FKs (memberships, follows,
    // notifications, RSVPs, hosts, comments, reactions, guestbook…) delete
    // automatically with the user. The references below are RESTRICT, so they'd
    // block the delete — clear them first, all in one transaction.
    await db.transaction(async (tx) => {
      // Nullable authorship/attribution links → detach (preserve the content).
      await tx.update(creators).set({ userId: null }).where(eq(creators.userId, id));
      await tx.update(worlds).set({ artistId: null }).where(eq(worlds.artistId, id));
      await tx.update(events).set({ createdBy: null }).where(eq(events.createdBy, id));
      await tx.update(tools).set({ submittedBy: null }).where(eq(tools.submittedBy, id));
      await tx.update(tvContent).set({ artistId: null }).where(eq(tvContent.artistId, id));
      await tx.update(tvEpisodes).set({ createdBy: null }).where(eq(tvEpisodes.createdBy, id));
      await tx.update(eventGalleryPhotos).set({ uploadedBy: null }).where(eq(eventGalleryPhotos.uploadedBy, id));
      await tx.update(shortLinks).set({ createdBy: null }).where(eq(shortLinks.createdBy, id));
      await tx.update(eventInvites).set({ invitedBy: null }).where(eq(eventInvites.invitedBy, id));
      await tx.update(eventInvites).set({ acceptedByUserId: null }).where(eq(eventInvites.acceptedByUserId, id));

      // NOT-NULL ticket links can't be detached — delete those rows. Deleting an
      // order cascades to its tickets; also clear tickets transferred to this user.
      await tx.delete(tickets).where(eq(tickets.ownerId, id));
      await tx.delete(ticketOrders).where(eq(ticketOrders.buyerId, id));

      await tx.delete(users).where(eq(users.id, id));
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Admin DELETE user:', error);
    return NextResponse.json({ error: 'Failed to delete user' }, { status: 500 });
  }
}
