'use client';

import { eraDateRange } from '@/lib/eraDates';
import { ORANGE } from './constants';
import { usd } from './funding/format';
import { totalRaisedCents, type FundingGoalView } from './funding/types';
import type { EraMilestoneView, EraPostView } from './types';

/* ── The "Happening now" unit ──────────────────────────────────────
 * The page's opening move: the current milestone fused with proof of
 * life. A first-time visitor gets structure (which step) and narrative
 * (it moved 2 days ago) in one glance — the research's NOW unit. */

function relativeDay(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  const days = Math.floor((Date.now() - then) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

export function NowUnit({ m, index, posts, goal, acceptingSupport, onSupport, className = '' }: {
  m: EraMilestoneView;
  index: number;
  /** This era's posts — the freshest one stamps the unit. */
  posts: EraPostView[];
  goal?: FundingGoalView;
  acceptingSupport?: boolean;
  /** Opens the milestone in the roadmap, where the full funding flow lives. */
  onSupport: () => void;
  className?: string;
}) {
  const latest = posts.reduce<string | null>((acc, p) => (!acc || p.createdAt > acc ? p.createdAt : acc), null);
  const fresh = relativeDay(latest);
  const isNow = m.status === 'now';
  const hasGoal = !!goal && (goal.goalCents != null || totalRaisedCents(goal) > 0);

  return (
    <div className={className}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-mono text-[10px] font-bold uppercase tracking-[2px]" style={{ color: ORANGE }}>
          {isNow ? 'Happening now' : 'Where it stands'}
        </span>
        {fresh && <span className="font-mono text-[10px] text-ink/40">last update {fresh}</span>}
      </div>
      <div className="mt-2 rounded-lg overflow-hidden border" style={{ borderColor: 'color-mix(in srgb, var(--orange) 45%, transparent)' }}>
        <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_220px]">
          <div className="p-4 sm:p-5 min-w-0">
            <p className="font-mono text-[9px] font-bold uppercase tracking-[2px]" style={{ color: ORANGE }}>
              M{String(index + 1).padStart(2, '0')} · {isNow ? 'Now' : 'Latest'}
            </p>
            <h4 className="font-basement font-black text-[clamp(16px,2vw,20px)] uppercase leading-tight text-ink mt-1.5">{m.title}</h4>
            {(eraDateRange(m) ?? m.dateLabel) && (
              <p className="font-mono text-[10px] uppercase tracking-[1px] text-ink/40 mt-1">{eraDateRange(m) ?? m.dateLabel}</p>
            )}
            {m.description && (
              <p className="font-mono text-[12px] text-ink/65 leading-relaxed mt-2">{m.description}</p>
            )}
            {hasGoal && (
              <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2 mt-3.5">
                {acceptingSupport && (
                  <button
                    onClick={onSupport}
                    className="font-mono text-[11px] uppercase tracking-[1px] font-bold px-3.5 py-2 rounded-sm cursor-pointer border-none"
                    style={{ backgroundColor: 'var(--lime)', color: 'var(--obsidian)' }}
                  >
                    Fund this milestone
                  </button>
                )}
                <span className="font-mono text-[11px] text-ink/55">
                  {totalRaisedCents(goal!) > 0 ? (
                    <>
                      {usd(totalRaisedCents(goal!))}
                      {goal!.goalCents != null && <> of {usd(goal!.goalCents)}</>}
                      {goal!.patronCount > 0 && <> · {goal!.patronCount} patron{goal!.patronCount === 1 ? '' : 's'}</>}
                    </>
                  ) : goal!.goalCents != null ? (
                    // Never "$0 of $X · 0 patrons" — a goal with no money yet
                    // states the destination, not the emptiness.
                    <>Goal {usd(goal!.goalCents)}</>
                  ) : null}
                </span>
              </div>
            )}
          </div>
          {m.imageUrl && (
            /* Media only on the headliner — the collapsed rail stays text. */
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={m.imageUrl} alt="" className="w-full h-full min-h-[130px] max-h-[220px] object-cover" loading="lazy" />
          )}
        </div>
      </div>
    </div>
  );
}
