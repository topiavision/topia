/* Live-edit support: hydrate a DraftRoadmap from a persisted era, and diff
 * two draft states into the API patches that make the second real.
 *
 * Edit mode keeps the same pure reducer as create mode — the component runs
 * applyCommand, then hands (prev, next) here and fires the returned patches.
 * The diff is command-agnostic on purpose: one well-tested mapping instead
 * of a per-command switch that drifts. Funding (goalCents/goalBlurb) is
 * deliberately ignored — goals ride /api/funding/goals separately.
 *
 * Pinning note: existing milestones hydrate with datePinned=false so
 * "finish by March" can re-flow a real roadmap; a date the user touches
 * during the session pins as usual. */

import type { DraftMilestone, DraftRoadmap, ParsedDate, Precision, MilestoneStatus } from './types';
import type { EraView } from '../../app/components/world/in-process/types';

const PRECISIONS = new Set(['day', 'month', 'year']);

function toParsed(date: string | null, precision: string | null): ParsedDate | null {
  if (!date) return null;
  const p: Precision = PRECISIONS.has(precision ?? '') ? (precision as Precision) : 'month';
  return { value: date, precision: p };
}

const MS_STATUSES = new Set(['done', 'now', 'upcoming', 'paused']);

/** Existing-milestone keys carry the real id: 'ex-<uuid>'. */
export const keyForId = (id: string) => `ex-${id}`;
export const idForKey = (key: string): string | null => (key.startsWith('ex-') ? key.slice(3) : null);

export function draftFromEra(era: EraView, goals?: Map<string, { goalCents: number | null; blurb: string | null; externalRaisedCents?: number }>): DraftRoadmap {
  return {
    project: era.projectId
      ? { mode: 'existing', id: era.projectId, name: era.projectName ?? '' }
      : { mode: 'none' },
    templateId: null,
    title: era.title,
    description: era.description,
    start: toParsed(era.startDate, era.startPrecision),
    end: toParsed(era.endDate, era.endPrecision),
    milestones: era.milestones.map((m): DraftMilestone => {
      const goal = goals?.get(m.id);
      return {
        key: keyForId(m.id),
        title: m.title,
        description: m.description,
        start: toParsed(m.startDate, m.startPrecision),
        end: toParsed(m.endDate, m.endPrecision),
        status: (MS_STATUSES.has(m.status) ? m.status : 'upcoming') as MilestoneStatus,
        datePinned: false,
        goalCents: goal?.goalCents ?? null,
        goalExternalCents: goal?.externalRaisedCents ?? null,
        goalBlurb: goal?.blurb ?? null,
      };
    }),
  };
}

/* ── Diff → patches ────────────────────────────────────────────────── */

export type EditPatch =
  | { kind: 'era-put'; body: Record<string, unknown> }
  | { kind: 'ms-put'; milestoneId: string; body: Record<string, unknown> }
  | { kind: 'ms-post'; clientKey: string; body: Record<string, unknown> }
  | { kind: 'ms-delete'; milestoneId: string };

const dateFields = (prefix: 'start' | 'end', d: ParsedDate | null) => ({
  [`${prefix}Date`]: d?.value ?? null,
  [`${prefix}Precision`]: d?.precision ?? null,
});

function sameDate(a: ParsedDate | null, b: ParsedDate | null): boolean {
  return (a?.value ?? null) === (b?.value ?? null) && (a?.precision ?? null) === (b?.precision ?? null);
}

/** Everything that must change to turn `prev` into `next`, as API calls.
 * Ordering: era first, then deletes, then puts, then posts. */
export function diffToPatches(prev: DraftRoadmap, next: DraftRoadmap): EditPatch[] {
  const patches: EditPatch[] = [];

  // Era-level fields.
  const era: Record<string, unknown> = {};
  if (prev.title !== next.title) era.title = next.title;
  if ((prev.description ?? null) !== (next.description ?? null)) era.description = next.description;
  if (!sameDate(prev.start, next.start)) Object.assign(era, dateFields('start', next.start));
  if (!sameDate(prev.end, next.end)) Object.assign(era, dateFields('end', next.end));
  if (Object.keys(era).length > 0) patches.push({ kind: 'era-put', body: era });

  const prevByKey = new Map(prev.milestones.map((m, i) => [m.key, { m, i }]));
  const nextKeys = new Set(next.milestones.map((m) => m.key));

  // Removed milestones.
  for (const { m } of prevByKey.values()) {
    if (!nextKeys.has(m.key)) {
      const id = idForKey(m.key);
      if (id) patches.push({ kind: 'ms-delete', milestoneId: id });
    }
  }

  // Changed + new milestones (sortOrder = position in next).
  next.milestones.forEach((m, i) => {
    const was = prevByKey.get(m.key);
    if (!was) {
      patches.push({
        kind: 'ms-post',
        clientKey: m.key,
        body: {
          title: m.title,
          description: m.description,
          ...dateFields('start', m.start),
          ...dateFields('end', m.end),
          status: m.status,
          sortOrder: i,
        },
      });
      return;
    }
    const id = idForKey(m.key);
    if (!id) return; // unsaved key that somehow persisted — nothing to patch
    const body: Record<string, unknown> = {};
    if (was.m.title !== m.title) body.title = m.title;
    if ((was.m.description ?? null) !== (m.description ?? null)) body.description = m.description;
    if (!sameDate(was.m.start, m.start)) Object.assign(body, dateFields('start', m.start));
    if (!sameDate(was.m.end, m.end)) Object.assign(body, dateFields('end', m.end));
    if (was.m.status !== m.status) body.status = m.status;
    if (was.i !== i) body.sortOrder = i;
    if (Object.keys(body).length > 0) patches.push({ kind: 'ms-put', milestoneId: id, body });
  });

  return patches;
}
