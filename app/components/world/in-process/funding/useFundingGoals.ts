'use client';

/* Fetch every funding goal for a world, once per layer mount, keyed by the id
 * of the thing it funds.
 *
 * Deliberately separate from the eras payload: goals change on a different
 * cadence than roadmap content, and keeping them apart means a world with no
 * funding pays nothing for the feature beyond one empty request.
 */
import { useCallback, useEffect, useState } from 'react';
import type { FundingGoalView, GoalMap } from './types';

export function useFundingGoals(worldId: string | null | undefined) {
  const [goals, setGoals] = useState<GoalMap>(new Map());
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    if (!worldId) { setLoaded(true); return; }
    try {
      const res = await fetch(`/api/funding/goals?worldId=${encodeURIComponent(worldId)}`);
      if (!res.ok) { setLoaded(true); return; }
      const data: { goals?: FundingGoalView[] } = await res.json();
      setGoals(new Map((data.goals ?? []).map((g) => [g.targetId, g])));
    } catch {
      // A funding fetch failing must never break the roadmap — the page just
      // renders as though nothing is funded.
    } finally {
      setLoaded(true);
    }
  }, [worldId]);

  useEffect(() => { void reload(); }, [reload]);

  return { goals, reload, loaded };
}
