# AGENTS.md — Topia Operating Manual

Topia is a creator platform (topia.vision): profiles with "passport" stamps, worlds
(creator projects), Luma-style events with RSVP + ticketing, Instagram-style DMs,
a tools/grants directory, and Topia TV. Solo-maintained, high velocity, no tests,
no CI — **you are the CI**. Everything merged to main deploys to production via Vercel.

Stack: Next.js 16 App Router · React 19 · TypeScript · Tailwind 4 (CSS variables) ·
Drizzle ORM on Neon Postgres · Privy auth (email/SMS/Google/wallet + embedded wallets) ·
Resend email · Stripe (Checkout for tickets; Connect Express for creator payouts) ·
Vercel Blob storage.

## Ground rules (read before touching anything)

1. **NEVER run `drizzle-kit migrate`, `db:push`, or `db:generate`.** The migration
   journal in `drizzle/` is permanently behind the live Neon schema; drizzle-kit
   fails with "relation already exists" or, worse, tries to drop things. Schema
   changes go: edit `lib/db/schema.ts` (source of truth) → write an idempotent
   `scripts/apply-<feature>.mjs` → run it with `node`. See the `db-change` skill.
2. **Node/npm live at `/opt/homebrew/bin` and are NOT on default PATH.** Prefix
   every npm/node/npx Bash call: `export PATH=/opt/homebrew/bin:$PATH && ...`.
   The dev server config in `.claude/launch.json` already handles this.
3. **Secrets come from Vercel, never committed.** If `.env.local` is missing:
   `vercel env pull .env.local` (project `topiavision/topia` on Vercel).
4. **"Delete" means soft archive.** User-facing removal of events/worlds sets
   `published = false` (recoverable). Hard delete only exists for worlds
   (`/api/worlds/delete`, owner only) and is never the default answer.
5. **Money is integer USD cents everywhere.** Never floats. Fee math lives in one
   pure module, `lib/payments/fees.ts` — `computeCheckoutTotal()` grosses the
   charge up so the creator receives 100%. It has assertions in
   `scripts/check-fee-math.ts`; run them after touching it.
6. **Every external integration degrades gracefully when unconfigured.** Follow the
   pattern: `isStripeConfigured()`, `isConnectConfigured()`, `isEmailConfigured()`,
   `verifyPrivyIdentity()`
   returning `{ configured: false }`. New integrations must no-op with a logged
   reason, never throw at import time or crash a request.
7. **The root `*.md` docs are stale** (README, SETUP, DEPLOYMENT_GUIDE, etc. date
   from initial scaffolding). Only `COLORS.md` still matches reality. Trust the
   code and this file.

## Where things live

| Area | Location | Notes |
|---|---|---|
| DB schema (source of truth) | `lib/db/schema.ts` | ~35 tables; users, worlds, events, RSVPs, tickets, messages, guestbook, shortLinks |
| DB client | `lib/db/index.ts` | Neon Pool + drizzle; `import { db, users, ... } from '@/lib/db'` |
| Schema apply scripts | `scripts/apply-*.mjs` | The REAL migration mechanism; all idempotent |
| Server Privy verification | `lib/auth/privyServer.ts` | `verifyPrivyIdentity(token)` — never throws |
| Admin gate | `lib/adminAuth.ts` | Hardcoded email/phone allowlist + `isAdminRequest(request)` |
| Event host gate | `lib/events/auth.ts` | `requireManager(privyId, eventId)` |
| Email sending | `lib/notify/email.ts` | Resend templates; best-effort, returns `{sent, reason}` |
| Email template source | `scripts/gen-email-templates.mjs` | Generates `emails/*.html`; live copies are pasted into the Resend dashboard |
| Payments (tickets) | `lib/payments/` + `lib/stripe.ts` | Stripe Checkout. `fulfillOrder` is idempotent and money-agnostic — copy its shape |
| Creator payouts | `lib/payments/connect.ts` + `app/api/payouts/*` | Connect Express, **Accounts v2**. One account per USER; `resolvePayee()` decides who earns |
| Fee math | `lib/payments/fees.ts` | Pure, dependency-free, asserted by `scripts/check-fee-math.ts` |
| Funding goals | `app/api/funding/goals` + `app/components/world/in-process/funding/` | Polymorphic over milestone / project / life_chapter |
| Feature access | `lib/featureAccess.ts` | Per-user grants. Funding is OFF for everyone until admin switches it on |
| Feature flags | `lib/featureFlags.ts` | `PAYMENTS_ENABLED`; `FUNDING_KILL_SWITCH` can only ever *disable* |
| Shortlinks | `lib/shortlinkStore.ts` + `app/s/[code]/route.ts` | Idempotent per path; worlds get slug codes |
| Vanity profiles | `middleware.ts` | `/@username` rewrites to `/u/username` |
| Design tokens | `app/globals.css` + `COLORS.md` | All theming via CSS variables |
| Shared event composer | `app/events/_components/EventComposer.tsx` | ONE composer for create + edit; never fork it |
| Admin dashboard | `app/admin/page.tsx` + `/api/admin/*` | Every admin route must call the gate |

