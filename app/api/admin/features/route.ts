import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db, users, userFeatureFlags } from '@/lib/db';
import { isAdminRequest, verifyAdminToken } from '@/lib/adminAuth';
import { FEATURE_FUNDING } from '@/lib/featureAccess';

/* Grant or revoke a feature for one person — the phased-rollout control.
 *
 * Kept separate from the users PATCH, which is strictly about Discover
 * visibility. This gates a money feature, so it records who granted it. */

// Only features that are actually rollout-gated. An open-ended string here
// would let a typo create a grant that silently never matches anything.
const GRANTABLE = new Set([FEATURE_FUNDING]);

export async function POST(request: Request) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const { userId, feature, enabled } = await request.json();

    if (!userId || typeof feature !== 'string' || typeof enabled !== 'boolean') {
      return NextResponse.json(
        { error: 'userId, feature(string) and enabled(boolean) are required' },
        { status: 400 },
      );
    }
    if (!GRANTABLE.has(feature)) {
      return NextResponse.json(
        { error: `Unknown feature "${feature}". Grantable: ${[...GRANTABLE].join(', ')}` },
        { status: 400 },
      );
    }

    const [target] = await db.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1);
    if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    // Attribute the grant to the acting admin where we can resolve them.
    const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
    const admin = await verifyAdminToken(token);
    let grantedBy: string | null = null;
    if (admin.ok) {
      const [adminUser] = await db
        .select({ id: users.id }).from(users).where(eq(users.privyId, admin.did)).limit(1);
      grantedBy = adminUser?.id ?? null;
    }

    await db
      .insert(userFeatureFlags)
      .values({ userId, feature, enabled, grantedBy })
      .onConflictDoUpdate({
        target: [userFeatureFlags.userId, userFeatureFlags.feature],
        // Revoking keeps the row (enabled=false) rather than deleting it, so
        // the audit trail of who granted what survives.
        set: { enabled, grantedBy, updatedAt: new Date() },
      });

    console.log(`[admin-features] ${feature} ${enabled ? 'granted to' : 'revoked from'} ${userId}`);

    const [row] = await db
      .select({ enabled: userFeatureFlags.enabled })
      .from(userFeatureFlags)
      .where(and(eq(userFeatureFlags.userId, userId), eq(userFeatureFlags.feature, feature)))
      .limit(1);

    return NextResponse.json({ ok: true, userId, feature, enabled: Boolean(row?.enabled) });
  } catch (error) {
    console.error('[admin-features] POST failed:', error);
    return NextResponse.json({ error: 'Failed to update feature access' }, { status: 500 });
  }
}
