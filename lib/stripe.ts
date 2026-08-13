// Server-side Stripe client. Imported only from API route handlers — the
// secret key never ships to the browser. Checkout uses Stripe-hosted pages
// (redirect via session.url), so no publishable key or client SDK is needed.
import Stripe from 'stripe';

let client: Stripe | null = null;

export function stripeClient(): Stripe {
  if (!client) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error('STRIPE_SECRET_KEY is not set');
    client = new Stripe(key);
  }
  return client;
}

// Used to verify inbound webhook signatures (whsec_… from the Stripe
// dashboard's webhook endpoint, or `stripe listen` in development).
export const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? '';

// True only when the server can actually create Checkout Sessions.
export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}
