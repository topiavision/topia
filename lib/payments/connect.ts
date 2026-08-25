/* Stripe Connect — creator payout accounts, payee resolution, and the fee math.
 *
 * Charge model: DESTINATION CHARGES on the platform account
 * (`payment_intent_data.transfer_data`), never direct charges. Direct charges
 * would emit webhooks on the connected account with a different signing secret
 * and require account-scoped session retrieval, forking the existing checkout
 * and webhook code. Destination charges keep the session, the webhook endpoint,
 * the signing secret and the status poller exactly where they already are.
 *
 * We deliberately do NOT set `on_behalf_of` — it moves settlement and fee
 * jurisdiction to the connected account's country and breaks the USD-only
 * assumption. `statement_descriptor_suffix` gives the same "it's the creator's
 * name on my statement" benefit without that.
 *
 * REFUND WARNING: under destination charges, `refunds.create({ charge })`
 * refunds the payer from the PLATFORM's balance and does not claw back the
 * transfer unless `reverse_transfer: true` is passed. Every refund path must
 * set it, or Topia eats the full charged amount while the creator keeps theirs.
 */
import { and, eq } from 'drizzle-orm';
import type Stripe from 'stripe';
import { db, users, worlds, worldMembers, eventHosts, creatorPayoutAccounts } from '@/lib/db';
import { isStripeConfigured } from '@/lib/stripe';
import { computeCheckoutTotal, platformFeeBps, sanitizeDescriptor } from './fees';

// Re-exported so callers have one import for "everything Connect".
export { computeCheckoutTotal, platformFeeBps, sanitizeDescriptor };
export type { CheckoutTotal } from './fees';

/* ── Configuration ─────────────────────────────────────────────────── */

/** True only when the server can actually create connected accounts. Connect
 *  is gated separately from Stripe itself so ticketing can keep running on the
 *  platform account while payouts are still being rolled out. */
export function isConnectConfigured(): boolean {
  const hasKey = isStripeConfigured();
  const enabled = process.env.STRIPE_CONNECT_ENABLED === 'true';
  if (!hasKey || !enabled) {
    /* Say WHICH half is missing. "Payments are not available yet" is the right
     * thing to show a user and a useless thing to debug from — and the two
     * halves fail for different reasons: the key is usually present already
     * (ticketing needs it), while STRIPE_CONNECT_ENABLED is a separate opt-in
     * that is easy to miss when adding "the Stripe keys". */
    console.warn(
      '[payouts] Connect unavailable —' +
      (hasKey ? '' : ' STRIPE_SECRET_KEY missing;') +
      (enabled ? '' : ' STRIPE_CONNECT_ENABLED is not "true";') +
      ' set it in the environment and REDEPLOY (Vercel applies env changes to new deployments only).',
    );
  }
  return hasKey && enabled;
}

/* ── Account status ────────────────────────────────────────────────── */

export type PayoutAccount = typeof creatorPayoutAccounts.$inferSelect;

/* Accounts v2. Stripe blocks v1 account creation for new integrations, so this
 * uses `stripe.v2.core.accounts` throughout.
 *
 * The account is created with the RECIPIENT configuration, not merchant. The
 * API docs draw the line exactly where our charge model sits: merchant is for
 * "Direct charges or Destination Charges with on_behalf_of set"; recipient is
 * for "Destination Charges without on_behalf_of". We deliberately omit
 * on_behalf_of (it would move settlement and fee jurisdiction to the creator's
 * country and break the USD-only assumption), so recipient is correct.
 *
 * A consequence worth stating: a recipient-only account never needs charges
 * enabled. The PLATFORM takes the charge and transfers onward, so the single
 * capability that gates everything is stripe_transfers. */
export type V2Account = Stripe.V2.Core.Account;

/** Read the one capability that matters: can we transfer money to them. */
function transfersActive(a: V2Account): boolean {
  const status = a.configuration?.recipient?.capabilities?.stripe_balance?.stripe_transfers?.status;
  return status === 'active';
}

