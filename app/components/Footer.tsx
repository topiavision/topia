'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import ThemeToggle from './ThemeToggle';
import { SocialIcon } from './SocialIcons';
import { useUserProfile } from '../hooks/useUserProfile';

// Single footer-nav atom — keep link styling consistent with the main menu nav.
function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="font-mono text-xs text-bone/55 hover:text-lime transition-colors no-underline">
      {children}
    </Link>
  );
}

export default function Footer() {
  const pathname = usePathname();
  const { profile } = useUserProfile();

  // Passport routes to the viewer's own passport — matches the main nav.
  const passportHref = profile?.username ? `/profile/${profile.username}` : '/profile';

  // Hide footer on certain pages
  if (pathname.startsWith('/dashboard')) return null;

  return (
    // Mobile: extend the footer past its content so the floating pill nav hovers
    // over obsidian instead of covering the links — this is the bottom edge of
    // every PageShell page.
    <footer className="topia-footer bg-obsidian text-bone border-t border-bone/[0.06] pb-[var(--mobile-nav-clearance)] md:pb-0">
      <div className="max-w-[var(--content-max)] mx-auto px-[var(--page-pad)] py-6">
        {/* Single row — wordmark + inline nav on the left, socials + toggle on the right */}
        <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:gap-7">
            <Link href="/" className="font-basement font-black text-sm tracking-[4px] uppercase no-underline text-bone shrink-0">
              TOPIA<span style={{ color: 'var(--accent, #e4fe52)' }}>.</span>
            </Link>
            <nav className="flex flex-wrap items-center gap-x-5 gap-y-2">
              <FooterLink href={passportHref}>Passport</FooterLink>
              <FooterLink href="/tv">Topia TV</FooterLink>
              <FooterLink href="/events">Events</FooterLink>
              <FooterLink href="/worlds">Worlds</FooterLink>
              <FooterLink href="/resources/tools">Tools</FooterLink>
              <FooterLink href="/resources/grants">Grants</FooterLink>
              <FooterLink href="/about">About</FooterLink>
              <FooterLink href="/contact">Contact</FooterLink>
            </nav>
          </div>

          <div className="flex items-center gap-4">
            <a href="https://www.instagram.com/topia.vision" target="_blank" rel="noopener noreferrer" aria-label="Instagram" className="text-bone/55 hover:text-lime transition-colors">
              <SocialIcon type="instagram" size={18} />
            </a>
            <a href="https://x.com/topiavision" target="_blank" rel="noopener noreferrer" aria-label="X / Twitter" className="text-bone/55 hover:text-lime transition-colors">
              <SocialIcon type="twitter" size={18} />
            </a>
            <a href="https://linkedin.com/company/topiavision" target="_blank" rel="noopener noreferrer" aria-label="LinkedIn" className="text-bone/55 hover:text-lime transition-colors">
              <SocialIcon type="linkedin" size={18} />
            </a>
            <span className="hidden md:inline w-px h-3.5 bg-bone/15" />
            <ThemeToggle embedded />
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-8 pt-6 border-t border-bone/[0.06] flex flex-col md:flex-row justify-between items-center gap-4">
          <span className="font-mono text-[13px] uppercase tracking-wider text-bone/55">
            &copy; {new Date().getFullYear()} TOPIA. All rights reserved.
          </span>
          <div className="flex items-center gap-5 flex-wrap justify-center">
            <FooterLink href="/legal/terms">Terms</FooterLink>
            <FooterLink href="/legal/privacy">Privacy</FooterLink>
            <FooterLink href="/legal/cookies">Cookies</FooterLink>
          </div>
        </div>
      </div>
    </footer>
  );
}
