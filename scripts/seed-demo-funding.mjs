// Seed (or remove) demo funding goals on a world, so the meters have
// something to render for a walkthrough.
//
// Writes ONLY to funding_goals, and only for milestones of the world you name.
// Fully reversible: --remove deletes exactly the rows it created and nothing
// else. Nothing outside funding_goals is touched, and no money is involved —
// raised_cents is set purely for display.
//
//   node scripts/seed-demo-funding.mjs grateful-minds
//   node scripts/seed-demo-funding.mjs grateful-minds --remove
import { config } from 'dotenv';
import { Pool } from '@neondatabase/serverless';

config({ path: '.env.local', quiet: true });

const slug = process.argv[2];
const remove = process.argv.includes('--remove');

if (!slug) {
  console.log('\nUsage: node scripts/seed-demo-funding.mjs <world-slug> [--remove]\n');
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL });

// Deliberately partial: only some milestones get goals, because the point is
// to prove that funding is per-milestone and optional.
const DEMO = [
  { goalCents: 200000, raisedCents: 128000, patronCount: 9,  blurb: 'Studio hire and the engineer for the first sessions.' },
  { goalCents: 800000, raisedCents: 320000, patronCount: 18, blurb: 'Engineer time, session players and the master.' },
  null,   // no goal — this milestone needs no money
  { goalCents: 400000, raisedCents: 0,      patronCount: 0,  blurb: 'Vinyl test press and shipping.' },
];

try {
  const { rows: worlds } = await pool.query(
    `SELECT id, title FROM worlds WHERE slug = $1 LIMIT 1`, [slug],
  );
  if (worlds.length === 0) throw new Error(`No world with slug "${slug}"`);
  const world = worlds[0];

  const { rows: owner } = await pool.query(
    `SELECT user_id FROM world_members WHERE world_id = $1 AND role = 'owner' LIMIT 1`, [world.id],
  );
  if (owner.length === 0) throw new Error(`World "${slug}" has no owner to attribute goals to`);

  const { rows: milestones } = await pool.query(`
    SELECT m.id, m.title
    FROM era_milestones m
    JOIN world_eras e ON e.id = m.era_id
    WHERE e.world_id = $1
    ORDER BY e.sort_order, m.sort_order
    LIMIT $2
  `, [world.id, DEMO.length]);

  if (milestones.length === 0) throw new Error(`World "${slug}" has no milestones`);

  if (remove) {
    const { rowCount } = await pool.query(
      `DELETE FROM funding_goals
        WHERE target_type = 'milestone'
          AND target_id = ANY($1::uuid[])`,
      [milestones.map((m) => m.id)],
    );
    console.log(`\n🧹 Removed ${rowCount} demo goal(s) from ${world.title}.\n`);
  } else {
    let n = 0;
    for (let i = 0; i < milestones.length; i++) {
      const spec = DEMO[i];
      if (!spec) { console.log(`  · ${milestones[i].title} — left unfunded (on purpose)`); continue; }
      await pool.query(`
        INSERT INTO funding_goals
          (target_type, target_id, owner_user_id, world_id, title_snapshot,
           goal_cents, raised_cents, patron_count, blurb)
        VALUES ('milestone', $1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (target_type, target_id) DO UPDATE SET
          goal_cents = EXCLUDED.goal_cents,
          raised_cents = EXCLUDED.raised_cents,
          patron_count = EXCLUDED.patron_count,
          blurb = EXCLUDED.blurb,
          updated_at = now()
      `, [milestones[i].id, owner[0].user_id, world.id, milestones[i].title,
          spec.goalCents, spec.raisedCents, spec.patronCount, spec.blurb]);
      n++;
      console.log(`  ✓ ${milestones[i].title} — $${(spec.raisedCents / 100).toLocaleString()} of $${(spec.goalCents / 100).toLocaleString()}`);
    }
    console.log(`\n✅ Seeded ${n} demo goal(s) on ${world.title}.`);
    console.log(`   Undo with: node scripts/seed-demo-funding.mjs ${slug} --remove\n`);
  }
} catch (err) {
  console.error('\n❌ Failed:', err.message, '\n');
  process.exitCode = 1;
} finally {
  await pool.end();
}