## Conventions

### Git & PRs
- Branches: `feat/<slug>`, `fix/<slug>`, `security/<slug>`. Never commit directly to main.
- Commits: conventional, **always with a scope**: `fix(messages): pin composer flush
  on keyboard (visualViewport)`. Scopes are product domains: events, messages,
  profile, worlds, admin, theme, home, onboarding, security, nav, rsvp, passport.
  Imperative mood, specific about problem AND solution.
- PRs merge via GitHub with merge commits (no squash/rebase). Keep PRs focused:
  fixes are 1–3 files; only architectural sweeps (redesign, security) go wide, and
  even those stay within one subsystem.
- Before any push: `export PATH=/opt/homebrew/bin:$PATH && npm run lint && npm run build`
  must both pass. There is no CI to catch you.

### API routes (`app/api/**/route.ts`)
- Auth: extract `privyId` from JSON body → resolve `users` row by `eq(users.privyId, privyId)`
  → 401 if absent → then check authorization (host/owner/admin) → 403 if not allowed.
- For sensitive operations (admin, anything asserting an email/phone identity), also
  verify the Privy **access token** server-side (`Authorization: Bearer` →
  `verifyPrivyIdentity`). `privyId` alone is client-supplied and spoofable.
- Errors: always `NextResponse.json({ error: '<message>' }, { status })` with
  400 (bad input) / 401 (not authenticated) / 403 (not authorized) / 404 / 500.
- Public list endpoints set `Cache-Control: public, s-maxage=60, stale-while-revalidate=300`.
  Anything per-viewer or auth-gated sets `private, no-store` (add it — older routes omit it).
- Emails send AFTER the DB write commits, best-effort: check `result.sent`, log
  `reason` on failure, never fail the request because an email failed.
- Log with a greppable prefix: `console.error('[rsvp] ...')`.

### Database access
- Query style: `const [row] = await db.select({...}).from(t).where(eq(...)).limit(1)`.
  This "Pattern A" dominates; don't introduce `db.query.*.findFirst` variants.
- Simple queries live inline in the route; reused or multi-step logic gets a
  `lib/<domain>/` helper (see `lib/events/auth.ts`, `lib/messages.ts`).
- Raw SQL only via the `sql` tag for things drizzle can't express
  (e.g. `sql\`lower(${users.email}) = ${email.toLowerCase()}\``), always parameterized.
- Timestamps: `createdAt`/`updatedAt` with `.defaultNow().notNull()`; set
  `updatedAt: new Date()` on updates.

### Styling & theme
- Colors ONLY via CSS variables from `globals.css`. Brand: `--lime #e4fe52`,
  `--orange`, `--blue`, `--pink`, `--obsidian #1a1a1a`, `--bone #f5f0e8`.
  Theme-aware: `--page-bg`, `--page-text`, `--accent-ink` (deep lime `#4f6b00` in
  light mode, `--lime` in dark — lime text on bone is illegible; use `--accent-ink`
  for accent TEXT, `--lime` only for fills/backgrounds with dark text on top).
- Dark mode = `[data-theme="dark"]` attribute (localStorage-persisted; a sync script
  in `layout.tsx` prevents flash). Every new surface must be checked in BOTH themes.
- Type: `.heading-display` (Basement Grotesque, uppercase, tight) for display,
  `.body-text` (GT Zirkon) for body, `.meta-text` for 10px uppercase micro-labels.
  Micro-labels have a legibility floor — don't go below the existing sizes/weights.
- Utility-first Tailwind inline; no BEM, no component CSS layer. Responsive via
  `md:`/`lg:` prefixes; page padding via `var(--page-pad)`.

### Auth & login flows
- Client auth state comes from `usePrivy()`. Any gate must wait for
  `ready && authenticated` before redirecting or checking roles — checking early
  causes a hydration bounce that kicks logged-in users out.
