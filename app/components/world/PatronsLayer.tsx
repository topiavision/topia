'use client';

import { useMemo, useState } from 'react';
import type { EraView } from './InProcessLayer';
import type { ProjectItem } from './ProjectsLayer';
import { BackMilestoneModal } from './in-process/funding/BackMilestoneModal';
import { FundingMeter } from './in-process/funding/FundingMeter';
import { FundingReturn } from './in-process/funding/FundingReturn';
import { usd } from './in-process/funding/format';
import { totalRaisedCents, type FundingGoalView } from './in-process/funding/types';
import { useFundingGoals } from './in-process/funding/useFundingGoals';

interface GoalContext {
  eyebrow: string;
  roadmap: string | null;
  project: string | null;
}

export default function PatronsLayer({
  worldId,
  worldTitle,
  privyId,
  eras,
  projects,
  canEdit,
  onViewRoadmap,
}: {
  worldId: string;
  worldTitle: string;
  privyId: string | null;
  eras: EraView[];
  projects: ProjectItem[];
  canEdit: boolean;
  onViewRoadmap: () => void;
}) {
  const { goals, acceptingSupport, reload, loaded } = useFundingGoals(worldId);
  const [selectedGoal, setSelectedGoal] = useState<FundingGoalView | null>(null);

  const contextByTarget = useMemo(() => {
    const result = new Map<string, GoalContext>();
    for (const project of projects) {
      result.set(project.id, { eyebrow: 'Project', roadmap: null, project: project.name });
    }
    for (const era of eras) {
      era.milestones.forEach((milestone, index) => {
        result.set(milestone.id, {
          eyebrow: `Milestone ${String(index + 1).padStart(2, '0')}`,
          roadmap: era.title,
          project: era.projectName ?? null,
        });
      });
    }
    return result;
  }, [eras, projects]);

  const openGoals = [...goals.values()]
    .filter((goal) => goal.status === 'open')
    .sort((a, b) => totalRaisedCents(b) - totalRaisedCents(a));
  const raisedTotal = openGoals.reduce((sum, goal) => sum + totalRaisedCents(goal), 0);

  if (!loaded) {
    return (
      <div className="p-5 md:p-6 animate-pulse" aria-label="Loading patronage">
        <div className="h-5 w-40 rounded bg-ink/[0.08]" />
        <div className="h-24 mt-5 rounded-lg bg-ink/[0.05]" />
      </div>
    );
  }

  return (
    <div className="p-5 md:p-6">
      <FundingReturn onCredited={() => reload()} />

      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3 pb-5 border-b border-ink/[0.08]">
        <div>
          <p className="font-mono text-[10px] font-bold uppercase tracking-[2px]" style={{ color: 'var(--accent-ink)' }}>Patronage</p>
          <h2 className="font-basement font-black text-[clamp(20px,3vw,28px)] uppercase leading-none text-ink mt-1">Fund the work in motion</h2>
          <p className="font-zirkon text-[14px] leading-relaxed text-ink/55 mt-2 max-w-2xl">Patrons fund specific milestones and follow the process as the work moves forward.</p>
        </div>
        {raisedTotal > 0 && (
          <div className="md:text-right shrink-0">
            <span className="font-mono text-[18px] font-bold text-ink tabular-nums">{usd(raisedTotal)}</span>
            <span className="font-mono text-[9px] uppercase tracking-[1.5px] text-ink/40 ml-2">raised in this world</span>
          </div>
        )}
      </div>

      {openGoals.length === 0 ? (
        <div className="min-h-56 flex flex-col items-center justify-center text-center px-4 py-10">
          <p className="font-mono text-[11px] font-bold uppercase tracking-[1.5px] text-ink/55">Patronage is not open yet</p>
          <p className="font-zirkon text-[14px] text-ink/45 mt-2 max-w-md">When a builder opens funding for a project or milestone, it will appear here with exactly what the support unlocks.</p>
          <button onClick={onViewRoadmap} className="min-h-10 mt-4 px-3.5 rounded-md bg-transparent border border-ink/[0.16] font-mono text-[10px] font-bold uppercase tracking-wider text-ink/65 hover:text-ink hover:border-ink/35 cursor-pointer">View the roadmap</button>
          {canEdit && <p className="font-mono text-[10px] text-ink/35 mt-3">Builders can open funding from a milestone in Now.</p>}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mt-5">
          {openGoals.map((goal) => {
            const context = contextByTarget.get(goal.targetId);
            const raised = totalRaisedCents(goal);
            return (
              <article key={goal.id} className="rounded-xl border border-ink/[0.1] p-4 md:p-5 flex flex-col bg-ink/[0.015]">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[9px] font-bold uppercase tracking-[2px]" style={{ color: 'var(--accent-ink)' }}>{context?.eyebrow ?? (goal.targetType === 'project' ? 'Project' : 'Milestone')}</span>
                  {context?.project && <span className="font-mono text-[9px] uppercase tracking-[1.5px] text-ink/35">{context.project}</span>}
                </div>
                <h3 className="font-basement font-black text-[20px] uppercase leading-tight text-ink mt-2">{goal.titleSnapshot || 'Untitled funding goal'}</h3>
                {context?.roadmap && <p className="font-mono text-[10px] uppercase tracking-[1.5px] text-ink/40 mt-1">Roadmap · {context.roadmap}</p>}
                {goal.blurb && <p className="font-zirkon text-[14px] leading-relaxed text-ink/60 mt-3">{goal.blurb}</p>}

                <FundingMeter raisedCents={raised} goalCents={goal.goalCents} patronCount={goal.patronCount} size="lg" className="mt-5" />

                <div className="mt-auto pt-5 flex flex-wrap items-center gap-2">
                  {acceptingSupport ? (
                    <button onClick={() => setSelectedGoal(goal)} className="min-h-10 px-4 rounded-md border-none bg-lime text-obsidian font-mono text-[11px] font-bold uppercase tracking-wider cursor-pointer hover:opacity-90 transition-opacity">Fund this {goal.targetType === 'project' ? 'project' : 'milestone'}</button>
                  ) : (
                    <span className="font-mono text-[10px] uppercase tracking-[1.5px] text-ink/40">Funding is being prepared</span>
                  )}
                  <button onClick={onViewRoadmap} className="min-h-10 px-3.5 rounded-md bg-transparent border border-ink/[0.14] font-mono text-[10px] font-bold uppercase tracking-wider text-ink/55 hover:text-ink cursor-pointer">View progress</button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {selectedGoal && (
        <BackMilestoneModal
          goal={selectedGoal}
          milestoneLabel={contextByTarget.get(selectedGoal.targetId)?.eyebrow ?? 'Funding goal'}
          worldTitle={worldTitle}
          privyId={privyId}
          onClose={() => setSelectedGoal(null)}
        />
      )}
    </div>
  );
}
