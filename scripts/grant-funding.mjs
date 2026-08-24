// Grant or revoke funding access for a user, from the command line.
//
// The admin dashboard's Users tab does the same thing with a click; this
// exists because the pilot cohort arrives as a list of handles, and clicking
// through them one at a time invites mistakes.
//
// Writes only to user_feature_flags. Revoking keeps the row (enabled=false) so
// the record of who had access when survives.
//
//   node scripts/grant-funding.mjs callmelatasha
//   node scripts/grant-funding.mjs callmelatasha --revoke
//   node scripts/grant-funding.mjs alice bob carol
import { config } from 'dotenv';
import { Pool } from '@neondatabase/serverless';

config({ path: '.env.local', quiet: true });

const revoke = process.argv.includes('--revoke');
const handles = process.argv.slice(2)
  .filter((a) => !a.startsWith('--'))
  .map((h) => h.replace(/^@/, '').toLowerCase());

if (handles.length === 0) {
  console.log('\nUsage: node scripts/grant-funding.mjs <username> [more…] [--revoke]\n');
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL });

try {
  for (const handle of handles) {
    const { rows } = await pool.query(
      `SELECT id, username, name, email FROM users WHERE lower(username) = $1 LIMIT 1`,
      [handle],
    );
    if (rows.length === 0) { console.log(`  ✗ @${handle} — no such user`); continue; }
    const u = rows[0];

    await pool.query(`
      INSERT INTO user_feature_flags (user_id, feature, enabled)
      VALUES ($1, 'funding', $2)
      ON CONFLICT (user_id, feature)
        DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = now()
    `, [u.id, !revoke]);

    console.log(`  ${revoke ? '✗ revoked from' : '✓ granted to'} @${u.username}${u.name ? ` (${u.name})` : ''}`);

    if (!revoke) {
      // Stripe refuses a recipient account without a contact email, so flag it
      // here rather than letting them hit it mid-onboarding.
      if (!u.email) {
        console.log('      ⚠ no email on file — they must add one before connecting payouts');
      }
      // A grant lets them connect payouts, but goals resolve to a world's
      // OWNER. Without one they can't set a goal on that world.
      const { rows: owned } = await pool.query(
        `SELECT w.slug FROM world_members m JOIN worlds w ON w.id = m.world_id
          WHERE m.user_id = $1 AND m.role = 'owner'`, [u.id],
      );
      console.log(owned.length > 0
        ? `      owns: ${owned.map((w) => w.slug).join(', ')}`
        : '      ⚠ owns no world — can connect payouts, but cannot set goals until they own one');
    }
  }
  console.log('\nCheck the full picture: node scripts/check-funding-access.mjs\n');
} catch (err) {
  console.error('\n❌ Failed:', err.message, '\n');
  process.exitCode = 1;
} finally {
  await pool.end();
}
