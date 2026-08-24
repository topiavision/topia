'use client';

/* The aggregate row under a roadmap header: what this whole project needs,
 * before anyone scrolls a six-card strip.
 *
 * Renders ONLY when something in this era is actually funded. A roadmap with
 * no goals renders nothing at all — funding is opt-in per milestone, and a
 * creator who never sets one should not see funding chrome anywhere.
 */

import { FundingMeter } from './FundingMeter';
import { usd } from './format';
import type { EraMilestoneView } from '../types';
import type { GoalMap } from './types';

export function RoadmapFundingBar({
  milestones,
  goals,
  projectGoalId,
}: {
  milestones: EraMilestoneView[];
  goals: GoalMap;
  /** The project's own goal, when the creator funds the project as a whole
   *  rather than milestone by milestone. */
  projectGoalId?: string | null;
}) {
  const projectGoal = projectGoalId ? goals.get(projectGoalId) : undefined;
  const milestoneGoals = milestones.map((m) => goals.get(m.id)).filter(Boolean) as NonNullable<
    ReturnType<GoalMap['get']>
  >[];

  // Nothing funded here — render nothing. This is the whole "optional" promise.
  if (!projectGoal && milestoneGoals.length === 0) return null;

  // A project-level goal stands on its own; otherwise sum the milestones.
  const raised = projectGoal
    ? projectGoal.raisedCents
    : milestoneGoals.reduce((n, g) => n + g.raisedCents, 0);
  const target = projectGoal
    ? projectGoal.goalCents
    : milestoneGoals.reduce<number | null>(
        (n, g) => (g.goalCents == null ? n : (n ?? 0) + g.goalCents),
        null,
      );
  const patrons = projectGoal
    ? projectGoal.patronCount
    : milestoneGoals.reduce((n, g) => n + g.patronCount, 0);

  if (raised === 0 && target == null) return null;

  const fundedCount = milestoneGoals.filter(
    (g) => g.goalCents != null && g.raisedCents >= g.goalCents,
  ).length;

  return (
    <div
      className="mt-3 rounded-lg px-4 py-3.5"
      style={{
        backgroundColor: 'color-mix(in srgb, var(--lime) 16%, transparent)',
        border: '1px solid color-mix(in srgb, var(--accent-ink) 28%, transparent)',
      }}
    >
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <span
          className="font-mono text-[10px] font-bold uppercase tracking-[2px]"
          style={{ color: 'var(--accent-ink)' }}
        >
          {projectGoal ? 'Whole project' : 'Across this roadmap'}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[1px] text-ink/45">
          {projectGoal
            ? `${patrons} ${patrons === 1 ? 'backer' : 'backers'}`
            : `${fundedCount} of ${milestoneGoals.length} funded · ${patrons} ${patrons === 1 ? 'backer' : 'backers'}`}
        </span>
      </div>

      <p className="mt-1.5">
        <span className="font-mono text-[22px] font-bold tabular-nums" style={{ color: 'var(--accent-ink)' }}>
          {usd(raised)}
        </span>
        {target != null && (
          <span className="font-mono text-[13px] text-ink/45"> of {usd(target)}</span>
        )}
      </p>

      <FundingMeter
        raisedCents={raised}
        goalCents={target}
        size="lg"
        showLabel={false}
        className="mt-2.5"
      />
    </div>
  );
}
