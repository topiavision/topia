'use client';

import Link from 'next/link';
import { PathConfig, COLOR_HEX } from './pathConfig';

const STATUS_STYLE: Record<string, string> = {
  dormant: 'text-ink/40 border-ink/[0.12]',
  active: 'text-[var(--accent-ink)] border-[var(--accent-ink)]/30',
  live: 'text-pink border-pink/40',
  rising: 'text-cyan border-cyan/40',
};

interface WorldItem {
  worldId: string;
  worldTitle: string;
  worldSlug: string;
  worldImageUrl?: string | null;
  worldCategory?: string | null;
  role: string;
}

interface Props {
  config: PathConfig;
  isWorldBuilder: boolean;
  worlds: WorldItem[];
  isOwnProfile?: boolean;
  ownerName?: string;
}

const COLORS = ['lime', 'blue', 'pink', 'orange', 'green'];

export default function WorldsLayer({ config, worlds, isOwnProfile = false, ownerName }: Props) {
  const sectionLabel = isOwnProfile ? 'Your Worlds' : `${ownerName || 'Their'}'s Worlds`;

  return (
    <div className="bg-[var(--page-bg)] flex flex-col h-full">
      <div className={`${config.bg} px-4 py-2.5 flex items-center justify-between`}>
        <span className={`font-mono text-[11px] uppercase tracking-wider font-bold ${config.textOn}`}>{sectionLabel}</span>
        <span className={`font-mono text-[9px] uppercase tracking-[2px] ${config.textOn} opacity-30`}>{worlds.length} {worlds.length === 1 ? 'world' : 'worlds'}</span>
      </div>

      {worlds.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2.5 text-center">
          <span className="font-mono text-[11px] text-ink/20 uppercase tracking-wider">No worlds yet</span>
          <Link href="/worlds" className="font-mono text-[11px] text-[var(--accent-ink)] no-underline hover:underline">
            explore worlds →
          </Link>
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-x-auto overflow-y-hidden p-3 flex gap-3" style={{ scrollbarWidth: 'thin' }}>
          {worlds.map((w, i) => {
            const colorKey = COLORS[i % COLORS.length];
            const status = w.role === 'owner' ? 'live' : w.role === 'world_builder' ? 'active' : 'rising';
            return (
              <Link key={w.worldId} href={`/worlds/${w.worldSlug}`} className="group flex flex-col w-[min(340px,85vw)] shrink-0 h-full rounded-lg overflow-hidden border border-ink/[0.08] bg-[var(--page-bg)] hover:border-ink/25 transition-colors no-underline">
                <div className="relative flex-1 min-h-0 overflow-hidden bg-ink/[0.04]">
                  {w.worldImageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={w.worldImageUrl} alt="" className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.04]" />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center p-3">
                      <span className="font-basement font-black text-[clamp(20px,5vw,32px)] uppercase text-ink/10 text-center leading-none">{w.worldTitle}</span>
                    </div>
                  )}
                  <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.82), transparent 55%)' }} />
                  <span className={`absolute top-2.5 right-2.5 font-mono text-[8px] uppercase tracking-wider border rounded-sm px-2 py-0.5 backdrop-blur-sm bg-[var(--page-bg)]/50 ${STATUS_STYLE[status] || STATUS_STYLE.dormant}`}>{status}</span>
                  {w.worldCategory && <span className="absolute bottom-2.5 left-3 font-mono text-[9px] uppercase tracking-[2px] text-ink/55">{w.worldCategory}</span>}
                </div>
                <div className="p-3 shrink-0">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: COLOR_HEX[colorKey] || config.hex }} />
                    <span className="font-mono text-[13px] text-ink font-bold uppercase truncate">{w.worldTitle}</span>
                  </div>
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-ink/[0.06]">
                    <span className="font-mono text-[9px] uppercase tracking-[2px] text-ink/25">role</span>
                    <span className="font-mono text-[11px] text-ink/70 font-bold uppercase">{w.role.replace('_', ' ')}</span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
