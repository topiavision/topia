// Transactional event email — sends via Resend *Templates*. The copy/subject/
// design lives in the Resend dashboard; our code only triggers a template by id
// and passes variables. Dependency-free (plain fetch) and env-gated: dormant
// until RESEND_API_KEY is set, then auto-on. Mirrors lib/notify/invites.ts.
//
// Create these templates in Resend (Dashboard → Templates) and PUBLISH them.
// Variables use triple-brace syntax in the template, e.g. {{{EVENT_NAME}}}.
//
//   event-invite          → EVENT_NAME, EVENT_URL, INVITER_NAME
//   event-rsvp-confirmed   → EVENT_NAME, EVENT_URL, GUEST_NAME, EVENT_WHEN, EVENT_WHERE   (instant RSVP, profile complete)
//   event-rsvp-confirmed-setup → + PROFILE_URL   (instant RSVP, no handle yet — nudge to finish profile)
//   event-rsvp-requested   → EVENT_NAME, EVENT_URL, GUEST_NAME   (approval on)
//   event-rsvp-approved    → EVENT_NAME, EVENT_URL, GUEST_NAME
//   event-rsvp-declined    → EVENT_NAME, EVENT_URL, GUEST_NAME
//   event-host-rsvp-alert  → EVENT_NAME, MANAGE_URL, GUEST_NAME, STATUS
//   event-ticket-confirmed → EVENT_NAME, EVENT_URL, GUEST_NAME, TICKET_COUNT_LABEL, ORDER_TOTAL   (paid ticket order)
//   complete-your-profile  → USER_NAME, PROFILE_URL   (new-signup nudge)
//
// Template ids default to the slugs above but can be overridden per-env so you
// can rename in Resend without a code change.

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const RESEND_BATCH_ENDPOINT = 'https://api.resend.com/emails/batch';

export const EVENT_TEMPLATES = {
  invite:        process.env.RESEND_TPL_EVENT_INVITE        || 'event-invite',
  rsvpConfirmed: process.env.RESEND_TPL_RSVP_CONFIRMED      || 'event-rsvp-confirmed',
  rsvpConfirmedSetup: process.env.RESEND_TPL_RSVP_CONFIRMED_SETUP || 'event-rsvp-confirmed-setup',
  rsvpRequested: process.env.RESEND_TPL_RSVP_REQUESTED      || 'event-rsvp-requested',
  rsvpApproved:  process.env.RESEND_TPL_RSVP_APPROVED       || 'event-rsvp-approved',
  rsvpDeclined:  process.env.RESEND_TPL_RSVP_DECLINED       || 'event-rsvp-declined',
  hostAlert:     process.env.RESEND_TPL_HOST_RSVP_ALERT     || 'event-host-rsvp-alert',
  ticketConfirmed: process.env.RESEND_TPL_TICKET_CONFIRMED  || 'event-ticket-confirmed',
  completeProfile: process.env.RESEND_TPL_COMPLETE_PROFILE  || 'complete-your-profile',
  passportComplete: process.env.RESEND_TPL_PASSPORT_COMPLETE || 'passport-complete',
} as const;

// The live passport-card image for a user. Accepts a username or, before one is
// set, the user id — the card route resolves either. Brand host is the rendering
// origin so the image loads on whatever deployment sent the mail.
function cardUrl(origin: string, handle: string): string {
  return `${origin}/api/profile/${encodeURIComponent(handle)}/card`;
}

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

type Vars = Record<string, string | number>;

// Core sender: renders a dashboard template by id with the given variables.
// Best-effort — returns a reason instead of throwing so callers never break.
export async function sendTemplateEmail(opts: { to: string; templateId: string; variables: Vars }): Promise<{ sent: boolean; reason?: string }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { sent: false, reason: 'not_configured' };
  if (!opts.to) return { sent: false, reason: 'no_recipient' };
  const from = process.env.INVITE_EMAIL_FROM || 'Topia <onboarding@resend.dev>';
  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: opts.to, template: { id: opts.templateId, variables: opts.variables } }),
    });
    return res.ok ? { sent: true } : { sent: false, reason: `resend_${res.status}` };
  } catch {
    return { sent: false, reason: 'resend_error' };
  }
}

