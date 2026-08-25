'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import GlitchType from '../../components/ui/GlitchType';
import { PathConfig } from '../../components/profile/pathConfig';
import TopiaCard from '../../components/profile/TopiaCard';

interface Props {
  config: PathConfig | null;
  name: string;
  username: string;
  avatarUrl: string;
  roleTags: string[];
  path?: string;
}

export default function DoneStep({ config, name, username, avatarUrl, roleTags, path }: Props) {
  const [phase, setPhase] = useState(0);
  const [saving, setSaving] = useState(false);

  const saveCard = async () => {
    if (!username) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/profile/${encodeURIComponent(username)}/card`);
      if (!res.ok) throw new Error('failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `${username}-topia-card.png`; a.click();
      URL.revokeObjectURL(url);
    } catch { /* ignore */ }
    finally { setSaving(false); }
  };
  const accent = config?.hex ?? '#e4fe52';
  const accentBg = config?.bg ?? 'bg-lime';
  const accentTextOn = config?.textOn ?? 'text-obsidian';

  useEffect(() => {
    const t = [
      setTimeout(() => setPhase(1), 200),
      setTimeout(() => setPhase(2), 1200),
      setTimeout(() => setPhase(3), 2200),
      setTimeout(() => setPhase(4), 3000),
    ];
    return () => t.forEach(clearTimeout);
  }, []);

  return (
    <div className="relative min-h-screen bg-[var(--page-bg)] text-ink overflow-hidden">
      {/* texture */}
      <div
        className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage:
            'repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(245,240,232,1) 4px, rgba(245,240,232,1) 5px), repeating-linear-gradient(-45deg, transparent, transparent 4px, rgba(245,240,232,1) 4px, rgba(245,240,232,1) 5px)',
        }}
      />
      {/* path-tinted radial glow */}
      <div
        className="absolute inset-0 pointer-events-none transition-opacity duration-700"
        style={{
          opacity: phase >= 1 ? 0.18 : 0,
          background: `radial-gradient(circle at 50% 45%, ${accent} 0%, transparent 55%)`,
        }}
      />

      {/* Top bar */}
      <div className="relative z-10 flex items-center justify-between px-6 md:px-10 pt-6 md:pt-8">
        <span className="font-mono text-[11px] uppercase tracking-[2px] text-ink/30">topia://identity issued</span>
        <span className="font-mono text-[11px] uppercase tracking-[2px] text-ink/40">complete</span>
      </div>

      {/* Center */}
      <main className="relative z-10 flex flex-col items-center justify-center min-h-[calc(100vh-120px)] px-6 md:px-10 py-12">
        <div className="w-full max-w-3xl text-center">
          {phase >= 1 && (
            <div className="font-mono text-[12px] md:text-[14px] uppercase tracking-[3px] text-ink/40 mb-4">
              <GlitchType text="profile activated." speed={26} />
            </div>
          )}
          {phase >= 2 && (
            <h1 className="font-basement font-black text-[clamp(40px,8vw,96px)] uppercase leading-[0.92] text-ink">
              <GlitchType text={`welcome, ${name || 'creator'}.`} speed={28} />
            </h1>
          )}

          {/* Interactive Topia card — move it, then save to share */}
          {phase >= 3 && (
            <div
              className="mt-12 flex flex-col items-center"
              style={{ opacity: 0, animation: 'fadeUp 0.7s ease forwards' }}
            >
              <TopiaCard name={name} username={username} avatarUrl={avatarUrl} roleTags={roleTags} path={path} />
              {username && (
                <button
                  onClick={saveCard}
                  disabled={saving}
                  className="mt-4 font-mono text-[11px] uppercase tracking-[2px] text-ink/50 hover:text-ink underline bg-transparent border-none cursor-pointer disabled:opacity-50"
                >
                  {saving ? 'saving…' : 'save your card image →'}
                </button>
              )}
            </div>
          )}

          {phase >= 4 && (
            <div style={{ opacity: 0, animation: 'fadeUp 0.7s ease forwards' }}>
              <div className="mt-10 flex items-center justify-center gap-4">
                {username && (
                  <>
                  <Link
                    href="/profile?assistant=1"
                    className="font-mono text-[11px] uppercase tracking-[2px] bg-lime text-obsidian font-bold px-3 py-1.5 rounded-sm no-underline hover:opacity-90 transition"
                  >
                    ✦ Finish your passport
                  </Link>
                  <Link
                    href={`/profile/${username}`}
                    className={`font-mono font-bold text-[13px] md:text-[15px] uppercase tracking-[2px] ${accentBg} ${accentTextOn} px-7 py-3.5 rounded-md no-underline transition-all duration-200 hover:-translate-y-0.5 hover:scale-[1.03]`}
                    style={{ boxShadow: `0 8px 28px -6px ${accent}99` }}
                  >
                    view your profile →
                  </Link>
                  </>
                )}
                <Link
                  href="/home"
                  className="font-mono text-[12px] uppercase tracking-[2px] text-ink/50 hover:text-ink transition-colors no-underline border border-ink/20 hover:border-ink/50 px-4 py-2.5"
                >
                  explore topia
                </Link>
              </div>
              <p className="mt-6 font-mono text-[11px] uppercase tracking-[2px] text-ink/30">
                add your craft, bio &amp; links anytime from your profile
              </p>
            </div>
          )}
        </div>
      </main>

      {/* bottom accent */}
      <div
        className="absolute bottom-0 left-0 right-0 h-[3px] pointer-events-none"
        style={{ background: `linear-gradient(90deg, transparent, ${accent}40, ${accent}, ${accent}40, transparent)` }}
      />
    </div>
  );
}
