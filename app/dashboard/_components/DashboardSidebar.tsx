'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useDashboard } from './DashboardContext';
import { useSidebar } from './SidebarContext';

export default function DashboardSidebar() {
  const pathname = usePathname();
  const { worldMemberships, profile, features } = useDashboard();
  const { collapsed, toggle } = useSidebar();
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const switcherRef = useRef<HTMLDivElement>(null);

  const sortedWorlds = useMemo(() => {
    return [...worldMemberships].sort((a, b) => {
      if (a.role === b.role) return 0;
      const priority = (r: string) => r === 'owner' ? 0 : r === 'world_builder' ? 1 : 2;
      return priority(a.role) - priority(b.role);
    });
  }, [worldMemberships]);

  // Determine current context from URL
  const currentWorldSlug = useMemo(() => {
    const match = pathname.match(/^\/dashboard\/worlds\/([^/]+)/);
    return match ? match[1] : null;
  }, [pathname]);

  const currentWorld = currentWorldSlug
    ? worldMemberships.find((w) => w.worldSlug === currentWorldSlug)
    : null;

  // Close switcher on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (switcherRef.current && !switcherRef.current.contains(e.target as Node)) {
        setSwitcherOpen(false);
      }
    }
    if (switcherOpen) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [switcherOpen]);

  function isActive(href: string) {
    return pathname === href;
  }

  const worldSubItems = (slug: string) => [
    { label: 'Overview', href: `/dashboard/worlds/${slug}` },
    { label: 'Details', href: `/dashboard/worlds/${slug}/details`, tourId: 'tour-hq-details' },
    { label: 'Projects', href: `/dashboard/worlds/${slug}/projects`, tourId: 'tour-hq-projects' },
    { label: 'In Process', href: `/dashboard/worlds/${slug}/in-process`, tourId: 'tour-hq-inprocess' },
    { label: 'Members', href: `/dashboard/worlds/${slug}/members`, tourId: 'tour-hq-members' },
  ];

  const personalItems = [
    { label: 'Overview', href: '/dashboard' },
    { label: 'Events', href: '/dashboard/events' },
    /* Personal, not per-world: one Stripe account covers every world you admin
     * and every event you host. Shown only to accounts granted funding — the
     * phased rollout — and the page itself still renders its own "not switched
     * on" state for anyone who reaches the URL without the grant. */
    ...(features.includes('funding') ? [{ label: 'Payouts', href: '/dashboard/payouts' }] : []),
  ];

  /* ── Context switcher ─────────────────────────────────── */
  const contextSwitcher = (
    <div ref={switcherRef} className="relative px-3 pb-3">
      <button
        onClick={() => setSwitcherOpen(!switcherOpen)}
        className="w-full flex items-center gap-2 px-2.5 py-2 rounded-sm border bg-ink/[0.02] border-ink/15 text-ink hover:border-[var(--accent-ink)]/40 hover:bg-ink/[0.05] transition cursor-pointer"
      >
        {currentWorld ? (
          <>
            {currentWorld.worldImageUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={currentWorld.worldImageUrl} alt="" className="w-5 h-5 rounded-full object-cover shrink-0" />
            ) : (
              <div className="w-5 h-5 rounded-full shrink-0 flex items-center justify-center font-basement text-[11px] bg-lime text-obsidian">
                {currentWorld.worldTitle[0]?.toUpperCase()}
              </div>
            )}
            <span className="font-mono text-[11px] uppercase tracking-wider font-bold truncate flex-1 text-left">{currentWorld.worldTitle}</span>
          </>
        ) : (
          <>
            {profile?.avatarUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={profile.avatarUrl} alt="" className="w-5 h-5 rounded-full object-cover shrink-0" />
            ) : (
              <div className="w-5 h-5 rounded-full shrink-0 flex items-center justify-center bg-lime">
                <span className="font-basement text-[12px] text-obsidian">{(profile?.name?.[0] || profile?.username?.[0] || '?').toUpperCase()}</span>
              </div>
            )}
            <span className="font-mono text-[11px] uppercase tracking-wider font-bold truncate flex-1 text-left">{profile?.username ? `@${profile.username}` : profile?.name || 'You'}</span>
          </>
        )}
        <span className="font-mono text-[12px] text-ink/40 shrink-0" style={{ transform: switcherOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 200ms' }}>▾</span>
      </button>

      {/* Dropdown */}
      {switcherOpen && (
        <div className="absolute left-3 right-3 top-full mt-1 border border-ink/15 rounded-sm overflow-hidden shadow-2xl z-30 bg-[var(--page-bg)]">
          {/* Personal option */}
          <Link
            href="/dashboard"
            onClick={() => setSwitcherOpen(false)}
            className={`flex items-center gap-2 px-3 py-2 transition border-b border-ink/10 no-underline ${!currentWorld ? 'bg-ink/[0.06]' : 'hover:bg-ink/[0.03]'}`}
          >
            {profile?.avatarUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={profile.avatarUrl} alt="" className="w-5 h-5 rounded-full object-cover shrink-0" />
            ) : (
              <div className="w-5 h-5 rounded-full shrink-0 flex items-center justify-center bg-lime">
                <span className="font-basement text-[12px] text-obsidian">{(profile?.name?.[0] || profile?.username?.[0] || '?').toUpperCase()}</span>
              </div>
            )}
            <span className="font-mono text-[11px] uppercase tracking-wider flex-1 truncate text-ink">{profile?.username ? `@${profile.username}` : profile?.name || 'You'}</span>
            {!currentWorld && <span className="w-1.5 h-1.5 rounded-full bg-lime shrink-0" />}
          </Link>

          {/* World options */}
          {sortedWorlds.length > 0 && (
            <div className="py-1">
              <p className="font-mono text-[10px] uppercase tracking-[2px] text-ink/30 px-3 py-1.5">Worlds · {sortedWorlds.length}</p>
              {sortedWorlds.map((w) => (
                <Link
                  key={w.worldId}
                  href={`/dashboard/worlds/${w.worldSlug}`}
                  onClick={() => setSwitcherOpen(false)}
                  className={`flex items-center gap-2 px-3 py-1.5 transition no-underline ${currentWorldSlug === w.worldSlug ? 'bg-ink/[0.06]' : 'hover:bg-ink/[0.03]'}`}
                >
                  {w.worldImageUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={w.worldImageUrl} alt="" className="w-5 h-5 rounded-full object-cover shrink-0" />
                  ) : (
                    <div className="w-5 h-5 rounded-full shrink-0 flex items-center justify-center font-basement text-[11px] bg-lime text-obsidian">
                      {w.worldTitle[0]?.toUpperCase()}
                    </div>
                  )}
                  <span className="font-mono text-[11px] uppercase tracking-wider flex-1 truncate text-ink">{w.worldTitle}</span>
                  <span className="font-mono text-[9px] uppercase tracking-wider text-ink/30 shrink-0">
                    {w.role === 'owner' ? 'OWN' : w.role === 'world_builder' ? 'BLD' : 'COL'}
                  </span>
                  {currentWorldSlug === w.worldSlug && <span className="w-1.5 h-1.5 rounded-full bg-lime shrink-0" />}
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );

  /* ── Nav items (changes entirely based on context) ───── */
  const navItems = currentWorld
    ? worldSubItems(currentWorld.worldSlug)
    : personalItems;

  const navSection = (
    <nav className="flex-1 overflow-y-auto px-2">
      <p className="font-mono text-[10px] uppercase tracking-[2px] text-ink/25 px-2 py-1 mt-1">
        {currentWorld ? 'Manage' : 'Personal'}
      </p>
      {navItems.map((item) => (
        <Link
          key={item.href}
          id={(item as { tourId?: string }).tourId}
          href={item.href}
          className={`flex items-center gap-2 px-2 py-1.5 rounded-sm transition-colors mb-0.5 no-underline ${
            isActive(item.href) ? 'bg-lime text-obsidian font-bold' : 'text-ink/60 hover:text-ink hover:bg-ink/[0.04]'
          }`}
        >
          <span className="font-mono text-[11px] uppercase tracking-wider">{item.label}</span>
        </Link>
      ))}

      {/* Quick links section */}
      {!currentWorld && (
        <>
          <p className="font-mono text-[10px] uppercase tracking-[2px] text-ink/25 px-2 py-1 mt-4">Quick</p>
          {[
            { label: 'Tools', href: '/resources/tools' },
            { label: 'Worlds', href: '/worlds' },
            { label: 'Events', href: '/events' },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-2 px-2 py-1.5 rounded-sm text-ink/40 hover:text-ink hover:bg-ink/[0.04] transition-colors mb-0.5 no-underline"
            >
              <span className="font-mono text-[11px] uppercase tracking-wider">{item.label} →</span>
            </Link>
          ))}
        </>
      )}
    </nav>
  );

  /* ── Bottom links ─────────────────────────────────────── */
  const bottomLinks = (
    <div className="px-2 pb-6 pt-3 border-t border-ink/[0.06]">
      {currentWorld ? (
        <a
          href={`/worlds/${currentWorld.worldSlug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-2 py-1.5 rounded-sm text-ink/40 hover:text-ink hover:bg-ink/[0.04] transition no-underline"
        >
          <span className="font-mono text-[11px] uppercase tracking-wider">View World ↗</span>
        </a>
      ) : (
        <>
          <Link
            href="/profile"
            className="flex items-center gap-2 px-2 py-1.5 rounded-sm text-ink/40 hover:text-ink hover:bg-ink/[0.04] transition no-underline"
          >
            <span className="font-mono text-[11px] uppercase tracking-wider">Edit Profile</span>
          </Link>
          {profile?.username && (
            <Link
              href={`/profile/${profile.username}`}
              className="flex items-center gap-2 px-2 py-1.5 rounded-sm text-ink/40 hover:text-ink hover:bg-ink/[0.04] transition no-underline"
            >
              <span className="font-mono text-[11px] uppercase tracking-wider">View Profile ↗</span>
            </Link>
          )}
        </>
      )}
    </div>
  );

  /* ── Collapsed rail nav (compact mode) ───────────────── */
  // Shows just the avatar + a row of single-letter tabs so users can still
  // navigate without expanding. The expand chevron sits at the bottom.
  const railNav = (
    <nav className="flex-1 flex flex-col items-center gap-1 px-2 overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
      {navItems.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          title={item.label}
          className={`w-9 h-9 rounded-sm flex items-center justify-center font-mono text-[11px] uppercase tracking-wider transition-colors no-underline ${
            isActive(item.href)
              ? 'bg-lime text-obsidian font-bold'
              : 'text-ink/50 hover:text-ink hover:bg-ink/[0.04]'
          }`}
        >
          {item.label[0]?.toUpperCase()}
        </Link>
      ))}
      {!currentWorld && (
        <>
          <div className="w-6 h-px bg-ink/15 my-2" />
          {[
            { label: 'Tools',  href: '/resources/tools', glyph: 'T' },
            { label: 'Worlds', href: '/worlds',          glyph: 'W' },
            { label: 'Events', href: '/events',          glyph: 'E' },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              className="w-9 h-9 rounded-sm flex items-center justify-center font-mono text-[11px] uppercase tracking-wider text-ink/35 hover:text-ink hover:bg-ink/[0.04] transition-colors no-underline"
            >
              {item.glyph}
            </Link>
          ))}
        </>
      )}
    </nav>
  );

  /* ── Desktop sidebar ─────────────────────────────────── */
  const desktopSidebar = (
    <aside
      className={`hidden sm:flex flex-col fixed top-0 left-0 h-full pt-16 z-20 border-r border-ink/[0.06] bg-[var(--page-bg)] transition-[width] duration-300 ease-out ${
        collapsed ? 'w-14' : 'w-56'
      }`}
    >
      {/* Top: switcher (full) or just avatar (rail) */}
      <div className="pt-3 relative">
        {collapsed ? (
          // Compact avatar — click expands
          <button
            onClick={toggle}
            title="Expand sidebar"
            className="mx-auto block w-9 h-9 rounded-full overflow-hidden border border-ink/15 hover:border-[var(--accent-ink)]/50 transition cursor-pointer bg-ink/[0.02]"
          >
            {currentWorld ? (
              currentWorld.worldImageUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={currentWorld.worldImageUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center font-basement text-[13px] bg-lime text-obsidian">
                  {currentWorld.worldTitle[0]?.toUpperCase()}
                </div>
              )
            ) : profile?.avatarUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={profile.avatarUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-lime">
                <span className="font-basement text-[14px] text-obsidian">{(profile?.name?.[0] || profile?.username?.[0] || '?').toUpperCase()}</span>
              </div>
            )}
          </button>
        ) : (
          contextSwitcher
        )}
      </div>

      {collapsed ? railNav : navSection}

      {/* Collapse / expand toggle — bottom-right edge */}
      <div className={`px-2 pb-3 ${collapsed ? 'flex justify-center' : 'flex justify-end'} border-t border-ink/[0.06] pt-2`}>
        <button
          onClick={toggle}
          title={collapsed ? 'Expand sidebar (⌘\\)' : 'Collapse sidebar (⌘\\)'}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="w-7 h-7 rounded-sm flex items-center justify-center text-ink/40 hover:text-ink hover:bg-ink/[0.05] transition cursor-pointer bg-transparent border border-ink/10"
        >
          <span
            className="font-mono text-[14px] leading-none"
            style={{ transition: 'transform 250ms ease-out', transform: collapsed ? 'rotate(0deg)' : 'rotate(180deg)' }}
          >
            ›
          </span>
        </button>
      </div>

      {!collapsed && bottomLinks}
    </aside>
  );

  /* ── Mobile tab bar ──────────────────────────────────── */
  // Fixed elements don't inherit body's --safe-top padding, so the bar pads
  // itself — without this the installed PWA draws the tabs under the iOS
  // clock. Frosted like the bottom pill so both read as app chrome.
  const mobileTabs = (
    <div
      className="sm:hidden fixed top-0 left-0 right-0 z-20 border-b backdrop-blur-xl"
      style={{
        paddingTop: 'var(--safe-top)',
        backgroundColor: 'color-mix(in srgb, var(--page-bg) 85%, transparent)',
        borderColor: 'color-mix(in srgb, var(--page-text) 10%, transparent)',
      }}
    >
      <div className="flex items-center gap-1 px-3 py-1.5 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
        {/* Mobile context indicator */}
        {currentWorld && (
          <Link
            href="/dashboard"
            aria-label="Back to personal dashboard"
            className="shrink-0 w-9 h-9 flex items-center justify-center font-mono text-[14px] rounded-sm text-ink/40 hover:text-ink transition no-underline"
          >
            ←
          </Link>
        )}

        {currentWorld && (
          <span className="shrink-0 font-mono text-[11px] font-bold uppercase tracking-wider px-1 truncate max-w-[96px] text-ink/50">
            {currentWorld.worldTitle}
          </span>
        )}

        {/* Tab items */}
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`shrink-0 h-9 flex items-center font-mono text-[11px] uppercase tracking-wider px-3 rounded-sm transition-colors no-underline ${
              isActive(item.href) ? 'bg-lime text-obsidian font-bold' : 'text-ink/50 hover:text-ink'
            }`}
          >
            {item.label}
          </Link>
        ))}

        {/* On personal view, world shortcuts as avatar chips — full names
            overflowed the strip and forced sideways scrolling. */}
        {!currentWorld && sortedWorlds.length > 0 && (
          <>
            <span className="shrink-0 w-px h-4 mx-1 bg-ink/15" />
            {sortedWorlds.map((w) => (
              <Link
                key={w.worldId}
                href={`/dashboard/worlds/${w.worldSlug}`}
                aria-label={w.worldTitle}
                title={w.worldTitle}
                className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center no-underline hover:bg-ink/[0.05] transition-colors"
              >
                {w.worldImageUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={w.worldImageUrl} alt="" className="w-[26px] h-[26px] rounded-full object-cover border border-ink/10" />
                ) : (
                  <span className="w-[26px] h-[26px] rounded-full flex items-center justify-center font-basement text-[11px] bg-lime text-obsidian">
                    {w.worldTitle[0]?.toUpperCase()}
                  </span>
                )}
              </Link>
            ))}
          </>
        )}
      </div>
    </div>
  );

  return (
    <>
      {desktopSidebar}
      {mobileTabs}
    </>
  );
}
