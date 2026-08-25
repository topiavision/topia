/* The navigation, defined once.
 *
 * Desktop (TopNav) and mobile (MobileMenu) previously each carried their own
 * copy-pasted array, and they had already drifted — mobile had Dashboard,
 * desktop didn't; desktop had Search nowhere at all. Every nav surface now
 * consumes THIS file, so they cannot disagree again.
 *
 * Five destinations. Everything else — tools, grants, people, about — is a
 * SECONDARY link (mobile menu + footer) and a ⌘K result, not top-level chrome.
 * If a sixth destination ever feels necessary, the palette is probably the
 * right home for it instead.
 */

export interface NavDestination {
  href: string;
  label: string;
  /** Hidden until signed in. */
  authOnly?: boolean;
}

export const NAV_DESTINATIONS: NavDestination[] = [
  { href: '/home', label: 'Home' },
  { href: '/worlds', label: 'Worlds' },
  { href: '/events', label: 'Events' },
  { href: '/tv', label: 'TV' },
  { href: '/dashboard', label: 'Dashboard', authOnly: true },
];

export const SECONDARY_LINKS: NavDestination[] = [
  { href: '/topians', label: 'Topians' },
  { href: '/resources/tools', label: 'Tools' },
  { href: '/resources/grants', label: 'Grants' },
  { href: '/about', label: 'About' },
  { href: '/contact', label: 'Contact' },
];
