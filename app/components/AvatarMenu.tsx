'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import Link from 'next/link';
import { useUserProfile } from '../hooks/useUserProfile';

const PencilIcon = () => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M11.5 1.5L14.5 4.5L5 14H2V11L11.5 1.5Z"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export default function AvatarMenu() {
  const { login, logout } = usePrivy();
  const { profile, worldMemberships, ready, authenticated } = useUserProfile();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Sort worlds: builders first, then collaborators
  const sortedWorlds = useMemo(() => {
    return [...worldMemberships].sort((a, b) => {
      if (a.role === b.role) return 0;
      const priority = (r: string) => r === 'owner' ? 0 : r === 'world_builder' ? 1 : 2;
      return priority(a.role) - priority(b.role);
    });
  }, [worldMemberships]);

  // Click outside handler
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  // While Privy is still initializing, show the cached avatar (if we have
  // one) instead of a blank spot — the profile hook serves the last-known
  // profile from sessionStorage and revalidates in the background.
  if (!ready && !profile) return null;

  if (ready && !authenticated) {
    /* Logged-out: a primary SIGN UP plus a secondary LOG IN. Both open the
     * same Privy modal (it handles new and returning accounts in one flow) —
     * the split exists because newcomers scan for "sign up" and won't press a
     * button labelled "log in", while returning users want the reverse.
     * Primary gets the lime fill; secondary stays a quiet border. */
    return (
      <span className="flex items-center gap-2">
        <button
          onClick={login}
          className="font-mono text-[13px] uppercase tracking-tight hover:opacity-70 transition border-none rounded-lg px-3.5 py-1.5 cursor-pointer font-bold"
          style={{ backgroundColor: 'var(--lime, #e4fe52)', color: 'var(--obsidian, #1a1a1a)' }}
        >
          Sign up
        </button>
        <button
          onClick={login}
          className="font-mono text-[13px] uppercase tracking-tight hover:opacity-70 transition border rounded-lg px-3 py-1.5 cursor-pointer bg-transparent"
          style={{ color: 'var(--foreground)', borderColor: 'var(--border-color)' }}
        >
          Log in
        </button>
      </span>
    );
  }

  const displayName = profile?.name || 'Anonymous';
  const initial = (displayName[0] || '?').toUpperCase();
  const viewProfileHref = profile?.username ? `/profile/${profile.username}` : '/profile';

  return (
    <div ref={menuRef} className="relative">
      {/* Avatar trigger */}
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center justify-center w-8 h-8 rounded-full overflow-hidden border flex-shrink-0 hover:opacity-80 transition cursor-pointer"
        style={{ borderColor: 'var(--foreground)' }}
        aria-label="User menu"
      >
        {profile?.avatarUrl ? (
          <img src={profile.avatarUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center"
            style={{ backgroundColor: 'var(--foreground)' }}
          >
            <span className="font-mono text-[13px] font-bold" style={{ color: 'var(--background)' }}>
              {initial}
            </span>
          </div>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div
          className="absolute right-0 top-full mt-2 min-w-[240px] max-w-[calc(100vw-2rem)] border rounded-2xl overflow-hidden z-[70]"
          style={{
            backgroundColor: 'var(--background)',
            borderColor: 'var(--border-color)',
          }}
        >
          {/* 1. Profile: avatar + name (links to view profile) + edit icon */}
          <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border-color)' }}>
            <div className="flex items-center gap-3">
              <Link
                href={viewProfileHref}
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 min-w-0 flex-1 hover:opacity-70 transition"
              >
                <div
                  className="w-6 h-6 rounded-full overflow-hidden flex-shrink-0 border"
                  style={{ borderColor: 'var(--foreground)' }}
                >
                  {profile?.avatarUrl ? (
                    <img src={profile.avatarUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div
                      className="w-full h-full flex items-center justify-center"
                      style={{ backgroundColor: 'var(--foreground)' }}
                    >
                      <span className="font-mono text-[12px] font-bold" style={{ color: 'var(--background)' }}>
                        {initial}
                      </span>
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <div className="font-mono text-[13px] font-bold uppercase break-words" style={{ color: 'var(--foreground)' }}>
                    {displayName}
                  </div>
                  {profile?.username && (
                    <div className="font-mono text-[11px] opacity-50 break-all" style={{ color: 'var(--foreground)' }}>
                      @{profile.username}
                    </div>
                  )}
                </div>
              </Link>
              <Link
                href="/profile"
                onClick={() => setOpen(false)}
                className="flex-shrink-0 opacity-40 hover:opacity-100 transition"
                style={{ color: 'var(--foreground)' }}
                title="Edit profile"
              >
                <PencilIcon />
              </Link>
            </div>
          </div>

          {/* 2. Dashboard */}
          <Link
            href="/dashboard"
            onClick={() => setOpen(false)}
            className="block px-4 py-2.5 font-mono text-[13px] uppercase tracking-tight hover:opacity-70 transition"
            style={{ color: 'var(--foreground)' }}
          >
            DASHBOARD
          </Link>

          {/* Divider */}
          <div className="border-b mx-4" style={{ borderColor: 'var(--border-color)' }} />

          {/* 3. My Worlds (builders first, then collaborators) */}
          <div className="px-4 py-3">
            <div className="font-mono text-[13px] uppercase tracking-wider opacity-50 mb-2" style={{ color: 'var(--foreground)' }}>
              MY WORLDS
            </div>
            {sortedWorlds.length === 0 ? (
              <div className="font-mono text-[12px] opacity-30 py-1" style={{ color: 'var(--foreground)' }}>
                No worlds yet
              </div>
            ) : (
              <div className="space-y-1 max-h-[200px] overflow-y-auto">
                {sortedWorlds.map((wm) => (
                  <div key={wm.worldId} className="flex items-center justify-between py-1.5 gap-2">
                    <Link
                      href={`/worlds/${wm.worldSlug}`}
                      onClick={() => setOpen(false)}
                      className="font-mono text-[12px] hover:opacity-70 transition truncate"
                      style={{ color: 'var(--foreground)' }}
                    >
                      {wm.worldTitle}
                    </Link>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span
                        className="font-mono text-[12px] uppercase opacity-40"
                        style={{ color: 'var(--foreground)' }}
                      >
                        {wm.role === 'owner' ? 'OWNER' : wm.role === 'world_builder' ? 'BUILDER' : 'COLLAB'}
                      </span>
                      {(wm.role === 'world_builder' || wm.role === 'owner') && (
                        <Link
                          href={`/dashboard/worlds/${wm.worldSlug}/in-process`}
                          onClick={() => setOpen(false)}
                          className="opacity-40 hover:opacity-100 transition"
                          style={{ color: 'var(--foreground)' }}
                          title="Edit world"
                        >
                          <PencilIcon />
                        </Link>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="border-b mx-4" style={{ borderColor: 'var(--border-color)' }} />

          {/* Log Out */}
          <button
            onClick={() => { logout(); setOpen(false); }}
            className="block w-full text-left px-4 py-2.5 font-mono text-[13px] uppercase tracking-tight opacity-50 hover:opacity-100 transition"
            style={{ color: 'var(--foreground)' }}
          >
            LOG OUT
          </button>
        </div>
      )}
    </div>
  );
}
