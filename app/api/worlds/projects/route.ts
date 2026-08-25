import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { worldProjects, worldMembers, projectMembers, users } from '@/lib/db/schema';
import { eq, and, asc, inArray, ne } from 'drizzle-orm';
import { fetchOgImage } from '@/lib/ogImage';

// Fetch a project's credits with the credited person's public profile bits.
async function getCredits(projectId: string) {
  return db
    .select({
      userId: projectMembers.userId,
      role: projectMembers.role,
      name: users.name,
      username: users.username,
      avatarUrl: users.avatarUrl,
    })
    .from(projectMembers)
    .innerJoin(users, eq(users.id, projectMembers.userId))
    .where(eq(projectMembers.projectId, projectId))
    .orderBy(asc(projectMembers.createdAt));
}

// Replace a project's credits. Only world members can be credited — anything
// else in the payload is silently dropped rather than 400ing the whole save.
// That includes malformed ids: userId feeds a uuid column, and a non-UUID
// string makes Postgres 22P02 the whole request AFTER the project row was
// inserted, stranding an orphan project.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function replaceCredits(projectId: string, worldId: string, credits: unknown) {
  if (!Array.isArray(credits)) return;
  const wanted = credits
    .filter((c): c is { userId: string; role?: string } => Boolean(c && typeof c.userId === 'string' && UUID_RE.test(c.userId)))
    .slice(0, 30);
  const memberRows = wanted.length
    ? await db
        .select({ userId: worldMembers.userId })
        .from(worldMembers)
        .where(and(eq(worldMembers.worldId, worldId), inArray(worldMembers.userId, wanted.map((c) => c.userId))))
    : [];
  const allowed = new Set(memberRows.map((m) => m.userId));
  const seen = new Set<string>();
  const rows = wanted.filter((c) => {
    if (!allowed.has(c.userId) || seen.has(c.userId)) return false;
    seen.add(c.userId);
    return true;
  });
  await db.delete(projectMembers).where(eq(projectMembers.projectId, projectId));
  if (rows.length > 0) {
    await db.insert(projectMembers).values(
      rows.map((c) => ({ projectId, userId: c.userId, role: typeof c.role === 'string' && c.role.trim() ? c.role.trim().slice(0, 80) : null })),
    );
  }
}

// GET – fetch projects for a world
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const worldId = searchParams.get('worldId');

    if (!worldId) {
      return NextResponse.json({ error: 'Missing worldId' }, { status: 400 });
    }

    const slug = searchParams.get('slug');

    if (slug) {
      const result = await db
        .select()
        .from(worldProjects)
        .where(and(eq(worldProjects.worldId, worldId), eq(worldProjects.slug, slug)))
        .limit(1);

      if (result.length === 0) {
        return NextResponse.json({ error: 'Project not found' }, { status: 404 });
      }
      const credits = await getCredits(result[0].id);
      return NextResponse.json({ project: { ...result[0], credits } });
    }

    const projects = await db
      .select()
      .from(worldProjects)
      .where(eq(worldProjects.worldId, worldId))
      .orderBy(asc(worldProjects.sortOrder), asc(worldProjects.name));

    // Credits ride the list payload too — the dashboard editor reads them
    // straight off the project object instead of a fragile slug-keyed refetch.
    const ids = projects.map((p) => p.id);
    const creditRows = ids.length
      ? await db
          .select({
            projectId: projectMembers.projectId,
            userId: projectMembers.userId,
            role: projectMembers.role,
            name: users.name,
            username: users.username,
            avatarUrl: users.avatarUrl,
          })
          .from(projectMembers)
          .innerJoin(users, eq(users.id, projectMembers.userId))
          .where(inArray(projectMembers.projectId, ids))
          .orderBy(asc(projectMembers.createdAt))
      : [];
    const byProject = new Map<string, Omit<typeof creditRows[number], 'projectId'>[]>();
    for (const { projectId, ...credit } of creditRows) {
      if (!byProject.has(projectId)) byProject.set(projectId, []);
      byProject.get(projectId)!.push(credit);
    }

    return NextResponse.json({ projects: projects.map((p) => ({ ...p, credits: byProject.get(p.id) ?? [] })) });
  } catch (error) {
    console.error('Error fetching world projects:', error);
    return NextResponse.json({ error: 'Failed to fetch projects' }, { status: 500 });
  }
}

// Helper: verify the caller can build in this world. Owners ARE builders —
// the world creator is stored with role 'owner', and the old exact
// 'world_builder' match locked owners out of adding projects (the UI showed
// them the button, the API 403'd the save). Collaborators stay read-only,
// matching the dashboard's isBuilder gate.
const BUILDER_ROLES = ['owner', 'world_builder'];

