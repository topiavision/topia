'use client';

import Link from 'next/link';
import { usePrivy } from '@privy-io/react-auth';
import { useUserProfile } from '../../hooks/useUserProfile';

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
  { href: '/assistant', label: '✦ Assistant' },
  { href: '#', label: 'Catalysts', comingSoon: true },
  { href: '/dashboard', label: 'Dashboard' },
];

const STATIC_LINKS = [
  { href: '/about', label: 'About' },
  { href: '/contact', label: 'Contact' },
];

interface MobileMenuProps {
  isOpen: boolean;
  onClose: () => void;
}

const rowClass =
  'font-mono text-[15px] tracking-[1.5px] uppercase no-underline py-3 block transition-opacity hover:opacity-60';

export default function MobileMenu({ isOpen, onClose }: MobileMenuProps) {
  const { profile, ready, authenticated } = useUserProfile();
  const { login, logout } = usePrivy();
  const passportHref = profile?.username ? `/profile/${profile.username}` : '/profile';
  const displayName = profile?.name || 'Anonymous';
  const initial = (displayName[0] || '?').toUpperCase();

  return (
    <div
      className={`
        fixed inset-0 z-[2000] flex flex-col
        transition-opacity duration-300 ease-out
        ${isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}
      `}
      style={{ backgroundColor: 'var(--page-bg)', paddingTop: 'var(--safe-top, 0px)' }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-6 h-[var(--nav-height)] shrink-0 border-b"
        style={{ borderColor: 'var(--border-color)' }}
      >
        <span
          className="font-basement font-black text-sm tracking-[4px] uppercase"
          style={{ color: 'var(--page-text)' }}
        >
          TOPIA<span style={{ color: 'var(--accent, #e4fe52)' }}>.</span>
        </span>
        <button
          onClick={onClose}
          className="opacity-40 hover:opacity-100 transition-opacity bg-transparent border-none cursor-pointer p-2"
          style={{ color: 'var(--page-text)' }}
          aria-label="Close menu"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Links — scrollable so they never push the auth footer off-screen */}
      <nav className="flex-1 overflow-y-auto px-6 py-4" style={{ color: 'var(--page-text)' }}>
        {NAV_LINKS.map((item) =>
          item.children ? (
            <div key={item.label} className="py-2">
              <span className="font-mono text-[11px] tracking-[2px] uppercase opacity-30 block mb-0.5">
                {item.label}
              </span>
              {item.children.map((child) => (
                <Link key={child.href} href={child.href} onClick={onClose} className={`${rowClass} pl-4`} style={{ color: 'var(--page-text)' }}>
                  {child.label}
                </Link>
              ))}
            </div>
          ) : item.comingSoon ? (
            <span key={item.label} className={`${rowClass} opacity-25 cursor-default flex items-baseline gap-2`}>
              {item.label}
              <span className="font-mono text-[9px] tracking-[1px] opacity-70">Soon</span>
            </span>
          ) : (
            <Link
              key={item.href}
              href={item.label === 'Passport' ? passportHref : item.href!}
              onClick={onClose}
              className={`${rowClass} font-bold`}
              style={{ color: 'var(--page-text)' }}
            >
              {item.label}
            </Link>
          )
        )}

        <div className="border-t my-2" style={{ borderColor: 'var(--border-color)' }} />

        {STATIC_LINKS.map((link) => (
          <Link key={link.href} href={link.href} onClick={onClose} className={`${rowClass} opacity-40`} style={{ color: 'var(--page-text)' }}>
            {link.label}
          </Link>
        ))}
      </nav>

      {/* Auth footer — always pinned & reachable */}
      <div
        className="shrink-0 border-t px-6 pt-4"
        style={{ borderColor: 'var(--border-color)', paddingBottom: 'calc(env(safe-area-inset-bottom) + 16px)', color: 'var(--page-text)' }}
      >
        {!ready ? null : authenticated ? (
          <>
            <Link
              href={passportHref}
              onClick={onClose}
              className="flex items-center gap-3 no-underline mb-3"
              style={{ color: 'var(--page-text)' }}
            >
              <span className="w-10 h-10 rounded-full overflow-hidden border shrink-0 flex items-center justify-center" style={{ borderColor: 'var(--page-text)' }}>
                {profile?.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={profile.avatarUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="font-mono text-[14px] font-bold" style={{ color: 'var(--page-text)' }}>{initial}</span>
                )}
              </span>
              <span className="min-w-0">
                <span className="font-mono text-[14px] font-bold uppercase truncate block">{displayName}</span>
                {profile?.username && <span className="font-mono text-[11px] opacity-50 truncate block">@{profile.username}</span>}
              </span>
            </Link>
            <div className="grid grid-cols-2 gap-2">
              <Link
                href="/dashboard"
                onClick={onClose}
                className="text-center font-mono text-[12px] uppercase tracking-[1.5px] py-2.5 border rounded-md no-underline transition-opacity hover:opacity-70"
                style={{ color: 'var(--page-text)', borderColor: 'var(--border-color)' }}
              >
                Dashboard
              </Link>
              <button
                onClick={() => { logout(); onClose(); }}
                className="font-mono text-[12px] uppercase tracking-[1.5px] py-2.5 border rounded-md cursor-pointer transition-opacity hover:opacity-70"
                style={{ color: 'var(--page-text)', borderColor: 'var(--border-color)', background: 'transparent' }}
              >
                Log out
              </button>
            </div>
          </>
        ) : (
          <button
            onClick={() => { login(); onClose(); }}
            className="w-full font-mono text-[13px] uppercase tracking-[2px] font-bold py-3.5 rounded-md cursor-pointer transition-opacity hover:opacity-90"
            style={{ backgroundColor: 'var(--accent, #e4fe52)', color: '#1a1a1a', border: 'none' }}
          >
            Log in
          </button>
        )}
      </div>
    </div>
  );
}
