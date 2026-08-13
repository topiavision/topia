import type { Metadata } from 'next';
import LegalLayout from '../_components/LegalLayout';

export const metadata: Metadata = {
  title: 'Privacy Policy — TOPIA',
  description: 'How Topia collects, uses, and protects your personal information.',
};

const LAST_UPDATED = 'June 22, 2026';

const CONTENT = `
This Privacy Policy explains how **Topia, Inc.** ("**Topia**," "**we**," "**us**," or "**our**") collects, uses, shares, and protects information about you when you use our website, applications, and related services (the "**Services**"). It applies to all users and supplements our [Terms of Service](/legal/terms) and [Cookie Policy](/legal/cookies).

By using the Services, you agree to the practices described here.

## 1. Information We Collect

**Information you provide:**

- **Account & profile information** — such as your username, display name, handle, bio, avatar, links, and any content you add to your profile.
- **Authentication & wallet data** — when you sign in through **Privy**, we receive identifiers such as your email address, phone number, social login, and/or your blockchain wallet address, depending on how you choose to authenticate.
- **Content you create** — worlds, events, posts, images, reactions, guestbook entries, and other User Content.
- **Transaction information** — when you buy or sell tickets or items, we and our payment processors collect details needed to complete the transaction (e.g., amount, items, and a payment token). **Card numbers are handled by Stripe and are not stored by Topia.**
- **Communications** — messages you send us (e.g., support requests) and waitlist or contact submissions.

**Information collected automatically:**

- **Usage & device data** — IP address, browser and device type, operating system, pages viewed, referring URLs, and interactions with the Services.
- **Cookies and similar technologies** — see our [Cookie Policy](/legal/cookies).

**Information from third parties:**

- **Authentication providers** (Privy and any social/login services you connect).
- **Payment processors** (Stripe) — transaction status and limited details.
- **Public blockchains** — wallet addresses and on-chain transactions are public by nature. Information you put on-chain is outside our control and generally cannot be deleted.

## 2. How We Use Your Information

We use information to:

- Provide, operate, maintain, and improve the Services;
- Create and manage your account and authenticate you;
- Process transactions, tickets, and payments;
- Enable social and creator features (profiles, follows, events, worlds);
- Communicate with you, including service notices and, where permitted, marketing;
- Personalize content and recommendations;
- Detect, prevent, and address fraud, abuse, security issues, and violations of our Terms;
- Comply with legal obligations and enforce our agreements.

## 3. Legal Bases for Processing (EU/UK Users)

If you are in the European Economic Area or the United Kingdom, we process your personal data under the following legal bases under the GDPR / UK GDPR:

- **Performance of a contract** — to provide the Services you request;
- **Legitimate interests** — to operate, secure, and improve the Services, where not overridden by your rights;
- **Consent** — for certain cookies and marketing, which you may withdraw at any time;
- **Legal obligation** — to comply with applicable law.

## 4. How We Share Information

We do **not** sell your personal information for money. We share information only as described here:

- **Service providers** — vendors who help us run the Services, including Privy (authentication/wallets), Stripe (payments), hosting, storage, and analytics providers, who may process data only on our instructions.
- **Other users & the public** — your profile, worlds, events, and other content you publish are visible to others by design. Wallet addresses and on-chain activity are publicly visible.
- **Legal & safety** — when required by law, subpoena, or to protect the rights, safety, or property of Topia, our users, or the public.
- **Business transfers** — in connection with a merger, acquisition, financing, or sale of assets, subject to this Policy.
- **With your consent** — for any other purpose disclosed to you.

## 5. Data Retention

We retain personal information for as long as your account is active or as needed to provide the Services, comply with our legal obligations, resolve disputes, and enforce our agreements. When no longer needed, we delete or de-identify it. Note that information published on a public blockchain or shared publicly may persist independently of our systems.

## 6. Data Security

We use technical and organizational measures designed to protect your information. However, no method of transmission or storage is completely secure. **You are responsible for safeguarding your wallet credentials and private keys, which we never hold and cannot recover.**

## 7. Your Privacy Rights

Depending on where you live, you may have rights to access, correct, delete, port, or restrict the processing of your personal information, and to object to certain processing or withdraw consent. To exercise any right, email us at [contact@topia.vision](mailto:contact@topia.vision). We will respond as required by applicable law and will not discriminate against you for exercising your rights.

### Your California Privacy Rights (CCPA/CPRA)

If you are a California resident, you have the right to:

- **Know** what personal information we collect, use, and disclose;
- **Access** a copy of the personal information we hold about you;
- **Delete** personal information, subject to exceptions;
- **Correct** inaccurate personal information;
- **Opt out** of any "sale" or "sharing" of personal information for cross-context behavioral advertising; and
- **Limit** the use of sensitive personal information.

We do not sell personal information for monetary value. We may share limited identifiers with analytics or advertising partners; you can opt out by emailing [contact@topia.vision](mailto:contact@topia.vision) or by adjusting cookie settings. You may use an authorized agent to submit requests, and we will verify your identity before responding.

### Your European & UK Rights (GDPR)

If you are in the EEA or UK, you have the rights of access, rectification, erasure, restriction, data portability, and objection, and the right to lodge a complaint with your local supervisory authority. Where we rely on consent, you can withdraw it at any time.

## 8. International Data Transfers

We are based in the United States and may process information in the U.S. and other countries whose data-protection laws may differ from yours. Where required, we use appropriate safeguards (such as Standard Contractual Clauses) for international transfers.

## 9. Children's Privacy

The Services are intended for users **18 and older**. We do not knowingly collect personal information from anyone under 18. If you believe a minor has provided us information, contact [contact@topia.vision](mailto:contact@topia.vision) and we will delete it.

## 10. Third-Party Links & Services

The Services contain links to and integrations with third-party sites and services that we do not control. This Policy does not apply to those third parties; review their privacy policies separately.

## 11. Changes to This Policy

We may update this Privacy Policy from time to time. We will update the "Last updated" date above and, for material changes, provide additional notice where appropriate. Your continued use of the Services after changes take effect constitutes acceptance.

## 12. Contact Us

For privacy questions or to exercise your rights, contact us at [contact@topia.vision](mailto:contact@topia.vision).

---

*This Privacy Policy is provided as a general template for Topia's current Services and does not constitute legal advice. We recommend having it reviewed by qualified legal counsel before launch.*
`;

export default function PrivacyPage() {
  return (
    <LegalLayout
      eyebrow="legal // privacy"
      title="Privacy Policy"
      lastUpdated={LAST_UPDATED}
      content={CONTENT}
    />
  );
}
