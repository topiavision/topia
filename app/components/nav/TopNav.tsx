'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import LoginButton from '../LoginButton';
import NotificationBell from '../NotificationBell';
import MessagesNavIcon from '../MessagesNavIcon';
import { useUserProfile } from '../../hooks/useUserProfile';
import { useLiveEvent } from '../../hooks/useLiveEvent';
import { NAV_DESTINATIONS } from '@/lib/navItems';

/* Desktop nav — five destinations inline, no dropdown.
 *
 * The old "Menu ▾" hid every destination behind a click, listed two dead
 * "coming soon" items, and had drifted from the mobile menu's copy of the
 * same array. Destinations now come from lib/navItems.ts (shared with
 * mobile), sit in the bar where a first-time visitor can see the shape of the
 * platform at a glance, and mark the current section with the same lime
 * underline the in-page tabs use. Tools/grants/about live in the mobile menu,
 * the footer and ⌘K — secondary, not chrome.
 *
 * Messages, notifications and auth stay exactly where they were.
 */
export default function TopNav({ onOpenMessages }: { onOpenMessages: () => void }) {
  const { profile, authenticated, ready } = useUserProfile();
  const pathname = usePathname();
  // Desktop's live-event door — same lookup as the mobile chip. Hidden while
  // already in Event Mode (it would link to itself).
  const liveEvent = useLiveEvent(authenticated ? profile?.privyId : undefined, ready);
  const showLiveChip = !!liveEvent && !pathname.endsWith('/live');

  // Current-page marker: exact match or a sub-route of the item.
  const isActive = (href: string) =>
    href !== '/' && (pathname === href || pathname.startsWith(`${href}/`));

  return (
    <nav
      className="fixed top-0 left-0 w-full h-[var(--nav-height)] backdrop-blur-xl z-[1000] border-b hidden md:flex items-center justify-between px-[var(--page-pad)]"
      style={{
        backgroundColor: 'var(--nav-bg)',
        borderColor: 'var(--nav-border)',
      }}
    >
      {/* Logo + destinations */}
      <div className="flex items-center gap-7 min-w-0">
        <Link
          href="/"
          className="font-basement font-black text-sm tracking-[4px] uppercase no-underline shrink-0"
          style={{ color: 'var(--page-text)' }}
        >
          TOPIA<span style={{ color: 'var(--accent, #e4fe52)' }}>.</span>
        </Link>

        <div className="flex items-center gap-5">
          {NAV_DESTINATIONS.filter((d) => !d.authOnly || authenticated).map((d) => {
            const active = isActive(d.href);
            return (
              <Link
                key={d.href}
                href={d.href}
                aria-current={active ? 'page' : undefined}
                className={`font-mono text-[12px] tracking-[1.5px] uppercase no-underline py-[19px] border-b-2 transition-opacity ${
                  active ? 'opacity-100 font-bold' : 'opacity-50 hover:opacity-100'
                }`}
                style={{
                  color: 'var(--page-text)',
                  borderBottomColor: active ? 'var(--accent, #e4fe52)' : 'transparent',
                }}
              >
                {d.label}
              </Link>
            );
          })}
        </div>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-4 shrink-0">
        {showLiveChip && liveEvent && (
          <Link
            href={`/events/${liveEvent.slug}/live`}
            className="live-chip-glow flex items-center gap-2 rounded-full border pl-3 pr-3.5 py-1.5 no-underline max-w-[280px]"
            style={{ borderColor: 'var(--orange, #FF5C34)', backgroundColor: 'color-mix(in srgb, var(--orange, #FF5C34) 8%, transparent)' }}
          >
            <span className="relative flex w-2 h-2 shrink-0">
              <span className="live-ping absolute inline-flex h-full w-full rounded-full" style={{ backgroundColor: 'var(--orange, #FF5C34)' }} />
              <span className="relative inline-flex rounded-full w-2 h-2" style={{ backgroundColor: 'var(--orange, #FF5C34)' }} />
            </span>
            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] truncate" style={{ color: 'var(--page-text)' }}>
              <span style={{ color: 'var(--orange, #FF5C34)' }}>Live</span> · {liveEvent.eventName}
            </span>
            <span className="font-mono text-[10px] font-bold shrink-0" style={{ color: 'var(--orange, #FF5C34)' }}>
              {liveEvent.involvement === 'none' ? 'Join →' : 'Enter →'}
            </span>
          </Link>
        )}

        {/* Search — opens the ⌘K palette. */}
        <button
          onClick={() => window.dispatchEvent(new CustomEvent('topia:open-cmdk'))}
          aria-label="Search (⌘K)"
          className="flex items-center gap-2 rounded-lg border px-3 py-1.5 cursor-pointer bg-transparent hover:opacity-100 opacity-70 transition-opacity"
          style={{ borderColor: 'var(--nav-border)', color: 'var(--page-text)' }}
        >
          <span className="text-[13px] leading-none">⌕</span>
          <span className="font-mono text-[11px] tracking-wider hidden lg:inline" style={{ opacity: 0.6 }}>Search</span>
          <kbd className="font-mono text-[9px] tracking-[1px] px-1 py-px rounded border leading-none" style={{ borderColor: 'var(--nav-border)', opacity: 0.55 }}>⌘K</kbd>
        </button>

        <MessagesNavIcon onClick={onOpenMessages} />
        <NotificationBell />
        <LoginButton />
      </div>
    </nav>
  );
}
