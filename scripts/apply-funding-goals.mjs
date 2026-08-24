// Apply the funding tables: funding_goals (one row per fundable milestone,
// project or life chapter) and contributions (the money ledger).
//
// PURELY ADDITIVE — two new tables, their indexes and their foreign keys.
// No ALTER, no UPDATE, no DROP; nothing existing is touched. Idempotent, safe
// to re-run.
//
// Note: era_milestones.goal_cents / raised_cents are deliberately left alone.
// They were added for an earlier single-target design, are read by nothing,
// and funding_goals supersedes them. Dropping them is a later cleanup, not
// worth a schema change during a deadline week.
//
//   node scripts/apply-funding-goals.mjs
import { config } from 'dotenv';
import { Pool } from '@neondatabase/serverless';

config({ path: '.env.local', quiet: true });

const pool = new Pool({ connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL });

const statements = [
  `CREATE TABLE IF NOT EXISTS "funding_goals" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "target_type" text NOT NULL,
    "target_id" uuid NOT NULL,
    "owner_user_id" uuid NOT NULL,
    "world_id" uuid,
    "title_snapshot" text,
    "goal_cents" integer,
    "raised_cents" integer DEFAULT 0 NOT NULL,
    "patron_count" integer DEFAULT 0 NOT NULL,
    "blurb" text,
    "status" text DEFAULT 'open' NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "funding_goals_target_uniq"
     ON "funding_goals" ("target_type","target_id")`,
  `CREATE INDEX IF NOT EXISTS "funding_goals_owner_user_id_idx"
     ON "funding_goals" ("owner_user_id")`,
  `CREATE INDEX IF NOT EXISTS "funding_goals_world_id_idx"
     ON "funding_goals" ("world_id")`,

  `CREATE TABLE IF NOT EXISTS "contributions" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "funding_goal_id" uuid,
    "target_type" text,
    "target_id" uuid,
    "world_id" uuid,
    "goal_title_snapshot" text,
    "payout_user_id" uuid,
    "payout_account_id" text,
    "backer_id" uuid,
    "backer_name" text,
    "backer_email" text,
    "anonymous" boolean DEFAULT false NOT NULL,
    "message" text,
    "amount_cents" integer NOT NULL,
    "platform_fee_cents" integer DEFAULT 0 NOT NULL,
    "processing_fee_cents" integer DEFAULT 0 NOT NULL,
    "total_charged_cents" integer DEFAULT 0 NOT NULL,
    "refunded_cents" integer DEFAULT 0 NOT NULL,
    "currency" text DEFAULT 'USD' NOT NULL,
    "status" text DEFAULT 'pending' NOT NULL,
    "rail" text DEFAULT 'stripe' NOT NULL,
    "stripe_checkout_session_id" text,
    "stripe_payment_intent_id" text,
    "stripe_charge_id" text,
    "paid_at" timestamp,
    "refunded_at" timestamp,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS "contributions_funding_goal_id_idx"
     ON "contributions" ("funding_goal_id")`,
  `CREATE INDEX IF NOT EXISTS "contributions_payout_user_id_idx"
     ON "contributions" ("payout_user_id")`,
  `CREATE INDEX IF NOT EXISTS "contributions_backer_id_idx"
     ON "contributions" ("backer_id")`,
  `CREATE INDEX IF NOT EXISTS "contributions_world_id_created_at_idx"
     ON "contributions" ("world_id","created_at")`,
  // One contribution row per Checkout Session. This is the idempotency floor
  // that makes a double-fired webhook structurally impossible to double-credit.
  `CREATE UNIQUE INDEX IF NOT EXISTS "contributions_session_uniq"
     ON "contributions" ("stripe_checkout_session_id")`,
];

const foreignKeys = [
  ['funding_goals_owner_user_id_fk',
   `ALTER TABLE "funding_goals" ADD CONSTRAINT "funding_goals_owner_user_id_fk"
      FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade`],
  ['funding_goals_world_id_fk',
   `ALTER TABLE "funding_goals" ADD CONSTRAINT "funding_goals_world_id_fk"
      FOREIGN KEY ("world_id") REFERENCES "public"."worlds"("id") ON DELETE cascade`],
  // Contributions keep SET NULL on every parent: a financial record must
  // outlive the world, project or milestone it funded.
  ['contributions_funding_goal_id_fk',
   `ALTER TABLE "contributions" ADD CONSTRAINT "contributions_funding_goal_id_fk"
      FOREIGN KEY ("funding_goal_id") REFERENCES "public"."funding_goals"("id") ON DELETE set null`],
  ['contributions_world_id_fk',
   `ALTER TABLE "contributions" ADD CONSTRAINT "contributions_world_id_fk"
      FOREIGN KEY ("world_id") REFERENCES "public"."worlds"("id") ON DELETE set null`],
  ['contributions_payout_user_id_fk',
   `ALTER TABLE "contributions" ADD CONSTRAINT "contributions_payout_user_id_fk"
      FOREIGN KEY ("payout_user_id") REFERENCES "public"."users"("id") ON DELETE set null`],
  ['contributions_backer_id_fk',
   `ALTER TABLE "contributions" ADD CONSTRAINT "contributions_backer_id_fk"
      FOREIGN KEY ("backer_id") REFERENCES "public"."users"("id") ON DELETE set null`],
];

try {
  for (const sql of statements) {
    await pool.query(sql);
    console.log('  ✓', sql.trim().split('\n')[0].slice(0, 76));
  }

  for (const [name, sql] of foreignKeys) {
    const { rows } = await pool.query(`SELECT 1 FROM pg_constraint WHERE conname = $1`, [name]);
    if (rows.length > 0) { console.log('  ·', name, '(already present)'); continue; }
    await pool.query(sql);
    console.log('  ✓', name);
  }

  for (const table of ['funding_goals', 'contributions']) {
    const { rows } = await pool.query(
      `SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name = $1`, [table],
    );
    if (rows[0].n === 0) throw new Error(`${table} not found after apply`);
    const { rows: c } = await pool.query(`SELECT count(*)::int AS n FROM "${table}"`);
    console.log(`\n${table}: ${rows[0].n} columns, ${c[0].n} rows`);
  }

  console.log('\n✅ apply-funding-goals complete');
} catch (err) {
  console.error('\n❌ apply-funding-goals failed:', err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
