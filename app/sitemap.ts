import type { MetadataRoute } from 'next';
import { db, events, worlds, users, tools } from '@/lib/db';
import { eq, isNotNull } from 'drizzle-orm';

const BASE = 'https://topia.vision';

export const revalidate = 3600;

const STATIC_PATHS = [
  '',
  '/home',
  '/events',
  '/worlds',
  '/resources',
  '/resources/tools',
  '/resources/grants',
  '/topians',
  '/tv',
  '/about',
  '/contact',
  '/legal/privacy',
  '/legal/terms',
  '/legal/cookies',
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticEntries: MetadataRoute.Sitemap = STATIC_PATHS.map((path) => ({
    url: `${BASE}${path}`,
    changeFrequency: path === '' ? 'weekly' : 'daily',
    priority: path === '' ? 1 : 0.7,
  }));

  try {
    const [eventRows, worldRows, profileRows, toolRows] = await Promise.all([
      db
        .select({ slug: events.slug, updatedAt: events.updatedAt })
        .from(events)
        .where(eq(events.published, true))
        .limit(2000),
      db
        .select({ slug: worlds.slug, updatedAt: worlds.updatedAt })
        .from(worlds)
        .where(eq(worlds.published, true))
        .limit(2000),
      db
        .select({ username: users.username, updatedAt: users.updatedAt })
        .from(users)
        .where(isNotNull(users.username))
        .limit(5000),
      db
        .select({ slug: tools.slug, updatedAt: tools.updatedAt })
        .from(tools)
        .where(eq(tools.published, true))
        .limit(2000),
    ]);

    return [
      ...staticEntries,
      ...eventRows.map((e) => ({
        url: `${BASE}/events/${e.slug}`,
        lastModified: e.updatedAt,
        changeFrequency: 'daily' as const,
        priority: 0.8,
      })),
      ...worldRows.map((w) => ({
        url: `${BASE}/worlds/${w.slug}`,
        lastModified: w.updatedAt,
        changeFrequency: 'weekly' as const,
        priority: 0.8,
      })),
      ...profileRows
        .filter((p) => p.username)
        .map((p) => ({
          url: `${BASE}/profile/${p.username}`,
          lastModified: p.updatedAt,
          changeFrequency: 'weekly' as const,
          priority: 0.6,
        })),
      ...toolRows.map((t) => ({
        url: `${BASE}/resources/tools/${t.slug}`,
        lastModified: t.updatedAt,
        changeFrequency: 'weekly' as const,
        priority: 0.5,
      })),
    ];
  } catch (error) {
    // DB unreachable (e.g. at build time) — still serve the static entries.
    console.error('[sitemap] dynamic entries failed:', error);
    return staticEntries;
  }
}
