// Canonical source for the transactional email HTML — used by the admin email
// sender (preview + WYSIWYG send) and kept in sync with emails/*.html (which are
// pasted into Resend for the automatic transactional sends).
//
// Each template's body uses {{{VARIABLE}}} placeholders; renderTemplate fills them.

const LOGO = 'https://topia.vision/brand/email-logo.png';

const hl = (t: string, big = false) =>
  `<span style="display:inline-block;background:#e4fe52;color:#000000;padding:${big ? '4px 8px' : '3px 7px'};font-family:Arial,Helvetica,sans-serif;font-size:${big ? '11px' : '10px'};font-weight:bold;letter-spacing:${big ? '3px' : '2px'};text-transform:uppercase;">${t}</span>`;

function whenWhereBlock(): string {
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

function primaryButton(label: string, urlVar: string): string {
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

function secondaryNudge(): string {
  return `
          <tr>
            <td style="padding:24px 32px 0 32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid rgba(136,136,136,0.25);border-radius:12px;">
                <tr>
                  <td style="padding:18px 20px;font-family:Arial,Helvetica,sans-serif;">
                    <div style="padding-bottom:8px;">${hl('Finish setup')}</div>
                    <div style="font-size:14px;line-height:1.5;color:#888888;padding-bottom:14px;">You're in. Claim your Topia profile — pick a username and add a photo. It's how you show up across the network, and your passport starts collecting stamps from here.</div>
                    <a href="{{{PROFILE_URL}}}" target="_blank" style="display:inline-block;padding:11px 22px;font-family:Arial,Helvetica,sans-serif;font-weight:bold;font-size:13px;letter-spacing:1px;text-transform:uppercase;color:inherit;text-decoration:none;border:1px solid rgba(136,136,136,0.45);border-radius:8px;">Claim your profile &rarr;</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>`;
}

// A light explainer card placed after the CTA (e.g. what the passport is).
function infoBlock(label: string, body: string): string {
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

function fallbackLink(urlVar: string): string {
  return `
          <tr>
            <td style="padding:18px 32px 0 32px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:#888888;">
              Or paste this link into your browser:<br>
              <a href="{{{${urlVar}}}}" target="_blank" style="color:inherit;word-break:break-all;text-decoration:underline;">{{{${urlVar}}}}</a>
            </td>
          </tr>`;
}

// The user's passport with the event seal stamped on — shown after the event
// details on an RSVP confirmation. CARD_URL points at the stamped card image.
function stampCardBlock(): string {
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

interface ShellConfig {
  title: string;
  preheader: string;
  lede: string;
  intro: string;
  headline: string;
  note?: string;
  whenWhere?: boolean;
  card?: boolean;
  primary: { label: string; url: string };
  secondary?: boolean;
  info?: { label: string; body: string };
  fallbackUrl?: string;
}

function shell(c: ShellConfig): string {
  const pad = '&#8204;'.repeat(20);
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
          </tr>` : ''}${c.whenWhere ? whenWhereBlock() : ''}${c.card ? stampCardBlock() : ''}${primaryButton(c.primary.label, c.primary.url)}${c.secondary ? secondaryNudge() : ''}${c.info ? infoBlock(c.info.label, c.info.body) : ''}${c.fallbackUrl ? fallbackLink(c.fallbackUrl) : ''}
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
</html>`;
}

export type TemplateScope = 'event' | 'profile';

export interface EmailTemplate {
  id: string;
  label: string;
  subject: string;
  scope: TemplateScope;
  variables: string[];
  html: string;
}

interface TemplateDef extends Omit<EmailTemplate, 'html'> {
  shell?: ShellConfig;
  // Hand-authored HTML that bypasses the shell builder (kept in sync with the
  // matching emails/<id>.html pasted into Resend).
  html?: string;
}

// A self-contained, dynamic passport-card image for the given username/id. The
// route at /api/profile/<handle>/card renders the live card (avatar, path,
// roles, issue year) — embedding it keeps these emails in sync with the profile.
function cardImage(width: number): string {
  return `
          <tr>
            <td align="center" style="padding:22px 32px 0 32px;">
              <img src="{{{CARD_URL}}}" width="${width}" alt="{{{USER_NAME}}}'s Topia passport" style="display:block;width:${width}px;max-width:100%;height:auto;border:0;border-radius:14px;">
            </td>
          </tr>`;
}

// complete-your-profile is hand-authored (it embeds the live passport card and
// bypasses the shell). Keep this byte-identical to emails/complete-your-profile.html.
const COMPLETE_PROFILE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>Finish your TOPIA passport</title>
</head>
<body style="margin:0;padding:0;background-color:#ffffff;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;font-size:1px;line-height:1px;">
    Here's your passport so far — finish it &rarr;
    &#8204;&#8204;&#8204;&#8204;&#8204;&#8204;&#8204;&#8204;&#8204;&#8204;
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
          <tr><td style="padding:22px 32px 0 32px;">${hl('Your passport so far', true)}</td></tr>
          <tr>
            <td style="padding:14px 32px 0 32px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#888888;">
              Hey <strong style="color:#000000;">{{{USER_NAME}}}</strong> &#128075;
            </td>
          </tr>
          <tr>
            <td style="padding:6px 32px 0 32px;font-family:Arial,Helvetica,sans-serif;font-weight:900;font-size:28px;line-height:1.1;text-transform:uppercase;">
              Finish your passport
            </td>
          </tr>${cardImage(240)}
          <tr>
            <td style="padding:18px 32px 0 32px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#888888;">
              This is your passport so far. Add a profile photo and pick your path to make it official — it only takes a minute, and you can change it anytime.
            </td>
          </tr>${primaryButton('Complete your passport &rarr;', 'PROFILE_URL')}${infoBlock("What is a 'passport' on topia?", "Your TOPIA passport is your identity across the network. It's where people discover who you are, what you create, and the stamps you've collected along the way.")}${fallbackLink('PROFILE_URL')}
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
</html>`;

// passport-complete celebrates a finished profile and nudges sharing. Embeds the
// live card + share links. Keep byte-identical to emails/passport-complete.html.
const PASSPORT_COMPLETE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>Your TOPIA passport is live</title>
</head>
<body style="margin:0;padding:0;background-color:#ffffff;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;font-size:1px;line-height:1px;">
    Your passport is live — share it &rarr;
    &#8204;&#8204;&#8204;&#8204;&#8204;&#8204;&#8204;&#8204;&#8204;&#8204;
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
          <tr><td style="padding:22px 32px 0 32px;">${hl('Passport complete', true)}</td></tr>
          <tr>
            <td style="padding:14px 32px 0 32px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#888888;">
              Nice work, <strong style="color:#000000;">{{{USER_NAME}}}</strong> &#10022;
            </td>
          </tr>
          <tr>
            <td style="padding:6px 32px 0 32px;font-family:Arial,Helvetica,sans-serif;font-weight:900;font-size:28px;line-height:1.1;text-transform:uppercase;">
              You're on the map
            </td>
          </tr>${cardImage(260)}
          <tr>
            <td style="padding:18px 32px 0 32px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#888888;">
              Your passport is live. Share it with friends so they can find you across Topia — drop it in your bio, your group chat, or your IG story.
            </td>
          </tr>${primaryButton('View &amp; share your passport &rarr;', 'SHARE_URL')}
          <tr>
            <td style="padding:22px 32px 0 32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid rgba(136,136,136,0.25);border-radius:12px;">
                <tr>
                  <td style="padding:18px 20px;font-family:Arial,Helvetica,sans-serif;">
                    <div style="padding-bottom:8px;">${hl('Your link')}</div>
                    <div style="font-size:16px;line-height:1.4;color:#000000;font-weight:bold;padding-bottom:14px;">topia.vision/@{{{USERNAME}}}</div>
                    <a href="{{{STORY_URL}}}" target="_blank" style="display:inline-block;padding:11px 22px;font-family:Arial,Helvetica,sans-serif;font-weight:bold;font-size:13px;letter-spacing:1px;text-transform:uppercase;color:inherit;text-decoration:none;border:1px solid rgba(136,136,136,0.45);border-radius:8px;">Save for your IG story &rarr;</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>${fallbackLink('SHARE_URL')}
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
</html>`;

const DEFS: TemplateDef[] = [
  {
    id: 'event-invite', label: 'Event invite', scope: 'event',
    subject: '{{{INVITER_NAME}}} invited you to {{{EVENT_NAME}}}',
    variables: ['INVITER_NAME', 'EVENT_NAME', 'EVENT_URL', 'EVENT_WHEN', 'EVENT_WHERE'],
    shell: { title: "You're invited", preheader: 'See the details and RSVP &rarr;', lede: "You're invited", intro: '<strong style="color:inherit;">{{{INVITER_NAME}}}</strong> invited you to', headline: '{{{EVENT_NAME}}}', whenWhere: true, primary: { label: 'View invitation &rarr;', url: 'EVENT_URL' }, fallbackUrl: 'EVENT_URL' },
  },
  {
    id: 'event-rsvp-confirmed', label: 'RSVP confirmed', scope: 'event',
    subject: "You're confirmed for {{{EVENT_NAME}}}",
    variables: ['GUEST_NAME', 'EVENT_NAME', 'EVENT_URL', 'EVENT_WHEN', 'EVENT_WHERE', 'CARD_URL'],
    shell: { title: "You're going", preheader: "You're on the list. See you there &rarr;", lede: "You're going", intro: "<strong style=\"color:inherit;\">{{{GUEST_NAME}}}</strong>, you're confirmed for", headline: '{{{EVENT_NAME}}}', whenWhere: true, card: true, primary: { label: 'View event &rarr;', url: 'EVENT_URL' }, fallbackUrl: 'EVENT_URL' },
  },
  {
    id: 'event-rsvp-confirmed-setup', label: 'RSVP confirmed + profile setup', scope: 'event',
    subject: "You're confirmed for {{{EVENT_NAME}}}",
    variables: ['GUEST_NAME', 'EVENT_NAME', 'EVENT_URL', 'EVENT_WHEN', 'EVENT_WHERE', 'PROFILE_URL', 'CARD_URL'],
    shell: { title: "You're going", preheader: "You're in — now claim your Topia profile &rarr;", lede: "You're going", intro: "<strong style=\"color:inherit;\">{{{GUEST_NAME}}}</strong>, you're confirmed for", headline: '{{{EVENT_NAME}}}', whenWhere: true, card: true, primary: { label: 'View event &rarr;', url: 'EVENT_URL' }, secondary: true, fallbackUrl: 'EVENT_URL' },
  },
  {
    id: 'event-rsvp-requested', label: 'RSVP request received', scope: 'event',
    subject: 'Request received for {{{EVENT_NAME}}}',
    variables: ['GUEST_NAME', 'EVENT_NAME', 'EVENT_URL', 'EVENT_WHEN', 'EVENT_WHERE'],
    shell: { title: 'Request received', preheader: "Request received — we'll let you know &rarr;", lede: 'Request received', intro: 'Thanks <strong style="color:inherit;">{{{GUEST_NAME}}}</strong> — your request to join', headline: '{{{EVENT_NAME}}}', note: "is pending the host's approval. We'll email you the moment it's confirmed.", whenWhere: true, primary: { label: 'View event &rarr;', url: 'EVENT_URL' }, fallbackUrl: 'EVENT_URL' },
  },
  {
    id: 'event-rsvp-approved', label: 'RSVP approved', scope: 'event',
    subject: "You're approved for {{{EVENT_NAME}}}",
    variables: ['GUEST_NAME', 'EVENT_NAME', 'EVENT_URL', 'EVENT_WHEN', 'EVENT_WHERE'],
    shell: { title: "You're approved", preheader: "You're approved — you're going &rarr;", lede: "You're approved", intro: '<strong style="color:inherit;">{{{GUEST_NAME}}}</strong>, the host confirmed your spot for', headline: '{{{EVENT_NAME}}}', whenWhere: true, primary: { label: 'View event &rarr;', url: 'EVENT_URL' }, fallbackUrl: 'EVENT_URL' },
  },
  {
    id: 'event-rsvp-declined', label: 'RSVP declined', scope: 'event',
    subject: 'An update on your {{{EVENT_NAME}}} request',
    variables: ['GUEST_NAME', 'EVENT_NAME', 'EVENT_URL'],
    shell: { title: 'An update on your request', preheader: 'An update on your request', lede: 'Update', intro: 'Thanks for your interest, <strong style="color:inherit;">{{{GUEST_NAME}}}</strong>. The host wasn’t able to confirm your spot for', headline: '{{{EVENT_NAME}}}', note: "this time — keep an eye out, there's always more happening on Topia.", whenWhere: false, primary: { label: 'View event &rarr;', url: 'EVENT_URL' }, fallbackUrl: 'EVENT_URL' },
  },
  {
    id: 'event-host-rsvp-alert', label: 'Host RSVP alert', scope: 'event',
    subject: 'New {{{STATUS}}} for {{{EVENT_NAME}}}',
    variables: ['GUEST_NAME', 'EVENT_NAME', 'STATUS', 'MANAGE_URL', 'EVENT_WHEN', 'EVENT_WHERE'],
    shell: { title: 'New activity on your event', preheader: '{{{GUEST_NAME}}} · {{{EVENT_NAME}}}', lede: 'New {{{STATUS}}}', intro: '<strong style="color:inherit;">{{{GUEST_NAME}}}</strong> sent a {{{STATUS}}} for', headline: '{{{EVENT_NAME}}}', whenWhere: true, primary: { label: 'Manage event &rarr;', url: 'MANAGE_URL' }, fallbackUrl: 'MANAGE_URL' },
  },
  {
    id: 'complete-your-profile', label: 'Complete your profile', scope: 'profile',
    subject: 'Finish your TOPIA passport',
    variables: ['USER_NAME', 'PROFILE_URL', 'CARD_URL'],
    html: COMPLETE_PROFILE_HTML,
  },
  {
    id: 'passport-complete', label: 'Passport complete + share', scope: 'profile',
    subject: 'Your TOPIA passport is live',
    variables: ['USER_NAME', 'USERNAME', 'CARD_URL', 'SHARE_URL', 'STORY_URL'],
    html: PASSPORT_COMPLETE_HTML,
  },
];

export const EMAIL_TEMPLATES: EmailTemplate[] = DEFS.map(({ shell: s, html: h, ...rest }) => ({ ...rest, html: h ?? (s ? shell(s) : '') }));

export function getTemplate(id: string): EmailTemplate | undefined {
  return EMAIL_TEMPLATES.find((t) => t.id === id);
}

// Replace every {{{KEY}}} with vars[KEY] (missing keys → empty string).
export function renderTemplate(source: string, vars: Record<string, string>): string {
  return source.replace(/\{\{\{(\w+)\}\}\}/g, (_, key) => vars[key] ?? '');
}
