// Generates the Resend email template HTML into emails/*.html from one shared
// shell, so the logo / footer / styling stay identical across every template.
// These files are the source of truth — paste each into the matching Resend
// template (the template id = the file name). Variables use {{{VAR}}}.
//
//   node scripts/gen-email-templates.mjs

import { mkdirSync, writeFileSync } from 'node:fs';

const LOGO = 'https://topia.vision/brand/email-logo.png';

const pad = '&#8204;'.repeat(20);
const hl = (t, big = false) =>
  `<span style="display:inline-block;background:#e4fe52;color:#000000;padding:${big ? '4px 8px' : '3px 7px'};font-family:Arial,Helvetica,sans-serif;font-size:${big ? '11px' : '10px'};font-weight:bold;letter-spacing:${big ? '3px' : '2px'};text-transform:uppercase;">${t}</span>`;

function whenWhereBlock() {
  return `
          <tr>
            <td style="padding:24px 32px 0 32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-family:Arial,Helvetica,sans-serif;">
                <tr><td style="padding:0 0 6px 0;">${hl('When')}</td></tr>
                <tr><td style="padding:0 0 16px 0;font-size:15px;line-height:1.4;">{{{EVENT_WHEN}}}</td></tr>
                <tr><td style="padding:0 0 6px 0;">${hl('Where')}</td></tr>
                <tr><td style="padding:0;font-size:15px;line-height:1.4;">{{{EVENT_WHERE}}}</td></tr>
              </table>
            </td>
          </tr>`;
}

function primaryButton(label, urlVar) {
  return `
          <tr>
            <td style="padding:28px 32px 0 32px;">
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" bgcolor="#e4fe52" style="border-radius:8px;">
                    <a href="{{{${urlVar}}}}" target="_blank" style="display:inline-block;padding:14px 28px;font-family:Arial,Helvetica,sans-serif;font-weight:bold;font-size:14px;letter-spacing:1px;text-transform:uppercase;color:#000000;text-decoration:none;border-radius:8px;">${label}</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>`;
}

function secondaryNudge() {
  return `
          <tr>
            <td style="padding:24px 32px 0 32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid rgba(136,136,136,0.25);border-radius:12px;">
                <tr>
                  <td style="padding:18px 20px;font-family:Arial,Helvetica,sans-serif;">
                    <div style="padding-bottom:8px;">${hl('Make it yours')}</div>
                    <div style="font-size:14px;line-height:1.5;color:#888888;padding-bottom:14px;">Your spot is saved to this email. Claim your Topia profile with it — this RSVP comes along, your pass is ready at the door, and your passport starts collecting stamps the moment you show up.</div>
                    <a href="{{{PROFILE_URL}}}" target="_blank" style="display:inline-block;padding:11px 22px;font-family:Arial,Helvetica,sans-serif;font-weight:bold;font-size:13px;letter-spacing:1px;text-transform:uppercase;color:inherit;text-decoration:none;border:1px solid rgba(136,136,136,0.45);border-radius:8px;">Claim your profile &rarr;</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>`;
}

// A light explainer card placed after the CTA (e.g. what the passport is).
function infoBlock(label, body) {
  return `
          <tr>
            <td style="padding:22px 32px 0 32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid rgba(136,136,136,0.25);border-radius:12px;">
                <tr>
                  <td style="padding:18px 20px;font-family:Arial,Helvetica,sans-serif;">
                    <div style="padding-bottom:8px;">${hl(label)}</div>
                    <div style="font-size:14px;line-height:1.5;color:#888888;">${body}</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>`;
}

function fallbackLink(urlVar) {
  return `
          <tr>
            <td style="padding:18px 32px 0 32px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:#888888;">
              Or paste this link into your browser:<br>
              <a href="{{{${urlVar}}}}" target="_blank" style="color:inherit;word-break:break-all;text-decoration:underline;">{{{${urlVar}}}}</a>
            </td>
          </tr>`;
}

