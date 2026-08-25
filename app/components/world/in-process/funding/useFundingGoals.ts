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
  /** Server-computed: this world's payee can actually receive money. */
  const [acceptingSupport, setAcceptingSupport] = useState(false);
  /** Whether a goal can be set here at all — the payee is in the cohort. */
  const [canSetGoals, setCanSetGoals] = useState(false);
  /** The world has no owner, so no payee exists. Worth saying out loud. */
  const [payeeMissing, setPayeeMissing] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    if (!worldId) { setLoaded(true); return; }
    try {
      const res = await fetch(`/api/funding/goals?worldId=${encodeURIComponent(worldId)}`);
      if (!res.ok) { setLoaded(true); return; }
      const data: {
        goals?: FundingGoalView[]; acceptingSupport?: boolean;
        canSetGoals?: boolean; payeeMissing?: boolean;
      } = await res.json();
      setGoals(new Map((data.goals ?? []).map((g) => [g.targetId, g])));
      setAcceptingSupport(Boolean(data.acceptingSupport));
      setCanSetGoals(Boolean(data.canSetGoals));
      setPayeeMissing(Boolean(data.payeeMissing));
    } catch {
      // A funding fetch failing must never break the roadmap — the page just
      // renders as though nothing is funded.
    } finally {
      setLoaded(true);
    }
  }, [worldId]);

  useEffect(() => { void reload(); }, [reload]);

  return { goals, acceptingSupport, canSetGoals, payeeMissing, reload, loaded };
}
