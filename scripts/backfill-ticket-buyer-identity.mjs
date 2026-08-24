// Recover buyer name/email for ticket orders placed before the checkout screen
// collected them.
//
// Stripe Checkout always collects an email, and the card form captures the
// cardholder name — it lands in session.customer_details. The old webhook read
// only session.id and payment_intent, so that data was collected and dropped.
// Every order stores its Checkout Session id, so it's all still retrievable.
//
// Fills blanks ONLY: a value the buyer typed on Topia is never overwritten, and
// a user's profile name/email/phone is never clobbered.
//
//   node scripts/backfill-ticket-buyer-identity.mjs            # dry run (default)
//   node scripts/backfill-ticket-buyer-identity.mjs --apply    # write
//
// NOTE ON THE KEY: `vercel env pull` will NOT give you STRIPE_SECRET_KEY — it's
// flagged Sensitive in Vercel, which is write-only by design, and pulls back the
// literal string "[SENSITIVE]". Either use a key you already hold, or create a
// Stripe restricted key (rk_live_…) with Checkout Sessions = Read, which is the
// only permission this script needs. Revoke it when you're done.
//
// Safe to re-run: once the blanks are filled it's a no-op.
import { config } from 'dotenv';
import { Pool } from '@neondatabase/serverless';
import Stripe from 'stripe';

config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');

const pool = new Pool({ connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL });

const key = process.env.STRIPE_SECRET_KEY;
if (!key) {
  console.error('STRIPE_SECRET_KEY is not set. Run `vercel env pull .env.local` first.');
  process.exit(1);
}
const stripe = new Stripe(key);

// Stripe gives one "name" field; first token is the first name, the rest is the
// last name. Mirrors splitFullName() in lib/payments/buyerIdentity.ts.
function splitFullName(full) {
  const parts = (full ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: '', last: '' };
  if (parts.length === 1) return { first: parts[0], last: '' };
  return { first: parts[0], last: parts.slice(1).join(' ') };
}

try {
  const { rows: orders } = await pool.query(`
    SELECT o.id, o.status, o.stripe_checkout_session_id AS session_id,
           o.buyer_first_name, o.buyer_last_name, o.buyer_email,
           o.buyer_id, u.name AS user_name, u.email AS user_email, u.phone AS user_phone
    FROM ticket_orders o
    LEFT JOIN users u ON u.id = o.buyer_id
    WHERE o.stripe_checkout_session_id IS NOT NULL
      AND (o.buyer_first_name IS NULL OR o.buyer_last_name IS NULL OR o.buyer_email IS NULL)
    ORDER BY o.created_at DESC
  `);

  console.log(`${orders.length} order(s) with a Stripe session and at least one blank buyer field.`);
  if (!APPLY) console.log('DRY RUN — no writes. Re-run with --apply to write.\n');

  let orderWrites = 0;
  let userWrites = 0;

  for (const o of orders) {
    let session;
    try {
      session = await stripe.checkout.sessions.retrieve(o.session_id);
    } catch (err) {
      console.log(`  ${o.id} (${o.status}) — Stripe retrieve failed: ${err.message}`);
      continue;
    }

    const d = session.customer_details ?? {};
    const email = (d.email ?? '').trim();
    const phone = (d.phone ?? '').trim();
    const { first, last } = splitFullName(d.name);

    if (!email && !phone && !first) {
      console.log(`  ${o.id} (${o.status}) — Stripe has no customer_details either.`);
      continue;
    }

    const orderPatch = {};
    if (first && !o.buyer_first_name?.trim()) orderPatch.buyer_first_name = first;
    if (last && !o.buyer_last_name?.trim()) orderPatch.buyer_last_name = last;
    if (email && !o.buyer_email?.trim()) orderPatch.buyer_email = email;

    const userPatch = {};
    const fullName = [first, last].filter(Boolean).join(' ');
    if (fullName && !o.user_name?.trim()) userPatch.name = fullName;
    if (email && !o.user_email?.trim()) userPatch.email = email;
    if (phone && !o.user_phone?.trim()) userPatch.phone = phone;

    const summary = [
      Object.keys(orderPatch).length ? `order← ${JSON.stringify(orderPatch)}` : null,
      Object.keys(userPatch).length ? `user← ${JSON.stringify(userPatch)}` : null,
    ].filter(Boolean).join('  ');
    console.log(`  ${o.id} (${o.status}) — ${summary || 'already complete, nothing to do'}`);

    if (!APPLY) continue;

    if (Object.keys(orderPatch).length) {
      const cols = Object.keys(orderPatch);
      const sets = cols.map((c, i) => `"${c}" = $${i + 1}`).join(', ');
      await pool.query(
        `UPDATE ticket_orders SET ${sets}, updated_at = now() WHERE id = $${cols.length + 1}`,
        [...cols.map((c) => orderPatch[c]), o.id],
      );
      orderWrites++;
    }

    if (Object.keys(userPatch).length && o.buyer_id) {
      const cols = Object.keys(userPatch);
      const sets = cols.map((c, i) => `"${c}" = $${i + 1}`).join(', ');
      try {
        await pool.query(
          `UPDATE users SET ${sets}, updated_at = now() WHERE id = $${cols.length + 1}`,
          [...cols.map((c) => userPatch[c]), o.buyer_id],
        );
        userWrites++;
      } catch (err) {
        // users.email / users.phone are UNIQUE — another profile may own it.
        console.log(`    user patch skipped (unique conflict?): ${err.message}`);
      }
    }
  }

  console.log(
    APPLY
      ? `\nDone. ${orderWrites} order row(s) and ${userWrites} user row(s) updated.`
      : `\nDry run complete. Re-run with --apply to write.`,
  );
} catch (err) {
  console.error('FAILED:', err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
