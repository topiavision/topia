// Apply the performance indexes found missing by the Aug 2026 perf audit.
//
// PURELY ADDITIVE — CREATE INDEX IF NOT EXISTS only. No ALTER, no UPDATE, no
// data change. Idempotent, safe to re-run. Mirrors the new index() entries in
// lib/db/schema.ts, plus two FUNCTIONAL indexes that drizzle's schema can't
// express: ~10 hot paths filter on lower(users.username)/lower(users.email)
// (profile metadata on every profile view, RSVP resolve-or-create, member
// invites…), which the plain unique btree cannot serve — each was a seq scan
// on users.
//
//   node scripts/apply-perf-indexes.mjs
import { config } from 'dotenv';
import { Pool } from '@neondatabase/serverless';

config({ path: '.env.local', quiet: true });

const pool = new Pool({ connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL });

const statements = [
  // Every event listing filters published and sorts by date_iso.
  `CREATE INDEX IF NOT EXISTS "events_published_date_iso_idx" ON "events" ("published","date_iso")`,
  `CREATE INDEX IF NOT EXISTS "events_city_idx" ON "events" ("city")`,
  // /api/events?worldId= — a world's events resolve through event_hosts.world_id.
  `CREATE INDEX IF NOT EXISTS "event_hosts_world_id_idx" ON "event_hosts" ("world_id")`,
  // Profile stamps, computed on every profile view.
  `CREATE INDEX IF NOT EXISTS "event_invites_invited_by_status_idx" ON "event_invites" ("invited_by","status")`,
  `CREATE INDEX IF NOT EXISTS "tools_submitted_by_idx" ON "tools" ("submitted_by")`,
  // Ticket reads by event (door lists) and by owner (your tickets).
  `CREATE INDEX IF NOT EXISTS "tickets_event_id_idx" ON "tickets" ("event_id")`,
  `CREATE INDEX IF NOT EXISTS "tickets_owner_id_idx" ON "tickets" ("owner_id")`,
  // Functional: serve lower(username)/lower(email) lookups.
  `CREATE INDEX IF NOT EXISTS "users_lower_username_idx" ON "users" (lower("username"))`,
  `CREATE INDEX IF NOT EXISTS "users_lower_email_idx" ON "users" (lower("email"))`,
];

try {
  for (const sql of statements) {
    await pool.query(sql);
    console.log('  ✓', sql.replace(/CREATE INDEX IF NOT EXISTS /, '').slice(0, 74));
  }

  // Verify: every index above must now exist.
  const names = statements.map((s) => s.match(/"([a-z_]+_idx)"/)[1]);
  const { rows } = await pool.query(
    `SELECT indexname FROM pg_indexes WHERE indexname = ANY($1::text[])`, [names],
  );
  if (rows.length !== names.length) {
    const have = new Set(rows.map((r) => r.indexname));
    throw new Error('missing after apply: ' + names.filter((n) => !have.has(n)).join(', '));
  }
  console.log(`\n✅ apply-perf-indexes complete — ${rows.length}/${names.length} present`);
} catch (err) {
  console.error('\n❌ apply-perf-indexes failed:', err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
