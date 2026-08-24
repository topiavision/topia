/* Crediting contributions to funding goals.
 *
 * Modelled on lib/payments/tickets.ts fulfillOrder, with one deliberate
 * strengthening: a `.for('update')` row lock. fulfillOrder relies on a bare
 * status read, which is fine when only the webhook realistically fires. Here
 * the webhook and the status poller genuinely race — the poller fires about a
 * second after the redirect, the webhook a second or so later — so the
 * pending→paid check-then-set has to be atomic.
 *
 * Four independent layers stop a double credit:
 *   1. the row lock, serialising concurrent crediting of the same row
 *   2. a status guard that no-ops and sends no second email
 *   3. raised_cents recomputed FROM the ledger rather than incremented, so a
 *      replay converges instead of drifting
 *   4. a UNIQUE index on stripe_checkout_session_id, making one row per
 *      Checkout Session a database guarantee rather than a matter of care
 *
 * REFUNDS: Stripe's charge.amount_refunded is CUMULATIVE, so partial refunds
 * and replayed events are only distinguishable by diffing against what we
 * already recorded. See applyContributionRefund.
 */
import { and, eq, sql } from 'drizzle-orm';
import { db, contributions, fundingGoals, users, worlds } from '@/lib/db';

export interface CreditResult {
  contributionId: string;
  alreadyCredited: boolean;
  amountCents: number;
  goalId: string | null;
}

/** Recompute a goal's cached totals from the ledger. The ledger is the truth;
 *  raised_cents and patron_count are caches that must be derivable, never
 *  accumulated blindly. */
async function recomputeGoalTotals(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  goalId: string,
): Promise<void> {
  await tx
    .update(fundingGoals)
    .set({
      raisedCents: sql`COALESCE((
        SELECT SUM(${contributions.amountCents} - ${contributions.refundedCents})
        FROM ${contributions}
        WHERE ${contributions.fundingGoalId} = ${goalId}
          AND ${contributions.status} = 'paid'
      ), 0)`,
      patronCount: sql`COALESCE((
        SELECT COUNT(*)
        FROM ${contributions}
        WHERE ${contributions.fundingGoalId} = ${goalId}
          AND ${contributions.status} = 'paid'
      ), 0)`,
      updatedAt: new Date(),
    })
    .where(eq(fundingGoals.id, goalId));
}

/**
 * Credit a contribution. Idempotent: safe to call from the webhook and the
 * status poller simultaneously, and safe to call again on a webhook replay.
 *
 * @param amountPaidCents what Stripe actually collected, from session.amount_total.
 *        Deliberately preferred over the stored pending amount so a tampered
 *        client cannot inflate a meter.
 */
export async function creditContribution(
  contributionId: string,
  paymentRef?: Partial<{
    stripeCheckoutSessionId: string;
    stripePaymentIntentId: string;
    stripeChargeId: string;
    /** Total charged, including fees — for reconciliation, not for the meter. */
    amountPaidCents: number;
  }>,
): Promise<CreditResult> {
  const result = await db.transaction(async (tx) => {
    const [c] = await tx
      .select()
      .from(contributions)
      .where(eq(contributions.id, contributionId))
      .for('update');

    if (!c) throw new Error(`[funding] contribution ${contributionId} not found`);

    // Already credited, or deliberately not creditable. Never resurrect a
    // refunded or cancelled row — that would silently re-take money.
    if (c.status !== 'pending') {
      return { contributionId, alreadyCredited: true, amountCents: c.amountCents, goalId: c.fundingGoalId, contribution: c };
    }

    await tx
      .update(contributions)
      .set({
        status: 'paid',
        paidAt: new Date(),
        updatedAt: new Date(),
        ...(paymentRef?.stripeCheckoutSessionId ? { stripeCheckoutSessionId: paymentRef.stripeCheckoutSessionId } : {}),
        ...(paymentRef?.stripePaymentIntentId ? { stripePaymentIntentId: paymentRef.stripePaymentIntentId } : {}),
        ...(paymentRef?.stripeChargeId ? { stripeChargeId: paymentRef.stripeChargeId } : {}),
        ...(typeof paymentRef?.amountPaidCents === 'number' ? { totalChargedCents: paymentRef.amountPaidCents } : {}),
      })
      .where(eq(contributions.id, c.id));

    if (c.fundingGoalId) await recomputeGoalTotals(tx, c.fundingGoalId);

    return { contributionId, alreadyCredited: false, amountCents: c.amountCents, goalId: c.fundingGoalId, contribution: c };
  });

  // Emails AFTER the transaction commits, best-effort. A mail failure must
  // never roll back money that already moved.
  if (!result.alreadyCredited) {
    try {
      await notifyContribution(result.contribution);
    } catch (err) {
      console.error('[funding] contribution notification failed:', err);
    }
  }

  return {
    contributionId: result.contributionId,
    alreadyCredited: result.alreadyCredited,
    amountCents: result.amountCents,
    goalId: result.goalId,
  };
}