/** Requirements Stripe is still waiting on the USER (not us) to satisfy. */
function outstandingRequirements(a: V2Account): string[] {
  const entries = (a.requirements?.entries ?? []) as Array<{
    awaiting_action_from?: string;
    description?: string;
  }>;
  return entries
    .filter((e) => e.awaiting_action_from === 'user')
    .map((e) => e.description ?? '')
    .filter(Boolean);
}

/** The one predicate that decides whether a creator can be paid. Computed
 *  server-side and shipped as a single boolean; UI never re-derives it. */
export function canAcceptPayments(acct: PayoutAccount | null | undefined): boolean {
  if (!acct) return false;
  if (acct.onboardingStatus === 'disabled' || acct.onboardingStatus === 'deauthorized') return false;
  // Recipient-only: transfers is the whole gate. chargesEnabled is mirrored
  // from it for column compatibility and carries no independent meaning.
  return acct.transfersActive;
}

function deriveStatus(a: V2Account): PayoutAccount['onboardingStatus'] {
  if (transfersActive(a)) return 'active';
  // Something is outstanding. If the user still has work to do it is ordinary
  // onboarding; if not, Stripe is reviewing or has restricted the account.
  return outstandingRequirements(a).length > 0 ? 'pending' : 'restricted';
}

/** Write a Stripe v2 Account onto our cache row. Shared by the account webhook
 *  and the dashboard's live retrieve, so both paths produce identical rows.
 *  Returns null if we don't know the account. */