function eventUrl(origin: string, slug: string): string {
  return `${origin}/events/${slug}`;
}

// ── Bulk send (rate-limit safe) ───────────────────────────────────────────
// Resend caps requests at ~2/sec, so one-request-per-recipient blows the limit
// on any real blast. The Batch API sends up to 100 *individually-addressed*
// emails in ONE request; we chunk into 100s, throttle between chunks to stay
// under the rate limit, and back off on a 429 (honoring Retry-After). Each
// recipient still gets their own email (personalized; no shared To: header).
const RESEND_BATCH_SIZE = 100;
const RESEND_THROTTLE_MS = 600;   // < 2 req/sec
const RESEND_MAX_RETRIES = 4;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export interface BulkResult { sent: number; failed: number; total: number; errors: string[] }

export async function sendBulkEmails(
  messages: { to: string; subject: string; html: string }[],
  onProgress?: (done: number, total: number) => void,
): Promise<BulkResult> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.INVITE_EMAIL_FROM || 'Topia <onboarding@resend.dev>';
  const total = messages.length;
  if (!key) return { sent: 0, failed: total, total, errors: ['not_configured'] };
  if (total === 0) return { sent: 0, failed: 0, total: 0, errors: [] };

  let sent = 0;
  let failed = 0;
  const errors: string[] = [];

  for (let start = 0; start < total; start += RESEND_BATCH_SIZE) {
    const chunk = messages.slice(start, start + RESEND_BATCH_SIZE);
    const payload = chunk.map((m) => ({ from, to: m.to, subject: m.subject, html: m.html }));

    for (let attempt = 0; ; attempt++) {
      let res: Response;
      try {
        res = await fetch(RESEND_BATCH_ENDPOINT, {
          method: 'POST',
          headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } catch {
        failed += chunk.length;
        errors.push(`network_error@${start}`);
        break;
      }
      if (res.ok) { sent += chunk.length; break; }
      // Rate limited — wait out the window and retry the same chunk.
      if (res.status === 429 && attempt < RESEND_MAX_RETRIES) {
        const ra = Number(res.headers.get('retry-after'));
        const wait = Number.isFinite(ra) && ra > 0 ? ra * 1000 : RESEND_THROTTLE_MS * 2 ** attempt;
        await sleep(wait);
        continue;
      }
      failed += chunk.length;
      errors.push(`resend_${res.status}@${start}`);
      break;
    }

    onProgress?.(Math.min(start + RESEND_BATCH_SIZE, total), total);
    if (start + RESEND_BATCH_SIZE < total) await sleep(RESEND_THROTTLE_MS); // pace the next request
  }

  return { sent, failed, total, errors };
}

// Send pre-rendered HTML (used by the admin email sender, where the preview is
// the source of truth). Best-effort; returns a reason instead of throwing.
export async function sendRawEmail(opts: { to: string; subject: string; html: string }): Promise<{ sent: boolean; reason?: string }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { sent: false, reason: 'not_configured' };
  if (!opts.to) return { sent: false, reason: 'no_recipient' };
  const from = process.env.INVITE_EMAIL_FROM || 'Topia <onboarding@resend.dev>';
  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: opts.to, subject: opts.subject, html: opts.html }),
    });
    return res.ok ? { sent: true } : { sent: false, reason: `resend_${res.status}` };
  } catch {
    return { sent: false, reason: 'resend_error' };
  }
}

// Build human-readable "when" and "where" lines for email bodies from the raw
// event fields. Returns friendly fallbacks (never empty) so templates can render
// the rows unconditionally.
export interface EventScheduleFields {
  date?: string | null;
  dateIso?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  timezone?: string | null;
  city?: string | null;
  address?: string | null;
}