async function verifyWorldBuilder(privyId: string, worldId: string) {
  const userResult = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.privyId, privyId))
    .limit(1);

  if (userResult.length === 0) return null;

  const membership = await db
    .select({ id: worldMembers.id })
    .from(worldMembers)
    .where(
      and(
        eq(worldMembers.worldId, worldId),
        eq(worldMembers.userId, userResult[0].id),
        inArray(worldMembers.role, BUILDER_ROLES)
      )
    )
    .limit(1);

  return membership.length > 0 ? userResult[0].id : null;
}

// Slugs are per-world and were generated with no dedup — two same-named
// projects collided and made slug-keyed lookups resolve the wrong row.
// Suffix -2, -3… until free (excluding the project being renamed).
async function uniqueProjectSlug(worldId: string, name: string, excludeProjectId?: string) {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'project';
  const taken = await db
    .select({ id: worldProjects.id, slug: worldProjects.slug })
    .from(worldProjects)
    .where(excludeProjectId
      ? and(eq(worldProjects.worldId, worldId), ne(worldProjects.id, excludeProjectId))
      : eq(worldProjects.worldId, worldId));
  const used = new Set(taken.map((t) => t.slug));
  if (!used.has(base)) return base;
  for (let i = 2; ; i++) {
    if (!used.has(`${base}-${i}`)) return `${base}-${i}`;
  }
}

// POST – create a project
export async function POST(request: Request) {
  try {
    const data = await request.json();
    const { worldId, privyId, name, description, content, imageUrl, videoUrl, url, links, tags, credits } = data;

    if (!worldId || !privyId || !name) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const userId = await verifyWorldBuilder(privyId, worldId);
    if (!userId) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    const slug = await uniqueProjectSlug(worldId, name);

    // No uploaded cover but the project has a site? Borrow the site's own
    // og:image so the card never renders as an empty placeholder. Best-effort
    // with a hard timeout — a slow or image-less site just means no cover.
    let resolvedImage = imageUrl || null;
    if (!resolvedImage && url) resolvedImage = await fetchOgImage(String(url));

    const result = await db.insert(worldProjects).values({
      worldId,
      name,
      slug,
      description: description || null,
      content: content || null,
      imageUrl: resolvedImage,
      videoUrl: videoUrl || null,
      url: url || null,
      links: links || null,
      tags: tags || null,
    }).returning();

    await replaceCredits(result[0].id, worldId, credits);
    const savedCredits = await getCredits(result[0].id);

    return NextResponse.json({ project: { ...result[0], credits: savedCredits } });
  } catch (error) {
    console.error('Error creating world project:', error);
    return NextResponse.json({ error: 'Failed to create project' }, { status: 500 });
  }
}

// PUT – update a project
export async function PUT(request: Request) {
  try {
    const data = await request.json();
    const { projectId, worldId, privyId, ...fields } = data;

    if (!projectId || !worldId || !privyId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const userId = await verifyWorldBuilder(privyId, worldId);
    if (!userId) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (fields.name !== undefined) {
      updateData.name = fields.name;
      updateData.slug = await uniqueProjectSlug(worldId, String(fields.name), projectId);
    }
    if (fields.description !== undefined) updateData.description = fields.description || null;
    if (fields.content !== undefined) updateData.content = fields.content || null;
    if (fields.imageUrl !== undefined) updateData.imageUrl = fields.imageUrl || null;
    if (fields.videoUrl !== undefined) updateData.videoUrl = fields.videoUrl || null;
    if (fields.url !== undefined) updateData.url = fields.url || null;
    if (fields.links !== undefined) updateData.links = fields.links || null;
    if (fields.tags !== undefined) updateData.tags = fields.tags || null;

    // Same og:image fallback as create: cover explicitly cleared (or absent)
    // while a site URL is present/being set.
    if ((updateData.imageUrl ?? undefined) === null && (fields.url || undefined)) {
      updateData.imageUrl = await fetchOgImage(String(fields.url));
    }

    // Scope by worldId too — the builder check above authorizes the SUBMITTED
    // world, so the project must actually belong to it.
    const result = await db.update(worldProjects)
      .set(updateData)
      .where(and(eq(worldProjects.id, projectId), eq(worldProjects.worldId, worldId)))
      .returning();

    if (result.length === 0) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    if (fields.credits !== undefined) await replaceCredits(projectId, worldId, fields.credits);
    const savedCredits = await getCredits(projectId);

    return NextResponse.json({ project: { ...result[0], credits: savedCredits } });
  } catch (error) {
    console.error('Error updating world project:', error);
    return NextResponse.json({ error: 'Failed to update project' }, { status: 500 });
  }
}

// DELETE – remove a project
export async function DELETE(request: Request) {
  try {
    const data = await request.json();
    const { projectId, worldId, privyId } = data;

    if (!projectId || !worldId || !privyId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const userId = await verifyWorldBuilder(privyId, worldId);
    if (!userId) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    await db.delete(worldProjects).where(and(eq(worldProjects.id, projectId), eq(worldProjects.worldId, worldId)));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting world project:', error);
    return NextResponse.json({ error: 'Failed to delete project' }, { status: 500 });
  }
}