- Post-login intent NEVER travels in URL query params. Privy OAuth (Google/wallet)
  round-trips through the provider and returns to `customOAuthRedirectUrl` built
  from pathname only — **query strings are dropped**. Stash intent in
  `sessionStorage` (existing keys: `topia:postLogin`, `topia_pending_rsvp`,
  `topia_invite_token`) and resolve it after auth. Only honor internal paths
  (`startsWith('/')`, not `//`).
- New users may not have a `users` row yet. Flows reachable by fresh visitors
  (RSVP) resolve-or-create the row and catch unique-constraint races on
  email/phone by re-selecting.

### Emails
- Provider is Resend; live templates are managed in the Resend dashboard with
  `{{{TRIPLE_BRACE}}}` variables. The HTML is generated by
  `scripts/gen-email-templates.mjs` → `emails/*.html` → manually pasted into Resend.
  **Editing `emails/*.html` directly changes nothing in production** — edit the
  generator, regenerate, re-paste, and update `lib/notify/email.ts` if variables changed.
- Send via `sendTemplateEmail`/the typed wrappers in `lib/notify/email.ts`. Bulk
  sends use the batched, rate-limited `sendBulkEmails` (100/batch, 600ms spacing,
  429 backoff) — never hand-roll a send loop.

### Creator payouts & funding

- **Stripe Connect Express, Accounts v2.** v1 account creation is refused for new
  integrations. Create with `stripe.v2.core.accounts` and request **both**
  `merchant.card_payments` and `recipient.stripe_balance.stripe_transfers` — the API
  rejects transfers-only, despite the docs implying recipient alone is right for our
  charge model. `scripts/check-stripe-connect.mjs` proves the whole flow end to end.
- **Destination charges, never `on_behalf_of`.** `transfer_data.amount` states what
  the creator receives; `application_fee_amount` is the wrong primitive here and the
  two are mutually exclusive. `on_behalf_of` would move fee jurisdiction to the
  creator's country and break the USD-only assumption.
- **Every refund path sets `reverse_transfer: true`.** Without it the platform
  refunds the buyer while the creator keeps the transfer — a full-charge hole per
  refund.
- **One account per PERSON.** Worlds and events resolve to a payee via
  `resolvePayee()`: a world pays its **admin** (`world_members.role = 'owner'`), a
  personal event pays its creator-host, a life goal pays the user. Snapshot the payee
  onto the order or contribution — the inputs are mutable dropdowns.
- **Never reuse `applyStripeCustomerDetails` for contributions.** It patches the
  `users` table, which would turn guest checkout into a profile-write primitive.
- **Funding is opt-in twice over**: off for every account until an admin grants it,
  and optional per milestone. A milestone with no goal must render byte-for-byte as
  it did before funding existed.

### Conventions to adopt going forward (not yet uniform in the codebase)
- Add `Cache-Control: private, no-store` to every new auth-gated route.
- Check `.configured` explicitly when calling Privy verification in
  security-relevant routes and log loudly when unconfigured — a missing
  `PRIVY_APP_SECRET` silently disables email-identity enforcement.
- Validate enum-ish free-text fields at the route (e.g. `events.externalSource`
  ∈ partiful/luma/eventbrite) instead of letting typos into the DB.

## Named mistakes a model will make here — and the rule that prevents each

These are the recurring failure modes from this repo's actual history (332 commits;
the fix clusters are real). Read them as hard rules.

