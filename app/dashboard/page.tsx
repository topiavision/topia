'use client';

import Link from 'next/link';
import { useDashboard } from './_components/DashboardContext';
import { useOverview } from './_components/DashboardOverviewContext';
import { useEffect, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import ProfileCompletionWidget from './_components/ProfileCompletionWidget';
import PendingInvitationsWidget from './_components/PendingInvitationsWidget';
import { FundingMeter } from '../components/world/in-process/funding/FundingMeter';
import { usd } from '../components/world/in-process/funding/format';
import type { FundingGoalView } from '../components/world/in-process/funding/types';

// Every stat carries a one-line explainer under the number — the bare "+2"
// and the mystery "Builder" tile were reported as confusing. Deltas say what
// they measure ("+2 this month"); static tiles say what they count.

export default function DashboardOverviewPage() {
  const { profile, worldMemberships, hostedEvents, features } = useDashboard();
  const { data: overview } = useOverview();
  const stats = overview?.stats ?? null;

  const { getAccessToken, user } = usePrivy();

  /* Funding is rendered ONLY when it exists for this user — a dashboard with
   * no goals anywhere shows zero funding chrome, exactly like the roadmap.
   * One parallel fetch per membership world (small N), collected into a map
   * keyed by worldId. */
  const [goalsByWorld, setGoalsByWorld] = useState<Record<string, FundingGoalView[]>>({});
  useEffect(() => {
    if (worldMemberships.length === 0) return;
    let cancelled = false;
    Promise.all(
      worldMemberships.map(async (w) => {
        try {
          const res = await fetch(`/api/funding/goals?worldId=${encodeURIComponent(w.worldId)}`);
          if (!res.ok) return [w.worldId, []] as const;
          const d = await res.json();
          return [w.worldId, (d.goals ?? []) as FundingGoalView[]] as const;
        } catch { return [w.worldId, []] as const; }
      }),
    ).then((pairs) => {
      if (!cancelled) setGoalsByWorld(Object.fromEntries(pairs.filter(([, g]) => g.length > 0)));
    });
    return () => { cancelled = true; };
  }, [worldMemberships]);

  const allGoals = Object.values(goalsByWorld).flat();
  const totalRaised = allGoals.reduce((n, g) => n + g.raisedCents, 0);

  /* Payout next-step: only meaningful for accounts in the funding cohort.
   * Everyone else never sees the word "payout" here. */
  const hasFunding = features.includes('funding');
  const [payoutReady, setPayoutReady] = useState<boolean | null>(null);
  useEffect(() => {
    if (!hasFunding || !user?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await getAccessToken();
        const res = await fetch(`/api/payouts/account?privyId=${encodeURIComponent(user.id)}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        if (!res.ok) return;
        const d = await res.json();
        if (!cancelled) setPayoutReady(Boolean(d.canAccept));
      } catch { /* leave null — no step shown */ }
    })();
    return () => { cancelled = true; };
  }, [hasFunding, user?.id, getAccessToken]);

  const displayName = profile?.name || profile?.username || 'creator';
  const initial = (displayName[0] || '?').toUpperCase();
  const builderCount = worldMemberships.filter((w) => w.role === 'world_builder' || w.role === 'owner').length;
  const firstName = displayName.split(' ')[0];

  return (
    <div>
      {/* ═══ HERO: greeting · identity · date · stats — one unified band ═══ */}
      <div className="border border-ink/[0.08] rounded-lg overflow-hidden mb-6">
        {/* Lime band */}
        <div className="bg-lime px-5 py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-12 h-12 md:w-14 md:h-14 rounded-full overflow-hidden border-2 border-obsidian/30 shrink-0">
              {profile?.avatarUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={profile.avatarUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-[var(--page-bg)]">
                  <span className="font-basement text-[20px] text-[var(--accent-ink)]">{initial}</span>
                </div>
              )}
            </div>
            <div className="min-w-0">
              <span className="font-mono text-[10px] uppercase tracking-[2px] text-obsidian/50 block">topia://dashboard</span>
              <h1 className="font-basement font-black text-[clamp(22px,3.5vw,36px)] uppercase leading-[0.9] text-obsidian mt-0.5 break-words">
                Hello, {firstName}.
              </h1>
              {profile?.username && (
                <span className="font-mono text-[11px] text-obsidian/70 mt-0.5 block break-all">@{profile.username}</span>
              )}
            </div>
          </div>
          <div className="text-left md:text-right shrink-0">
            <span className="font-mono text-[11px] uppercase tracking-[2px] text-obsidian/60 block">
              {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
            </span>
            {profile?.username && (
              <Link
                href={`/profile/${profile.username}`}
                className="inline-block mt-1 font-mono text-[10px] uppercase tracking-[2px] text-obsidian/70 hover:text-obsidian no-underline"
              >
                view public profile →
              </Link>
            )}
          </div>
        </div>

        {/* Stats strip + quick actions */}
        <div className="bg-[var(--page-bg)] border-t border-ink/[0.04] flex flex-col lg:flex-row lg:items-stretch lg:divide-x divide-ink/[0.06]">
          {/* Stats — wrap into a 3-up grid on mobile (a sideways-scrolling
              strip clipped the tail stats); divider-separated row from sm up. */}
          <div className="px-5 py-3 grid grid-cols-3 gap-y-3 sm:flex sm:items-center sm:gap-0 sm:overflow-x-auto lg:flex-1">
            {([
              { label: 'Worlds',    value: worldMemberships.length, delta: stats?.deltas.worlds,    sub: "you're in",       href: '/worlds' },
              { label: 'Events',    value: stats?.events ?? hostedEvents.length, delta: stats?.deltas.events, sub: 'hosted', href: '/events' },
              { label: 'Building',  value: builderCount,             delta: undefined,               sub: 'as owner/builder', href: null },
              // Only exists when money has actually moved — no $0 placeholder.
              ...(totalRaised > 0 ? [{ label: 'Raised', value: totalRaised, money: true, delta: undefined, sub: 'across your worlds', href: null }] : []),
              { label: 'Connects', value: stats?.followers ?? 0,    delta: stats?.deltas.followers, sub: 'follow you',      href: profile?.username ? `/profile/${profile.username}` : null },
              { label: 'Connected', value: stats?.following ?? 0,    delta: undefined,               sub: 'you follow',      href: null },
            ] satisfies { label: string; value: number; delta?: number; sub: string; href: string | null; money?: boolean }[]).map((stat, i, arr) => {
              const inner = (
                <div className={`flex flex-col sm:px-4 ${i < arr.length - 1 ? 'sm:border-r sm:border-ink/[0.06]' : ''} ${i === 0 ? 'sm:pl-0' : ''}`}>
                  <span className="font-mono text-[10px] uppercase tracking-[2px] text-ink/30">{stat.label}</span>
                  <span className={`font-mono text-[20px] md:text-[24px] font-bold leading-none mt-1 ${'money' in stat && stat.money ? '' : 'text-ink'}`} style={'money' in stat && stat.money ? { color: 'var(--accent-ink)' } : undefined}>
                    {'money' in stat && stat.money ? usd(stat.value) : stat.value}
                  </span>
                  {stat.delta && stat.delta > 0 ? (
                    <span className="font-mono text-[9px] uppercase tracking-[1px] text-[var(--accent-ink)]/80 mt-1">+{stat.delta} this month</span>
                  ) : (
                    <span className="font-mono text-[9px] uppercase tracking-[1px] text-ink/25 mt-1">{stat.sub}</span>
                  )}
                </div>
              );
              return stat.href ? (
                <Link key={stat.label} href={stat.href} className="no-underline">{inner}</Link>
              ) : (
                <div key={stat.label}>{inner}</div>
              );
            })}
          </div>

          {/* Quick actions in the same band — primary CTA + secondaries.
              2×2 grid on mobile (free-wrapping left a lone chip on row two);
              inline row from sm up. */}
          <div className="px-5 py-3 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center lg:shrink-0">
            {(
              <Link
                href="/dashboard/create-world"
                className="text-center font-mono text-[11px] uppercase tracking-[2px] bg-lime text-obsidian px-3 py-2 rounded-sm hover:opacity-90 transition no-underline"
              >
                + World
              </Link>
            )}
            {(
              <Link
                href="/events/create"
                className="text-center font-mono text-[11px] uppercase tracking-[2px] text-ink/60 border border-ink/15 hover:border-[var(--accent-ink)]/50 hover:text-ink px-3 py-2 rounded-sm transition no-underline"
              >
                + Event
              </Link>
            )}
            <Link
              href="/resources/tools?submit=1"
              className="text-center font-mono text-[11px] uppercase tracking-[2px] text-ink/60 border border-ink/15 hover:border-[var(--accent-ink)]/50 hover:text-ink px-3 py-2 rounded-sm transition no-underline"
            >
              + Tool
            </Link>
            <Link
              href="/resources/grants?submit=1"
              className="text-center font-mono text-[11px] uppercase tracking-[2px] text-ink/60 border border-ink/15 hover:border-[var(--accent-ink)]/50 hover:text-ink px-3 py-2 rounded-sm transition no-underline"
            >
              + Grant
            </Link>
          </div>
        </div>
      </div>

      {/* ═══ URGENT STRIP — only renders if anything pending. Both widgets
              self-gate (PendingInvitations hides when total=0; Profile-
              Completion hides at 100%). They stack on narrow screens, sit
              side-by-side on wide — together as one row so they don't
              individually drag empty whitespace. ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6 empty:hidden">
        <PendingInvitationsWidget />
        <ProfileCompletionWidget />
      </div>

      {/* ═══ MAIN GRID — your work (2/3) + next steps (1/3) ═══
          The old eight-widget stack is gone: worlds and events are the work,
          next-steps absorbs the nudges, saved collapses to one row. Activity
          and recently-viewed live behind ⌘K and the sections themselves. */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* MAIN COLUMN */}
        <div className="lg:col-span-2 space-y-6 min-w-0">
          {worldMemberships.length > 0 ? (
            <YourWorldsSection worldMemberships={worldMemberships} goalsByWorld={goalsByWorld} />
          ) : (
            <EmptyWorldsCard />
          )}

          <YourEventsSection upcoming={overview?.upcoming ?? []} hostedCount={hostedEvents.length} />
        </div>

        {/* SIDE COLUMN */}
        <aside className="space-y-6 min-w-0">
          <NextStepsCard
            showPayoutStep={hasFunding && payoutReady === false}
            goalCount={allGoals.length}
          />
          <SavedRow savedTools={overview?.savedTools ?? []} kitTools={overview?.kitTools ?? []} />
        </aside>
      </div>
    </div>
  );
}

/* ── Sub-components extracted for readability ─────────────────── */

interface WorldMembership {
  worldId: string;
  worldTitle: string;
  worldSlug: string;
  worldCategory: string | null;
  worldImageUrl: string | null;
  role: string;
}

function YourWorldsSection({ worldMemberships, goalsByWorld }: {
  worldMemberships: WorldMembership[];
  goalsByWorld: Record<string, FundingGoalView[]>;
}) {
  return (
    <div className="border border-ink/[0.08] rounded-lg overflow-hidden">
      <div className="bg-[var(--page-bg)] border-b border-ink/[0.06] px-4 py-2 flex items-center justify-between">
        <span className="font-mono text-[11px] uppercase tracking-[2px] text-ink/40">
          Your worlds · {worldMemberships.length}
        </span>
        <Link href="/worlds" className="font-mono text-[10px] uppercase tracking-[2px] text-ink/30 hover:text-ink no-underline">
          browse all →
        </Link>
      </div>
      <div className="divide-y divide-ink/[0.04]">
        {worldMemberships.slice(0, 6).map((w) => {
          const goals = goalsByWorld[w.worldId];
          const raised = goals?.reduce((n, g) => n + g.raisedCents, 0) ?? 0;
          const target = goals?.reduce((n, g) => n + (g.goalCents ?? 0), 0) ?? 0;
          return (
            <Link
              key={w.worldId}
              href={`/dashboard/worlds/${w.worldSlug}`}
              className="bg-[var(--page-bg)] hover:bg-ink/[0.03] transition px-4 py-3 block no-underline"
            >
              <div className="flex items-center gap-3">
                {w.worldImageUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={w.worldImageUrl} alt="" width={36} height={36} loading="lazy" decoding="async" className="w-9 h-9 rounded-sm object-cover shrink-0" />
                ) : (
                  <div className="w-9 h-9 rounded-sm bg-lime flex items-center justify-center shrink-0">
                    <span className="font-basement text-base text-obsidian">{w.worldTitle[0]?.toUpperCase()}</span>
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="font-mono text-[12px] uppercase font-bold text-ink truncate">{w.worldTitle}</div>
                  <div className="font-mono text-[10px] text-ink/30 truncate">
                    {/* Funding line only when goals exist — otherwise the
                        category, otherwise nothing. Dynamic per world. */}
                    {goals ? (
                      <span style={{ color: 'var(--accent-ink)' }}>
                        {usd(raised)}{target > 0 ? ` of ${usd(target)}` : ' backed'} · {goals.length} goal{goals.length === 1 ? '' : 's'}
                      </span>
                    ) : (w.worldCategory ?? '')}
                  </div>
                </div>
                <span className="font-mono text-[9px] uppercase tracking-[2px] text-ink/30 shrink-0">
                  {w.role === 'owner' ? 'OWNER' : w.role === 'world_builder' ? 'BUILDER' : 'COLLAB'}
                </span>
              </div>
              {goals && (
                <FundingMeter raisedCents={raised} goalCents={target > 0 ? target : null} size="sm" showLabel={false} className="mt-2.5 ml-12" />
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function YourEventsSection({ upcoming, hostedCount }: {
  upcoming: { id: string; eventName: string; slug: string; dateIso: string | null; date: string | null; city: string | null; role: 'hosting' | 'attending' }[];
  hostedCount: number;
}) {
  return (
    <div className="border border-ink/[0.08] rounded-lg overflow-hidden">
      <div className="bg-[var(--page-bg)] border-b border-ink/[0.06] px-4 py-2 flex items-center justify-between">
        <span className="font-mono text-[11px] uppercase tracking-[2px] text-ink/40">Your events</span>
        <Link href="/dashboard/events" className="font-mono text-[10px] uppercase tracking-[2px] text-ink/30 hover:text-ink no-underline">
          all yours →
        </Link>
      </div>
      {upcoming.length === 0 ? (
        <div className="bg-[var(--page-bg)] px-4 py-5 text-center">
          <p className="font-mono text-[12px] text-ink/45">
            {hostedCount > 0 ? 'Nothing upcoming.' : 'Nothing on the calendar yet.'}
          </p>
          <Link href="/events/create" className="inline-block mt-2 font-mono text-[11px] uppercase tracking-[2px] text-ink/60 border border-ink/20 hover:border-ink/60 hover:text-ink px-3 py-1.5 rounded-sm transition no-underline">
            + Event
          </Link>
        </div>
      ) : (
        <div className="divide-y divide-ink/[0.04]">
          {upcoming.slice(0, 4).map((e) => (
            <Link
              key={e.id}
              href={e.role === 'hosting' ? `/events/${e.slug}/manage` : `/events/${e.slug}`}
              className="bg-[var(--page-bg)] hover:bg-ink/[0.03] transition px-4 py-2.5 flex items-center gap-3 no-underline"
            >
              <div className="w-10 shrink-0 text-center">
                <span className="font-mono text-[9px] uppercase tracking-[1px] block" style={{ color: 'var(--orange)' }}>
                  {e.dateIso ? new Date(`${e.dateIso}T00:00:00`).toLocaleDateString('en-US', { month: 'short' }) : '—'}
                </span>
                <span className="font-mono text-[15px] font-bold text-ink leading-none">
                  {e.dateIso ? new Date(`${e.dateIso}T00:00:00`).getDate() : ''}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-mono text-[12px] font-bold text-ink truncate">{e.eventName}</div>
                {e.city && <div className="font-mono text-[10px] text-ink/30 truncate">{e.city}</div>}
              </div>
              <span className="font-mono text-[9px] uppercase tracking-[2px] text-ink/30 shrink-0">
                {e.role === 'hosting' ? 'Manage →' : 'Going'}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

/* Next steps — the nudge column. Every row is conditional on REAL state, so a
 * user with nothing pending sees a quiet "all clear" instead of chrome. */
function NextStepsCard({ showPayoutStep, goalCount }: { showPayoutStep: boolean; goalCount: number }) {
  const steps: { label: string; sub: string; href: string }[] = [];
  if (showPayoutStep) {
    steps.push({
      label: 'Connect your payout account',
      sub: goalCount > 0 ? 'backing stays hidden until this is done' : 'about 3 minutes, via Stripe',
      href: '/dashboard/payouts',
    });
  }
  if (steps.length === 0) return null;
  return (
    <div className="border border-ink/[0.08] rounded-lg overflow-hidden">
      <div className="bg-[var(--page-bg)] border-b border-ink/[0.06] px-4 py-2">
        <span className="font-mono text-[11px] uppercase tracking-[2px] text-ink/40">Next steps</span>
      </div>
      <div className="divide-y divide-ink/[0.04]">
        {steps.map((st) => (
          <Link key={st.href} href={st.href} className="bg-[var(--page-bg)] hover:bg-ink/[0.03] transition px-4 py-3 flex items-start gap-2.5 no-underline">
            <span className="w-3.5 h-3.5 rounded-full border-2 shrink-0 mt-0.5" style={{ borderColor: 'var(--accent-ink)' }} />
            <span className="min-w-0">
              <span className="font-mono text-[12px] text-ink block">{st.label}</span>
              <span className="font-mono text-[10px] text-ink/40 block mt-0.5">{st.sub}</span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

/* Saved — one collapsed row instead of two widgets. <details> keeps it
 * zero-state and zero-JS; the full lists are one tap away. */
function SavedRow({ savedTools, kitTools }: {
  savedTools: { id: string; name: string; slug: string }[];
  kitTools: { id: string; name: string; slug: string }[];
}) {
  const total = savedTools.length + kitTools.length;
  if (total === 0) return null;
  return (
    <details className="border border-ink/[0.08] rounded-lg overflow-hidden group">
      <summary className="bg-[var(--page-bg)] px-4 py-2.5 flex items-center justify-between cursor-pointer list-none">
        <span className="font-mono text-[11px] uppercase tracking-[2px] text-ink/40">
          Saved · {kitTools.length} in kit · {savedTools.length} tools
        </span>
        <span className="font-mono text-[11px] text-ink/30 transition-transform group-open:rotate-90">›</span>
      </summary>
      <div className="border-t border-ink/[0.06] divide-y divide-ink/[0.04]">
        {[...kitTools, ...savedTools].slice(0, 8).map((t) => (
          <Link key={t.id} href={`/resources/tools/${t.slug}`} className="bg-[var(--page-bg)] hover:bg-ink/[0.03] transition px-4 py-2 block no-underline font-mono text-[12px] text-ink truncate">
            {t.name}
          </Link>
        ))}
      </div>
    </details>
  );
}

function EmptyWorldsCard() {
  return (
    <div className="border border-ink/[0.08] rounded-lg overflow-hidden">
      <div className="bg-[var(--page-bg)] border-b border-ink/[0.06] px-4 py-2">
        <span className="font-mono text-[11px] uppercase tracking-[2px] text-ink/40">Your worlds</span>
      </div>
      <div className="bg-[var(--page-bg)] p-6 text-center">
        <p className="font-basement font-black text-[24px] uppercase text-ink leading-tight">No worlds yet.</p>
        <p className="font-mono text-[12px] text-ink/50 mt-2 max-w-xs mx-auto">
          A world is your scene — a place creators rally around. Start one, or join one you love.
        </p>
        <div className="mt-4 flex items-center justify-center gap-2 flex-wrap">
          {(
            <Link
              href="/dashboard/create-world"
              className="font-mono text-[11px] uppercase tracking-[2px] bg-lime text-obsidian px-4 py-2 rounded-sm hover:opacity-90 transition no-underline"
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
    </div>
  );
}
