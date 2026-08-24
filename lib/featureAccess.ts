/* Per-user feature access, for phased rollout.
 *
 * Two layers, and the distinction matters:
 *
 *   - The NEXT_PUBLIC_* flag in lib/featureFlags.ts means GENERALLY AVAILABLE.
 *     When it is on, everyone has the feature and this module is a no-op.
 *   - A user_feature_flags row means "this person, ahead of general
 *     availability" — the pilot cohort.
 *
 * So a limited rollout runs with the env flag OFF and rows granted from the
 * admin dashboard; flipping the env flag later opens the gates without having
 * to touch the allowlist, and turning it back off returns to exactly the pilot
 * group rather than to nobody.
 *
 * This is server-side and authoritative. The client mirrors it for rendering
 * (see the profile payload), but every route re-checks — a hidden button is a
 * courtesy, not a gate.
 */
import { and, eq, inArray } from 'drizzle-orm';
import { db, userFeatureFlags } from '@/lib/db';
import { FUNDING_ENABLED } from '@/lib/featureFlags';

export const FEATURE_FUNDING = 'funding';

/** Features that are generally available right now, from build-time flags. */
function generallyAvailable(): Set<string> {
  const s = new Set<string>();
  if (FUNDING_ENABLED) s.add(FEATURE_FUNDING);
  return s;
}

/** Does this user have the feature — by general availability or by grant? */
export async function hasFeature(
  userId: string | null | undefined,
  feature: string,
): Promise<boolean> {
  if (generallyAvailable().has(feature)) return true;
  if (!userId) return false;

  const [row] = await db
    .select({ enabled: userFeatureFlags.enabled })
    .from(userFeatureFlags)
    .where(and(eq(userFeatureFlags.userId, userId), eq(userFeatureFlags.feature, feature)))
    .limit(1);
  return Boolean(row?.enabled);
}

/** Every feature this user can see — for the profile payload the client
 *  renders from. One query rather than one per feature. */
export async function featuresForUser(userId: string | null | undefined): Promise<string[]> {
  const ga = generallyAvailable();
  if (!userId) return [...ga];

  const rows = await db
    .select({ feature: userFeatureFlags.feature, enabled: userFeatureFlags.enabled })
    .from(userFeatureFlags)
    .where(eq(userFeatureFlags.userId, userId));

  for (const r of rows) if (r.enabled) ga.add(r.feature);
  return [...ga];
}

/** Which of these users have the feature. Used where the gate depends on
 *  someone other than the caller — funding checks the PAYEE, not the person
 *  clicking, because the payee is who would receive money. */
export async function usersWithFeature(
  userIds: string[],
  feature: string,
): Promise<Set<string>> {
  if (generallyAvailable().has(feature)) return new Set(userIds);
  if (userIds.length === 0) return new Set();

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
