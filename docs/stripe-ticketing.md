# Stripe ticketing — setup & operations

Paid event tickets run on **Stripe Checkout**: buyers pick a tier (and
optionally a promo code) on the event page, we create a pending order, send
them to a Stripe-hosted payment page, and issue QR-coded tickets when Stripe
confirms payment. Card data never touches our servers, which keeps PCI scope
at the minimum (SAQ A).

The earlier Square and USDC-on-Base rails are removed. Historical orders from
those rails keep their columns on `ticket_orders`.

## 1. One-time setup

### Stripe account

1. Create/activate the account at <https://dashboard.stripe.com> (business
   details, bank account). Describe the business as an **event ticketing
   platform** — do not mention crypto features; nothing crypto-related flows
   through Stripe.
2. Grab the **secret key** (`sk_live_…`, or `sk_test_…` for staging) from
   Developers → API keys. No publishable key is needed — Checkout is a
   redirect, not an embedded form.
3. Add a webhook endpoint under Developers → Webhooks:
   - URL: `https://topia.vision/api/webhooks/stripe`
   - Events: `checkout.session.completed`, `checkout.session.expired`,
     `charge.refunded`
   - Copy the signing secret (`whsec_…`).

### Environment variables (Vercel)

| Variable | Value |
| --- | --- |
| `STRIPE_SECRET_KEY` | `sk_live_…` / `sk_test_…` |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` from the webhook endpoint |
| `NEXT_PUBLIC_PAYMENTS_ENABLED` | `true` to show the ticketing UI (tiers, purchase, promo codes) |
| `NEXT_PUBLIC_SITE_URL` | canonical origin used in webhook-triggered emails (defaults to `https://topia.vision`) |

`RESEND_API_KEY` (already used for RSVP mail) also powers the ticket
confirmation email; publish a Resend template named `event-ticket-confirmed`
from `emails/event-ticket-confirmed.html` (variables: `EVENT_NAME`,
`EVENT_URL`, `GUEST_NAME`, `TICKET_COUNT_LABEL`, `ORDER_TOTAL`).

### Database

The drizzle journal is behind the live DB, so apply the new objects with the
idempotent script (mirrors `apply-ticketing-tables.mjs`):

```bash
npm run db:apply-stripe-ticketing
```

This creates `event_promo_codes` and adds `promo_code_id`, `promo_code`,
`discount_cents`, `stripe_checkout_session_id`, `stripe_payment_intent_id`
to `ticket_orders`. Safe to re-run.

### Local development

```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
# use the printed whsec_… as STRIPE_WEBHOOK_SECRET in .env.local
```

Test card: `4242 4242 4242 4242`, any future expiry/CVC.

## 2. How the flow works

```
buyer clicks Get → modal (quantity + promo code)
  → POST /api/checkout/stripe          creates pending order, snapshots price
                                       + discount, returns session URL
  → redirect to Stripe Checkout        (cards, Apple Pay, Google Pay, Link)
  → Stripe redirects back              /events/<slug>?checkout=success&order=<id>
  → page polls /api/checkout/stripe/status until 'paid'
fulfillment (idempotent, transactional):
  webhook checkout.session.completed   ← authoritative
  status endpoint fallback             ← self-heals if the webhook was missed
  issues tickets, bumps quantitySold + promo redemptionCount, emails receipt
```

- Free tiers (and 100%-off promo orders) skip Stripe entirely and issue
  instantly.
- Abandoned Checkout Sessions expire after 30 minutes
  (`checkout.session.expired` → order `cancelled`).
- Paid tiers must be ≥ **$0.50** (Stripe's card minimum). Promo codes that
  would land a total in the 1–49¢ band are rejected with a clear error.

## 3. Promo codes

Host-managed per event (composer → Tickets section, or Manage → Tickets):

- **percent** (1–100%) or **fixed** ($ off the order total)
- optional restriction to a single tier
- optional max redemptions (counts **paid** orders only) and expiry date
- codes are case-insensitive, stored uppercase, unique per event

Discount math lives in `lib/payments/promo.ts` and is applied server-side at
order creation; the buyer-side "Apply" button is only a preview of the same
check.

### Tier sale windows

Each tier can carry an optional **goes-on-sale** and/or **sales-end**
datetime (set in the composer or Manage → Tickets):

- before the start: the tier is listed but not purchasable — "On sale Aug 29"
- after the end: the tier stays listed, crossed out — "Sale ended"
- both are enforced server-side at order creation, not just hidden in the UI

Typical setup: an Early Bird tier with a sales-end date, plus a Same-Day /
Door tier whose start is the event morning. `isActive` remains the master
switch to hide a tier entirely.

## 4. How tickets relate to RSVPs

One guest list. The two paths converge:

- **Buying a ticket auto-RSVPs the buyer as `going`** (inside the fulfillment
  transaction, bypassing approval/capacity — payment is admission). Buyers
  appear in the Guests tab, Who's Going, counts, and reminder emails.
- **Ticket-gated events**: when every active tier is paid, the free RSVP
  button hides and the RSVP API rejects free registration — checkout is the
  only way in. Events with a free tier (or no tiers at all) keep the normal
  RSVP flow, including approval and waitlists.
- **Door check-in** was already unified: the scan list is RSVPs ∪ valid
  ticket holders, deduped, and scanning stamps tickets `checked_in`.

## 5. Refunds

Issue refunds from the **Stripe dashboard**. The `charge.refunded` webhook
(full refunds only) flips the order to `refunded`, voids its tickets, and
releases tier supply. Partial refunds intentionally leave tickets valid.

## 6. Stripe-side gotchas to expect

- **First payout ~7 days** after the first live charge; ~2-day rolling after.
- **Rolling review**: a new account with a sudden sales spike can get asked
  for extra verification. Keep the site's terms/refund/contact pages live
  (they are — `/legal/terms` covers ticket sales).
- **Future-delivery risk**: ticketing is money-now-event-later, so at larger
  volume Stripe may apply a reserve. Not typical at small volume.
