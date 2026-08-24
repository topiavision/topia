import { NextRequest, NextResponse } from 'next/server';
import { and, eq, inArray } from 'drizzle-orm';
import {
  db, users, worldMembers, worldEras, eraMilestones, worldProjects, lifeChapters, fundingGoals,
} from '@/lib/db';
import { verifyPrivyIdentity } from '@/lib/auth/privyServer';
import { resolveWorldPayee, isConnectConfigured } from '@/lib/payments/connect';
import { hasFeature, FEATURE_FUNDING } from '@/lib/featureAccess';

const NO_STORE = { 'Cache-Control': 'private, no-store' };
const BUILDER_ROLES = ['owner', 'world_builder'];
const TARGET_TYPES = new Set(['milestone', 'project', 'life_chapter']);

// $1 floor sits above Stripe's 50c card minimum with room to spare; the $1M
// ceiling catches a "500000 meaning $5,000" typo and keeps the longest
// rendered string inside a milestone card at 375px.
const MIN_GOAL_CENTS = 100;
const MAX_GOAL_CENTS = 100_000_000;

/** null clears the goal (open-ended support). Anything else must be a sane
 *  integer number of cents. */
function cleanGoalCents(raw: unknown): { cents: number | null } | { error: string } {
  if (raw === null || raw === undefined || raw === '') return { cents: null };
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) {
    return { error: 'Goal must be a whole number of cents' };
  }
  if (n === 0) return { cents: null };
  if (n < MIN_GOAL_CENTS) return { error: 'A goal has to be at least $1' };
  if (n > MAX_GOAL_CENTS) return { error: 'Goals top out at $1,000,000' };
  return { cents: n };
}

/* Who may set a goal on a given target, and who gets paid for it.
 *
 * Goals are money-adjacent, so these routes verify the Privy BEARER TOKEN
 * rather than trusting the client-supplied privyId the way the older era and
 * milestone routes still do. */
type TargetAuth =
  | { error: string; status: 400 | 401 | 403 | 404 }
  | { userId: string; ownerUserId: string; worldId: string | null; title: string };

async function authorizeTarget(
  privyId: string | undefined,
  accessToken: string | null | undefined,
  targetType: string,
  targetId: string,
): Promise<TargetAuth> {
  if (!privyId || !targetId) return { error: 'Missing privyId or target', status: 400 };
  if (!TARGET_TYPES.has(targetType)) return { error: 'Unknown target type', status: 400 };

  const identity = await verifyPrivyIdentity(accessToken);
  if (!identity.configured) {
    console.error('[funding] Privy is not configured — refusing to write a funding goal');
    return { error: 'Identity verification unavailable', status: 403 };
  }
  if (!identity.ok || identity.did !== privyId) return { error: 'Not authenticated', status: 401 };

  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.privyId, privyId)).limit(1);
  if (!user) return { error: 'User not found', status: 404 };

  // A life chapter belongs to a person: only they can set a goal on it, and
  // they are the payee.
  if (targetType === 'life_chapter') {
    const [chapter] = await db
      .select({ userId: lifeChapters.userId, title: lifeChapters.title, status: lifeChapters.status })
      .from(lifeChapters).where(eq(lifeChapters.id, targetId)).limit(1);
    if (!chapter) return { error: 'Chapter not found', status: 404 };
    if (chapter.userId !== user.id) return { error: 'Not authorized', status: 403 };
    // 'witness' is the schema's own opt-out — "not seeking funds, just witness
    // it". Refuse rather than silently contradicting the creator's choice.
    if (chapter.status === 'witness') {
      return { error: 'This chapter is marked witness — not seeking funds', status: 400 };
    }
    return { userId: user.id, ownerUserId: user.id, worldId: null, title: chapter.title };
  }

  // Milestone and project goals resolve to a world.
  let worldId: string | null = null;
  let title = '';
  if (targetType === 'milestone') {
    const [row] = await db
      .select({ worldId: worldEras.worldId, title: eraMilestones.title })
      .from(eraMilestones)
      .innerJoin(worldEras, eq(eraMilestones.eraId, worldEras.id))
      .where(eq(eraMilestones.id, targetId)).limit(1);
    if (!row) return { error: 'Milestone not found', status: 404 };
    worldId = row.worldId; title = row.title;
  } else {
    const [row] = await db
      .select({ worldId: worldProjects.worldId, name: worldProjects.name })
      .from(worldProjects).where(eq(worldProjects.id, targetId)).limit(1);
    if (!row) return { error: 'Project not found', status: 404 };
    worldId = row.worldId; title = row.name;
  }

  const [membership] = await db.select({ id: worldMembers.id }).from(worldMembers)
    .where(and(
      eq(worldMembers.worldId, worldId),
      eq(worldMembers.userId, user.id),
      inArray(worldMembers.role, BUILDER_ROLES),
    )).limit(1);
  if (!membership) return { error: 'Not authorized', status: 403 };

  // Builders may SET a goal; the world's ADMIN is who gets PAID.
  const payee = await resolveWorldPayee(worldId);
  if (!payee) return { error: 'This world has no owner to pay', status: 400 };

  return { userId: user.id, ownerUserId: payee.userId, worldId, title };
}

/* GET /api/funding/goals?worldId=… | ?ownerUserId=… | ?targetType=&targetId=
 * Public read — a goal and its progress are public information, the same way
 * a crowdfunding meter is. Nothing about any backer is exposed here. */
