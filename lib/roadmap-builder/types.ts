/* Roadmap Builder — shared types for the prompt-driven roadmap engine.
 *
 * The engine is deliberately dependency-free and deterministic: no React, no
 * DB, no clock reads (every entry point takes `now: Date`). The UI feeds user
 * utterances through parse/commands and renders the resulting DraftRoadmap;
 * nothing touches the network until the draft is saved via the batch route.
 * Assertions live in scripts/check-roadmap-builder.ts. */

import type { DatePrecision } from '../eraDates';

export type Precision = DatePrecision;

/* A parsed date, wire-compatible with the era/milestone date columns:
 * value is always a normalized full YYYY-MM-DD (month precision → 1st,
 * year precision → Jan 1), same normalization as InProcessFields. */
export interface ParsedDate { value: string; precision: Precision }

export type MilestoneStatus = 'done' | 'now' | 'upcoming' | 'paused';

export interface DraftMilestone {
  /** Client-side stable key ('m1', 'm2'…) for animation and command refs. */
  key: string;
  title: string;
  description: string | null;
  start: ParsedDate | null;
  end: ParsedDate | null;
  status: MilestoneStatus;
  /** True once the user explicitly set the date — timeline redistribution
   * (set_timeframe) must never clobber a pinned date. */
  datePinned: boolean;
  /** Optional funding goal, in integer cents (null = no goal — the default;
   * a milestone without one renders exactly as it always has). Goals save
   * through /api/funding/goals AFTER the roadmap exists, never in the batch. */
  goalCents: number | null;
  goalBlurb: string | null;
  /** Creator-entered money raised OUTSIDE Topia (Latashá's brief) — rides the
   * same /api/funding/goals save as the goal itself. */
  goalExternalCents: number | null;
}

export type DraftProject =
  | { mode: 'existing'; id: string; name: string }
  | { mode: 'new'; name: string }
  | { mode: 'none' }; // world-wide roadmap (projectId null)

export interface DraftRoadmap {
  project: DraftProject;
  templateId: TemplateId | null;
  title: string;
  description: string | null;
  start: ParsedDate | null;
  end: ParsedDate | null;
  milestones: DraftMilestone[];
}

export type TemplateId =
  | 'album' | 'podcast' | 'film' | 'book' | 'fashion'
  | 'tour' | 'exhibition' | 'product' | 'generic';

/** How a command names a milestone: by index (chips) or fuzzy title (chat). */
export type MilestoneRef = { index: number } | { title: string };

export type BuilderCommand =
  | { kind: 'seed'; templateId: TemplateId; projectName: string | null; quantity: number | null; end: ParsedDate | null; raw: string }
  | { kind: 'add_milestone'; title: string; start: ParsedDate | null }
  | { kind: 'remove_milestone'; ref: MilestoneRef }
  | { kind: 'rename_milestone'; ref: MilestoneRef; title: string }
  | { kind: 'set_milestone_date'; ref: MilestoneRef; start: ParsedDate | null; end: ParsedDate | null }
  | { kind: 'set_status'; ref: MilestoneRef; status: MilestoneStatus }
  | { kind: 'set_goal'; ref: MilestoneRef; cents: number | null; blurb?: string | null; externalCents?: number | null }
  | { kind: 'set_milestone_description'; ref: MilestoneRef; text: string | null }
  | { kind: 'move_milestone'; ref: MilestoneRef; to: number | 'first' | 'last' | 'up' | 'down' }
  | { kind: 'set_era_title'; title: string }
  | { kind: 'set_era_description'; text: string }
  | { kind: 'set_timeframe'; start: ParsedDate | null; end: ParsedDate | null }
  | { kind: 'unknown'; raw: string };

/* Caps. The client blocks past MAX_DRAFT_MILESTONES with a friendly reply;
 * the batch route 400s past MAX_BATCH_MILESTONES as a backstop. */
export const MAX_COUNTABLE_REPEATS = 12;
export const MAX_DRAFT_MILESTONES = 20;
export const MAX_BATCH_MILESTONES = 30;

/* Goal bounds — mirror /api/funding/goals ($1 floor, $1M ceiling) so the
 * chat catches a bad amount before the round trip; the route re-validates. */
export const MIN_GOAL_CENTS = 100;
export const MAX_GOAL_CENTS = 100_000_000;
