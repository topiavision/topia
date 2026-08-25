// Is creator funding actually live in production?
//
// Reads nothing local — it probes the deployed site the way a visitor would,
// so it reports what the RUNNING deployment sees rather than what is saved in
// a dashboard somewhere. Vercel applies env changes to new deployments only,
// so "saved" and "live" are genuinely different states.
//
// Answers in plain language, because the underlying signals are unintuitive:
// a 400 "goalId is required" is the GOOD outcome (the config gate passed and
// validation took over), and a 503 is the bad one.
//
//   node scripts/check-production-payouts.mjs
//   node scripts/check-production-payouts.mjs https://my-preview.vercel.app
const origin = process.argv[2] || 'https://topia.vision';

async function probe(path, init) {
  try {
    const res = await fetch(origin + path, init);
    let body = {};
    try { body = await res.json(); } catch { /* non-JSON is fine */ }
    return { status: res.status, body };
  } catch (err) {
    return { status: 0, body: { error: String(err) } };
  }
}

console.log(`\nChecking ${origin}\n`);

/* Contribution checkout gates on config BEFORE it validates the body, so the
 * shape of the rejection tells us which gate we reached. */
const checkout = await probe('/api/checkout/contribution', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: '{}',
});

let ok = true;

if (checkout.status === 503) {
  ok = false;
  console.log('✗ Stripe Connect is NOT live.');
  console.log('  The deployment is missing STRIPE_SECRET_KEY or STRIPE_CONNECT_ENABLED,');
  console.log('  or the env vars were saved but nothing has redeployed since.');
} else if (checkout.status === 400) {
  console.log('✓ Stripe Connect IS live.');
  console.log(`  (Checkout rejected an empty request with "${checkout.body.error}" —`);
  console.log('   that is validation talking, which means the config gate passed.)');
} else {
  ok = false;
  console.log(`? Unexpected: HTTP ${checkout.status} ${JSON.stringify(checkout.body)}`);
}

/* Ticketing shares the Stripe key, so this separates "no key at all" from
 * "key present, Connect flag missing". */
const tickets = await probe('/api/checkout/stripe', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: '{}',
});
console.log(
  tickets.status === 503
    ? '\n✗ STRIPE_SECRET_KEY is missing too — ticketing is down as well.'
    : '\n✓ STRIPE_SECRET_KEY is present (ticketing reached its own auth check).',
);

/* The payouts page must never hard-fail, even unconfigured — it has an
 * explicit "not switched on" state. A 500 here is a real bug. */
const page = await probe('/dashboard/payouts');
console.log(
  page.status === 200
    ? '✓ /dashboard/payouts serves.'
    : `✗ /dashboard/payouts returned ${page.status} — it should always render.`,
);

console.log(
  ok
    ? '\nReady: a granted creator can now connect a payout account.\n'
    : '\nNot ready — fix the item above, then redeploy (saving env vars alone does nothing).\n',
);
if (!ok) process.exitCode = 1;
