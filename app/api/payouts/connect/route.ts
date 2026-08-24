import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, creatorPayoutAccounts } from '@/lib/db';
import { stripeClient } from '@/lib/stripe';
import {
  isConnectConfigured, getPayoutAccountByUserId,
  v2AccountCreateParams, v2AccountLinkParams,
} from '@/lib/payments/connect';
import { authenticate, NO_STORE } from '../auth';

/* POST /api/payouts/connect — { privyId, accessToken? }
 * Bearer-verified, self-scoped. Creates (or reuses) the caller's Stripe
 * Express account and returns a fresh onboarding link.
 *
 * The account row is written BEFORE returning, so a creator who abandons
 * onboarding halfway resumes the same Stripe account instead of stacking up
 * orphans. Account links are single-use and expire in minutes, so one is
 * minted per click and never persisted, logged or shortlinked. */
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

    if (!isConnectConfigured()) {
      return NextResponse.json(
        { error: 'Payouts are not available on this deployment yet' },
        { status: 503, headers: NO_STORE },
      );
    }

    const origin = request.nextUrl.origin;
    const stripe = stripeClient();

    let account = await getPayoutAccountByUserId(auth.userId);

    /* Stripe refuses a recipient configuration without a contact email:
     *   "If configuration.recipient is supplied, the Account must have a
     *    contact email."
     * Topia users can authenticate by phone or wallet alone, so users.email is
     * genuinely nullable here. Fail with something actionable rather than
     * letting Stripe's message reach the creator. */
    if (!account && !auth.email) {
      return NextResponse.json(
        { error: 'Add an email address to your profile before setting up payouts — Stripe requires one to pay you.' },
        { status: 400, headers: NO_STORE },
      );
    }

    if (!account) {
      const created = await stripe.v2.core.accounts.create(
        v2AccountCreateParams({
          userId: auth.userId,
          displayName: auth.name,
          email: auth.email,
          originUrl: origin,
        }),
      );

      try {
        const [row] = await db
          .insert(creatorPayoutAccounts)
          .values({ userId: auth.userId, stripeAccountId: created.id })
          .returning();
        account = row;
      } catch {
        // Unique violation: a concurrent click already created the row.
        // Resolve-or-create, catch, re-select — the pattern from CLAUDE.md.
        account = await getPayoutAccountByUserId(auth.userId);
        if (!account) throw new Error('Could not persist the connected account');
      }
    }

    const link = await stripe.v2.core.accountLinks.create(
      v2AccountLinkParams(account.stripeAccountId, origin),
    );

    return NextResponse.json(
      { url: link.url, onboardingStatus: account.onboardingStatus },
      { headers: NO_STORE },
    );
  } catch (error) {
    console.error('[payouts] connect failed:', error);
    return NextResponse.json(
      { error: 'Could not start payout setup — try again.' },
      { status: 502, headers: NO_STORE },
    );
  }
}

/* DELETE /api/payouts/connect — forget the local row.
 * Does NOT delete the Stripe account: the creator's money, history and tax
 * records live there, and Topia has no business destroying them. Disconnecting
 * for real happens in the Stripe dashboard and arrives as
 * account.application.deauthorized. */
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const auth = await authenticate(
      body.privyId,
      request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? body.accessToken,
    );
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status, headers: NO_STORE });
    }
    await db.delete(creatorPayoutAccounts).where(eq(creatorPayoutAccounts.userId, auth.userId));
    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  } catch (error) {
    console.error('[payouts] disconnect failed:', error);
    return NextResponse.json({ error: 'Could not disconnect' }, { status: 500, headers: NO_STORE });
  }
}
