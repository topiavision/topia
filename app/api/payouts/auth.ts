/* Shared auth for the payouts routes.
 *
 * Every payouts route is SELF-SCOPED: a user manages their own connected
 * account and nobody else's. That falls out of keying accounts by user_id and
 * removes a whole class of authorization bug — there is no "whose account am I
 * touching" question to get wrong.
 *
 * Because these routes create and expose Stripe onboarding links, a raw
 * client-supplied privyId is not enough (it is a body field, and spoofable).
 * They verify the Privy Bearer token the way the mint routes do. */
import { db, users } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { verifyPrivyIdentity } from '@/lib/auth/privyServer';

export const NO_STORE = { 'Cache-Control': 'private, no-store' };

export type PayoutsAuth =
  | { error: string; status: 401 | 403 | 404 }
  | { userId: string; name: string | null; email: string | null };

export async function authenticate(
  privyId: string | undefined,
  accessToken: string | null | undefined,
): Promise<PayoutsAuth> {
  if (!privyId) return { error: 'Not authenticated', status: 401 };

  const identity = await verifyPrivyIdentity(accessToken);
  if (!identity.configured) {
    // Loud, per the convention in CLAUDE.md: a missing PRIVY_APP_SECRET
    // silently disables identity enforcement, and these routes move money.
    console.error('[payouts] Privy is not configured — refusing to act on an unverified identity');
    return { error: 'Identity verification unavailable', status: 403 };
  }
  if (!identity.ok || identity.did !== privyId) {
    return { error: 'Not authenticated', status: 401 };
  }

  const [user] = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(eq(users.privyId, privyId))
    .limit(1);
  if (!user) return { error: 'User not found', status: 404 };

  return { userId: user.id, name: user.name, email: user.email };
}