export function formatEventSchedule(ev: EventScheduleFields): { when: string; where: string } {
  // Date — prefer the sortable ISO (parsed as UTC to avoid an off-by-one day),
  // else fall back to the stored display string.
  let date = '';
  if (ev.dateIso) {
    const d = new Date(`${ev.dateIso}T00:00:00Z`);
    if (!Number.isNaN(d.getTime())) {
      date = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' }).format(d);
    }
  }
  if (!date && ev.date) date = ev.date;

  // Time — "1:00 PM – 5:00 PM PT" (short tz label when we can derive one).
  let time = '';
  if (ev.startTime) {
    time = ev.endTime ? `${ev.startTime} – ${ev.endTime}` : ev.startTime;
    if (ev.timezone) {
      try {
        const tz = new Intl.DateTimeFormat('en-US', { timeZone: ev.timezone, timeZoneName: 'short' })
          .formatToParts(new Date())
          .find((p) => p.type === 'timeZoneName')?.value;
        if (tz) time += ` ${tz}`;
      } catch { /* unknown tz — skip the label */ }
    }
  }

  const when = [date, time].filter(Boolean).join(' · ') || 'Date to be announced';
  const where = [ev.address, ev.city].filter(Boolean).join(' · ') || 'Location to be announced';
  return { when, where };
}

// ── Per-touchpoint senders ────────────────────────────────────────────────
// (Invites send via sendTemplateEmail directly from lib/notify/invites.ts so
//  they can pass their tokenized accept URL as EVENT_URL.)

// Guest confirmation right after they register. Three shapes:
//   • approval on        → "request received"            (rsvpRequested)
//   • confirmed, profile complete  → standard confirmation (rsvpConfirmed)
//   • confirmed, no handle yet     → confirmation + nudge to finish their
//                                    profile               (rsvpConfirmedSetup)
export function sendRsvpConfirmation(opts: {
  to: string; eventName: string; origin: string; slug: string;
  guestName?: string | null; approvalRequired: boolean;
  profileComplete?: boolean; eventWhen?: string | null; eventWhere?: string | null;
  username?: string | null; userId?: string | null;
}) {
  const templateId = opts.approvalRequired
    ? EVENT_TEMPLATES.rsvpRequested
    : opts.profileComplete
      ? EVENT_TEMPLATES.rsvpConfirmed
      : EVENT_TEMPLATES.rsvpConfirmedSetup;
  // The confirmed variants show the passport with the event seal stamped on it
  // (keyed by username, else user id). The "request received" variant has no card.
  const handle = opts.username || opts.userId || '';
  return sendTemplateEmail({
    to: opts.to,
    templateId,
    variables: {
      EVENT_NAME: opts.eventName,
      EVENT_URL: eventUrl(opts.origin, opts.slug),
      GUEST_NAME: opts.guestName || 'there',
      EVENT_WHEN: opts.eventWhen || 'Date to be announced',
      EVENT_WHERE: opts.eventWhere || 'Location to be announced',
      PROFILE_URL: `${opts.origin}/onboarding`,
      CARD_URL: handle ? `${cardUrl(opts.origin, handle)}?stamp=${encodeURIComponent(opts.slug)}` : '',
    },
  });
}

// Ticket purchase confirmation — fired once per order when it flips to paid
// (card via Stripe, or a free/fully-discounted claim). totalCents is what was
// actually charged after any promo discount.
// The claim card injected into guest ticket confirmations ({{{CLAIM_BLOCK}}}
// in the template — members get an empty string). Mirrors the generator's
// secondaryNudge; keep the two in step (scripts/gen-email-templates.mjs).
function claimBlockHtml(profileUrl: string): string {
  return `
          <tr>
            <td style="padding:24px 32px 0 32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid rgba(136,136,136,0.25);border-radius:12px;">
                <tr>
                  <td style="padding:18px 20px;font-family:Arial,Helvetica,sans-serif;">
                    <div style="padding-bottom:8px;font-weight:bold;font-size:13px;letter-spacing:1px;text-transform:uppercase;color:inherit;">Confirm your account</div>
                    <div style="font-size:14px;line-height:1.5;color:#888888;padding-bottom:14px;">Your ticket is tied to this email. Claim your Topia profile with it — the ticket, your pass at the door, and your first stamps are already yours.</div>
                    <a href="${profileUrl}" target="_blank" style="display:inline-block;padding:11px 22px;font-family:Arial,Helvetica,sans-serif;font-weight:bold;font-size:13px;letter-spacing:1px;text-transform:uppercase;color:inherit;text-decoration:none;border:1px solid rgba(136,136,136,0.45);border-radius:8px;">Claim your profile &rarr;</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>`;
}

