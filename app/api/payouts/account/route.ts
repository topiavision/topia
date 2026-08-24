import { NextRequest, NextResponse } from 'next/server';
import { stripeClient } from '@/lib/stripe';
import {
  isConnectConfigured,
  syncConnectAccount,
  getPayoutAccountByUserId,
  canAcceptPayments,
  platformFeeBps,
  V2_ACCOUNT_INCLUDE,
} from '@/lib/payments/connect';
import { hasFeature, FEATURE_FUNDING } from '@/lib/featureAccess';
import { authenticate, NO_STORE } from '../auth';

// How stale a cached account row may be before we ask Stripe directly. The
// account.updated webhook keeps this fresh in normal operation; the live
// retrieve is the belt to its braces, and matters most right after the creator
// returns from onboarding.
const STALE_MS = 60_000;

/* GET /api/payouts/account?privyId=…
 * Bearer-verified. Returns the caller's own payout status.
 *
 * Deliberately returns 200 with { configured: false } rather than 503 when
 * Connect is switched off, so the dashboard can render a "coming soon" state
 * instead of an error. Never returns stripeAccountId — the client has no use
 * for it and it is a needless identifier to leak. */
export async function GET(request: NextRequest) {
  try {
    const privyId = request.nextUrl.searchParams.get('privyId') ?? undefined;
    const auth = await authenticate(
      privyId,
      request.headers.get('authorization')?.replace(/^Bearer\s+/i, ''),
    );
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status, headers: NO_STORE });
    }

    /* Phased rollout: someone outside the pilot cohort sees exactly what they
     * would see before launch, rather than a 403 they can't act on. */
    if (!(await hasFeature(auth.userId, FEATURE_FUNDING))) {
      return NextResponse.json(
        { configured: false, account: null, canAccept: false, platformFeeBps: platformFeeBps() },
        { headers: NO_STORE },
      );
    }

    if (!isConnectConfigured()) {
      return NextResponse.json(
        { configured: false, account: null, canAccept: false, platformFeeBps: platformFeeBps() },
        { headers: NO_STORE },
      );
    }

    let account = await getPayoutAccountByUserId(auth.userId);

    const stale =
      account &&
      (!account.lastSyncedAt || Date.now() - new Date(account.lastSyncedAt).getTime() > STALE_MS);
    if (account && (stale || request.nextUrl.searchParams.get('sync') === '1')) {
      try {
        const fresh = await stripeClient().v2.core.accounts.retrieve(account.stripeAccountId, {
          include: [...V2_ACCOUNT_INCLUDE],
        });
        account = (await syncConnectAccount(fresh)) ?? account;
      } catch (err) {
        // A failed refresh is not a failed request — serve the cache and say so.
        console.error('[payouts] account retrieve failed:', err);
      }
    }

    return NextResponse.json(
      {
        configured: true,
        canAccept: canAcceptPayments(account),
        platformFeeBps: platformFeeBps(),
        account: account
          ? {
              onboardingStatus: account.onboardingStatus,
              chargesEnabled: account.chargesEnabled,
              payoutsEnabled: account.payoutsEnabled,
              transfersActive: account.transfersActive,
              detailsSubmitted: account.detailsSubmitted,
              requirementsDue: account.requirementsDue ?? [],
              disabledReason: account.disabledReason,
              country: account.country,
              currency: account.currency,
            }
          : null,
      },
      { headers: NO_STORE },
    );
  } catch (error) {
    console.error('[payouts] GET account failed:', error);
    return NextResponse.json({ error: 'Could not load payout status' }, { status: 500, headers: NO_STORE });
  }
}
