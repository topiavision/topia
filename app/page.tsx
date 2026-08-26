'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { usePrivy } from '@privy-io/react-auth';
import GlitchType from './components/ui/GlitchType';
import { isCoreProfileComplete } from '../lib/profile/completeness';

export default function Home() {
  const router = useRouter();
  const { ready, authenticated, user, login } = usePrivy();
  const [phase, setPhase] = useState(0);
  const [routing, setRouting] = useState(false);

  // When authenticated, route to a remembered destination (e.g. a "complete your
  // profile" email sends logged-out users here intending /onboarding). A stored
  // intent always wins — never derail an RSVP/invite/connect mid-flow. With no
  // intent: brand-new (or core-incomplete) accounts flow straight into
  // /onboarding — the one moment a user EXPECTS setup — and complete profiles
  // go to /home exactly as before. Destination comes from ?next= (modal logins,
  // query preserved) or sessionStorage (OAuth logins, which drop the query).
  // Only safe internal paths are honored (guards against open redirects).
  useEffect(() => {
    if (!ready || !authenticated || !user) return;
    setRouting(true);
    const isSafe = (p: string | null): p is string => !!p && p.startsWith('/') && !p.startsWith('//');
    let dest: string | null = null;
    try {
      const fromQuery = new URLSearchParams(window.location.search).get('next');
      const stored = sessionStorage.getItem('topia:postLogin');
      if (stored) sessionStorage.removeItem('topia:postLogin');
      if (isSafe(fromQuery)) dest = fromQuery;
      else if (isSafe(stored)) dest = stored;
    } catch { /* ignore */ }
    if (dest) { router.replace(dest); return; }

    let cancelled = false;
    fetch(`/api/auth/profile?privyId=${encodeURIComponent(user.id)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled) return;
        // No row yet (sync hasn't run) counts as incomplete — that IS the
        // brand-new signup case.
        router.replace(isCoreProfileComplete(d?.user) ? '/home' : '/onboarding');
      })
      .catch(() => { if (!cancelled) router.replace('/home'); });
    return () => { cancelled = true; };
  }, [ready, authenticated, user, router]);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 300),
      setTimeout(() => setPhase(2), 900),
      setTimeout(() => setPhase(3), 1500),
      setTimeout(() => setPhase(4), 2100),
      setTimeout(() => setPhase(5), 2800),
      setTimeout(() => setPhase(6), 3500),
      setTimeout(() => setPhase(7), 4200),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  // Loading state while we decide where to route an authenticated user
  if (ready && authenticated) {
    return (
      <div className="fixed inset-0 bg-obsidian text-bone flex flex-col items-center justify-center">
        <div className="font-mono text-[12px] uppercase tracking-[3px] text-bone/60 mb-3">
          <GlitchType text="entering topia" speed={28} />
        </div>
        <div className="font-mono text-[10px] uppercase tracking-[2px] text-bone/30">
          {routing ? '↳ routing…' : '↳ authenticating…'}
        </div>
      </div>
    );
  }
  // No `if (!ready) return null` gate: the splash is pure branding with no
  // auth-dependent content, so it renders immediately AND server-renders —
  // which makes the star video (the LCP element) discoverable in the initial
  // HTML. Gating it on Privy `ready` cost ~2s of LCP. The only auth-dependent
  // piece is the CTA click, which no-ops until Privy is ready.
  return (
    <div
      className="fixed inset-0 overflow-hidden transition-colors duration-300"
      style={{ backgroundColor: 'var(--accent, #e4fe52)' }}
    >
      {/* Chrome star logo video — center, dominant */}
      <div className="absolute inset-0 flex items-center justify-center z-[2]">
        <video
          src="/brand/star-sequence.mp4"
          poster="/brand/star-poster.webp"
          autoPlay
          loop
          muted
          playsInline
          className="w-[clamp(300px,50vw,700px)] h-auto mix-blend-multiply"
          // Hint the preload scanner to fetch the LCP video first. React 19
          // supports fetchPriority but React's video prop types don't yet.
          {...({ fetchPriority: 'high' } as unknown as React.VideoHTMLAttributes<HTMLVideoElement>)}
        />
      </div>

      {/* Grain overlay */}
      <div
        className="absolute inset-0 opacity-[0.04] pointer-events-none z-[3]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='5' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
          backgroundSize: '200px',
        }}
      />

      {/* Top-left cluster */}
      <div className="absolute top-6 left-6 md:top-10 md:left-10 z-[10]">
        {phase >= 1 && (
          <div className="font-mono text-[9px] md:text-[11px] text-[#1a1a1a]/70 uppercase tracking-[2px]">
            <GlitchType text="a creator engine" speed={30} />
          </div>
        )}
        {phase >= 2 && (
          <div className="font-mono text-[9px] md:text-[11px] text-[#1a1a1a]/50 uppercase tracking-[2px] mt-0.5">
            <GlitchType text="for artists, by artists" speed={25} />
          </div>
        )}
        {phase >= 1 && (
          <div className="font-basement font-black text-[clamp(24px,3vw,36px)] text-[#1a1a1a] uppercase leading-none mt-3">
            <GlitchType text="TOPIA" speed={80} />
          </div>
        )}
      </div>

      {/* Top-right cluster */}
      <div className="absolute top-6 right-6 md:top-10 md:right-10 text-right z-[10]">
        {phase >= 2 && (
          <div className="font-mono text-[8px] md:text-[10px] text-[#1a1a1a]/50 uppercase tracking-[2px]">
            <GlitchType text="culture first." speed={30} />
          </div>
        )}
        {phase >= 3 && (
          <div className="font-mono text-[8px] md:text-[10px] text-[#1a1a1a]/50 uppercase tracking-[2px] mt-0.5">
            <GlitchType text="systems second." speed={30} />
          </div>
        )}
        {phase >= 4 && (
          <div className="font-mono text-[8px] md:text-[10px] text-[#1a1a1a]/70 uppercase tracking-[2px] mt-0.5 font-bold">
            <GlitchType text="ownership always." speed={25} />
          </div>
        )}
      </div>

      {/* Asterisk — top center */}
      <div className="absolute top-6 left-1/2 -translate-x-1/2 z-[10]">
        <span className="text-[#1a1a1a]/30 text-[20px] md:text-[28px]">※</span>
      </div>

      {/* Center text — overlaps with star video */}
      <div className="absolute left-1/2 top-[42%] -translate-x-1/2 text-center z-[4]">
        {phase >= 5 && (
          <div className="font-mono text-[10px] md:text-[13px] text-[#1a1a1a]/60 uppercase tracking-[3px]">
            <GlitchType text="build your world." speed={30} />
          </div>
        )}
      </div>

      {/* Mid-left — scattered metadata */}
      <div className="absolute left-6 md:left-10 top-[55%] z-[10]">
        {phase >= 4 && (
          <div className="font-mono text-[8px] text-[#1a1a1a]/40 uppercase tracking-[2px]">
            <GlitchType text="ecosystem" speed={35} />
          </div>
        )}
        {phase >= 4 && (
          <div className="font-mono text-[8px] text-[#1a1a1a]/40 uppercase tracking-[2px] mt-0.5">
            <GlitchType text="tools" speed={35} />
          </div>
        )}
        {phase >= 4 && (
          <div className="font-mono text-[8px] text-[#1a1a1a]/40 uppercase tracking-[2px] mt-0.5">
            <GlitchType text="community" speed={35} />
          </div>
        )}
      </div>

      {/* Mid-right — date and version */}
      <div className="absolute right-6 md:right-10 top-[55%] text-right z-[10]">
        {phase >= 3 && (
          <div className="font-mono text-[8px] text-[#1a1a1a]/40 uppercase tracking-[2px]">
            <GlitchType text="2026" speed={50} />
          </div>
        )}
        {phase >= 3 && (
          <div className="font-mono text-[8px] text-[#1a1a1a]/40 uppercase tracking-[2px] mt-0.5">
            <GlitchType text="v2.0" speed={50} />
          </div>
        )}
      </div>

      {/* BOTTOM — massive ENTER TOPIA. Visible (and legible) from first
          paint: the button used to exist invisibly until phase 6–7, leaving
          a ~4s window where the only interactive element on the page had no
          label. The phased choreography now only drives the progress line. */}
      <div className="absolute bottom-6 md:bottom-10 left-6 md:left-10 right-6 md:right-10 z-[10]">
        {/* Tagline */}
        <div className="flex justify-between items-end mb-2">
          <span className="font-mono text-[8px] text-[#1a1a1a]/40 uppercase tracking-[2px]">
            culture before tech.
          </span>
          <span className="font-mono text-[8px] text-[#1a1a1a]/40 uppercase tracking-[2px]">
            depth before data.
          </span>
        </div>

        {/* Big CTA — triggers Privy login (which routes via the home effect once authenticated) */}
        <button onClick={() => { if (ready) login(); }} className="group block no-underline w-full text-left bg-transparent border-none cursor-pointer p-0">
          <div className="flex items-baseline justify-between">
            <span className="font-basement font-black text-[clamp(48px,10vw,120px)] uppercase text-[#1a1a1a] leading-none group-hover:text-bone transition-colors duration-300">
              ENTER TOPIA
            </span>
            <span className="font-mono text-[#1a1a1a]/50 group-hover:text-bone/60 transition-colors duration-300 text-[clamp(24px,4vw,48px)]">
              →
            </span>
          </div>
          {/* Progress line — still rides the animation phases (decorative) */}
          <div className="mt-3 h-[2px] bg-[#1a1a1a]/10 rounded-full overflow-hidden">
            <div
              className={`h-full bg-[#1a1a1a]/40 rounded-full transition-all ease-out ${
                phase >= 7 ? 'w-full duration-[1500ms]' : 'w-0'
              }`}
            />
          </div>
          {/* One concrete line for cold visitors — what you can actually DO here. */}
          <span className="block mt-2 font-mono text-[10px] md:text-[11px] text-[#1a1a1a]/60 uppercase tracking-[2px]">
            events, worlds &amp; passports for the creative underground — join in one tap.
          </span>
        </button>

        {/* Quiet no-login exits — the splash must not be a login wall */}
        <div className="mt-3 flex items-center flex-wrap gap-x-2 gap-y-1 font-mono text-[9px] md:text-[10px] uppercase tracking-[2px]">
          <span className="text-[#1a1a1a]/40">or look around first</span>
          <Link href="/worlds" className="no-underline border-b border-[#1a1a1a]/25 text-[#1a1a1a]/60 hover:text-[#1a1a1a] hover:border-[#1a1a1a]/60 transition-colors pb-px">worlds</Link>
          <span className="text-[#1a1a1a]/30">·</span>
          <Link href="/events" className="no-underline border-b border-[#1a1a1a]/25 text-[#1a1a1a]/60 hover:text-[#1a1a1a] hover:border-[#1a1a1a]/60 transition-colors pb-px">events</Link>
          <span className="text-[#1a1a1a]/30">·</span>
          <Link href="/tv" className="no-underline border-b border-[#1a1a1a]/25 text-[#1a1a1a]/60 hover:text-[#1a1a1a] hover:border-[#1a1a1a]/60 transition-colors pb-px">tv</Link>
        </div>
      </div>
    </div>
  );
}
