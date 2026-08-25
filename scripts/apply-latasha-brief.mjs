// Latashá's Aug 25 product brief — the two schema additions:
//   era_milestones.details          multi-line description; the existing
//                                   `description` stays as the one-line card
//                                   summary
//   funding_goals.external_raised_cents
//                                   money the creator raised OUTSIDE Topia
//                                   (grants, patrons, their own) — counts
//                                   toward the bar, labeled as external
//
// PURELY ADDITIVE — ADD COLUMN IF NOT EXISTS only. Idempotent, safe to re-run.
//
//   node scripts/apply-latasha-brief.mjs
import { config } from 'dotenv';
import { Pool } from '@neondatabase/serverless';

config({ path: '.env.local', quiet: true });
const pool = new Pool({ connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL });

const statements = [
  `ALTER TABLE "era_milestones" ADD COLUMN IF NOT EXISTS "details" text`,
  `ALTER TABLE "funding_goals" ADD COLUMN IF NOT EXISTS "external_raised_cents" integer DEFAULT 0 NOT NULL`,
];

try {
  for (const sql of statements) { await pool.query(sql); console.log('  ✓', sql.slice(0, 76)); }
  const { rows } = await pool.query(`
    SELECT table_name, column_name FROM information_schema.columns
    WHERE (table_name='era_milestones' AND column_name='details')
       OR (table_name='funding_goals' AND column_name='external_raised_cents')`);
  if (rows.length !== 2) throw new Error('columns missing after apply');
  console.log('\n✅ apply-latasha-brief complete — both columns present');
} catch (err) {
  console.error('\n❌ failed:', err.message); process.exitCode = 1;
} finally { await pool.end(); }
