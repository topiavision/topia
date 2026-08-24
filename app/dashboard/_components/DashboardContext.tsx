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

interface DashboardContextValue {
  profile: UserProfile | null;
  worldMemberships: WorldMembership[];
  /** Phased-rollout grants for this account, e.g. ['funding']. Rendering only
   *  — every route re-checks server-side. */
  features: string[];
  hostedEvents: HostedEvent[];
  refreshEvents: () => void;
}

export const DashboardContext = createContext<DashboardContextValue>({
  profile: null,
  worldMemberships: [],
  features: [],
  hostedEvents: [],
  refreshEvents: () => {},
});

export function useDashboard() {
  return useContext(DashboardContext);
}

export type { HostedEvent };
