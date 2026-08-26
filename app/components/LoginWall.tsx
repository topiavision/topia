'use client';

import Link from 'next/link';
import { usePrivy } from '@privy-io/react-auth';

/* The ONE login wall. Every "log in to do X" dead-end renders this instead of
 * a bare sentence: the message, a REAL door (Privy's login modal), and a way
 * back. Modeled on Event Mode's door card (app/events/[slug]/live/page.tsx).
 *
 * The button waits for Privy `ready` before enabling — never gate or redirect
 * on auth state during hydration (CLAUDE.md house bug #5). */

interface LoginWallProps {
  message: string;
  backHref?: string;
  backLabel?: string;
  className?: string;
}

export default function LoginWall({ message, backHref, backLabel, className = '' }: LoginWallProps) {
  const { ready, login } = usePrivy();

  return (
    <div className={`flex flex-col items-center justify-center gap-4 px-6 py-10 text-center ${className}`}>
      <span className="ipb-orb text-[28px]" style={{ color: 'var(--orange, #FF5C34)' }} aria-hidden="true">✦</span>
      <p className="font-mono text-[13px] leading-relaxed max-w-[34ch]" style={{ color: 'var(--page-text)' }}>
        {message}
      </p>
      <button
        onClick={() => { if (ready) login(); }}
        disabled={!ready}
        className="font-mono text-[12px] font-bold uppercase tracking-widest px-6 py-3 rounded-full cursor-pointer border-none transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-default"
        style={{ backgroundColor: 'var(--lime, #e4fe52)', color: 'var(--obsidian, #1a1a1a)' }}
      >
        Log in or sign up →
      </button>
      {backHref && (
        <Link
          href={backHref}
          className="font-mono text-[11px] uppercase tracking-[2px] underline opacity-50 hover:opacity-100 transition-opacity"
          style={{ color: 'var(--page-text)' }}
        >
          ← {backLabel ?? 'Back'}
        </Link>
      )}
    </div>
  );
}
