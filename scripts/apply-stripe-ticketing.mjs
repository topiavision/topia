// One-off: apply the Stripe-rail ticketing changes — the event_promo_codes
// table plus the new columns on ticket_orders (promo snapshot + Stripe ids).
// The drizzle migration journal is behind the live schema, so this mirrors
// scripts/apply-ticketing-tables.mjs: idempotent, safe to re-run.
//
//   node scripts/apply-stripe-ticketing.mjs
import { config } from 'dotenv';
import { Pool } from '@neondatabase/serverless';

config({ path: '.env.local' });

const pool = new Pool({ connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL });

const statements = [
  `CREATE TABLE IF NOT EXISTS "event_promo_codes" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "event_id" uuid NOT NULL,
    "ticket_type_id" uuid,
    "code" text NOT NULL,
    "discount_type" text NOT NULL,
    "discount_value" integer NOT NULL,
    "max_redemptions" integer,
    "redemption_count" integer DEFAULT 0 NOT NULL,
    "starts_at" timestamp,
    "expires_at" timestamp,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS "event_promo_codes_event_id_idx" ON "event_promo_codes" ("event_id")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "event_promo_codes_event_code_idx" ON "event_promo_codes" ("event_id","code")`,
  `ALTER TABLE "ticket_orders" ADD COLUMN IF NOT EXISTS "promo_code_id" uuid`,
  `ALTER TABLE "ticket_orders" ADD COLUMN IF NOT EXISTS "promo_code" text`,
  `ALTER TABLE "ticket_orders" ADD COLUMN IF NOT EXISTS "discount_cents" integer DEFAULT 0 NOT NULL`,
  `ALTER TABLE "ticket_orders" ADD COLUMN IF NOT EXISTS "stripe_checkout_session_id" text`,
  `ALTER TABLE "ticket_orders" ADD COLUMN IF NOT EXISTS "stripe_payment_intent_id" text`,
];

// FK constraints — wrapped so a duplicate (already-applied) one is ignored.
const fks = [
  ['event_promo_codes_event_id_events_id_fk', `ALTER TABLE "event_promo_codes" ADD CONSTRAINT "event_promo_codes_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade`],
  ['event_promo_codes_ticket_type_id_event_ticket_types_id_fk', `ALTER TABLE "event_promo_codes" ADD CONSTRAINT "event_promo_codes_ticket_type_id_event_ticket_types_id_fk" FOREIGN KEY ("ticket_type_id") REFERENCES "public"."event_ticket_types"("id") ON DELETE cascade`],
  ['ticket_orders_promo_code_id_event_promo_codes_id_fk', `ALTER TABLE "ticket_orders" ADD CONSTRAINT "ticket_orders_promo_code_id_event_promo_codes_id_fk" FOREIGN KEY ("promo_code_id") REFERENCES "public"."event_promo_codes"("id")`],
];

try {
  for (const sql of statements) {
    await pool.query(sql);
  }
  for (const [name, sql] of fks) {
    await pool.query(
      `DO $$ BEGIN
         IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '${name}') THEN
           ${sql.replace(/'/g, "''")};
         END IF;
       END $$;`
    );
  }
  const { rows } = await pool.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name = 'ticket_orders' AND column_name IN
       ('promo_code_id','promo_code','discount_cents','stripe_checkout_session_id','stripe_payment_intent_id')
     ORDER BY column_name`
  );
  console.log('Applied. New ticket_orders columns present:', rows.map((r) => r.column_name).join(', '));
} catch (err) {
  console.error('FAILED:', err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
