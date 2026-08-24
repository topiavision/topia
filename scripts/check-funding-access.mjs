// READ-ONLY: who currently has funding access, and who granted it.
//
// Funding is off for every account until an admin switches it on per user, so
// this answers "who is in the pilot cohort right now?" — worth running before
// and after any rollout step.
//
//   node scripts/check-funding-access.mjs
import { config } from 'dotenv';
import { Pool } from '@neondatabase/serverless';

config({ path: '.env.local', quiet: true });

const pool = new Pool({ connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL });

try {
  const { rows: total } = await pool.query(`SELECT count(*)::int AS n FROM users`);

  const { rows: granted } = await pool.query(`
    SELECT u.username, u.name, u.email, f.enabled, f.updated_at,
           g.username AS granted_by
    FROM user_feature_flags f
    JOIN users u ON u.id = f.user_id
    LEFT JOIN users g ON g.id = f.granted_by
    WHERE f.feature = 'funding'
    ORDER BY f.enabled DESC, f.updated_at DESC
  `);

  const on = granted.filter((r) => r.enabled);
  const off = granted.filter((r) => !r.enabled);

  console.log(`\nUsers on the platform : ${total[0].n}`);
  console.log(`Funding ON            : ${on.length}`);
  console.log(`Previously revoked    : ${off.length}`);

  if (on.length > 0) {
    console.log('\nHas funding access:');
    for (const r of on) {
      console.log(
        `  @${r.username ?? '—'}${r.name ? ` (${r.name})` : ''}` +
        `\n    granted by @${r.granted_by ?? '—'} · ${new Date(r.updated_at).toISOString().slice(0, 10)}`,
      );
    }
  }

  if (off.length > 0) {
    console.log('\nRevoked (row kept for the audit trail):');
    for (const r of off) console.log(`  @${r.username ?? '—'}`);
  }

  console.log(
    on.length === 0
      ? '\n✅ Nobody has funding access. The admin Users tab is the only way to change that.\n'
      : `\n${total[0].n - on.length} of ${total[0].n} users still have funding off.\n`,
  );

  if (process.env.NEXT_PUBLIC_FUNDING_KILL_SWITCH === 'true') {
    console.log('⚠ KILL SWITCH IS ON — funding is disabled platform-wide regardless of the grants above.\n');
  }
} catch (err) {
  console.error('Check failed:', err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
