'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import PageShell from '../components/PageShell';
import BlobImage from '../components/BlobImage';
import { PATH_CONFIG, type UserPath } from '../components/profile/pathConfig';

export interface TopianProfile {
  id: string;
  username: string | null;
  name: string | null;
  avatarUrl: string | null;
  roleTags: string | null;
  path: string | null;
  bio: string | null;
  pronouns: string | null;
  isWorldBuilder?: boolean;
  createdAt?: string;
}

// New if the profile was created within the last 21 days.
function isNewProfile(createdAt?: string): boolean {
  if (!createdAt) return false;
  const t = new Date(createdAt).getTime();
  return !isNaN(t) && Date.now() - t < 21 * 24 * 60 * 60 * 1000;
}

// Passport-style machine-readable line for the card footer. Pure decoration —
// aria-hidden everywhere it renders.
function mrzLine(p: TopianProfile): string {
  const name = (p.username || p.name || 'topian').replace(/[^a-z0-9]/gi, '<').toUpperCase();
  return `T<TOPIA<${name.padEnd(16, '<')}${p.id.slice(0, 6).toUpperCase()}<<`;
}

/* ── Passport ID card ─────────────────────────────────────────── */
function TopianCard({ p, eager }: { p: TopianProfile; eager: boolean }) {
  const config = p.path && p.path in PATH_CONFIG ? PATH_CONFIG[p.path as UserPath] : null;
  const stripBg = p.isWorldBuilder ? 'bg-lime' : config?.bg ?? 'bg-lime';
  const stripText = p.isWorldBuilder ? 'text-obsidian' : config?.textOn ?? 'text-obsidian';
  // Paths are hidden until they mean something (owner decision, Aug 2026):
  // 'World Builder' is earned (owns a world); everyone else reads Topian.
  const stripLabel = p.isWorldBuilder ? 'World Builder' : 'Topian';
  const tags = (p.roleTags ?? '').split(',').map((t) => t.trim()).filter(Boolean).slice(0, 3);
  const initial = (p.name || p.username || '?')[0]?.toUpperCase();

  return (
    <Link
      href={`/profile/${p.username}`}
      className="group block border border-ink/[0.08] hover:border-[var(--accent-ink)]/50 rounded-lg overflow-hidden bg-ink/[0.02] transition-colors no-underline"
    >
      {/* Path-colored issue strip */}
      <div className={`${stripBg} px-2.5 py-1.5 flex items-center justify-between`}>
        <span className={`font-mono text-[8px] uppercase tracking-[1.5px] font-bold ${stripText}`}>{stripLabel}</span>
        <span className={`font-mono text-[8px] uppercase tracking-[1.5px] ${stripText} opacity-50`} aria-hidden="true">
          T-{p.id.slice(0, 4).toUpperCase()}
        </span>
      </div>

      {/* Passport photo — framed, corner ticks, scanlines */}
      <div className="p-2.5 pb-0">
        <div className="relative">
          <div className="absolute -top-1 -left-1 w-3 h-3 z-20 pointer-events-none"><div className="absolute top-0 left-0 w-full h-[1px] bg-ink/20" /><div className="absolute top-0 left-0 h-full w-[1px] bg-ink/20" /></div>
          <div className="absolute -top-1 -right-1 w-3 h-3 z-20 pointer-events-none"><div className="absolute top-0 right-0 w-full h-[1px] bg-ink/20" /><div className="absolute top-0 right-0 h-full w-[1px] bg-ink/20" /></div>
          <div className="absolute -bottom-1 -left-1 w-3 h-3 z-20 pointer-events-none"><div className="absolute bottom-0 left-0 w-full h-[1px] bg-ink/20" /><div className="absolute bottom-0 left-0 h-full w-[1px] bg-ink/20" /></div>
          <div className="absolute -bottom-1 -right-1 w-3 h-3 z-20 pointer-events-none"><div className="absolute bottom-0 right-0 w-full h-[1px] bg-ink/20" /><div className="absolute bottom-0 right-0 h-full w-[1px] bg-ink/20" /></div>

          <div className="aspect-square rounded-md overflow-hidden border border-dashed border-ink/15 p-1">
            <div className="w-full h-full rounded-sm relative overflow-hidden border border-ink/15 bg-ink/[0.04]">
              {p.avatarUrl ? (
                <BlobImage
                  src={p.avatarUrl}
                  alt={p.name ?? ''}
                  width={480}
                  height={480}
                  sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 260px"
                  priority={eager}
                  className="w-full h-full object-cover relative z-10 group-hover:scale-[1.04] transition-transform duration-500"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center font-basement font-black text-[42px] text-ink/15">{initial}</div>
              )}
              {/* Scanline pass */}
              <div className="absolute inset-0 pointer-events-none z-20" style={{ opacity: 0.09, backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 1px, rgba(0,0,0,0.5) 1px, rgba(0,0,0,0.5) 2px)', backgroundSize: '100% 2px' }} />
              {isNewProfile(p.createdAt) && (
                <span className="absolute top-1.5 right-1.5 z-30 inline-flex items-center font-mono text-[8px] uppercase tracking-[1.5px] leading-none px-1.5 py-1 rounded-sm font-bold bg-pink text-obsidian">
                  New
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Registry fields */}
      <div className="px-3 pt-2.5">
        <span className="font-mono text-[8px] font-semibold uppercase tracking-[2px] text-ink/40 block">designation</span>
        <h3 className="font-basement font-black text-[15px] uppercase text-ink truncate leading-tight mt-0.5">
          {p.name || `@${p.username}`}
        </h3>
        <span className="font-mono text-[10px] text-ink/40 block truncate">
          @{p.username}{p.pronouns ? ` · ${p.pronouns}` : ''}
        </span>
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {tags.map((t) => (
              <span key={t} className="font-mono text-[8px] uppercase tracking-wider px-1.5 py-0.5 border border-ink/15 text-ink/50 rounded-sm whitespace-nowrap">
                {t.replace(/-/g, ' ')}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* MRZ footer */}
      <div className="px-3 py-2 mt-1.5 border-t border-ink/[0.05]">
        <span className="font-mono text-[8px] tracking-[1.5px] text-ink/15 uppercase truncate block" aria-hidden="true">
          {mrzLine(p)}
        </span>
      </div>
    </Link>
  );
}

// /topians — the full TOPIA directory. Every published profile, searchable
// and filterable by what people do. The home Discover carousel links here.
// The directory is server-rendered (see page.tsx); search/filter run client-side.
export default function TopiansClient({ initialProfiles }: { initialProfiles: TopianProfile[] }) {
  const [search, setSearch] = useState('');
  const [tag, setTag] = useState<string>('all');
  const profiles = initialProfiles;

  // The most common role tags across the directory become the filter chips.
  const topTags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of profiles) {
      for (const t of (p.roleTags ?? '').split(',').map((s) => s.trim()).filter(Boolean)) {
        counts.set(t, (counts.get(t) ?? 0) + 1);
      }
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([t]) => t);
  }, [profiles]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return profiles.filter((p) => {
      if (tag !== 'all') {
        const tags = (p.roleTags ?? '').split(',').map((s) => s.trim().toLowerCase());
        if (!tags.includes(tag.toLowerCase())) return false;
      }
      if (!q) return true;
      return (p.name ?? '').toLowerCase().includes(q) || (p.username ?? '').toLowerCase().includes(q);
    });
  }, [profiles, search, tag]);

  return (
    <PageShell>
      <div className="min-h-screen bg-[var(--page-bg)] text-ink">
        <section className="px-4 md:px-6 py-4 md:py-6">
          <div className="max-w-[var(--content-max)] mx-auto">
            <div className="grid grid-cols-1 gap-[3px] border border-ink/[0.08] rounded-lg overflow-hidden">

              {/* ─── ROW 1: Title bar ─── */}
              <div className="bg-lime relative">
                <div className="px-4 md:px-6 py-4 md:py-5 flex flex-col md:flex-row md:items-end md:justify-between gap-3">
                  <div>
                    <span className="font-mono text-[11px] uppercase tracking-[2px] text-[var(--on-accent-muted)] block">topia://directory</span>
                    <h1 className="font-basement font-black text-[clamp(28px,5vw,64px)] uppercase leading-[0.9] text-obsidian mt-1">
                      TOPIANS
                    </h1>
                  </div>
                  <div className="flex flex-col items-start md:items-end gap-1">
                    <span className="font-mono text-[12px] text-obsidian/80 leading-snug">every creator&apos;s passport — their profile here,</span>
                    <span className="font-mono text-[12px] text-[var(--on-accent-muted)] leading-snug">stamped as they move through topia.</span>
                  </div>
                </div>
              </div>

              {/* ─── ROW 2: Search + count ─── */}
              <div className="bg-[var(--page-bg)] border-t border-b border-ink/[0.06] px-4 py-3 flex flex-col md:flex-row md:items-center gap-3 md:gap-4 sticky top-0 md:top-[var(--nav-height,56px)] z-30">
                <div className="relative flex-1">
                  <input
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="search a name or @handle…"
                    className="w-full bg-transparent border border-ink/15 focus:border-ink/40 font-mono text-[13px] text-ink placeholder:text-ink/25 px-3 py-1.5 rounded-sm outline-none transition-colors"
                  />
                </div>
                <span className="font-mono text-[11px] uppercase tracking-[2px] text-[var(--text-muted)] md:ml-auto shrink-0">
                  {filtered.length} topian{filtered.length !== 1 ? 's' : ''}
                </span>
              </div>

              {/* ─── ROW 3: Role chips ─── */}
              {topTags.length > 0 && (
                <div className="bg-[var(--page-bg)] border-b border-ink/[0.06] px-4 py-2 flex items-center gap-1.5 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
                  {['all', ...topTags].map((t) => {
                    const active = tag === t;
                    return (
                      <button
                        key={t}
                        onClick={() => setTag(t)}
                        className={`font-mono text-[11px] uppercase tracking-wider px-2.5 py-1 rounded-sm whitespace-nowrap transition cursor-pointer ${
                          active
                            ? 'bg-lime text-obsidian font-bold border-transparent'
                            : 'text-[var(--text-muted)] hover:text-ink/80 bg-transparent border border-transparent'
                        }`}
                      >
                        {t === 'all' ? 'all' : t.replace(/-/g, ' ')}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* ─── ROW 4: Registry grid ─── */}
              <div className="bg-[var(--page-bg)] p-4 md:p-6 min-h-[400px]">
                {filtered.length === 0 ? (
                  <div className="text-center py-16">
                    <p className="font-mono text-[13px] uppercase tracking-[2px] text-[var(--text-muted)] mb-4">
                      no topians match{search ? ` "${search}"` : ''}{tag !== 'all' ? ` in ${tag.replace(/-/g, ' ')}` : ''}
                    </p>
                    <button
                      onClick={() => { setSearch(''); setTag('all'); }}
                      className="font-mono text-[11px] uppercase tracking-[2px] text-ink/60 border border-ink/20 hover:border-ink/60 px-3 py-1.5 rounded-sm bg-transparent cursor-pointer transition"
                    >
                      clear filters
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
                    {filtered.map((p, i) => (
                      <TopianCard key={p.id} p={p} eager={i < 4} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      </div>
    </PageShell>
  );
}
