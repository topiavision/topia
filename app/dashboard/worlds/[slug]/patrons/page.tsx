'use client';

import Link from 'next/link';
import { ReadOnlyBanner } from '../../../_components/ReadOnlyBanner';
import { FundingMeter } from '../../../../components/world/in-process/funding/FundingMeter';
import { usd } from '../../../../components/world/in-process/funding/format';
import { totalRaisedCents } from '../../../../components/world/in-process/funding/types';
import { useFundingGoals } from '../../../../components/world/in-process/funding/useFundingGoals';
import { useWorldDashboard } from '../layout';

export default function WorldPatronsPage() {
  const { world, slug, isBuilder } = useWorldDashboard();
  const { goals, acceptingSupport, canSetGoals, payeeMissing, loaded } = useFundingGoals(world.id);

  const allGoals = [...goals.values()].sort((a, b) => {
    if (a.status !== b.status) return a.status === 'open' ? -1 : 1;
    return totalRaisedCents(b) - totalRaisedCents(a);
  });
  const openGoals = allGoals.filter((goal) => goal.status === 'open');
  const totalRaised = allGoals.reduce((sum, goal) => sum + totalRaisedCents(goal), 0);
  const patronCount = allGoals.reduce((sum, goal) => sum + goal.patronCount, 0);

  return (
    <div>
      {!isBuilder && <ReadOnlyBanner />}

      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-5">
        <div>
          <p className="font-mono text-[10px] font-bold uppercase tracking-[2px]" style={{ color: 'var(--accent-ink)' }}>Patrons</p>
          <h2 className="font-basement font-black text-[clamp(20px,3vw,26px)] uppercase leading-none text-ink mt-1">Funding connected to the work</h2>
          <p className="font-zirkon text-[14px] leading-relaxed text-ink/50 mt-2 max-w-2xl">
            Track what patrons are funding. Goals are created and edited on the exact project or milestone in Now.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <Link href={`/dashboard/worlds/${slug}/in-process`} className="min-h-9 inline-flex items-center px-3 rounded-md bg-lime text-obsidian font-mono text-[10px] font-bold uppercase tracking-[1.5px] no-underline hover:opacity-90">
            Edit goals in Now
          </Link>
          <Link href={`/worlds/${slug}#patrons`} className="min-h-9 inline-flex items-center px-3 rounded-md border border-ink/15 text-ink/55 font-mono text-[10px] font-bold uppercase tracking-[1.5px] no-underline hover:text-ink hover:border-ink/35">
            Public view ↗
          </Link>
        </div>
      </div>

      {!loaded ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 animate-pulse" aria-label="Loading patronage">
          {[0, 1, 2].map((item) => <div key={item} className="h-24 rounded-xl bg-ink/[0.05]" />)}
        </div>
      ) : (
        <>
          {payeeMissing && (
            <div className="rounded-xl border border-orange/35 bg-orange/[0.04] p-4 mb-4">
              <p className="font-mono text-[11px] leading-relaxed text-orange">
                This world has no lead worldbuilder assigned, so funding cannot open. Assign the owner from Builders before publishing a goal.
              </p>
              <Link href={`/dashboard/worlds/${slug}/members`} className="inline-block mt-2 font-mono text-[10px] font-bold uppercase tracking-[1.5px] text-orange">Open Builders →</Link>
            </div>
          )}

          <div className="grid grid-cols-3 gap-px rounded-xl overflow-hidden border border-ink/[0.08] bg-ink/[0.08] mb-5">
            {[
              { value: openGoals.length, label: 'Open goals' },
              { value: patronCount, label: patronCount === 1 ? 'Patron' : 'Patrons' },
              { value: usd(totalRaised), label: 'Raised' },
            ].map((stat) => (
              <div key={stat.label} className="min-w-0 bg-[var(--page-bg)] px-3 py-3 sm:px-4">
                <p className="font-mono text-[clamp(16px,4vw,22px)] font-bold leading-none text-ink tabular-nums truncate">{stat.value}</p>
                <p className="font-mono text-[8px] sm:text-[9px] uppercase tracking-[1px] sm:tracking-[1.5px] text-ink/35 mt-1.5 truncate">{stat.label}</p>
              </div>
            ))}
          </div>

          {!canSetGoals && !payeeMissing && allGoals.length === 0 && (
            <div className="rounded-xl border border-ink/[0.1] p-4 mb-4 bg-ink/[0.015]">
              <p className="font-mono text-[11px] text-ink/55">Funding is not available for this world yet. The roadmap and process log still work normally.</p>
            </div>
          )}

          {allGoals.length === 0 ? (
            <div className="min-h-64 rounded-xl border border-dashed border-ink/15 flex flex-col items-center justify-center text-center px-5 py-10">
              <p className="font-mono text-[11px] font-bold uppercase tracking-[1.5px] text-ink/55">No funding goals yet</p>
              <p className="font-zirkon text-[14px] text-ink/45 mt-2 max-w-md">
                Open funding only where money clearly unlocks the next piece of work. Patrons should always know what their support moves forward.
              </p>
              {isBuilder && canSetGoals && (
                <Link href={`/dashboard/worlds/${slug}/in-process`} className="min-h-10 inline-flex items-center mt-4 px-4 rounded-md bg-lime text-obsidian font-mono text-[10px] font-bold uppercase tracking-[1.5px] no-underline">
                  Choose a milestone
                </Link>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {allGoals.map((goal) => {
                const raised = totalRaisedCents(goal);
                return (
                  <article key={goal.id} className="rounded-xl border border-ink/[0.1] p-4 sm:p-5 bg-ink/[0.015]">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-mono text-[9px] font-bold uppercase tracking-[2px]" style={{ color: 'var(--accent-ink)' }}>
                        {goal.targetType === 'project' ? 'Project' : 'Milestone'}
                      </span>
                      <span className={`font-mono text-[9px] uppercase tracking-[1.5px] ${goal.status === 'open' ? 'text-ink/55' : 'text-ink/30'}`}>
                        {goal.status === 'open' ? (acceptingSupport ? 'Accepting funding' : 'Goal open · setup needed') : 'Closed'}
                      </span>
                    </div>
                    <h3 className="font-basement font-black text-[18px] uppercase leading-tight text-ink mt-2">{goal.titleSnapshot || 'Untitled goal'}</h3>
                    {goal.blurb && <p className="font-zirkon text-[14px] leading-relaxed text-ink/55 mt-2">{goal.blurb}</p>}
                    <FundingMeter raisedCents={raised} goalCents={goal.goalCents} patronCount={goal.patronCount} size="md" className="mt-4" />
                    <Link href={`/dashboard/worlds/${slug}/in-process`} className="inline-block mt-4 font-mono text-[10px] font-bold uppercase tracking-[1.5px] text-ink/50 hover:text-ink">
                      Edit on roadmap →
                    </Link>
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
