import { redirect } from 'next/navigation';

/* The pre-launch waitlist is retired — signup has been open for a while, and
 * this page was telling search-engine visitors the product was unreleased.
 * Old links land on the homepage instead. (/api/waitlist stays: it powers the
 * NewsletterSignup form.) */
export default function WaitlistPage() {
  redirect('/');
}
