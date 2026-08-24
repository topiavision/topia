// Lightweight feature flags. Flip these to roll features in/out without
// ripping out the underlying code.

// Ticketed-event payments (cards via Stripe Checkout, plus promo codes). The
// full backend + UI exist; the buyer-facing purchase UI and host tier manager
// stay hidden until we're ready to sell tickets. Set
// NEXT_PUBLIC_PAYMENTS_ENABLED=true to turn it on.
export const PAYMENTS_ENABLED = process.env.NEXT_PUBLIC_PAYMENTS_ENABLED === 'true';

// Creator funding — milestone/project/life goals paid via Stripe Connect.
//
// There is deliberately NO "enable for everyone" flag. Funding is granted per
// user from the admin dashboard and is OFF for every account until someone
// switches it on there. That keeps a single env var from opening a money
// feature to the whole platform by accident.
//
// This is an emergency kill switch only: it can take access AWAY from everyone
// at once, never give it. Set NEXT_PUBLIC_FUNDING_KILL_SWITCH=true to disable
// funding platform-wide regardless of individual grants.
export const FUNDING_KILL_SWITCH = process.env.NEXT_PUBLIC_FUNDING_KILL_SWITCH === 'true';
