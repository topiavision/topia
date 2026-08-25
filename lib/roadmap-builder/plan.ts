/* LLM roadmap plans — when no hand-written template fits ("I'm building an
 * app"), the `roadmap` parse flow drafts milestone titles from the
 * description. This module is the trust boundary: clamp whatever came back,
 * then dress it as a RoadmapTemplate so `instantiate` does the date math
 * exactly like every hand-written arc. Grammar and templates remain the
 * floor — an unconfigured or failed LLM never blocks the generic arc. */

import type { RoadmapTemplate } from './templates';

export interface RoadmapPlan {
  projectName: string | null;
  months: number | null;
  milestones: string[];
}

export function clampRoadmapPlan(raw: unknown): RoadmapPlan | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const seen = new Set<string>();
  const milestones: string[] = [];
  if (Array.isArray(r.milestones)) {
    for (const item of r.milestones) {
      if (typeof item !== 'string') continue;
      const title = item.trim().replace(/\s+/g, ' ').slice(0, 60);
      const key = title.toLowerCase();
      if (!title || seen.has(key)) continue;
      seen.add(key);
      milestones.push(title);
      if (milestones.length >= 8) break;
    }
  }
  if (milestones.length < 2) return null; // one milestone isn't an arc
  const months = typeof r.months === 'number' && Number.isFinite(r.months)
    ? Math.min(36, Math.max(1, Math.round(r.months)))
    : null;
  const projectName = typeof r.projectName === 'string' && r.projectName.trim()
    ? r.projectName.trim().slice(0, 80)
    : null;
  return { projectName, months, milestones };
}

/** A plan wearing a template's clothes: milestones spread evenly 0..1 so
 * `instantiate` stretches them across the timeframe like any other arc. */
export function planToTemplate(plan: RoadmapPlan): RoadmapTemplate {
  const n = plan.milestones.length;
  return {
    id: 'generic',
    label: 'a plan', chipLabel: 'Plan',
    keywords: [],
    defaultEraTitle: plan.projectName ?? 'The Plan',
    defaultSpanMonths: plan.months ?? 6,
    milestones: plan.milestones.map((title, i) => ({
      title,
      frac: n === 1 ? 0 : i / (n - 1),
    })),
  };
}
