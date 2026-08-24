// Set the owner of a world.
//
// Money follows OWNERSHIP, not edit rights: funding goals and event ticket
// revenue for a world resolve to its world_members row with role='owner'. A
// world with no owner has no payee and cannot take funding at all — which is
// the state most worlds are currently in, because ownership rows only started
// being written at creation later on.
//
// Promotes an existing member, or adds them if they aren't one. Demotes any
// previous owner to world_builder so there is exactly one — they keep every
// edit right, they simply stop being the payee.
//
//   node scripts/set-world-owner.mjs tash55 callmelatasha
//   node scripts/set-world-owner.mjs tash55            (just report)
import { config } from 'dotenv';
import { Pool } from '@neondatabase/serverless';

config({ path: '.env.local', quiet: true });

const slug = process.argv[2];
const handle = process.argv[3]?.replace(/^@/, '').toLowerCase();

if (!slug) {
  console.log('\nUsage: node scripts/set-world-owner.mjs <world-slug> [username]\n');
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL });

try {
  const { rows: worlds } = await pool.query(
    `SELECT id, title, slug FROM worlds WHERE slug = $1 LIMIT 1`, [slug]);
  if (worlds.length === 0) throw new Error(`No world with slug "${slug}"`);
  const world = worlds[0];

  const showMembers = async () => {
    const { rows } = await pool.query(`
      SELECT u.username, m.role FROM world_members m
      JOIN users u ON u.id = m.user_id
      WHERE m.world_id = $1 ORDER BY m.role, u.username`, [world.id]);
    console.log(`\n${world.title} (${world.slug}):`);
    for (const r of rows) console.log(`  ${r.role.padEnd(14)} @${r.username}`);
    if (!rows.some((r) => r.role === 'owner')) {
      console.log('  ⚠ NO OWNER — this world has no payee and cannot take funding');
    }
  };

  if (!handle) { await showMembers(); console.log(); process.exit(0); }

  const { rows: users } = await pool.query(
    `SELECT id, username, name FROM users WHERE lower(username) = $1 LIMIT 1`, [handle]);
  if (users.length === 0) throw new Error(`No user @${handle}`);
  const user = users[0];

  console.log('Before:');
  await showMembers();

  // Exactly one owner: step any existing one down to world_builder. They lose
  // nothing but the payee role.
  const { rowCount: demoted } = await pool.query(
    `UPDATE world_members SET role = 'world_builder'
      WHERE world_id = $1 AND role = 'owner' AND user_id <> $2`,
    [world.id, user.id]);

  const { rowCount: promoted } = await pool.query(
    `UPDATE world_members SET role = 'owner'
      WHERE world_id = $1 AND user_id = $2`, [world.id, user.id]);

  if (promoted === 0) {
    await pool.query(
      `INSERT INTO world_members (world_id, user_id, role) VALUES ($1, $2, 'owner')`,
      [world.id, user.id]);
    console.log(`\n(@${user.username} was not a member — added as owner)`);
  }
  if (demoted > 0) console.log(`(${demoted} previous owner stepped down to world_builder)`);

  console.log('\nAfter:');
  await showMembers();
  console.log(`\n✅ @${user.username} now owns ${world.slug} and is its payee.\n`);
} catch (err) {
  console.error('\n❌ Failed:', err.message, '\n');
  process.exitCode = 1;
} finally {
  await pool.end();
}