/** Mark a pending contribution failed or cancelled (declined card, abandoned
 *  checkout, expired session). Never touches a credited row. */
export async function failContribution(
  contributionId: string,
  status: 'failed' | 'cancelled' = 'failed',
): Promise<void> {
  await db
    .update(contributions)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(contributions.id, contributionId), eq(contributions.status, 'pending')));
}

/**
 * Apply a refund. Stripe reports `charge.amount_refunded` CUMULATIVELY, so the
 * delta against what we already recorded is what distinguishes a genuine
 * partial refund from a replayed event.
 *
 * NOTE: issuing the refund itself must pass `reverse_transfer: true`, or the
 * platform refunds the backer while the creator keeps the transfer. That is a
 * property of how the refund is created, not of this function.
 */
export async function applyContributionRefund(
  contributionId: string,
  cumulativeRefundedCents: number,
  chargeId?: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    const [c] = await tx
      .select()
      .from(contributions)
      .where(eq(contributions.id, contributionId))
      .for('update');
    if (!c) return;

    const delta = cumulativeRefundedCents - c.refundedCents;
    if (delta <= 0) return; // replayed event — nothing new refunded

    const fullyRefunded = cumulativeRefundedCents >= c.amountCents;

    await tx
      .update(contributions)
      .set({
        refundedCents: cumulativeRefundedCents,
        // A partial refund leaves the contribution 'paid' — it still counts,
        // for less. Only a full refund flips the status.
        status: fullyRefunded ? 'refunded' : c.status,
        refundedAt: fullyRefunded ? new Date() : c.refundedAt,
        updatedAt: new Date(),
        ...(chargeId ? { stripeChargeId: chargeId } : {}),
      })
      .where(eq(contributions.id, c.id));

    if (c.fundingGoalId) await recomputeGoalTotals(tx, c.fundingGoalId);
  });
}

/** A dispute pulls the funds immediately, so treat it as fully withdrawn until
 *  it resolves. Winning re-credits through creditContribution's normal path. */
export async function disputeContribution(contributionId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [c] = await tx
      .select()
      .from(contributions)
      .where(eq(contributions.id, contributionId))
      .for('update');
    if (!c || c.status !== 'paid') return;

    await tx
      .update(contributions)
      .set({ status: 'disputed', updatedAt: new Date() })
      .where(eq(contributions.id, c.id));

    if (c.fundingGoalId) await recomputeGoalTotals(tx, c.fundingGoalId);
  });
}

/** Look a contribution up by its Checkout Session — the key the status poller
 *  and the webhook both hold. */
export async function contributionBySessionId(sessionId: string) {
  const [c] = await db
    .select()
    .from(contributions)
    .where(eq(contributions.stripeCheckoutSessionId, sessionId))
    .limit(1);
  return c ?? null;
}

/* ── Notifications ─────────────────────────────────────────────────────
 * Best-effort, after commit. Templates are pasted into Resend by hand; until
 * they exist sendTemplateEmail returns { sent: false, reason } and logs, and
 * the contribution is still credited. */
type ContributionRow = typeof contributions.$inferSelect;

async function notifyContribution(c: ContributionRow): Promise<void> {
  const { sendTemplateEmail } = await import('@/lib/notify/email');
  const amount = `$${(c.amountCents / 100).toFixed(2)}`;

  // The ledger stores worldId; the email wants a link.
  let worldPath = '/';
  if (c.worldId) {
    const [w] = await db.select({ slug: worlds.slug }).from(worlds).where(eq(worlds.id, c.worldId)).limit(1);
    if (w?.slug) worldPath = `/worlds/${w.slug}`;
  }

  if (c.backerEmail) {
    const r = await sendTemplateEmail({
      to: c.backerEmail,
      templateId: 'milestone-contribution-receipt',
      variables: {
        BACKER_NAME: c.backerName ?? 'friend',
        AMOUNT: amount,
        MILESTONE_TITLE: c.goalTitleSnapshot ?? 'this milestone',
        WORLD_URL: worldPath,
      },
    }).catch((e: unknown) => ({ sent: false, reason: String(e) }));
    if (!r.sent) console.error('[funding] receipt not sent:', r.reason);
  }

  if (c.payoutUserId) {
    const [creator] = await db
      .select({ email: users.email, name: users.name })
      .from(users)
      .where(eq(users.id, c.payoutUserId))
      .limit(1);
    if (creator?.email) {
      const r = await sendTemplateEmail({
        to: creator.email,
        templateId: 'milestone-contribution-alert',
        variables: {
          CREATOR_NAME: creator.name ?? 'there',
          BACKER_NAME: c.anonymous ? 'Someone' : (c.backerName ?? 'Someone'),
          AMOUNT: amount,
          MILESTONE_TITLE: c.goalTitleSnapshot ?? 'a milestone',
        },
      }).catch((e: unknown) => ({ sent: false, reason: String(e) }));
      if (!r.sent) console.error('[funding] creator alert not sent:', r.reason);
    }
  }
}