export function sendTicketConfirmation(opts: {
  to: string; eventName: string; origin: string; slug: string;
  ticketCount: number; totalCents: number; guestName?: string | null;
  /** Buyer has no Privy account yet — the email carries the claim card. */
  guest?: boolean;
}) {
  return sendTemplateEmail({
    to: opts.to,
    templateId: EVENT_TEMPLATES.ticketConfirmed,
    variables: {
      EVENT_NAME: opts.eventName,
      EVENT_URL: eventUrl(opts.origin, opts.slug),
      GUEST_NAME: opts.guestName || 'there',
      TICKET_COUNT_LABEL: `${opts.ticketCount} ticket${opts.ticketCount === 1 ? '' : 's'}`,
      ORDER_TOTAL: opts.totalCents === 0 ? 'Free' : `$${(opts.totalCents / 100).toFixed(2)}`,
      CLAIM_BLOCK: opts.guest ? claimBlockHtml(`${opts.origin}/onboarding`) : '',
    },
  });
}

// Host approves or declines a pending request.
export function sendRsvpDecision(opts: { to: string; eventName: string; origin: string; slug: string; guestName?: string | null; approved: boolean; eventWhen?: string | null; eventWhere?: string | null }) {
  return sendTemplateEmail({
    to: opts.to,
    templateId: opts.approved ? EVENT_TEMPLATES.rsvpApproved : EVENT_TEMPLATES.rsvpDeclined,
    variables: {
      EVENT_NAME: opts.eventName,
      EVENT_URL: eventUrl(opts.origin, opts.slug),
      GUEST_NAME: opts.guestName || 'there',
      EVENT_WHEN: opts.eventWhen || 'Date to be announced',
      EVENT_WHERE: opts.eventWhere || 'Location to be announced',
    },
  });
}

// Account: nudge a brand-new user to finish their profile / onboarding.
// Fires once at signup; only send when the new account has an email on file.
// Embeds the user's passport-so-far card (keyed by username, else user id).
export function sendCompleteProfile(opts: { to: string; userName?: string | null; origin: string; username?: string | null; userId?: string | null }) {
  const handle = opts.username || opts.userId || '';
  return sendTemplateEmail({
    to: opts.to,
    templateId: EVENT_TEMPLATES.completeProfile,
    variables: {
      USER_NAME: opts.userName || 'there',
      PROFILE_URL: `${opts.origin}/onboarding`,
      CARD_URL: handle ? cardUrl(opts.origin, handle) : '',
    },
  });
}

// Account: celebrate a finished profile and prompt the user to share their
// passport. Requires a username (the public profile + card both key off it).
export function sendPassportComplete(opts: { to: string; userName?: string | null; username: string; origin: string }) {
  const card = cardUrl(opts.origin, opts.username);
  return sendTemplateEmail({
    to: opts.to,
    templateId: EVENT_TEMPLATES.passportComplete,
    variables: {
      USER_NAME: opts.userName || 'there',
      USERNAME: opts.username,
      CARD_URL: card,
      SHARE_URL: `${opts.origin}/@${opts.username}`,
      STORY_URL: `${card}?format=story`,
    },
  });
}

// Host alert when someone RSVPs / requests to join.
export function sendHostRsvpAlert(opts: { to: string; eventName: string; origin: string; slug: string; guestName?: string | null; pending: boolean; eventWhen?: string | null; eventWhere?: string | null }) {
  return sendTemplateEmail({
    to: opts.to,
    templateId: EVENT_TEMPLATES.hostAlert,
    variables: {
      EVENT_NAME: opts.eventName,
      MANAGE_URL: `${opts.origin}/events/${opts.slug}/manage`,
      GUEST_NAME: opts.guestName || 'Someone',
      STATUS: opts.pending ? 'request' : 'rsvp',
      EVENT_WHEN: opts.eventWhen || 'Date to be announced',
      EVENT_WHERE: opts.eventWhere || 'Location to be announced',
    },
  });
}
