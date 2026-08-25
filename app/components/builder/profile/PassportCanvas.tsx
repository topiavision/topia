'use client';

import TopiaCard from '../../profile/TopiaCard';
import { roleSlugToLabel } from '@/lib/profile/roleTags';
import type { ProfileState } from '@/lib/builder/profile';

/* The Profile Assistant's live preview: the actual passport card (pure
 * props, no network) plus the Certified meter — the four checks from
 * lib/profile/stamps.ts rendered as a fill-them-in checklist. */

const ORANGE = 'var(--orange, #FF5C34)';

export function PassportCanvas({ state, username }: { state: ProfileState; username: string | null }) {
  const checks: { label: string; ok: boolean }[] = [
    { label: 'Photo', ok: Boolean(state.avatarUrl) },
    { label: 'Bio', ok: Boolean(state.bio?.trim()) },
    { label: 'Roles', ok: state.roleTags.length > 0 },
    { label: 'Path', ok: Boolean(state.path) },
  ];
  const done = checks.filter((c) => c.ok).length;

  return (
    <div className="ipb-canvas-bg min-h-full p-4 sm:p-8 flex flex-col items-center gap-5">
      <div className="ipb-materialize w-full max-w-[340px]">
        <TopiaCard
          name={state.name ?? ''}
          username={username ?? ''}
          avatarUrl={state.avatarUrl}
          roleTags={state.roleTags.map(roleSlugToLabel)}
          path={state.path}
        />
      </div>
      <div className="ipb-enter w-full max-w-[340px] rounded-lg border border-ink/10 bg-[var(--page-bg)]/70 p-3.5">
        <div className="flex items-baseline justify-between mb-2">
          <span className="font-mono text-[9px] font-bold uppercase tracking-[2px]" style={{ color: done === 4 ? 'var(--accent-ink)' : ORANGE }}>
            {done === 4 ? 'Certified ✦' : 'Certified stamp'}
          </span>
          <span className="font-mono text-[10px] text-ink/45">{done}/4</span>
        </div>
        <div className="flex gap-1.5 mb-2.5">
          {checks.map((c) => (
            <span key={c.label} className="h-1.5 flex-1 rounded-full transition-colors duration-500"
              style={{ backgroundColor: c.ok ? 'var(--lime, #e4fe52)' : 'color-mix(in srgb, currentColor 12%, transparent)' }} />
          ))}
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {checks.map((c) => (
            <span key={c.label} className={`font-mono text-[10px] uppercase tracking-[1px] ${c.ok ? 'text-ink/70' : 'text-ink/35'}`}>
              {c.ok ? '✓' : '○'} {c.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
