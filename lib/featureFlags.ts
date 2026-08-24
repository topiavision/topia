// Lightweight feature flags. Flip these to roll features in/out without
// ripping out the underlying code.

// Ticketed-event payments (cards via Stripe Checkout, plus promo codes). The
// full backend + UI exist; the buyer-facing purchase UI and host tier manager
// stay hidden until we're ready to sell tickets. Set
// NEXT_PUBLIC_PAYMENTS_ENABLED=true to turn it on.
export const PAYMENTS_ENABLED = process.env.NEXT_PUBLIC_PAYMENTS_ENABLED === 'true';

// Creator funding — milestone/project/life goals paid via Stripe Connect.
// Separate from PAYMENTS_ENABLED so ticketing and funding roll out
// independently. Set NEXT_PUBLIC_FUNDING_ENABLED=true to turn it on.
export const FUNDING_ENABLED = process.env.NEXT_PUBLIC_FUNDING_ENABLED === 'true';
