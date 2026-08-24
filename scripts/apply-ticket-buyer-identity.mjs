// One-off: add the buyer-identity columns to ticket_orders.
//
// Ticket buyers never fill in the RSVP form — fulfillOrder() puts them on the
// guest list directly — so until now the only name/email a host could see was
// whatever Privy happened to put on the users row. An SMS-only login left the
// host looking at a bare phone number. These columns hold the buyer's own
// first/last name and email, captured on the checkout screen.
//
// The drizzle migration journal is behind the live schema, so this mirrors
// scripts/apply-stripe-ticketing.mjs: idempotent, safe to re-run.
//
//   node scripts/apply-ticket-buyer-identity.mjs
import { config } from 'dotenv';
import { Pool } from '@neondatabase/serverless';

config({ path: '.env.local' });

const pool = new Pool({ connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL });

const statements = [
  `ALTER TABLE "ticket_orders" ADD COLUMN IF NOT EXISTS "buyer_first_name" text`,
  `ALTER TABLE "ticket_orders" ADD COLUMN IF NOT EXISTS "buyer_last_name" text`,
  // buyer_email predates this script, but keep it here so a fresh DB built
  // only from the apply scripts still ends up with the full set.
  `ALTER TABLE "ticket_orders" ADD COLUMN IF NOT EXISTS "buyer_email" text`,
  // The host sales view lists orders per event, newest first.
  `CREATE INDEX IF NOT EXISTS "ticket_orders_event_id_idx" ON "ticket_orders" ("event_id")`,
  `CREATE INDEX IF NOT EXISTS "ticket_orders_buyer_id_idx" ON "ticket_orders" ("buyer_id")`,
];

try {
  for (const sql of statements) {
    await pool.query(sql);
  }
  const { rows } = await pool.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name = 'ticket_orders'
       AND column_name IN ('buyer_first_name','buyer_last_name','buyer_email')
     ORDER BY column_name`
  );
  console.log('Applied. ticket_orders buyer columns present:', rows.map((r) => r.column_name).join(', '));
} catch (err) {
  console.error('FAILED:', err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
