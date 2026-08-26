import type { Metadata } from 'next';
import { getTvEpisodes } from '@/lib/tv/episodes';
import { getEventsOverview } from '@/lib/events/overview';
import { getPublicProfiles } from '@/lib/profile/list';
import HomeClient from './HomeClient';

// Public data (Discover carousel, events rail, TV guide) is server-rendered;
// the viewer's profile-completeness check hydrates client-side.
export const revalidate = 60;

export const metadata: Metadata = {
  title: 'Home | TOPIA',
  description: 'Discover creators, events, worlds, and Topia TV — the TOPIA network home.',
  alternates: { canonical: 'https://topia.vision/home' },
};

export default async function HomePage() {
  // Each source degrades to an empty list on failure — a DB blip on one query
  // must not 500 the whole front door (same pattern as app/tv/page.tsx).
  // HomeClient renders honest empty states for whatever is missing.
  const [episodes, events, profiles] = await Promise.all([
    getTvEpisodes().catch((error) => {
      console.error('[home] SSR episodes failed:', error);
      return [] as Awaited<ReturnType<typeof getTvEpisodes>>;
    }),
    getEventsOverview()
      .then((o) => o.events)
      .catch((error) => {
        console.error('[home] SSR events failed:', error);
        return [] as Awaited<ReturnType<typeof getEventsOverview>>['events'];
      }),
    getPublicProfiles({ limit: 24, completeOnly: true }).catch((error) => {
      console.error('[home] SSR profiles failed:', error);
      return [] as Awaited<ReturnType<typeof getPublicProfiles>>;
    }),
  ]);

  return (
    <HomeClient
      initialEpisodes={episodes}
      initialEvents={events}
      initialProfiles={profiles.map((p) => ({ ...p, createdAt: p.createdAt.toISOString() }))}
    />
  );
}