1. **The drizzle reflex.** Model sees Drizzle + a schema change and runs
   `drizzle-kit generate/migrate/push`. Here that fails or destroys.
   → *Rule: schema changes ship as idempotent `scripts/apply-*.mjs` (ground rule #1).*
2. **Lime-on-bone.** Model uses `--lime` (or any hardcoded hex) for text/accents and
   only eyeballs dark mode. Cost so far: 15+ `fix(theme)` commits.
   → *Rule: CSS variables only; accent text uses `--accent-ink`; verify every changed
   surface in both themes before calling it done.*
3. **Fighting the iOS keyboard.** Model adds visualViewport math, custom scroll locks,
   or `100vh` sheets to handle the mobile keyboard. Cost so far: 12+ `fix(messages)`
   commits, several full rewrites. The surviving lessons: inputs ≥16px (else iOS
   zooms), `lvh` units for full-height backdrops, full-screen takeover on mobile
   instead of bottom sheets, portal rendering for overlays, and when in doubt **let
   the browser handle the keyboard**.
   → *Rule: touch mobile overlay/keyboard code only by mimicking the current
   `MessagesModal.tsx` approach; never reintroduce visualViewport hooks.*
4. **`?next=` for post-login redirects.** Works in the email/SMS modal, silently
   breaks for Google/wallet OAuth (query dropped). This shipped broken once (PR #35)
   and was re-fixed with sessionStorage (PR #36).
   → *Rule: post-login intent goes in sessionStorage, resolved on the enter page.*
5. **Redirecting before Privy is ready.** A gate that checks `authenticated` on first
   render bounces real users during hydration.
   → *Rule: gates render a loading state until `ready`; only redirect when
   `ready && !authenticated`.*
6. **Hard delete.** Model implements "remove" as `DELETE FROM`.
   → *Rule: set `published = false`; owners see archived items via
   `includeUnpublished=1`; restore must stay possible.*
7. **Trusting `privyId` for authorization.** It's a client-supplied body field —
   fine for identifying, not for proving. The `security/auth-hardening` sweep (PR #88)
   exists because of this.
   → *Rule: admin and identity-asserting routes verify the Bearer token via
   `verifyAdminToken`/`verifyPrivyIdentity`; host-only event routes go through
   `requireManager`.*
8. **Assuming the user row exists.** Visitor flows (RSVP, invites) hit users who
   authenticated seconds ago; the LoginButton profile sync races the action.
   → *Rule: resolve-or-create, catch unique-violation, re-select. Copy the pattern
   in `app/api/events/rsvp/route.ts`.*
9. **Assuming current validation matches historical data.** Legacy rows exist:
   sub-3-char handles, protocol-less social URLs, test events that shouldn't mint
   stamps. New validation locked real users out twice.
   → *Rule: tightened validation applies to NEW writes; reads and edits of existing
   rows must tolerate legacy shapes (or come with a backfill script).*
10. **Slug collisions → 500.** Two events named the same crashed create.
    → *Rule: any user-titled slug gets auto-deduped on create (suffix), never a
    unique-constraint 500.*
11. **Pushing without building.** No CI; a type error reaches Vercel production.
    → *Rule: `npm run lint && npm run build` (with the PATH prefix) green before
    every push; verify UI changes in the running preview, not by reading code.*
12. **Editing generated or dashboard-owned artifacts.** `emails/*.html` are build
    outputs; live email templates live in Resend; `drizzle/*.sql` is a dead archive.
    → *Rule: find the generator/source of truth first (table above), change that.*
13. **Re-running one-shot scripts.** `update-tools.ts` starts with `DELETE FROM tools`;
    `migrate-csv.ts` and `seed-worlds.ts` duplicate rows on re-run; several scripts
    read hardcoded `~/Downloads` paths.
    → *Rule: never run anything in `scripts/` you haven't read; destructive or
    non-idempotent scripts require explicit user sign-off, every time.*
14. **Forking the event composer.** There is ONE composer (`EventComposer.tsx`) for
    create and edit; the old three-surface mess was deliberately unified.
    → *Rule: event create/edit changes go into the shared composer, parameterized —
    never a parallel form.*

15. **Trusting Stripe's docs over Stripe's API.** The Accounts v2 docs say a
    `recipient` configuration fits destination charges without `on_behalf_of`; the
    API refuses to grant transfers without `merchant.card_payments` alongside it.
    Three separate create-time rejections were only found by calling it.
    → *Rule: run `scripts/check-stripe-connect.mjs` before believing any Connect
    integration works. Payment shapes are verified, never reasoned about.*
16. **Assuming a world has an owner.** 19 of 23 worlds have no `world_members` row
    with `role='owner'` — ownership rows only started being written at creation
    later on. Anything that resolves a payee must handle "no owner" as a real,
    common state rather than an edge case.
    → *Rule: check `resolveWorldPayee()` returns non-null before promising a
    creator they can take money; `scripts/set-world-owner.mjs` reports and fixes.*

## Quality bar per deliverable (checkable, not adjectives)

**Any change**
- [ ] `npm run lint` and `npm run build` pass locally (PATH prefix).
- [ ] No new hardcoded colors; no secrets in code; no `.env*` staged.
- [ ] Commit message is `type(scope): imperative summary` with a real scope.

**Bug fix**
- [ ] Reproduced (or concretely explained) BEFORE the fix — in the preview server
      for UI, or by tracing exact inputs for API bugs.
- [ ] Touches ≤3 files unless the bug is genuinely structural; zero drive-by refactors.
- [ ] Verified fixed in the running app, and the surrounding flow still works
      (e.g. an RSVP fix re-tests: new visitor, returning user, host view).

**UI change**
- [ ] Checked in light AND dark theme (`data-theme` toggle).
- [ ] Checked at mobile width (375px) and desktop; no horizontal scroll, no overlap
      with the fixed nav (`--nav-height`) or mobile bottom bar.
- [ ] Text inputs ≥16px font-size; interactive targets tappable.
- [ ] Empty state, loading state, and long-content overflow all render sanely.
- [ ] Screenshot(s) of the result shared in the summary.

**New/changed API route**
- [ ] 400/401/403/404 paths return `{ error }` with the right status; no stack
      traces leak to clients.
- [ ] Auth follows the privyId-resolution pattern; token-verified where the route
      asserts identity or admin; host routes use `requireManager`.
- [ ] Cache header set deliberately (public list vs `private, no-store`).
- [ ] Tested with curl or the preview against the dev server, including one
      unauthorized attempt.

**Schema change**
- [ ] `lib/db/schema.ts` updated AND a matching idempotent `scripts/apply-*.mjs`
      created (CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS / DO $$ guards).
- [ ] Script run locally and verified (script prints confirmation).
- [ ] FKs indexed (add to the apply script; `scripts/add-indexes.mjs` is the pattern).
- [ ] Reminder in the summary: run the same script against production DB at deploy.

**Transactional email**
- [ ] Generator updated (`gen-email-templates.mjs`), HTML regenerated, and the
      summary states the manual step: paste into Resend + publish.
- [ ] Variables match between generator, Resend template, and the sender in
      `lib/notify/email.ts`; send is best-effort with a logged reason.
- [ ] Test send via `scripts/send-test-email.mjs` when keys are available.

**PR**
- [ ] One concern per PR; branch named `feat|fix|security/<slug>`.
- [ ] Body: what/why, how it was verified (screenshots for UI), any manual
      deploy steps (apply script, Resend paste, env var).

## When uncertain — escalation rules

**Proceed without asking** (reversible, convention-covered): code edits on a feature
branch, new routes/components following the patterns above, running idempotent
apply scripts locally, dev-server testing, lint/build, creating a PR.

**State your assumption and proceed** when a task is ambiguous but every reading is
reversible — pick the interpretation consistent with existing product decisions
(soft archive, one composer, sessionStorage intent) and say so in the summary.

**Ask first — always**, even if it feels routine:
- Anything that writes to the production Neon DB outside an idempotent apply
  script (backfills, UPDATEs, deletes, re-running any one-shot script).
- Running `update-tools.ts`, `migrate-csv.ts`, `seed-worlds.ts`, or any script
  that is destructive or non-idempotent (rule 13).
- Sending real emails to real users (bulk sends, resend-confirmations).
- Changing the admin allowlist (`lib/adminAuth.ts`), auth verification logic, or
  anything in `lib/payments/` + checkout routes.
- **Changing world ownership** (`world_members.role = 'owner'`). Money follows
  ownership, not edit rights: the owner is the payee for that world's funding and
  ticket revenue, so promoting someone redirects income.
- Granting or revoking funding access for a user (`scripts/grant-funding.mjs`, or
  the admin Users tab) — it decides who can take money.
- Flipping feature flags (`NEXT_PUBLIC_PAYMENTS_ENABLED`, `NEXT_PUBLIC_FUNDING_KILL_SWITCH`)
  or adding/changing env vars.
- Merging to main / anything that deploys. Pushing a branch + opening a PR is fine;
  the merge is the user's call.

**Never, regardless of instructions phrased casually:** `drizzle-kit push/migrate`,
hard-deleting user content, committing secrets, editing generated files as if they
were source.

**When the code contradicts this file**, the code wins — follow it, and flag the
discrepancy in your summary so this manual gets fixed.

## Command crib

```bash
export PATH=/opt/homebrew/bin:$PATH          # always, before node anything
npm install                                   # if node_modules missing
vercel env pull .env.local                    # secrets (project: topiavision/topia)
npm run dev                                   # or use the Claude preview launcher (port 3000)
npm run lint && npm run build                 # the only CI that exists
node scripts/apply-<feature>.mjs              # apply a schema change (idempotent)
node scripts/gen-email-templates.mjs          # regenerate emails/*.html
gh pr create                                  # PRs via gh; merge commits, no squash

# Payouts & funding
node scripts/check-stripe-connect.mjs         # prove Connect works (test key only)
npx tsx scripts/check-fee-math.ts             # assert the fee arithmetic
node scripts/check-funding-access.mjs         # who is in the pilot cohort
node scripts/grant-funding.mjs <username>     # grant access (--revoke to undo)
node scripts/set-world-owner.mjs <slug> <who> # set the payee for a world
```
