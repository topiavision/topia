import { NextResponse } from 'next/server';
import { desc, eq, and, gte, sql, count } from 'drizzle-orm';
import { db, worlds, users, events, eventRsvps, eraProcessPosts, worldEras } from '@/lib/db';

/* ── The NOW STAMPING ticker ────────────────────────────────────────
 * A dozen recent, PUBLIC-SAFE happenings, merged and sorted: new worlds,
 * process moments (already public on world pages), new topians (published
 * profiles), and going-counts for upcoming events (counts are already
 * public on event cards — individual RSVP names never appear here).
 * One shape: { text, href, at }. */

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [newWorlds, moments, newTopians, upcoming] = await Promise.all([
      db.select({ title: worlds.title, slug: worlds.slug, at: worlds.createdAt })
        .from(worlds).where(eq(worlds.published, true))
        .orderBy(desc(worlds.createdAt)).limit(3),

      db.select({
        title: eraProcessPosts.title, at: eraProcessPosts.createdAt,
        worldTitle: worlds.title, worldSlug: worlds.slug, minted: eraProcessPosts.mintedUrl,
      })
        .from(eraProcessPosts)
        .innerJoin(worldEras, eq(eraProcessPosts.eraId, worldEras.id))
        .innerJoin(worlds, and(eq(worldEras.worldId, worlds.id), eq(worlds.published, true)))
        .orderBy(desc(eraProcessPosts.createdAt)).limit(5),

      db.select({ username: users.username, at: users.createdAt })
        .from(users)
        .where(and(eq(users.published, true), sql`${users.username} is not null`))
        .orderBy(desc(users.createdAt)).limit(3),

      db.select({
        name: events.eventName, slug: events.slug, dateIso: events.dateIso,
        going: count(eventRsvps.id),
      })
        .from(events)
        .leftJoin(eventRsvps, and(eq(eventRsvps.eventId, events.id), eq(eventRsvps.status, 'going')))
        .where(and(eq(events.published, true), gte(events.dateIso, sql`to_char(now(), 'YYYY-MM-DD')`)))
        .groupBy(events.id)
        .orderBy(events.dateIso).limit(2),
    ]);

    const items = [
      ...newWorlds.map((w) => ({
        text: `NEW WORLD — ${w.title.toUpperCase()} went live`,
        href: `/worlds/${w.slug}`, at: w.at?.toISOString() ?? null,
      })),
      ...moments.map((m) => ({
        text: `${m.worldTitle.toUpperCase()} logged “${m.title}”${m.minted ? ' ⛓' : ''}`,
        href: `/worlds/${m.worldSlug}#inprocess`, at: m.at?.toISOString() ?? null,
      })),
      ...newTopians.map((u) => ({
        text: `@${u.username} claimed a passport`,
        href: `/profile/${u.username}`, at: u.at?.toISOString() ?? null,
      })),
      ...upcoming
        .filter((e) => Number(e.going) > 0)
        .map((e) => ({
          text: `${Number(e.going)} going to ${e.name.toUpperCase()}`,
          href: `/events/${e.slug}`, at: null as string | null,
        })),
    ]
      // Dated items newest-first; undated (going counts) ride at the end.
      .sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''))
      .slice(0, 12);

    return NextResponse.json({ items }, {
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' },
    });
  } catch (e) {
    console.error('[ticker]', e);
    return NextResponse.json({ items: [] }, { status: 200 });
  }
}
