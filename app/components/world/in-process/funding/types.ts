/* One funding goal as the UI sees it. Mirrors the /api/funding/goals payload. */
export interface FundingGoalView {
  id: string;
  targetType: string;              // 'milestone' | 'project' | 'life_chapter'
  targetId: string;
  worldId: string | null;
  titleSnapshot: string | null;
  /** null = supported with no target amount. Distinct from 0. */
  goalCents: number | null;
  raisedCents: number;
  patronCount: number;
  blurb: string | null;
  status: string;                  // 'open' | 'closed'
}

/** Goals keyed by the id of the thing they fund, so a card can look itself up. */
export type GoalMap = Map<string, FundingGoalView>;