export async function GET(request: NextRequest) {
  try {
    const p = request.nextUrl.searchParams;
    const worldId = p.get('worldId');
    const ownerUserId = p.get('ownerUserId');
    const targetType = p.get('targetType');
    const targetId = p.get('targetId');

    const where = worldId ? eq(fundingGoals.worldId, worldId)
      : ownerUserId ? eq(fundingGoals.ownerUserId, ownerUserId)
      : targetType && targetId
        ? and(eq(fundingGoals.targetType, targetType), eq(fundingGoals.targetId, targetId))
        : null;
    if (!where) {
      return NextResponse.json(
        { error: 'Provide worldId, ownerUserId, or targetType + targetId' },
        { status: 400, headers: NO_STORE },
      );
    }

    const goals = await db
      .select({
        id: fundingGoals.id,
        targetType: fundingGoals.targetType,
        targetId: fundingGoals.targetId,
        worldId: fundingGoals.worldId,
        titleSnapshot: fundingGoals.titleSnapshot,
        goalCents: fundingGoals.goalCents,
        raisedCents: fundingGoals.raisedCents,
        patronCount: fundingGoals.patronCount,
        blurb: fundingGoals.blurb,
        status: fundingGoals.status,
      })
      .from(fundingGoals)
      .where(where);

    /* Whether these goals can actually take money right now, computed here so
     * the UI renders off one boolean and never re-derives the rule. Requires
     * Connect configured, the payee granted funding access, and their account
     * able to receive transfers. */
    let acceptingSupport = false;
    if (worldId && isConnectConfigured() && goals.length > 0) {
      const payee = await resolveWorldPayee(worldId);
      acceptingSupport = Boolean(
        payee?.canAccept && (await hasFeature(payee.userId, FEATURE_FUNDING)),
      );
    }

    // Editors refetch this straight after mutating, so it must never be CDN
    // cached — a created goal vanishing for 60s was a real bug in this feature
    // once already (PR #145).
    return NextResponse.json({ goals, acceptingSupport }, { headers: NO_STORE });
  } catch (error) {
    console.error('[funding] GET goals failed:', error);
    return NextResponse.json({ error: 'Could not load goals' }, { status: 500, headers: NO_STORE });
  }
}

/* POST /api/funding/goals — { privyId, targetType, targetId, goalCents?, blurb? }
 * Upsert: one goal per target, so setting a goal twice edits rather than
 * duplicates. Bearer-verified.
 *
 * A goal SAVES whether or not the payee has connected Stripe — blocking it
 * would dead-end a creator who is simply planning a roadmap. Whether the goal
 * can actually accept money is a separate, live question answered by the
 * payee's account status. */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { privyId, targetType, targetId, blurb } = body;
    const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? body.accessToken;

    const auth = await authorizeTarget(privyId, token, String(targetType ?? ''), String(targetId ?? ''));
    if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status, headers: NO_STORE });

    /* Gate on the PAYEE rather than the caller. A world builder may set goals,
     * but the money would reach the world's admin — so it is the admin who
     * must be in the pilot cohort. */
    if (!(await hasFeature(auth.ownerUserId, FEATURE_FUNDING))) {
      return NextResponse.json(
        { error: 'Funding isn\'t available for this account yet' },
        { status: 403, headers: NO_STORE },
      );
    }

    const goal = cleanGoalCents(body.goalCents);
    if ('error' in goal) return NextResponse.json({ error: goal.error }, { status: 400, headers: NO_STORE });

    const values = {
      targetType: String(targetType),
      targetId: String(targetId),
      ownerUserId: auth.ownerUserId,
      worldId: auth.worldId,
      titleSnapshot: auth.title,
      goalCents: goal.cents,
      blurb: blurb ? String(blurb).slice(0, 500) : null,
      updatedAt: new Date(),
    };

    // raisedCents and patronCount are deliberately absent: they are caches
    // owned by the crediting transaction and must never be client-writable.
    const [row] = await db
      .insert(fundingGoals)
      .values(values)
      .onConflictDoUpdate({
        target: [fundingGoals.targetType, fundingGoals.targetId],
        set: {
          ownerUserId: values.ownerUserId,
          worldId: values.worldId,
          titleSnapshot: values.titleSnapshot,
          goalCents: values.goalCents,
          blurb: values.blurb,
          updatedAt: values.updatedAt,
        },
      })
      .returning();

    return NextResponse.json({ goal: row }, { headers: NO_STORE });
  } catch (error) {
    console.error('[funding] POST goal failed:', error);
    return NextResponse.json({ error: 'Could not save the goal' }, { status: 500, headers: NO_STORE });
  }
}

/* DELETE /api/funding/goals?targetType=&targetId=&privyId=
 * Refuses once real money is attached — the goal is the thing contributions
 * point at, and removing it would orphan a financial record. Close it instead. */
export async function DELETE(request: NextRequest) {
  try {
    const p = request.nextUrl.searchParams;
    const targetType = p.get('targetType') ?? '';
    const targetId = p.get('targetId') ?? '';
    const privyId = p.get('privyId') ?? undefined;
    const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');

    const auth = await authorizeTarget(privyId, token, targetType, targetId);
    if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status, headers: NO_STORE });

    const [existing] = await db.select({ id: fundingGoals.id, raisedCents: fundingGoals.raisedCents })
      .from(fundingGoals)
      .where(and(eq(fundingGoals.targetType, targetType), eq(fundingGoals.targetId, targetId)))
      .limit(1);
    if (!existing) return NextResponse.json({ ok: true }, { headers: NO_STORE });

    if (existing.raisedCents > 0) {
      return NextResponse.json(
        { error: 'This has already received support and can\'t be removed. Close it instead.' },
        { status: 409, headers: NO_STORE },
      );
    }

    await db.delete(fundingGoals).where(eq(fundingGoals.id, existing.id));
    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  } catch (error) {
    console.error('[funding] DELETE goal failed:', error);
    return NextResponse.json({ error: 'Could not remove the goal' }, { status: 500, headers: NO_STORE });
  }
}
