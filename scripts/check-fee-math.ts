/* Fee-math assertions. This repo has no test suite, and mostly doesn't need
 * one — but computeCheckoutTotal is pure integer arithmetic containing a
 * division, and every dollar in the funding system flows through it. A
 * rounding regression here would surface as pennies of drift across thousands
 * of contributions rather than as an obvious break.
 *
 *   npx tsx scripts/check-fee-math.ts
 */
import { computeCheckoutTotal, formatCents } from '../lib/payments/fees';

// Pin the rates so the assertions mean something regardless of local env.
process.env.TOPIA_PLATFORM_FEE_BPS = '500';
process.env.STRIPE_FEE_BPS = '290';
process.env.STRIPE_FEE_FIXED_CENTS = '30';

let failures = 0;

function check(label: string, actual: unknown, expected: unknown) {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`  ${ok ? '✓' : '✗'} ${label}${ok ? '' : `  — got ${actual}, expected ${expected}`}`);
}

console.log('\nKnown amounts (the table in the plan):');
for (const [contribution, total, platform, processing] of [
  [10000, 10845, 500, 345],   // $100 → $108.45, Topia $5.00
  [2500, 2735, 125, 110],     // $25  → $27.35
  [2000, 2194, 100, 94],      // $20 ticket → $21.94
  [500, 572, 25, 47],         // $5   → $5.72
] as const) {
  const r = computeCheckoutTotal(contribution);
  const tag = `$${formatCents(contribution)}`;
  check(`${tag} total = $${formatCents(total)}`, r.totalCents, total);
  check(`${tag} platform fee = $${formatCents(platform)}`, r.platformFeeCents, platform);
  check(`${tag} processing = $${formatCents(processing)}`, r.processingFeeCents, processing);
}

console.log('\nInvariants across the full supported range ($1 – $5,000):');

let reconcileFails = 0;
let netNegative: number | null = null;
let creatorShort: number | null = null;

for (let c = 100; c <= 500_000; c++) {
  const { platformFeeCents, processingFeeCents, totalCents, contributionCents } = computeCheckoutTotal(c);

  // The three components must exactly reconstruct the charge — no lost cents.
  if (totalCents - processingFeeCents - contributionCents !== platformFeeCents) reconcileFails++;

  // Topia must never lose money. This is the whole reason for the gross-up:
  // a flat deducted 5% goes negative below $14.29.
  if (platformFeeCents <= 0 && c > 0) netNegative ??= c;

  // The creator must always receive exactly what the supporter chose.
  if (contributionCents !== c) creatorShort ??= c;
}

check('total − processing − contribution === platform fee, always', reconcileFails, 0);
check('platform fee never zero or negative', netNegative, null);
check('creator always receives the full contribution', creatorShort, null);

console.log('\nEdge cases:');
check('zero contribution stays zero-fee', computeCheckoutTotal(0).platformFeeCents, 0);
check('fractional cents floored, not lost', computeCheckoutTotal(101).contributionCents, 101);
check('negative input clamps to zero', computeCheckoutTotal(-500).contributionCents, 0);

if (failures > 0) {
  console.error(`\n❌ ${failures} fee-math assertion(s) failed.\n`);
  process.exit(1);
}
console.log('\n✅ Fee math holds.\n');
