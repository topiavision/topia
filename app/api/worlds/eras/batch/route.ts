import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { worldEras, eraMilestones, worldMembers, worldProjects, users } from '@/lib/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { cleanDate, cleanPrecision } from '@/lib/eraDates';

/* POST /api/worlds/eras/batch — create a whole roadmap in one call:
 * (optionally) a project, the era, and all its milestones. This exists for
 * the Roadmap Builder — the old path was one POST per milestone with a full
 * refetch between each. Era + milestones are atomic; the project insert
 * stays outside the transaction (an orphan project is harmless and matches
 * the EraForm chain this replaces). */

const NO_STORE = { 'Cache-Control': 'private, no-store' };
const ERA_STATUSES = new Set(['active', 'complete', 'archived']);
const MILESTONE_STATUSES = new Set(['done', 'now', 'upcoming', 'paused']);
const MAX_MILESTONES = 30;

// Same builder bar as the sibling era/milestone routes (duplicated per-route
// by convention there; extracting a shared helper is future cleanup).
const BUILDER_ROLES = ['owner', 'world_builder'];

async function verifyWorldBuilder(privyId: string, worldId: string) {
  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.privyId, privyId)).limit(1);
  if (!user) return null;
  const [membership] = await db.select({ id: worldMembers.id }).from(worldMembers)
    .where(and(
      eq(worldMembers.worldId, worldId),
      eq(worldMembers.userId, user.id),
      inArray(worldMembers.role, BUILDER_ROLES),
    )).limit(1);
  return membership ? user.id : null;
}

// Same per-world slug dedupe as /api/worlds/projects — collisions used to 500.
async function uniqueProjectSlug(worldId: string, name: string) {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'project';
  const taken = await db
    .select({ slug: worldProjects.slug })
    .from(worldProjects)
    .where(eq(worldProjects.worldId, worldId));
  const used = new Set(taken.map((t) => t.slug));
  if (!used.has(base)) return base;
  for (let i = 2; ; i++) {
    if (!used.has(`${base}-${i}`)) return `${base}-${i}`;
  }
}

export async function POST(request: Request) {
  try {
    const { privyId, worldId, projectId, newProjectName, era, milestones } = await request.json();

    if (!privyId) return NextResponse.json({ error: 'Sign in to save a roadmap' }, { status: 401 });
    if (!worldId) return NextResponse.json({ error: 'worldId is required' }, { status: 400 });
    if (!era?.title || !String(era.title).trim()) return NextResponse.json({ error: 'A roadmap title is required' }, { status: 400 });
    if (projectId && newProjectName) return NextResponse.json({ error: 'Pass projectId or newProjectName, not both' }, { status: 400 });

    const eraStatus = String(era.status || 'active');
    if (!ERA_STATUSES.has(eraStatus)) return NextResponse.json({ error: 'status must be active, complete, or archived' }, { status: 400 });

    const ms: unknown[] = Array.isArray(milestones) ? milestones : [];
    if (ms.length > MAX_MILESTONES) return NextResponse.json({ error: `At most ${MAX_MILESTONES} milestones per roadmap` }, { status: 400 });
    const cleanMs = ms.map((raw) => {
      const m = raw as Record<string, unknown>;
      const title = typeof m.title === 'string' ? m.title.trim() : '';
      const status = String(m.status || 'upcoming');
      return {
        title,
        description: m.description ? String(m.description).trim() : null,
        details: m.details ? String(m.details).trim().slice(0, 4000) : null,
        startDate: cleanDate(m.startDate) ?? null,
        endDate: cleanDate(m.endDate) ?? null,
        startPrecision: cleanPrecision(m.startPrecision) ?? null,
        endPrecision: cleanPrecision(m.endPrecision) ?? null,
        status,
        sortOrder: Number.isFinite(Number(m.sortOrder)) ? Number(m.sortOrder) : 0,
      };
    });
    for (const m of cleanMs) {
      if (!m.title) return NextResponse.json({ error: 'Every milestone needs a title' }, { status: 400 });
      if (!MILESTONE_STATUSES.has(m.status)) return NextResponse.json({ error: 'Milestone status must be done, now, upcoming, or paused' }, { status: 400 });
    }
    if (cleanMs.filter((m) => m.status === 'now').length > 1) {
      return NextResponse.json({ error: 'A roadmap can only have one milestone in motion' }, { status: 400 });
    }

    const userId = await verifyWorldBuilder(privyId, worldId);
    if (!userId) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

    // Resolve the project: verify an existing one belongs to THIS world, or
    // create the new one (outside the transaction, like the EraForm chain).
    let resolvedProjectId: string | null = null;
    let projectName: string | null = null;
    let projectSlug: string | null = null;
    if (projectId) {
      const [project] = await db.select({ id: worldProjects.id, name: worldProjects.name, slug: worldProjects.slug })
        .from(worldProjects)
        .where(and(eq(worldProjects.id, projectId), eq(worldProjects.worldId, worldId))).limit(1);
      if (!project) return NextResponse.json({ error: 'That project is not part of this world' }, { status: 400 });
      resolvedProjectId = project.id;
      projectName = project.name;
      projectSlug = project.slug;
    } else if (newProjectName && String(newProjectName).trim()) {
      const name = String(newProjectName).trim().slice(0, 120);
      const slug = await uniqueProjectSlug(worldId, name);
      const [project] = await db.insert(worldProjects).values({ worldId, name, slug }).returning();
      resolvedProjectId = project.id;
      projectName = project.name;
      projectSlug = project.slug;
    }

    const created = await db.transaction(async (tx) => {
      const [eraRow] = await tx.insert(worldEras).values({
        worldId,
        projectId: resolvedProjectId,
        title: String(era.title).trim(),
        description: era.description ? String(era.description).trim() : null,
        startDate: cleanDate(era.startDate) ?? null,
        endDate: cleanDate(era.endDate) ?? null,
        startPrecision: cleanPrecision(era.startPrecision) ?? null,
        endPrecision: cleanPrecision(era.endPrecision) ?? null,
        status: eraStatus,
      }).returning();

      const milestoneRows = cleanMs.length
        ? await tx.insert(eraMilestones).values(cleanMs.map((m) => ({ eraId: eraRow.id, ...m }))).returning()
        : [];
      return { eraRow, milestoneRows };
    });

    return NextResponse.json({
      era: {
        ...created.eraRow,
        projectName,
        projectSlug,
        // goal/raised stay server-side — same stripping as the eras GET.
        milestones: created.milestoneRows.map(({ goalCents: _g, raisedCents: _r, ...m }) => m),
        posts: [],
      },
    }, { headers: NO_STORE });
  } catch (error) {
    console.error('[eras-batch] POST failed:', error);
    return NextResponse.json({ error: 'Failed to create roadmap' }, { status: 500 });
  }
}
