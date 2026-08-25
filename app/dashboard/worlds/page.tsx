'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { usePrivy } from '@privy-io/react-auth';
import { useDashboard } from '../_components/DashboardContext';

export default function DashboardWorldsPage() {
  const { worldMemberships, profile } = useDashboard();
  const { user } = usePrivy();
  const [busyId, setBusyId] = useState<string | null>(null);
  // Optimistic published overrides keyed by worldId (membership list is
  // context-derived, so we apply local state after archive/restore).
  const [pubOverride, setPubOverride] = useState<Record<string, boolean>>({});

  const sortedWorlds = useMemo(() => {
    return [...worldMemberships].sort((a, b) => {
      if (a.role === b.role) return 0;
      const priority = (r: string) => r === 'owner' ? 0 : r === 'world_builder' ? 1 : 2;
      return priority(a.role) - priority(b.role);
    });
  }, [worldMemberships]);

  const isPublished = (worldId: string, fallback: boolean | undefined) =>
    pubOverride[worldId] ?? (fallback ?? true);

  // Owner-only soft remove / restore — flips worlds.published. Recoverable.
  const setPublished = async (worldId: string, published: boolean) => {
    if (!user?.id) return;
    setBusyId(worldId);
    try {
      const res = await fetch('/api/worlds/archive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ privyId: user.id, worldId, published }),
      });
      if (res.ok) setPubOverride((p) => ({ ...p, [worldId]: published }));
    } finally {
      setBusyId(null);
    }
  };


  return (
    <div>
      {/* Header band */}
      <div className="border border-ink/[0.08] rounded-lg overflow-hidden mb-6">
        <div className="bg-lime px-5 py-4 flex items-center justify-between gap-3">
          <div>
            <span className="font-mono text-[10px] uppercase tracking-[2px] text-obsidian/50 block">topia://your-worlds</span>
            <h1 className="font-basement font-black text-[clamp(22px,3.5vw,32px)] uppercase leading-[0.9] text-obsidian mt-0.5">
              Worlds.
            </h1>
          </div>
          {(
            <Link
              href="/dashboard/create-world"
              className="font-mono text-[11px] uppercase tracking-[2px] bg-obsidian text-lime px-3 py-1.5 rounded-sm hover:opacity-90 transition no-underline shrink-0 font-bold"
            >
              + World
            </Link>
          )}
        </div>
        <div className="bg-[var(--page-bg)] px-5 py-2.5">
          <span className="font-mono text-[11px] text-ink/50">
            <span className="text-ink font-bold">{sortedWorlds.length}</span> world{sortedWorlds.length === 1 ? '' : 's'} you&apos;re part of
          </span>
        </div>
      </div>

      {sortedWorlds.length === 0 ? (
        <div className="border border-ink/[0.08] rounded-lg bg-[var(--page-bg)] p-10 text-center">
          <p className="font-basement font-black text-[22px] uppercase text-ink leading-tight">No worlds yet.</p>
          <p className="font-mono text-[12px] text-ink/50 mt-2 max-w-xs mx-auto">
            A world is your scene — a place creators rally around. Start one, or join one you love.
          </p>
          <div className="mt-4 flex items-center justify-center gap-2 flex-wrap">
            {(
              <Link
                href="/dashboard/create-world"
                className="font-mono text-[11px] uppercase tracking-[2px] bg-lime text-obsidian px-4 py-2 rounded-sm hover:opacity-90 transition no-underline font-bold"
              >
                + Create a world
              </Link>
            )}
            <Link
              href="/worlds"
              className="font-mono text-[11px] uppercase tracking-[2px] text-ink/60 border border-ink/20 hover:border-ink/60 hover:text-ink px-4 py-2 rounded-sm transition no-underline"
            >
              Explore worlds
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {sortedWorlds.map((wm) => {
            const published = isPublished(wm.worldId, wm.worldPublished);
            return (
              <div
                key={wm.worldId}
                className={`border border-ink/[0.08] rounded-lg overflow-hidden bg-[var(--page-bg)] ${!published ? 'opacity-80' : ''}`}
              >
                {/* Cover — clicks through to manage */}
                <Link href={`/dashboard/worlds/${wm.worldSlug}`} className="block aspect-video overflow-hidden bg-ink/[0.04] no-underline">
                  {wm.worldImageUrl && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={wm.worldImageUrl} alt={wm.worldTitle} className="w-full h-full object-cover" style={{ objectPosition: 'center 35%' }} />
                  )}
                </Link>

                {/* Info */}
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-mono text-[13px] font-bold uppercase text-ink truncate">{wm.worldTitle}</h3>
                    <span className="flex items-center gap-1.5 shrink-0">
                      {!published && (
                        <span className="font-mono text-[9px] uppercase tracking-[1px] px-1.5 py-0.5 rounded-sm border border-ink/20 text-ink/50">
                          Archived
                        </span>
                      )}
                      <span className="font-mono text-[9px] uppercase tracking-[2px] text-ink/30">
                        {wm.role === 'owner' ? 'Owner' : wm.role === 'world_builder' ? 'Builder' : 'Collab'}
                      </span>
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap mt-3">
                    <Link
                      href={`/dashboard/worlds/${wm.worldSlug}`}
                      className="font-mono text-[10px] uppercase tracking-[1px] bg-lime text-obsidian font-bold px-2.5 py-1 rounded-sm hover:opacity-90 transition no-underline"
                    >
                      Manage
                    </Link>
                    <Link
                      href={`/worlds/${wm.worldSlug}`}
                      className="font-mono text-[10px] uppercase tracking-[1px] text-ink/60 border border-ink/15 hover:border-ink/40 hover:text-ink px-2.5 py-1 rounded-sm transition no-underline"
                    >
                      View
                    </Link>
                    {wm.role === 'owner' && (
                      published ? (
                        <button
                          onClick={() => setPublished(wm.worldId, false)}
                          disabled={busyId === wm.worldId}
                          className="font-mono text-[10px] uppercase tracking-[1px] text-orange border border-ink/15 hover:border-orange/50 px-2.5 py-1 rounded-sm transition disabled:opacity-40 cursor-pointer bg-transparent"
                          title="Hide from the public site (recoverable)"
                        >
                          {busyId === wm.worldId ? '…' : 'Archive'}
                        </button>
                      ) : (
                        <button
                          onClick={() => setPublished(wm.worldId, true)}
                          disabled={busyId === wm.worldId}
                          className="font-mono text-[10px] uppercase tracking-[1px] text-ink/60 border border-ink/15 hover:border-ink/40 hover:text-ink px-2.5 py-1 rounded-sm transition disabled:opacity-40 cursor-pointer bg-transparent"
                          title="Restore to the public site"
                        >
                          {busyId === wm.worldId ? '…' : 'Restore'}
                        </button>
                      )
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
