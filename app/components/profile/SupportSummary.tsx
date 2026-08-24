'use client';

/* The cumulative "what this creator needs" view.
 *
 * Creators carry more than one thing at once — projects, and the life around
 * them (a studio move, rent between tours). Asking a patron to piece that
 * together from separate roadmaps loses the point, so this is one query across
 * every goal a person owns, split into LIFE and PROJECTS.
 *
 * Renders nothing at all when there are no goals: funding is opt-in, and a
 * profile that isn't asking for support should look exactly as it always has.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { FundingMeter } from '../world/in-process/funding/FundingMeter';
import { usd } from '../world/in-process/funding/format';
import type { FundingGoalView } from '../world/in-process/funding/types';

const LIFE_GREEN = 'var(--green)';

export function SupportSummary({ ownerUserId, displayName }: {
  ownerUserId: string;
  displayName?: string | null;
}) {
  const [goals, setGoals] = useState<FundingGoalView[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/funding/goals?ownerUserId=${encodeURIComponent(ownerUserId)}`)
      .then((r) => (r.ok ? r.json() : { goals: [] }))
      .then((d: { goals?: FundingGoalView[] }) => {
        if (!cancelled) setGoals(d.goals ?? []);
      })
      .catch(() => { /* a funding failure must never break a profile */ })
      .finally(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [ownerUserId]);

  const open = goals.filter((g) => g.status === 'open');
  if (!loaded || open.length === 0) return null;

  const life = open.filter((g) => g.targetType === 'life_chapter');
  const work = open.filter((g) => g.targetType !== 'life_chapter');

  const sum = (rows: FundingGoalView[], key: 'raisedCents' | 'goalCents') =>
    rows.reduce((n, g) => n + (g[key] ?? 0), 0);

  const totalRaised = sum(open, 'raisedCents');
  const totalGoal = sum(open, 'goalCents');
  const patrons = open.reduce((n, g) => n + g.patronCount, 0);
  const lifeRaised = sum(life, 'raisedCents');
  const workRaised = sum(work, 'raisedCents');

  const pct = (n: number) => (totalRaised > 0 ? (n / Math.max(totalGoal, totalRaised)) * 100 : 0);

  return (
    <div className="mt-8">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <h3 className="font-basement font-black text-[18px] uppercase leading-none text-ink">
          Support {displayName || 'this creator'}
        </h3>
        <span className="font-mono text-[10px] uppercase tracking-[1px] text-ink/45">
          {open.length} open · {patrons} {patrons === 1 ? 'patron' : 'patrons'}
        </span>
      </div>

      {/* One number for everything, split by where it goes. */}
      <div
        className="mt-3 rounded-lg px-4 py-3.5"
        style={{
          backgroundColor: 'color-mix(in srgb, var(--lime) 14%, transparent)',
          border: '1px solid color-mix(in srgb, var(--accent-ink) 26%, transparent)',
        }}
      >
        <p>
          <span className="font-mono text-[24px] font-bold tabular-nums" style={{ color: 'var(--accent-ink)' }}>
            {usd(totalRaised)}
          </span>
          {totalGoal > 0 && (
            <span className="font-mono text-[13px] text-ink/45"> of {usd(totalGoal)} across everything</span>
          )}
        </p>

        <div
          className="h-[8px] rounded-full overflow-hidden mt-2.5 flex"
          style={{ backgroundColor: 'color-mix(in srgb, var(--page-text) 14%, transparent)' }}
        >
          <span style={{ width: `${pct(lifeRaised)}%`, backgroundColor: LIFE_GREEN }} />
          <span style={{ width: `${pct(workRaised)}%`, backgroundColor: 'var(--lime)' }} />
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 font-mono text-[10.5px] text-ink/55">
          {life.length > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-[2px]" style={{ backgroundColor: LIFE_GREEN }} />
              Life {usd(lifeRaised)}
            </span>
          )}
          {work.length > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-[2px]" style={{ backgroundColor: 'var(--lime)' }} />
              Projects {usd(workRaised)}
            </span>
          )}
        </div>
      </div>

      {life.length > 0 && <GoalGroup title="Life — the things behind the work" goals={life} accent={LIFE_GREEN} />}
      {work.length > 0 && <GoalGroup title="Projects" goals={work} accent="var(--lime)" />}

      <p className="font-mono text-[10px] text-ink/35 mt-4 leading-relaxed">
        Patrons are credited on what they fund. Fees are added on top, so 100% of a
        contribution reaches the creator.
      </p>
    </div>
  );
}

function GoalGroup({ title, goals, accent }: {
  title: string; goals: FundingGoalView[]; accent: string;
}) {
  return (
    <>
      <p className="font-mono text-[10px] font-bold uppercase tracking-[2px] text-ink/35 mt-5 mb-2">{title}</p>
      <div className="space-y-2">
        {goals.map((g) => (
          <div
            key={g.id}
            className="border border-ink/[0.1] p-3.5"
            style={{ borderLeft: `3px solid ${accent}` }}
          >
            <div className="flex items-baseline justify-between gap-3 flex-wrap">
              <span className="font-mono text-[13.5px] font-bold text-ink">{g.titleSnapshot ?? 'Untitled'}</span>
              {g.patronCount > 0 && (
                <span className="font-mono text-[10px] uppercase tracking-[1px] text-ink/40">
                  {g.patronCount} {g.patronCount === 1 ? 'patron' : 'patrons'}
                </span>
              )}
            </div>
            {g.blurb && <p className="font-mono text-[11.5px] text-ink/55 mt-1.5 leading-relaxed">{g.blurb}</p>}
            <FundingMeter
              raisedCents={g.raisedCents}
              goalCents={g.goalCents}
              size="md"
              className="mt-2.5"
            />
            {g.worldId && (
              <Link
                href="/worlds"
                className="font-mono text-[10px] uppercase tracking-[1px] text-ink/40 hover:text-ink/70 no-underline mt-2 inline-block"
              >
                See the roadmap →
              </Link>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
