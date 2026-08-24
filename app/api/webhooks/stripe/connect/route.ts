import { NextRequest, NextResponse } from 'next/server';
import { stripeClient } from '@/lib/stripe';
import { syncConnectAccount, markDeauthorized, V2_ACCOUNT_INCLUDE } from '@/lib/payments/connect';

/* Stripe Connect webhooks — account lifecycle only.
 *
 * A SEPARATE endpoint from /api/webhooks/stripe with its own signing secret,
 * because Connect events are configured as a distinct endpoint in the Stripe
 * dashboard. Payment events keep arriving on the platform endpoint: we use
 * destination charges, so charges, refunds and disputes all stay there.
 *
 * These are Accounts v2 THIN events — the payload carries a related_object
 * reference rather than the account itself, so we verify the signature, then
 * fetch the current account and sync from that. Fetching also means a
 * re-delivered or out-of-order event can't write stale state: we always
 * persist what the account looks like right now.
 *
 * Configure in the Stripe dashboard:
 *   Developers → Webhooks → Add endpoint
 *   Events: v2.core.account.updated, and the capability_status_updated
 *           variants for the recipient configuration
 *   Then set STRIPE_CONNECT_WEBHOOK_SECRET.
 */
const CONNECT_WEBHOOK_SECRET = process.env.STRIPE_CONNECT_WEBHOOK_SECRET ?? '';

export async function POST(request: NextRequest) {
  const body = await request.text(); // raw body required for signature check
  const signature = request.headers.get('stripe-signature') ?? '';

  // No unsigned fallback here, unlike the legacy platform webhook. These
  // events flip the flag that decides whether a creator can be paid, so an
  // unverified body must never reach syncConnectAccount. 200 rather than 4xx
  // so Stripe doesn't retry-storm a misconfigured deployment.
  if (!CONNECT_WEBHOOK_SECRET) {
    console.error('[payouts-webhook] STRIPE_CONNECT_WEBHOOK_SECRET is not set — refusing unsigned event');
    return NextResponse.json({ received: true, skipped: 'unsigned' });
  }

  const stripe = stripeClient();

  let notification;
  try {
    notification = await stripe.parseEventNotificationAsync(body, signature, CONNECT_WEBHOOK_SECRET);
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  try {
    const type: string = notification.type ?? '';

    // Every account-shaped event is handled the same way: re-read the account
    // and persist the truth. Matching on the prefix rather than an exact list
    // keeps this working as Stripe adds capability_status_updated variants —
    // but that also means TypeScript can't narrow the notification union for
    // us, hence the explicit shape below.
    if (type.startsWith('v2.core.account')) {
      const { related_object: related } = notification as unknown as {
        related_object?: { id?: string };
      };
      const accountId = related?.id;
      if (!accountId) return NextResponse.json({ received: true });

      if (type === 'v2.core.account.closed') {
        await markDeauthorized(accountId);
        console.log(`[payouts-webhook] ${accountId} closed`);
        return NextResponse.json({ received: true });
      }

      const account = await stripe.v2.core.accounts.retrieve(accountId, {
        include: [...V2_ACCOUNT_INCLUDE],
      });
      const synced = await syncConnectAccount(account);
      // A null result means the account isn't one of ours — another
      // platform's, or a stale event. Not an error.
      if (synced) {
        console.log(`[payouts-webhook] ${accountId} → ${synced.onboardingStatus}`);
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('[payouts-webhook] handler failed:', error);
    // 500 so Stripe retries — the account flags matter and are safe to re-apply.
    return NextResponse.json({ error: 'Handler failed' }, { status: 500 });
  }
}