export async function syncConnectAccount(account: V2Account): Promise<PayoutAccount | null> {
  const [existing] = await db
    .select()
    .from(creatorPayoutAccounts)
    .where(eq(creatorPayoutAccounts.stripeAccountId, account.id))
    .limit(1);
  // Not ours — another platform's account, or a stale event. Ignore quietly.
  if (!existing) return null;

  const active = transfersActive(account);
  const due = outstandingRequirements(account);

  const [updated] = await db
    .update(creatorPayoutAccounts)
    .set({
      chargesEnabled: active,
      payoutsEnabled: active,
      transfersActive: active,
      detailsSubmitted: due.length === 0,
      onboardingStatus: deriveStatus(account),
      requirementsDue: due,
      disabledReason: null,
      lastSyncedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(creatorPayoutAccounts.id, existing.id))
    .returning();
  return updated ?? null;
}

/** Mark an account deauthorized — the creator disconnected Topia from Stripe.
 *  In-flight pending charges are left alone (the money either settles or
 *  expires); the gate closes immediately for anything new. */
export async function markDeauthorized(stripeAccountId: string): Promise<void> {
  await db
    .update(creatorPayoutAccounts)
    .set({
      onboardingStatus: 'deauthorized',
      chargesEnabled: false,
      payoutsEnabled: false,
      transfersActive: false,
      lastSyncedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(creatorPayoutAccounts.stripeAccountId, stripeAccountId));
}

/* The v2 create + onboarding-link shapes, kept here so the route stays thin
 * and the diagnostic script can mirror them exactly. */
export const V2_ACCOUNT_INCLUDE = [
  'configuration.merchant',
  'configuration.recipient',
  'identity',
  'requirements',
] as const;

export function v2AccountCreateParams(opts: {
  userId: string;
  displayName?: string | null;
  email?: string | null;
  originUrl: string;
}) {
  return {
    display_name: opts.displayName ?? undefined,
    contact_email: opts.email ?? undefined,
    dashboard: 'express' as const,
    identity: { country: 'US' },
    defaults: {
      currency: 'usd',
      responsibilities: {
        // Destination charges settle on the platform, so the platform pays
        // Stripe's fees and carries losses. This matches the fee model: the
        // 5% is retained from what the platform keeps after Stripe's cut.
        fees_collector: 'application' as const,
        losses_collector: 'application' as const,
        // NB: requirements_collector exists on the RESPONSE shape but is not
        // accepted on create — Stripe rejects it as an unknown field. Express
        // (dashboard: 'express') already implies Stripe-hosted collection.
      },
      profile: { business_url: opts.originUrl },
    },
    /* BOTH configurations are required, despite recipient being the one we
     * actually use. Stripe rejects a recipient-only account with:
     *   "stripe_balance.stripe_transfers capability cannot be requested
     *    without the configuration.merchant.capabilities.card_payments
     *    capability."
     * So card_payments is requested to satisfy that dependency; the charge
     * still happens on the PLATFORM (destination charge, no on_behalf_of) and
     * stripe_transfers remains the only capability we gate on. */
    configuration: {
      merchant: {
        capabilities: { card_payments: { requested: true } },
      },
      recipient: {
        capabilities: {
          stripe_balance: { stripe_transfers: { requested: true } },
        },
      },
    },
    include: [...V2_ACCOUNT_INCLUDE],
    metadata: { topiaUserId: opts.userId },
  };
}

export function v2AccountLinkParams(accountId: string, origin: string) {
  return {
    account: accountId,
    use_case: {
      type: 'account_onboarding' as const,
      account_onboarding: {
        // Onboarding must collect for both, or the capability dependency
        // above can never be satisfied.
        configurations: ['merchant' as const, 'recipient' as const],
        refresh_url: `${origin}/dashboard/payouts?connect=refresh`,
        return_url: `${origin}/dashboard/payouts?connect=return`,
        collection_options: { fields: 'currently_due' as const },
      },
    },
  };
}

export async function getPayoutAccountByUserId(userId: string): Promise<PayoutAccount | null> {
  const [row] = await db
    .select()
    .from(creatorPayoutAccounts)
    .where(eq(creatorPayoutAccounts.userId, userId))
    .limit(1);
  return row ?? null;
}

/* ── Payee resolution ──────────────────────────────────────────────────
 * WHO earned this money. Resolved fresh at earning time and then SNAPSHOTTED
 * onto the order/contribution — never re-derived later, because the inputs are
 * mutable (a host can change "Host as world" from a dropdown, and world
 * ownership can transfer). Without the snapshot, editing a dropdown would
 * retroactively change who owns money that already moved. */

export interface Payee {
  userId: string;
  account: PayoutAccount | null;
  canAccept: boolean;
}

async function payeeFor(userId: string | null | undefined): Promise<Payee | null> {
  if (!userId) return null;
  const account = await getPayoutAccountByUserId(userId);
  return { userId, account, canAccept: canAcceptPayments(account) };
}

/** A world pays its ADMIN — the world_members row with role 'owner'. Never a
 *  world_builder or collaborator: money follows ownership, not edit rights. */
export async function resolveWorldPayee(worldId: string): Promise<Payee | null> {
  const [owner] = await db
    .select({ userId: worldMembers.userId })
    .from(worldMembers)
    .where(and(eq(worldMembers.worldId, worldId), eq(worldMembers.role, 'owner')))
    .limit(1);
  if (owner) return payeeFor(owner.userId);

  // Legacy worlds predate world_members and carry only worlds.artistId.
  const [world] = await db
    .select({ artistId: worlds.artistId })
    .from(worlds)
    .where(eq(worlds.id, worldId))
    .limit(1);
  return payeeFor(world?.artistId);
}

/** An event hosted AS a world pays that world's admin; a personal event pays
 *  its creator-host. Personal is the common case — the composer offers
 *  "Just me (personal)" first and hides the world picker entirely from users
 *  with no world memberships. */
export async function resolveEventPayee(eventId: string): Promise<Payee | null> {
  const [creatorHost] = await db
    .select({ userId: eventHosts.userId, worldId: eventHosts.worldId })
    .from(eventHosts)
    .where(and(eq(eventHosts.eventId, eventId), eq(eventHosts.role, 'creator')))
    .limit(1);
  if (!creatorHost) return null;
  if (creatorHost.worldId) return resolveWorldPayee(creatorHost.worldId);
  return payeeFor(creatorHost.userId);
}

/** A life goal belongs to the person, so it pays the person. */
export async function resolveUserPayee(userId: string): Promise<Payee | null> {
  return payeeFor(userId);
}

/** Resolve a Topia user id from a Privy DID. */
export async function userIdFromPrivyId(privyId: string): Promise<string | null> {
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.privyId, privyId))
    .limit(1);
  return row?.id ?? null;
}
