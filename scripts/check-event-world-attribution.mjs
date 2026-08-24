// READ-ONLY audit: find event_hosts rows whose world attribution ("Host as
// world") points at a world the host is not a member of.
//
// Until now the create/edit routes accepted any worldId without checking
// membership, so historical rows may attribute an event to a world its host
// has no relationship with. That was cosmetic — the event simply appeared on
// that world's events tab. It stops being cosmetic once creator payouts ship,
// because a world-hosted event's ticket revenue routes to that world's admin.
//
// This script CHANGES NOTHING. It prints what it finds so the rows can be
// judged individually rather than silently rewritten — several may be
// legitimate events whose host later left the world.
//
//   node scripts/check-event-world-attribution.mjs
import { config } from 'dotenv';
import { Pool } from '@neondatabase/serverless';

config({ path: '.env.local' });

const pool = new Pool({ connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL });

try {
  const { rows } = await pool.query(`
    SELECT
      eh.id            AS host_row_id,
      eh.role          AS host_role,
      e.slug           AS event_slug,
      e.event_name     AS event_name,
      e.published      AS event_published,
      u.username       AS host_username,
      w.slug           AS world_slug,
      w.title          AS world_title
    FROM event_hosts eh
    JOIN events e ON e.id = eh.event_id
    JOIN worlds w ON w.id = eh.world_id
    LEFT JOIN users u ON u.id = eh.user_id
    LEFT JOIN world_members wm
      ON wm.world_id = eh.world_id AND wm.user_id = eh.user_id
    WHERE eh.world_id IS NOT NULL
      AND wm.id IS NULL
    ORDER BY e.created_at DESC
  `);

  if (rows.length === 0) {
    console.log('✅ No mis-attributed event/world rows. Nothing to reconcile.');
  } else {
    console.log(`⚠️  ${rows.length} event host row(s) attribute an event to a world the host does not belong to:\n`);
    for (const r of rows) {
      console.log(
        `  ${r.event_published ? ' ' : '(unpublished) '}${r.event_name}` +
        `\n    event   /events/${r.event_slug}` +
        `\n    host    @${r.host_username ?? '—'} (${r.host_role})` +
        `\n    world   ${r.world_title} (/worlds/${r.world_slug})` +
        `\n    row     ${r.host_row_id}\n`,
      );
    }
    console.log('Decide per row. Leaving them alone is safe today; before ticket');
    console.log('payouts ship, any row still listed here would route that event\'s');
    console.log('revenue to that world\'s admin.');
  }

  // Paid-ticket exposure: which of the above have actually sold anything.
  const { rows: paid } = await pool.query(`
    SELECT COUNT(*)::int AS orders, COALESCE(SUM(o.amount_cents), 0)::int AS cents
    FROM ticket_orders o
    WHERE o.status = 'paid'
  `);
  console.log(`\nPaid ticket orders to date: ${paid[0].orders} (gross $${(paid[0].cents / 100).toFixed(2)}).`);
  console.log('These predate payee snapshotting and settle manually.');
} catch (err) {
  console.error('Audit failed:', err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
