/* The command registry for the ⌘K palette.
 *
 * Commands are DATA, not components — the palette renders whatever this
 * returns, so adding a command never touches palette code. Two kinds:
 * navigation (href) and actions (run). Visibility is decided here, in one
 * place, from the caller's auth state and feature grants.
 *
 * Keep labels task-shaped ("Create a world", not "World creation page") —
 * people type verbs.
 */

export interface Command {
  id: string;
  label: string;
  /** Group header in the palette. */
  group: 'Actions' | 'Go to';
  /** Extra strings the filter should match ("gigs" → Events). */
  keywords?: string;
  href?: string;
  run?: () => void;
  /** Glyph rendered in the leading square. Text, not an icon font. */
  glyph: string;
}

export function buildCommands(opts: {
  authenticated: boolean;
  username?: string | null;
  /** Feature grants from the profile payload, e.g. ['funding']. */
  features: string[];
}): Command[] {
  const { authenticated, username, features } = opts;
  const cmds: Command[] = [];

  // ── Actions ──
  if (authenticated) {
    cmds.push(
      { id: 'create-world', label: 'Create a world', group: 'Actions', glyph: '+', keywords: 'new start build' },
      { id: 'create-event', label: 'Create an event', group: 'Actions', glyph: '+', keywords: 'new host party show' },
    );
  }
  cmds.push({
    id: 'toggle-theme', label: 'Toggle light / dark', group: 'Actions', glyph: '◐',
    keywords: 'theme dark mode light appearance',
    run: () => {
      // Mirrors ThemeToggle exactly — same storage key, same attribute.
      const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('topia-theme', next);
    },
  });

  // ── Destinations ──
  cmds.push(
    { id: 'go-home', label: 'Home', group: 'Go to', glyph: '⌂', href: '/home', keywords: 'discover feed' },
    { id: 'go-worlds', label: 'Worlds', group: 'Go to', glyph: '◍', href: '/worlds', keywords: 'browse projects communities' },
    { id: 'go-events', label: 'Events', group: 'Go to', glyph: '◷', href: '/events', keywords: 'calendar rsvp tickets' },
    { id: 'go-tv', label: 'Topia TV', group: 'Go to', glyph: '▷', href: '/tv', keywords: 'watch video episodes' },
    { id: 'go-tools', label: 'Tools', group: 'Go to', glyph: '⚒', href: '/resources/tools', keywords: 'resources software kit' },
    { id: 'go-grants', label: 'Grants', group: 'Go to', glyph: '$', href: '/resources/grants', keywords: 'resources funding money apply' },
    { id: 'go-topians', label: 'Topians', group: 'Go to', glyph: '✦', href: '/topians', keywords: 'people members community discover' },
  );

  if (authenticated) {
    cmds.push(
      { id: 'go-dashboard', label: 'Dashboard', group: 'Go to', glyph: '▦', href: '/dashboard', keywords: 'studio manage my' },
      {
        id: 'go-passport', label: 'Your passport', group: 'Go to', glyph: '❒',
        href: username ? `/profile/${username}` : '/profile', keywords: 'profile me account',
      },
    );
    if (features.includes('funding')) {
      cmds.push({ id: 'go-payouts', label: 'Payouts', group: 'Go to', glyph: '⇄', href: '/dashboard/payouts', keywords: 'stripe money funding connect bank' });
    }
  }

  return cmds;
}
