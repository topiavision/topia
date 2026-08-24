'use client';

import { useState, useEffect } from 'react';
import { usePrivy } from '@privy-io/react-auth';

export interface WorldMembership {
  worldId: string;
  worldTitle: string;
  worldSlug: string;
  worldCategory: string | null;
  worldImageUrl: string | null;
  worldPublished?: boolean;
  role: string; // 'owner' | 'world_builder' | 'collaborator'
}

export interface UserProfile {
  id: string;
  privyId: string;
  name: string | null;
  username: string | null;
  bio: string | null;
  avatarUrl: string | null;
  email: string | null;
  role: string | null;
  roleTags: string | null;
  path: string | null;
  toolSlugs: string | null;
  socialWebsite: string | null;
  socialTwitter: string | null;
  socialInstagram: string | null;
  socialSoundcloud: string | null;
  socialSpotify: string | null;
  socialLinkedin: string | null;
  socialSubstack: string | null;
}

interface CachedProfile {
  privyId: string;
  profile: UserProfile;
  worldMemberships: WorldMembership[];
  features: string[];
}

// Every consumer of this hook used to refetch /api/auth/profile from scratch
// on every page load, so the nav avatar stayed blank until Privy initialized
// AND the fetch round-tripped. Instead: serve the last-known profile from
// sessionStorage immediately, revalidate in the background, and share one
// in-flight fetch across all hook consumers on the page.
const CACHE_KEY = 'topia:profile-cache:v1';

let memoryCache: CachedProfile | null = null;
let inflight: { privyId: string; promise: Promise<CachedProfile | null> } | null = null;

function readCache(): CachedProfile | null {
  if (memoryCache) return memoryCache;
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    memoryCache = JSON.parse(raw) as CachedProfile;
    return memoryCache;
  } catch {
    return null;
  }
}

function writeCache(entry: CachedProfile | null) {
  memoryCache = entry;
  if (typeof window === 'undefined') return;
  try {
    if (entry) sessionStorage.setItem(CACHE_KEY, JSON.stringify(entry));
    else sessionStorage.removeItem(CACHE_KEY);
  } catch {
    // storage blocked/full — the cache is best-effort
  }
}

function fetchProfile(privyId: string): Promise<CachedProfile | null> {
  if (inflight?.privyId === privyId) return inflight.promise;
  const promise = fetch(`/api/auth/profile?privyId=${encodeURIComponent(privyId)}`)
    .then((r) => r.json())
    .then((data) => {
      if (!data.user) return null;
      const entry: CachedProfile = {
        privyId,
        profile: data.user,
        worldMemberships: data.worldMemberships ?? [],
        features: data.features ?? [],
      };
      writeCache(entry);
      return entry;
    })
    .finally(() => {
      if (inflight?.privyId === privyId) inflight = null;
    });
  inflight = { privyId, promise };
  return promise;
}

export function useUserProfile() {
  const { ready, authenticated, user } = usePrivy();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [worldMemberships, setWorldMemberships] = useState<WorldMembership[]>([]);
  // Phased-rollout grants for this account, e.g. ['funding'].
  const [features, setFeatures] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  // Hydrate from the cache one paint after mount (not in the initial state,
  // which would mismatch the server-rendered HTML) so the avatar shows
  // instantly instead of waiting on Privy + the profile fetch.
  useEffect(() => {
    const cached = readCache();
    if (cached) {
      setProfile(cached.profile);
      setWorldMemberships(cached.worldMemberships);
      setFeatures(cached.features ?? []);
    }
  }, []);

  useEffect(() => {
    if (!ready) return; // keep showing cached data while Privy boots
    if (!authenticated || !user) {
      setProfile(null);
      setWorldMemberships([]);
      setFeatures([]);
      setLoading(false);
      writeCache(null); // logged out — drop the cache
      return;
    }

    const cached = readCache();
    if (cached && cached.privyId !== user.id) {
      // Cache belongs to a different account — drop it before revalidating.
      setProfile(null);
      setWorldMemberships([]);
      setFeatures([]);
      writeCache(null);
    }
    setLoading(!cached || cached.privyId !== user.id);

    let cancelled = false;
    fetchProfile(user.id)
      .then((entry) => {
        if (cancelled || !entry) return;
        setProfile(entry.profile);
        setWorldMemberships(entry.worldMemberships);
        setFeatures(entry.features ?? []);
      })
      .catch(console.error)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [ready, authenticated, user]);

  return { profile, worldMemberships, features, loading, ready, authenticated };
}
