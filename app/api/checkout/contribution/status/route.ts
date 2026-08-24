import { NextRequest, NextResponse } from 'next/server';
import { stripeClient, isStripeConfigured } from '@/lib/stripe';
import { contributionBySessionId, creditContribution, failContribution } from '@/lib/payments/funding';

const NO_STORE = { 'Cache-Control': 'private, no-store' };

/* GET /api/checkout/contribution/status?sessionId=cs_…
 *
 * The self-healing poll after the success redirect: the webhook is
 * authoritative, but a backer shouldn't stare at a stale meter if it lags.
 * creditContribution is idempotent, so both racing is harmless.
 *
 * The Stripe session id IS the capability token here — ~66 unguessable
 * characters, issued by Stripe, handed only to the backer via
 * {CHECKOUT_SESSION_ID}. That's what lets this work for guests with no
 * account. The response is deliberately thin: no email, no backer name, no
 * Stripe ids, and an unknown id returns the same generic 404 as a wrong one so
 * it can't be used to probe. */
export async function GET(request: NextRequest) {
  try {
    const sessionId = request.nextUrl.searchParams.get('sessionId') ?? '';
    if (!sessionId.startsWith('cs_')) {
      return NextResponse.json({ error: 'Not found' }, { status: 404, headers: NO_STORE });
    }

    let contribution = await contributionBySessionId(sessionId);
    if (!contribution) {
      return NextResponse.json({ error: 'Not found' }, { status: 404, headers: NO_STORE });
    }

    if (contribution.status === 'pending' && isStripeConfigured()) {
      try {
        const session = await stripeClient().checkout.sessions.retrieve(sessionId);
        if (session.payment_status === 'paid') {
          await creditContribution(contribution.id, {
            stripeCheckoutSessionId: session.id,
            stripePaymentIntentId: typeof session.payment_intent === 'string'
              ? session.payment_intent : session.payment_intent?.id,
            amountPaidCents: session.amount_total ?? undefined,
          });
        } else if (session.status === 'expired') {
          await failContribution(contribution.id, 'cancelled');
        }
        contribution = await contributionBySessionId(sessionId);
      } catch (err) {
        // A failed retrieve is not a failed request — report what we have and
        // let the webhook finish the job.
        console.error('[funding] status retrieve failed:', err);
      }
    }

    return NextResponse.json({
      ok: true,
      status: contribution?.status ?? 'pending',
      amountCents: contribution?.amountCents ?? 0,
      milestoneTitle: contribution?.goalTitleSnapshot ?? null,
      targetId: contribution?.targetId ?? null,
    }, { headers: NO_STORE });
  } catch (error) {
    console.error('[funding] status failed:', error);
    return NextResponse.json({ error: 'Could not check status' }, { status: 500, headers: NO_STORE });
  }
}
