// Apply the per-user feature access table, used for phased rollout of funding
// (and later phases) to a limited cohort ahead of general availability.
//
// PURELY ADDITIVE — one new table, its indexes and its foreign keys. No ALTER,
// no UPDATE, no DROP. Idempotent, safe to re-run.
//
//   node scripts/apply-feature-flags.mjs
import { config } from 'dotenv';
import { Pool } from '@neondatabase/serverless';

config({ path: '.env.local', quiet: true });

const pool = new Pool({ connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL });

const statements = [
  `CREATE TABLE IF NOT EXISTS "user_feature_flags" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "user_id" uuid NOT NULL,
    "feature" text NOT NULL,
    "enabled" boolean DEFAULT true NOT NULL,
    "granted_by" uuid,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL
  )`,
  // One row per (person, feature) — makes the admin toggle an upsert.
  `CREATE UNIQUE INDEX IF NOT EXISTS "user_feature_flags_user_feature_uniq"
     ON "user_feature_flags" ("user_id","feature")`,
  `CREATE INDEX IF NOT EXISTS "user_feature_flags_feature_idx"
     ON "user_feature_flags" ("feature")`,
];

const foreignKeys = [
  ['user_feature_flags_user_id_fk',
   `ALTER TABLE "user_feature_flags" ADD CONSTRAINT "user_feature_flags_user_id_fk"
      FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade`],
  // Keep the grant record even if the granting admin's account is removed.
  ['user_feature_flags_granted_by_fk',
   `ALTER TABLE "user_feature_flags" ADD CONSTRAINT "user_feature_flags_granted_by_fk"
      FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE set null`],
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

  const { rows: cols } = await pool.query(
    `SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name = 'user_feature_flags'`,
  );
  if (cols[0].n === 0) throw new Error('user_feature_flags not found after apply');

  const { rows: grants } = await pool.query(
    `SELECT feature, count(*)::int AS n FROM user_feature_flags WHERE enabled GROUP BY feature`,
  );
  console.log(`\nuser_feature_flags: ${cols[0].n} columns`);
  console.log(grants.length === 0
    ? 'Active grants: none yet — grant from the admin dashboard, Users tab.'
    : 'Active grants: ' + grants.map((g) => `${g.feature}=${g.n}`).join(', '));

  console.log('\n✅ apply-feature-flags complete');
} catch (err) {
  console.error('\n❌ apply-feature-flags failed:', err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
