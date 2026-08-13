import type { Metadata } from 'next';
import LegalLayout from '../_components/LegalLayout';

export const metadata: Metadata = {
  title: 'Cookie Policy — TOPIA',
  description: 'How Topia uses cookies and similar technologies.',
};

const LAST_UPDATED = 'June 22, 2026';

const CONTENT = `
This Cookie Policy explains how **Topia, Inc.** ("**Topia**," "**we**," "**us**," or "**our**") uses cookies and similar technologies when you use our website and services (the "**Services**"). It should be read together with our [Privacy Policy](/legal/privacy) and [Terms of Service](/legal/terms).

## 1. What Are Cookies?

Cookies are small text files placed on your device when you visit a website. They let a site recognize your device, remember your preferences, keep you signed in, and understand how the site is used. We also use similar technologies such as **local storage**, **session storage**, **pixels**, and **software development kits (SDKs)** — we refer to all of these collectively as "cookies."

## 2. How We Use Cookies

We use cookies for the following purposes:

| Category | Purpose | Examples |
| --- | --- | --- |
| **Strictly necessary** | Required to run the Services — authentication, session management, security, and load balancing. These cannot be switched off. | Sign-in/session via Privy; security and fraud-prevention tokens |
| **Preferences** | Remember your choices and settings to personalize your experience. | Light/dark theme preference (\`topia-theme\`) stored in local storage |
| **Analytics / performance** | Help us understand how the Services are used so we can improve them. | Aggregated usage and performance metrics |
| **Functional** | Enable enhanced features and integrations. | Embedded media, content from partners |

We do not use cookies to serve personalized third-party advertising. If this changes, we will update this Policy and request consent where required.

## 3. Third-Party Cookies

Some cookies are set by third parties that provide functionality on our behalf, including:

- **Privy** — authentication and wallet session management;
- **Stripe** — payment processing and fraud prevention;
- **Hosting and analytics providers** — performance and reliability.

These third parties may process information in accordance with their own privacy and cookie policies.

## 4. Your Choices

You can control and manage cookies in several ways:

- **Browser settings.** Most browsers let you block or delete cookies and clear local storage. Doing so may break parts of the Services — for example, you may be signed out or lose saved preferences.
- **Consent controls.** Where required by law (such as in the EEA and UK), we will ask for your consent to non-essential cookies and provide a way to change your choices.
- **Do Not Track.** Some browsers offer a "Do Not Track" signal. There is no industry-wide standard for responding to these signals, so we currently do not respond to them, but we honor recognized opt-out preference signals where legally required.

## 5. Changes to This Policy

We may update this Cookie Policy from time to time. We will update the "Last updated" date above and, where appropriate, provide additional notice.

## 6. Contact Us

Questions about our use of cookies? Email us at [contact@topia.vision](mailto:contact@topia.vision).

---

*This Cookie Policy is provided as a general template for Topia's current Services and does not constitute legal advice. We recommend having it reviewed by qualified legal counsel before launch.*
`;

export default function CookiesPage() {
  return (
    <LegalLayout
      eyebrow="legal // cookies"
      title="Cookie Policy"
      lastUpdated={LAST_UPDATED}
      content={CONTENT}
    />
  );
}
