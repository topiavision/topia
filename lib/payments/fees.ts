/* Fee math. Deliberately dependency-free — no db, no stripe, no env beyond
 * process.env — so it can be exercised directly by scripts/check-fee-math.ts.
 * Every dollar in the funding system flows through computeCheckoutTotal().
 *
 * Model: Topia's cut and Stripe's cut are both added ON TOP, so the creator
 * receives 100% of the amount the supporter chose.
 *
 * The total must be GROSSED UP rather than summed, because Stripe charges
 * 2.9% + $0.30 on the total — including on its own fee. Solving
 *   T = c + fee(c) + (stripeBps·T + stripeFixed)
 * for T gives the ceil() below.
 *
 * The obvious alternative — a flat `application_fee_amount` of 5% deducted
 * from the charge — nets Topia $1.80 on $100 and goes NEGATIVE below $14.29,
 * which is exactly where pay-what-you-want contributions live. Hence this shape.
 */

function intFromEnv(key: string, fallback: number, max: number): number {
  const n = Number(process.env[key] ?? fallback);
  return Number.isFinite(n) && n >= 0 && n <= max ? Math.floor(n) : fallback;
}

/** Topia's cut, in basis points. 500 = 5%. */
export function platformFeeBps(): number {
  return intFromEnv('TOPIA_PLATFORM_FEE_BPS', 500, 2000);
}

export interface CheckoutTotal {
  /** What the supporter chose, and exactly what the creator receives. */
  contributionCents: number;
  /** Topia's cut. */
  platformFeeCents: number;
  /** Estimated Stripe processing. Amex and international cards run higher —
   *  Topia's net dips but never goes negative — so this is safe to show as an
   *  estimate rather than a promise. */
  processingFeeCents: number;
  /** What the card is actually charged. */
  totalCents: number;
}

export function computeCheckoutTotal(contributionCents: number): CheckoutTotal {
  const c = Math.max(0, Math.floor(contributionCents));
  const platformFeeCents = Math.round((c * platformFeeBps()) / 10000);
  const stripeBps = intFromEnv('STRIPE_FEE_BPS', 290, 1000);
  const stripeFixed = intFromEnv('STRIPE_FEE_FIXED_CENTS', 30, 1000);

  // The slice that must survive Stripe's cut.
  const gross = c + platformFeeCents;
  const totalCents = Math.ceil((gross + stripeFixed) * 10000 / (10000 - stripeBps));

  return {
    contributionCents: c,
    platformFeeCents,
    processingFeeCents: totalCents - gross,
    totalCents,
  };
}

/** Stripe caps the statement descriptor suffix at 22 chars and rejects most
 *  punctuation. Falls back to the brand rather than emitting an empty string. */
export function sanitizeDescriptor(name: string): string {
  return name.replace(/[^A-Za-z0-9 ]/g, '').trim().slice(0, 22) || 'TOPIA';
}

/** Display helper: 12345 → "123.45". Money is integer cents everywhere. */
export function formatCents(cents: number): string {
  return (cents / 100).toFixed(2);
}