// The user's passport with the event seal stamped on (RSVP confirmation).
function stampCardBlock() {
  return `
          <tr>
            <td style="padding:24px 32px 0 32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid rgba(136,136,136,0.25);border-radius:12px;">
                <tr>
                  <td align="center" style="padding:22px 20px 26px 20px;font-family:Arial,Helvetica,sans-serif;">
                    <div style="padding-bottom:10px;">${hl('New stamp earned')}</div>
                    <div style="font-size:13px;line-height:1.5;color:#888888;padding-bottom:18px;">This RSVP just stamped your passport.</div>
                    <img src="{{{CARD_URL}}}" width="240" alt="Your Topia passport" style="display:block;margin:0 auto;width:240px;max-width:100%;height:auto;border:0;">
                  </td>
                </tr>
              </table>
            </td>
          </tr>`;
}

// c = { title, preheader, lede, intro, headline, note, whenWhere, primary:{label,url},
//       secondary:bool, info:{label,body}, fallbackUrl }
function shell(c) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${c.title}</title>
</head>
<body style="margin:0;padding:0;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;font-size:1px;line-height:1px;">
    ${c.preheader}
    ${pad}
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;border:1px solid rgba(136,136,136,0.25);border-radius:16px;">

          <tr>
            <td style="padding:28px 32px 0 32px;">
              <img src="${LOGO}" width="48" height="48" alt="Topia" style="display:block;width:48px;height:48px;border:0;border-radius:12px;">
            </td>
          </tr>

          <tr><td style="padding:22px 32px 0 32px;">${hl(c.lede, true)}</td></tr>

          <tr>
            <td style="padding:14px 32px 0 32px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#888888;">
              ${c.intro}
            </td>
          </tr>
          <tr>
            <td style="padding:6px 32px 0 32px;font-family:Arial,Helvetica,sans-serif;font-weight:900;font-size:28px;line-height:1.1;text-transform:uppercase;">
              ${c.headline}
            </td>
          </tr>${c.note ? `
          <tr>
            <td style="padding:10px 32px 0 32px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#888888;">
              ${c.note}
            </td>
          </tr>` : ''}${c.whenWhere ? whenWhereBlock() : ''}${c.card ? stampCardBlock() : ''}${primaryButton(c.primary.label, c.primary.url)}${c.secondary ? secondaryNudge() : ''}${c.claimSlot ? '{{{CLAIM_BLOCK}}}' : ''}${c.info ? infoBlock(c.info.label, c.info.body) : ''}${c.fallbackUrl ? fallbackLink(c.fallbackUrl) : ''}

          <tr>
            <td style="padding:28px 32px 0 32px;">
              <div style="height:1px;background:rgba(136,136,136,0.25);line-height:1px;font-size:1px;">&nbsp;</div>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px 28px 32px;font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#888888;">
              Culture first. Systems second. Ownership always.<br>
              &copy; TOPIA VISION HOLDINGS LLC
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;
}

