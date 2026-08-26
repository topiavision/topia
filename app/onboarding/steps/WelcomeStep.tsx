'use client';

import { useEffect, useState } from 'react';
import GlitchType from '../../components/ui/GlitchType';

interface Props {
  onAdvance: () => void;
  name: string;
}

export default function WelcomeStep({ onAdvance, name }: Props) {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const t = [
      setTimeout(() => setPhase(1), 200),
      setTimeout(() => setPhase(2), 1200),
      setTimeout(() => setPhase(3), 2400),
    ];
    return () => t.forEach(clearTimeout);
  }, []);

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === 'Enter' && phase >= 3) onAdvance();
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onAdvance, phase]);

  return (
    <div className="relative min-h-screen bg-lime text-obsidian overflow-hidden flex flex-col">
      {/* grain */}
      <div
        className="absolute inset-0 opacity-[0.05] pointer-events-none"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='5' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
          backgroundSize: '200px',
        }}
      />

      {/* Top corner kicker */}
      <div className="relative z-10 flex items-center justify-between px-6 md:px-10 pt-6 md:pt-8">
        <span className="font-mono text-[11px] uppercase tracking-[2px] text-obsidian/50">topia://welcome</span>
        <span className="font-mono text-[11px] uppercase tracking-[2px] text-obsidian/40">first-time setup</span>
      </div>

      {/* Center */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 md:px-10 py-12">
        <div className="w-full max-w-3xl">
          {phase >= 1 && (
            <div className="font-mono text-[12px] md:text-[14px] uppercase tracking-[3px] text-obsidian/60 mb-4">
              <GlitchType text={`hello, ${String(name).toLowerCase().slice(0, 24)}.`} speed={26} />
            </div>
          )}
          {phase >= 2 && (
            <h1 className="font-basement font-black text-[clamp(40px,9vw,120px)] uppercase leading-[0.92] text-obsidian">
              <GlitchType text="LET'S BUILD YOUR PROFILE." speed={28} />
            </h1>
          )}
          {phase >= 3 && (
            <div
              className="mt-10 flex items-end justify-between gap-6"
              style={{ opacity: 0, animation: 'fadeUp 0.7s ease forwards' }}
            >
              <div className="font-mono text-[11px] md:text-[13px] uppercase tracking-[2px] text-obsidian/60 max-w-md">
                a few quick questions to set up your topia identity. takes about a minute.
              </div>
              <button
                onClick={onAdvance}
                className="font-basement font-black text-[clamp(20px,3vw,32px)] uppercase text-obsidian border-2 border-obsidian px-5 py-2.5 hover:bg-[var(--page-bg)] hover:text-ink transition-colors cursor-pointer bg-transparent shrink-0"
              >
                begin →
              </button>
            </div>
          )}
        </div>
      </main>

      {phase >= 3 && (
        <div
          className="relative z-10 px-6 md:px-10 pb-6 md:pb-8 text-center"
          style={{ opacity: 0, animation: 'fadeUp 0.7s ease 0.4s forwards' }}
        >
          <span className="font-mono text-[10px] uppercase tracking-[2px] text-obsidian/40">press enter ↵</span>
        </div>
      )}
    </div>
  );
}
