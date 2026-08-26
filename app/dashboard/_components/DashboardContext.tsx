'use client';

import { createContext, useContext } from 'react';
import type { WorldMembership, UserProfile } from '../../hooks/useUserProfile';

interface HostedEvent {
  id: string;
  eventName: string;
  slug: string;
  date: string | null;
  dateIso: string | null;
  city: string | null;
  imageUrl: string | null;
  published: boolean;
}

/** Null-vs-empty for hosted events, without breaking `hostedEvents.length`
 *  consumers: the layout keeps the raw `HostedEvent[] | null` sentinel and
 *  exposes the derived status here. 'error' only fires when NOTHING has
 *  loaded — a failed background refresh keeps showing the last good list. */
type EventsStatus = 'loading' | 'error' | 'loaded';

interface DashboardContextValue {
  profile: UserProfile | null;
  worldMemberships: WorldMembership[];
  /** Phased-rollout grants for this account, e.g. ['funding']. Rendering only
   *  — every route re-checks server-side. */
  features: string[];
  /** Empty until loaded — check `eventsStatus` before treating [] as "none". */
  hostedEvents: HostedEvent[];
  eventsStatus: EventsStatus;
  refreshEvents: () => void;
}

export const DashboardContext = createContext<DashboardContextValue>({
  profile: null,
  worldMemberships: [],
  features: [],
  hostedEvents: [],
  eventsStatus: 'loading',
  refreshEvents: () => {},
});

export function useDashboard() {
  return useContext(DashboardContext);
}

export type { HostedEvent };