const T = {
  'event-invite': {
    title: "You're invited", preheader: 'See the details and RSVP &rarr;',
    lede: "You're invited",
    intro: '<strong style="color:inherit;">{{{INVITER_NAME}}}</strong> invited you to',
    headline: '{{{EVENT_NAME}}}', whenWhere: true,
    primary: { label: 'View invitation &rarr;', url: 'EVENT_URL' }, fallbackUrl: 'EVENT_URL',
  },
  'event-rsvp-confirmed': {
    title: "You're going", preheader: "You're on the list. See you there &rarr;",
    lede: "You're going",
    intro: "<strong style=\"color:inherit;\">{{{GUEST_NAME}}}</strong>, you're confirmed for",
    headline: '{{{EVENT_NAME}}}', whenWhere: true, card: true,
    primary: { label: 'View event &rarr;', url: 'EVENT_URL' }, fallbackUrl: 'EVENT_URL',
  },
  'event-rsvp-confirmed-setup': {
    title: "You're going", preheader: "You're in — now claim your Topia profile &rarr;",
    lede: "You're going",
    intro: "<strong style=\"color:inherit;\">{{{GUEST_NAME}}}</strong>, you're confirmed for",
    headline: '{{{EVENT_NAME}}}', whenWhere: true, card: true,
    primary: { label: 'View event &rarr;', url: 'EVENT_URL' }, secondary: true, fallbackUrl: 'EVENT_URL',
  },
  'event-rsvp-requested': {
    title: 'Request received', preheader: "Request received — we'll let you know &rarr;",
    lede: 'Request received',
    intro: 'Thanks <strong style="color:inherit;">{{{GUEST_NAME}}}</strong> — your request to join',
    headline: '{{{EVENT_NAME}}}',
    note: "is pending the host's approval. We'll email you the moment it's confirmed.",
    whenWhere: true, primary: { label: 'View event &rarr;', url: 'EVENT_URL' }, fallbackUrl: 'EVENT_URL',
  },
  'event-rsvp-approved': {
    title: "You're approved", preheader: "You're approved — you're going &rarr;",
    lede: "You're approved",
    intro: '<strong style="color:inherit;">{{{GUEST_NAME}}}</strong>, the host confirmed your spot for',
    headline: '{{{EVENT_NAME}}}', whenWhere: true,
    primary: { label: 'View event &rarr;', url: 'EVENT_URL' }, fallbackUrl: 'EVENT_URL',
  },
  'event-rsvp-declined': {
    title: 'An update on your request', preheader: 'An update on your request',
    lede: 'Update',
    intro: 'Thanks for your interest, <strong style="color:inherit;">{{{GUEST_NAME}}}</strong>. The host wasn’t able to confirm your spot for',
    headline: '{{{EVENT_NAME}}}',
    note: "this time — keep an eye out, there's always more happening on Topia.",
    whenWhere: false, primary: { label: 'View event &rarr;', url: 'EVENT_URL' }, fallbackUrl: 'EVENT_URL',
  },
  'event-ticket-confirmed': {
    title: "You're in", preheader: 'Ticket confirmed. See you there &rarr;',
    lede: 'Ticket confirmed',
    intro: "<strong style=\"color:inherit;\">{{{GUEST_NAME}}}</strong>, you're confirmed for",
    headline: '{{{EVENT_NAME}}}', whenWhere: false,
    primary: { label: 'View event &rarr;', url: 'EVENT_URL' }, claimSlot: true,
    info: { label: 'Your order', body: '{{{TICKET_COUNT_LABEL}}} &middot; {{{ORDER_TOTAL}}}' },
    fallbackUrl: 'EVENT_URL',
  },
  'event-host-rsvp-alert': {
    title: 'New activity on your event', preheader: '{{{GUEST_NAME}}} · {{{EVENT_NAME}}}',
    lede: 'New {{{STATUS}}}',
    intro: '<strong style="color:inherit;">{{{GUEST_NAME}}}</strong> sent a {{{STATUS}}} for',
    headline: '{{{EVENT_NAME}}}', whenWhere: true,
    primary: { label: 'Manage event &rarr;', url: 'MANAGE_URL' }, fallbackUrl: 'MANAGE_URL',
  },
  // NOTE: complete-your-profile and passport-complete are intentionally NOT
  // generated here — they embed the live passport-card image and bypass the
  // shell. They're authored as literals in lib/notify/emailTemplates.ts; run
  // `tsx` against getTemplate(id).html to refresh emails/<id>.html.
};

mkdirSync(new URL('../emails/', import.meta.url), { recursive: true });
for (const [id, cfg] of Object.entries(T)) {
  writeFileSync(new URL(`../emails/${id}.html`, import.meta.url), shell(cfg));
  console.log(`✓ emails/${id}.html`);
}
