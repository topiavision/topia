'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import LoginButton from '../LoginButton';
import NotificationBell from '../NotificationBell';
import MessagesNavIcon from '../MessagesNavIcon';
import { useUserProfile } from '../../hooks/useUserProfile';
import { useLiveEvent } from '../../hooks/useLiveEvent';

type NavItem = {
  label: string;
  href?: string;
  comingSoon?: boolean;
  children?: { href: string; label: string }[];
};

const NAV_LINKS: NavItem[] = [
  { href: '/profile', label: 'Passport' },
  { href: '/tv', label: 'Topia TV' },
  { href: '/events', label: 'Events' },
  { href: '/worlds', label: 'Worlds' },
  {
    label: 'Resources',
    children: [
      { href: '/resources/tools', label: 'Tools' },
      { href: '/resources/grants', label: 'Grants' },
    ],
  },
  { href: '#', label: 'Builder', comingSoon: true },
  { href: '#', label: 'Catalysts', comingSoon: true },
];

const STATIC_LINKS = [
  { href: '/about', label: 'About' },
  { href: '/contact', label: 'Contact' },
];

export default function TopNav({ onOpenMessages }: { onOpenMessages: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { profile, authenticated, ready } = useUserProfile();
  const pathname = usePathname();
  // Passport routes to the viewer's own profile (their passport).
  const passportHref = profile?.username ? `/profile/${profile.username}` : '/profile';
  // Desktop's live-event door — same lookup as the mobile chip. Hidden while
  // already in Event Mode (it would link to itself).
  const liveEvent = useLiveEvent(authenticated ? profile?.privyId : undefined, ready);
  const showLiveChip = !!liveEvent && !pathname.endsWith('/live');

  // Current-page marker: exact match or a sub-route of the item.
  const isActive = (href?: string) =>
    !!href && href !== '#' && href !== '/' && (pathname === href || pathname.startsWith(`${href}/`));

  return (
    <nav
      className="fixed top-0 left-0 w-full h-[var(--nav-height)] backdrop-blur-xl z-[1000] border-b hidden md:flex items-center justify-between px-[var(--page-pad)]"
      style={{
        backgroundColor: 'var(--nav-bg)',
        borderColor: 'var(--nav-border)',
      }}
    >
      {/* Logo */}
      <Link
        href="/"
        className="font-basement font-black text-sm tracking-[4px] uppercase no-underline"
        style={{ color: 'var(--page-text)' }}
      >
        TOPIA<span style={{ color: 'var(--accent, #e4fe52)' }}>.</span>
      </Link>

      {/* Right side */}
      <div className="flex items-center gap-4">
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
        {/* Search — opens the ⌘K palette. Search had NO desktop entry point
            at all before this (it was mobile-pill-only). */}
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
        {/* Menu dropdown */}
        <div className="relative">
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            className="font-mono font-normal text-[13px] tracking-wider uppercase opacity-50 hover:opacity-100 transition-opacity duration-300 bg-transparent border-none cursor-pointer flex items-center gap-2"
            style={{ color: 'var(--page-text)' }}
          >
            Menu{' '}
            <span
              className={`transition-transform duration-200 inline-block ${menuOpen ? 'rotate-180' : ''}`}
            >
              ▾
            </span>
          </button>

          {menuOpen && (
            <>
              <div className="fixed inset-0 z-[998]" onClick={() => setMenuOpen(false)} />
              <div
                className="absolute top-full right-0 mt-2 backdrop-blur-xl rounded-lg py-2 min-w-[200px] z-[999]"
                style={{
                  backgroundColor: 'var(--nav-bg)',
                  border: '1px solid var(--nav-border)',
                }}
              >
                {NAV_LINKS.map((item) =>
                  item.children ? (
                    <div key={item.label} className="mt-1">
                      <div
                        className="px-4 pt-3 pb-1 font-mono text-[11px] tracking-[2px] uppercase opacity-30"
                        style={{ color: 'var(--page-text)' }}
                      >
                        {item.label}
                      </div>
                      {item.children.map((child) => (
                        <Link
                          key={child.href}
                          href={child.href}
                          onClick={() => setMenuOpen(false)}
                          aria-current={isActive(child.href) ? 'page' : undefined}
                          className={`flex items-center justify-between pl-7 pr-4 py-2.5 font-mono text-[13px] tracking-wider uppercase transition-all duration-200 no-underline ${isActive(child.href) ? 'opacity-100' : 'opacity-50 hover:opacity-100'}`}
                          style={{ color: 'var(--page-text)' }}
                        >
                          <span>{child.label}</span>
                          {isActive(child.href) && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: 'var(--accent, #e4fe52)' }} />}
                        </Link>
                      ))}
                    </div>
                  ) : item.comingSoon ? (
                    <div
                      key={item.label}
                      className="flex items-center justify-between px-4 py-3 font-mono text-[13px] tracking-wider uppercase opacity-30 cursor-default"
                      style={{ color: 'var(--page-text)' }}
                    >
                      <span>{item.label}</span>
                      <span className="text-[9px] tracking-[1px] opacity-70">Soon</span>
                    </div>
                  ) : (
                    <Link
                      key={item.href}
                      href={item.label === 'Passport' ? passportHref : item.href!}
                      onClick={() => setMenuOpen(false)}
                      aria-current={isActive(item.label === 'Passport' ? '/profile' : item.href) ? 'page' : undefined}
                      className={`flex items-center justify-between px-4 py-3 font-mono text-[13px] tracking-wider uppercase transition-all duration-200 no-underline ${isActive(item.label === 'Passport' ? '/profile' : item.href) ? 'opacity-100' : 'opacity-50 hover:opacity-100'}`}
                      style={{ color: 'var(--page-text)' }}
                    >
                      <span>{item.label}</span>
                      {isActive(item.label === 'Passport' ? '/profile' : item.href) && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: 'var(--accent, #e4fe52)' }} />}
                    </Link>
                  )
                )}
                <div className="border-t mt-1 pt-1" style={{ borderColor: 'var(--nav-border)' }}>
                  {STATIC_LINKS.map((link) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      onClick={() => setMenuOpen(false)}
                      className="block px-4 py-3 font-mono text-[13px] tracking-wider uppercase opacity-30 hover:opacity-60 transition-all duration-200 no-underline"
                      style={{ color: 'var(--page-text)' }}
                    >
                      {link.label}
                    </Link>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        <MessagesNavIcon onClick={onOpenMessages} />
        <NotificationBell />
        <LoginButton />
      </div>
    </nav>
  );
}
