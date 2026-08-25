import { NextRequest, NextResponse } from 'next/server';
import { and, eq, ilike, or, sql } from 'drizzle-orm';
import { db, worlds, events, users, tools, grants, worldProjects } from '@/lib/db';

/* GET /api/search?q=…
 *
 * ONE search endpoint for the whole platform — the ⌘K palette and the /search
 * page both speak to this. Before it existed, the search page downloaded the
 * entire worlds and events datasets and filtered them in the browser, and
 * people-search required auth while nothing else was searchable at all.
 *
 * Public data only (published rows), so no auth and cacheable per query. Six
 * entity types, all queried in one Promise.all, each capped — the palette
 * shows a handful per group, not pages.
 *
 * Matching is ILIKE substring. users(lower(username)) and users(lower(email))
 * are indexed (apply-perf-indexes.mjs); the rest of these tables are small
 * enough (tens to low hundreds of rows) that a scan is fine, and moving to
 * trigram/FTS later changes only this file. */

const CACHE = { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' };
const PER_TYPE = 6;

export async function GET(request: NextRequest) {
  try {
    const q = (request.nextUrl.searchParams.get('q') ?? '').trim().slice(0, 80);
    // Optional people filter by role slug ("photographer") — the assistant's
    // "show me photographers" query. Public rows only, same cache semantics
    // (the param varies the cache key).
    const role = (request.nextUrl.searchParams.get('role') ?? '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40);
    if (q.length < 2 && !role) {
      return NextResponse.json(
        { worlds: [], events: [], people: [], tools: [], grants: [], projects: [] },
        { headers: CACHE },
      );
    }
    // Role-only queries search people alone; the other five types skip the
    // DB entirely (textSearch=false) rather than match-nothing patterns —
    // Postgres rejects control bytes in ILIKE params.
    const textSearch = q.length >= 2;
    const pat = `%${q}%`;
    const NONE: never[] = [];

    const [worldRows, eventRows, peopleRows, toolRows, grantRows, projectRows] =
      await Promise.all([
        !textSearch ? NONE :
        db.select({
          title: worlds.title, slug: worlds.slug,
          subtitle: worlds.shortDescription, imageUrl: worlds.imageUrl,
        }).from(worlds)
          .where(and(
            eq(worlds.published, true),
            or(ilike(worlds.title, pat), ilike(worlds.category, pat), ilike(worlds.shortDescription, pat)),
          ))
          .limit(PER_TYPE),

        !textSearch ? NONE : db.select({
          title: events.eventName, slug: events.slug,
          city: events.city, dateIso: events.dateIso, imageUrl: events.imageUrl,
        }).from(events)
          .where(and(
            eq(events.published, true),
            or(ilike(events.eventName, pat), ilike(events.city, pat)),
          ))
          // Upcoming first, then most recent past.
          .orderBy(sql`${events.dateIso} >= to_char(now(), 'YYYY-MM-DD') DESC`, sql`${events.dateIso} DESC NULLS LAST`)
          .limit(PER_TYPE),

        db.select({
          username: users.username, name: users.name, avatarUrl: users.avatarUrl,
        }).from(users)
          .where(and(
            eq(users.published, true),
            role
              ? ilike(users.roleTags, `%${role}%`)
              : or(ilike(users.username, pat), ilike(users.name, pat)),
          ))
          .limit(role ? 12 : PER_TYPE),

        !textSearch ? NONE : db.select({ name: tools.name, slug: tools.slug, category: tools.category })
          .from(tools)
          .where(and(eq(tools.published, true), or(ilike(tools.name, pat), ilike(tools.category, pat))))
          .limit(PER_TYPE),

        !textSearch ? NONE : db.select({ name: grants.grantName, slug: grants.slug, org: grants.orgName })
          .from(grants)
          .where(and(eq(grants.published, true), or(ilike(grants.grantName, pat), ilike(grants.orgName, pat))))
          .limit(PER_TYPE),

        // Projects join their world for the URL and to hide unpublished worlds.
        !textSearch ? NONE : db.select({
          name: worldProjects.name, slug: worldProjects.slug,
          worldSlug: worlds.slug, worldTitle: worlds.title,
        }).from(worldProjects)
          .innerJoin(worlds, eq(worldProjects.worldId, worlds.id))
          .where(and(
            eq(worldProjects.published, true), eq(worlds.published, true),
            ilike(worldProjects.name, pat),
          ))
          .limit(PER_TYPE),
      ]);

    return NextResponse.json({
      worlds: worldRows.map((w) => ({
        title: w.title, subtitle: w.subtitle, imageUrl: w.imageUrl,
        href: `/worlds/${w.slug}`,
      })),
      events: eventRows.map((e) => ({
        title: e.title,
        subtitle: [e.dateIso, e.city].filter(Boolean).join(' · ') || null,
        imageUrl: e.imageUrl,
        href: `/events/${e.slug}`,
      })),
      people: peopleRows.map((p) => ({
        title: p.name || `@${p.username}`,
        subtitle: p.username ? `@${p.username}` : null,
        imageUrl: p.avatarUrl,
        href: `/profile/${p.username}`,
      })),
      tools: toolRows.map((t) => ({
        title: t.name, subtitle: t.category, imageUrl: null,
        href: `/resources/tools/${t.slug}`,
      })),
      grants: grantRows.map((g) => ({
        title: g.name, subtitle: g.org, imageUrl: null,
        href: `/resources/grants#${g.slug}`,
      })),
      projects: projectRows.map((p) => ({
        title: p.name, subtitle: p.worldTitle, imageUrl: null,
        href: `/worlds/${p.worldSlug}/projects/${p.slug}`,
      })),
    }, { headers: CACHE });
  } catch (error) {
    console.error('[search] failed:', error);
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }
}
