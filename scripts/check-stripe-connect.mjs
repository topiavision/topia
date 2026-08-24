// Diagnose Stripe Connect setup: is it enabled, what's missing, and can we
// actually create an Express account?
//
// Reads STRIPE_SECRET_KEY from .env.local. REFUSES to run against a live key —
// this creates a throwaway connected account to prove onboarding works, and
// that must never happen on live.
//
//   node scripts/check-stripe-connect.mjs
import { config } from 'dotenv';
import Stripe from 'stripe';

config({ path: '.env.local', quiet: true });

const key = process.env.STRIPE_SECRET_KEY;

if (!key) {
  console.log('\n✗ STRIPE_SECRET_KEY is not set in .env.local.');
  console.log('  Dashboard → toggle "Test mode" ON → Developers → API keys → secret key.');
  console.log('  Paste it into .env.local as STRIPE_SECRET_KEY=sk_test_…\n');
  process.exit(1);
}

if (!key.startsWith('sk_test_')) {
  console.log('\n✗ That is not a test key. This script creates a throwaway connected');
  console.log('  account and must never touch live. Use the sk_test_… key.\n');
  process.exit(1);
}

const stripe = new Stripe(key);
let blocked = false;

console.log('\nStripe Connect diagnostic (test mode)\n');

/* 1. The platform account itself. */
try {
  const acct = await stripe.accounts.retrieve();
  console.log('Platform account');
  console.log('  id            ', acct.id);
  console.log('  country       ', acct.country);
  console.log('  charges        ', acct.charges_enabled ? 'enabled' : 'DISABLED');
  console.log('  business name ', acct.business_profile?.name || '(not set)');
  if (!acct.business_profile?.name) {
    console.log('  ⚠ Express onboarding shows your business name to creators.');
    console.log('    Set it under Settings → Business → Public details.');
  }
} catch (err) {
  console.log('✗ Could not read the platform account:', err.message);
  process.exit(1);
}

/* 2. Is Connect switched on at all? Listing accounts is the cheapest probe —
 *    it fails with a specific message when Connect is off. */
console.log('\nConnect status');
try {
  const list = await stripe.v2.core.accounts.list({ limit: 1 });
  console.log('  ✓ Connect is ENABLED — connected accounts are readable');
  console.log(`  existing connected accounts: ${list.data.length === 0 ? 'none yet' : list.data.length + '+'}`);
} catch (err) {
  blocked = true;
  console.log('  ✗ Connect is NOT usable yet.');
  console.log('    Stripe says:', err.message);
}

/* 3. The real test: create a v2 recipient account and an onboarding link —
 *    exactly what /api/payouts/connect does. */
if (!blocked) {
  console.log('\nAccounts v2 — recipient account + onboarding link');
  let created = null;
  try {
    created = await stripe.v2.core.accounts.create({
      display_name: 'Topia diagnostic',
      contact_email: 'diagnostic@topia.vision',
      dashboard: 'express',
      identity: { country: 'US' },
      defaults: {
        currency: 'usd',
        responsibilities: {
          fees_collector: 'application',
          losses_collector: 'application',
        },
      },
      configuration: {
        merchant: { capabilities: { card_payments: { requested: true } } },
        recipient: {
          capabilities: { stripe_balance: { stripe_transfers: { requested: true } } },
        },
      },
      include: ['configuration.merchant', 'configuration.recipient', 'identity', 'requirements'],
      metadata: { topiaDiagnostic: 'true' },
    });
    console.log('  ✓ Created recipient account', created.id);
    const cap = created.configuration?.recipient?.capabilities?.stripe_balance?.stripe_transfers?.status;
    console.log('  stripe_transfers capability:', cap ?? '(not reported)');

    const link = await stripe.v2.core.accountLinks.create({
      account: created.id,
      use_case: {
        type: 'account_onboarding',
        account_onboarding: {
          configurations: ['merchant', 'recipient'],
          refresh_url: 'http://localhost:3000/dashboard/payouts?connect=refresh',
          return_url: 'http://localhost:3000/dashboard/payouts?connect=return',
          collection_options: { fields: 'currently_due' },
        },
      },
    });
    console.log('  ✓ Onboarding link works');
    console.log('\n  Open this to walk the creator flow yourself:');
    console.log('  ' + link.url);
  } catch (err) {
    blocked = true;
    console.log('  ✗ Blocked here. Stripe says:');
    console.log('    ' + err.message);
  } finally {
    if (created) {
      try {
        await stripe.v2.core.accounts.close(created.id, {
          applied_configurations: ['merchant', 'recipient'],
        });
        console.log('\n  (diagnostic account closed — nothing left active)');
      } catch {
        console.log(`\n  ⚠ Could not close ${created.id}; remove it from the test dashboard.`);
      }
    }
  }
}

console.log(
  blocked
    ? '\n✗ Not ready. Fix the item above, then re-run.\n'
    : '\n✅ Connect + Accounts v2 are ready. The app can onboard creators.\n',
);
