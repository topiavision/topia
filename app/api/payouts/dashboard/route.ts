import { NextRequest, NextResponse } from 'next/server';
import { stripeClient } from '@/lib/stripe';
import { isConnectConfigured, getPayoutAccountByUserId } from '@/lib/payments/connect';
import { hasFeature, FEATURE_FUNDING } from '@/lib/featureAccess';
import { authenticate, NO_STORE } from '../auth';

/* POST /api/payouts/dashboard — { privyId, accessToken? }
 * Bearer-verified, self-scoped. Returns a one-time Stripe Express dashboard
 * link where the creator sees their balance, payout schedule and bank details.
 *
 * Like onboarding links these are single-use and short-lived — minted per
 * click, never stored. */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const auth = await authenticate(
      body.privyId,
      request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? body.accessToken,
    );
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status, headers: NO_STORE });
    }

    // Phased rollout — the pilot cohort only, until funding is generally available.
    if (!(await hasFeature(auth.userId, FEATURE_FUNDING))) {
      return NextResponse.json(
        { error: 'Funding isn\'t available on your account yet' },
        { status: 403, headers: NO_STORE },
      );
    }

    if (!isConnectConfigured()) {
      return NextResponse.json(
        { error: 'Payouts are not available on this deployment yet' },
        { status: 503, headers: NO_STORE },
      );
    }

    const account = await getPayoutAccountByUserId(auth.userId);
    if (!account) {
      return NextResponse.json({ error: 'No payout account yet' }, { status: 404, headers: NO_STORE });
    }
    // Stripe rejects login links for accounts that never completed onboarding.
    if (!account.detailsSubmitted) {
      return NextResponse.json(
        { error: 'Finish setting up your payout account first' },
        { status: 409, headers: NO_STORE },
      );
    }

    const link = await stripeClient().accounts.createLoginLink(account.stripeAccountId);
    return NextResponse.json({ url: link.url }, { headers: NO_STORE });
  } catch (error) {
    console.error('[payouts] dashboard link failed:', error);
    return NextResponse.json(
      { error: 'Could not open your Stripe dashboard — try again.' },
      { status: 502, headers: NO_STORE },
    );
  }
}
