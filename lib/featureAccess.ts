/* Per-user feature access.
 *
 * Funding is OFF for every account until an admin switches it on for that
 * specific person, from the admin dashboard's Users tab. There is deliberately
 * no "enable for everyone" flag: a money feature should not be one env var
 * away from being live for the whole platform, and general availability — if
 * it ever comes — should be a considered change, not a checkbox.
 *
 * So access is exactly: a grant row exists and is enabled, AND the kill switch
 * is not thrown. The kill switch can only ever SUBTRACT — it disables funding
 * platform-wide in an emergency and can never hand access to anyone.
 *
 * This module is server-side and authoritative. The client mirrors it for
 * rendering (see the profile payload), but every route re-checks — a hidden
 * button is a courtesy, not a gate.
 */
import { and, eq, inArray } from 'drizzle-orm';
import { db, userFeatureFlags } from '@/lib/db';
import { FUNDING_KILL_SWITCH } from '@/lib/featureFlags';

export const FEATURE_FUNDING = 'funding';

/** Features currently switched off platform-wide, regardless of grants. */
function killed(feature: string): boolean {
  return feature === FEATURE_FUNDING && FUNDING_KILL_SWITCH;
}

/** Does this user have the feature? Grant-only — nothing else grants it. */
export async function hasFeature(
  userId: string | null | undefined,
  feature: string,
): Promise<boolean> {
  if (killed(feature)) return false;
  if (!userId) return false;

  const [row] = await db
    .select({ enabled: userFeatureFlags.enabled })
    .from(userFeatureFlags)
    .where(and(eq(userFeatureFlags.userId, userId), eq(userFeatureFlags.feature, feature)))
    .limit(1);
  return Boolean(row?.enabled);
}

/** Every feature this user has been granted — for the profile payload the
 *  client renders from. One query rather than one per feature. */
export async function featuresForUser(userId: string | null | undefined): Promise<string[]> {
  if (!userId) return [];

  const rows = await db
    .select({ feature: userFeatureFlags.feature, enabled: userFeatureFlags.enabled })
    .from(userFeatureFlags)
    .where(eq(userFeatureFlags.userId, userId));

  return rows
    .filter((r) => r.enabled && !killed(r.feature))
    .map((r) => r.feature);
}

/** Which of these users have the feature. Used where the gate depends on
 *  someone other than the caller — funding checks the PAYEE, not the person
 *  clicking, because the payee is who would receive money. */
export async function usersWithFeature(
  userIds: string[],
  feature: string,
): Promise<Set<string>> {
  if (killed(feature) || userIds.length === 0) return new Set();

  const rows = await db
    .select({ userId: userFeatureFlags.userId })
    .from(userFeatureFlags)
    .where(and(
      inArray(userFeatureFlags.userId, userIds),
      eq(userFeatureFlags.feature, feature),
      eq(userFeatureFlags.enabled, true),
    ));
  return new Set(rows.map((r) => r.userId));
}
