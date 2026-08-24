// Apply the creator payouts table (Stripe Connect Express accounts).
// The drizzle journal is behind the live schema, so this mirrors
// scripts/apply-stripe-ticketing.mjs: idempotent, safe to re-run.
//
//   node scripts/apply-creator-payouts.mjs
import { config } from 'dotenv';
import { Pool } from '@neondatabase/serverless';

config({ path: '.env.local' });

const pool = new Pool({ connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL });

const statements = [
  `CREATE TABLE IF NOT EXISTS "creator_payout_accounts" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "user_id" uuid NOT NULL,
    "stripe_account_id" text NOT NULL,
    "country" text DEFAULT 'US' NOT NULL,
    "currency" text DEFAULT 'USD' NOT NULL,
    "charges_enabled" boolean DEFAULT false NOT NULL,
    "payouts_enabled" boolean DEFAULT false NOT NULL,
    "transfers_active" boolean DEFAULT false NOT NULL,
    "details_submitted" boolean DEFAULT false NOT NULL,
    "onboarding_status" text DEFAULT 'pending' NOT NULL,
    "requirements_due" jsonb,
    "disabled_reason" text,
    "last_synced_at" timestamp,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL
  )`,
  // One account per person; one row per Stripe account. Both uniques are
  // load-bearing: user_id gives create-or-get idempotency, stripe_account_id
  // is how the account.updated webhook finds the row.
  `CREATE UNIQUE INDEX IF NOT EXISTS "creator_payout_accounts_user_id_idx"
     ON "creator_payout_accounts" ("user_id")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "creator_payout_accounts_stripe_account_id_idx"
     ON "creator_payout_accounts" ("stripe_account_id")`,
];

const foreignKeys = [
  [
    'creator_payout_accounts_user_id_users_id_fk',
    `ALTER TABLE "creator_payout_accounts"
       ADD CONSTRAINT "creator_payout_accounts_user_id_users_id_fk"
       FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade`,
  ],
];

try {
  for (const sql of statements) {
    await pool.query(sql);
    console.log('  ✓', sql.split('\n')[0].slice(0, 78));
  }

  for (const [name, sql] of foreignKeys) {
    const { rows } = await pool.query(
      `SELECT 1 FROM pg_constraint WHERE conname = $1`, [name],
    );
    if (rows.length > 0) {
      console.log('  ·', name, '(already present)');
      continue;
    }
    await pool.query(sql);
    console.log('  ✓', name);
  }

  // Verify rather than assume.
  const { rows: cols } = await pool.query(`
    SELECT column_name, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_name = 'creator_payout_accounts'
    ORDER BY ordinal_position
  `);
  if (cols.length === 0) throw new Error('creator_payout_accounts not found after apply');
  console.log(`\ncreator_payout_accounts: ${cols.length} columns`);

  const { rows: count } = await pool.query(`SELECT COUNT(*)::int AS n FROM creator_payout_accounts`);
  console.log(`Existing connected accounts: ${count[0].n}`);
  console.log('\n✅ apply-creator-payouts complete');
} catch (err) {
  console.error('\n❌ apply-creator-payouts failed:', err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
