'use client';

import { useState, useEffect, use, useMemo, useRef, useCallback } from 'react';
import { InkStamp } from '../../components/elements/InkStamp';
import Link from 'next/link';
import { usePrivy } from '@privy-io/react-auth';
import PageShell from '../../components/PageShell';
import ShareButton from '../../components/ShareButton';
import FollowButton from '../../components/FollowButton';
import { SocialIcon } from '../../components/SocialIcons';
import { getWorldConfig, type WorldConfig } from '../../components/world/worldConfig';
import OverviewLayer, { type SocialLinks, type ActivityItem } from '../../components/world/OverviewLayer';
import ProjectsLayer, { type ProjectItem } from '../../components/world/ProjectsLayer';
import EventsLayer, { type WorldEvent } from '../../components/world/EventsLayer';
import ToolsLayer from '../../components/world/ToolsLayer';
import InProcessLayer, { type EraView } from '../../components/world/InProcessLayer';
import ArchitectsLayer from '../../components/world/ArchitectsLayer';
import PatronsLayer from '../../components/world/PatronsLayer';
import { type ToolMiniData } from '../../resources/tools/ToolMiniCard';
import { useRecordWorldView } from '../../dashboard/_components/RecentlyViewedWorlds';

/* ── Types ────────────────────────────────────────────────────── */

interface WorldMember {
  userId: string;
  role: string;
  userName: string | null;
  userUsername: string | null;
  userAvatarUrl: string | null;
  createdAt?: string;
}

interface Announcement {
  id: string;
  body: string;
  createdAt: string;
  authorName: string | null;
  authorUsername: string | null;
}

interface WorldDetail {
  id: string;
  title: string;
  slug: string;
  shortDescription: string | null;
  description: string | null;
  category: string | null;
  imageUrl: string | null;
  headerImageUrl: string | null;
  country: string | null;
  tools: string | null;
  collaborators: string | null;
  socialLinks: SocialLinks | null;
  dateAdded: string | null;
  createdAt: string;
  creatorName: string | null;
  creatorSlug: string | null;
  creatorWebsiteUrl: string | null;
  creatorCountry: string | null;
  members: WorldMember[];
  // Email invitees who haven't claimed their profile yet — shown as pending
  // credits (name only; the API never exposes emails publicly).
  pendingGhosts?: { invitationId: string; name: string | null; role: string }[];
}

// A world is organized around what is happening now. Secondary material such
// as events and tools lives under About instead of competing with the work.
const SECTIONS = [
  { id: 'now',      label: 'NOW' },
  { id: 'projects', label: 'PROJECTS' },
  { id: 'patrons',  label: 'PATRONS' },
  { id: 'builders', label: 'BUILDERS' },
  { id: 'about',    label: 'ABOUT' },
] as const;
type SectionId = typeof SECTIONS[number]['id'];

function timeAgo(date: Date): string {
  const seconds = Math.max(0, (Date.now() - date.getTime()) / 1000);
  const units: [number, string][] = [[31536000, 'y'], [2592000, 'mo'], [604800, 'w'], [86400, 'd'], [3600, 'h'], [60, 'm']];
  for (const [secs, label] of units) {
    const amount = Math.floor(seconds / secs);
    if (amount >= 1) return `${amount}${label} ago`;
  }
  return 'just now';
}

/* ── Watchers modal — who's watching this world ───────────────── */

interface Watcher {
  userId: string;
  name: string | null;
  username: string | null;
  avatarUrl: string | null;
  isSelf?: boolean;
  isFollowing?: boolean;
}

function WatchersModal({ worldId, worldTitle, config, viewerPrivyId, onClose }: { worldId: string; worldTitle: string; config: WorldConfig; viewerPrivyId: string | null; onClose: () => void }) {
  const [watchers, setWatchers] = useState<Watcher[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    const qs = new URLSearchParams({ worldId, list: '1' });
    if (viewerPrivyId) qs.set('privyId', viewerPrivyId);
    fetch(`/api/worlds/follow?${qs}`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setWatchers(d.watchers || []); })
      .catch(() => { if (!cancelled) setWatchers([]); });
    return () => { cancelled = true; };
  }, [worldId, viewerPrivyId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[1500] flex items-center justify-center px-4 py-6"
      style={{ backgroundColor: 'rgba(10,10,10,0.7)', backdropFilter: 'blur(2px)' }}
      onClick={onClose}
      role="dialog"
      aria-label={`Who's watching ${worldTitle}`}
    >
      <div className="w-full max-w-[380px] max-h-[70vh] overflow-y-auto rounded-lg border border-ink/10 bg-[var(--page-bg)]" onClick={(e) => e.stopPropagation()}>
        <div className={`${config.bg} px-4 py-2.5 flex items-center justify-between sticky top-0 z-10`}>
          <span className={`font-mono text-[10px] font-bold uppercase tracking-[2px] ${config.textOn} truncate`}>Watching {worldTitle}</span>
          <button onClick={onClose} className={`w-6 h-6 flex items-center justify-center font-mono text-[16px] cursor-pointer bg-transparent border-none shrink-0 ${config.textOn}`}>×</button>
        </div>
        <div className="px-4 py-2">
          {watchers === null ? (
            <span className="font-mono text-[11px] uppercase tracking-wider text-ink/30 block py-4 text-center">Loading…</span>
          ) : watchers.length === 0 ? (
            <span className="block py-4 text-center">
              <span className="font-mono text-[11px] uppercase tracking-wider text-ink/30 block">No one watching yet.</span>
              {/* An empty list means the viewer isn't watching either — point at the way in. */}
              <span className="font-mono text-[10px] text-ink/40 block mt-1.5 normal-case tracking-normal">The Watch button up top is the way in.</span>
            </span>
          ) : (
            watchers.map((w) => {
              const identity = (
                <span className="flex items-center gap-3 py-2 min-w-0">
                  {w.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={w.avatarUrl} alt="" className="w-8 h-8 rounded-full object-cover border border-ink/10 shrink-0" />
                  ) : (
                    <span className="w-8 h-8 rounded-full bg-ink/10 flex items-center justify-center font-basement font-black text-[11px] text-ink/50 shrink-0">
                      {(w.name || w.username || '?')[0]?.toUpperCase()}
                    </span>
                  )}
                  <span className="min-w-0">
                    <span className="font-mono text-[12px] font-bold text-ink block truncate">{w.name || w.username || 'Someone'}</span>
                    {w.username && <span className="font-mono text-[10px] text-ink/40 block truncate">@{w.username}</span>}
                  </span>
                </span>
              );
              return (
                <div key={w.userId} className="flex items-center gap-2 border-b border-ink/[0.05] last:border-b-0">
                  {w.username ? (
                    <Link href={`/profile/${w.username}`} className="flex-1 min-w-0 no-underline hover:opacity-80 transition-opacity">{identity}</Link>
                  ) : (
                    <div className="flex-1 min-w-0">{identity}</div>
                  )}
                  {!w.isSelf && (
                    <span className="shrink-0">
                      <FollowButton targetUserId={w.userId} initialIsFollowing={Boolean(w.isFollowing)} />
                    </span>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Main Page ────────────────────────────────────────────────── */

export default function WorldPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const [world, setWorld] = useState<WorldDetail | null>(null);
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [worldEvents, setWorldEvents] = useState<WorldEvent[]>([]);
  const [eras, setEras] = useState<EraView[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [allTools, setAllTools] = useState<ToolMiniData[]>([]);
  const [loading, setLoading] = useState(true);
  const { user, authenticated, login } = usePrivy();
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<SectionId>('now');
  const [projectsLoaded, setProjectsLoaded] = useState(false);
  const [erasLoaded, setErasLoaded] = useState(false);
  // True once the visitor deliberately picks a tab (click or arrow key) so
  // async payloads never move them after they have made a choice.
  const userPickedSection = useRef(false);
  const [followers, setFollowers] = useState(0);
  const [following, setFollowing] = useState(false);
  const [stampBurst, setStampBurst] = useState(false);
  const [followPending, setFollowPending] = useState(false);
  const [watchersOpen, setWatchersOpen] = useState(false);

  useEffect(() => {
    const worldPromise = fetch(`/api/worlds?slug=${slug}`)
      .then((res) => res.json())
      .then((data) => { if (data.worlds && data.worlds.length > 0) setWorld(data.worlds[0]); });

    const userPromise = (authenticated && user?.id)
      ? fetch(`/api/auth/profile?privyId=${encodeURIComponent(user.id)}`)
          .then((r) => r.json())
          .then((d) => { if (d.user) setCurrentUserId(d.user.id); })
          .catch(() => {})
      : Promise.resolve();

    Promise.all([worldPromise, userPromise]).catch(console.error).finally(() => setLoading(false));
  }, [slug, authenticated, user?.id]);

  useEffect(() => {
    fetch('/api/tools')
      .then((r) => r.json())
      .then((data) => setAllTools(data.tools || []))
      .catch(console.error);
  }, []);

  const loadEras = useCallback(() => {
    if (!world?.id) return;
    fetch(`/api/worlds/eras?worldId=${world.id}`)
      .then((r) => r.json())
      .then((data) => setEras(data.eras || []))
      .catch(console.error)
      .finally(() => setErasLoaded(true));
  }, [world]);

  useEffect(() => {
    if (!world?.id) return;
    fetch(`/api/worlds/projects?worldId=${world.id}`)
      .then((r) => r.json())
      .then((data) => {
        const list = data.projects || [];
        setProjects(list);
      })
      .catch(console.error)
      .finally(() => setProjectsLoaded(true));
    fetch(`/api/events?worldId=${world.id}`)
      .then((r) => r.json())
      .then((data) => setWorldEvents(data.events || []))
      .catch(console.error);
    loadEras();
    fetch(`/api/worlds/announcements?worldId=${world.id}`)
      .then((r) => r.json())
      .then((data) => setAnnouncements(data.announcements || []))
      .catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [world?.id]);

  useEffect(() => {
    if (!world?.id) return;
    const qs = new URLSearchParams({ worldId: world.id });
    if (user?.id) qs.set('privyId', user.id);
    fetch(`/api/worlds/follow?${qs}`)
      .then((r) => r.json())
      .then((d) => {
        setFollowers(typeof d.followers === 'number' ? d.followers : 0);
        setFollowing(Boolean(d.following));
      })
      .catch(console.error);
  }, [world?.id, user?.id]);

  useRecordWorldView(world ? { slug: world.slug, title: world.title, imageUrl: world.imageUrl } : null);

  const config = useMemo(() => getWorldConfig(slug), [slug]);

  const worldBuilders = useMemo(() => world?.members?.filter((m) => m.role === 'world_builder' || m.role === 'owner') || [], [world]);
  const collaboratorMembers = useMemo(() => world?.members?.filter((m) => m.role === 'collaborator') || [], [world]);
  const isWorldBuilder = currentUserId && worldBuilders.some((b) => b.userId === currentUserId);
  const hasSocial = world?.socialLinks && Object.values(world.socialLinks).some((v) => v);

  async function toggleWorldFollow() {
    if (!world || !user?.id || followPending) return;
    const wasFollowing = following;
    if (!wasFollowing) { setStampBurst(true); setTimeout(() => setStampBurst(false), 1600); }
    setFollowPending(true);
    // optimistic
    setFollowing(!wasFollowing);
    setFollowers((c) => Math.max(0, c + (wasFollowing ? -1 : 1)));
    try {
      const res = await fetch('/api/worlds/follow', {
        method: wasFollowing ? 'DELETE' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ privyId: user.id, worldId: world.id }),
      });
      if (!res.ok) throw new Error(String(res.status));
    } catch (err) {
      console.error('[world] follow toggle failed:', err);
      setFollowing(wasFollowing);
      setFollowers((c) => Math.max(0, c + (wasFollowing ? 1 : -1)));
    } finally {
      setFollowPending(false);
    }
  }

  // Tools come from two places: the world's own `tools` field, and any
  // `tool:` tags builders attached to individual projects — merged so a tool
  // used on a project shows up here too, case-insensitively deduped.
  const toolsList = useMemo(() => {
    const worldToolNames = world?.tools ? world.tools.split(',').map((t) => t.trim()).filter(Boolean) : [];
    const projectToolNames = projects.flatMap((p) => (p.tags || []).filter((t) => t.startsWith('tool:')).map((t) => t.replace('tool:', '')));
    const seen = new Map<string, string>();
    for (const name of [...worldToolNames, ...projectToolNames]) {
      const key = name.toLowerCase();
      if (!seen.has(key)) seen.set(key, name);
    }
    return Array.from(seen.values());
  }, [world, projects]);

  // Events get their own "Latest events" section in Overview, so they're
  // deliberately left out of this log — otherwise every event shows up twice.
  const activity: ActivityItem[] = useMemo(() => {
    if (!world) return [];
    const items: ActivityItem[] = [
      { id: `published-${world.id}`, type: 'published', primaryText: `${world.title} went live`, timestamp: new Date(world.createdAt) },
    ];

    // Batch-seeded crews (e.g. at world creation) join within the same day —
    // group same-day joins into one line instead of one row per person.
    const byDay = new Map<string, { userName: string | null; userUsername: string | null; userAvatarUrl: string | null; role: string; timestamp: Date }[]>();
    for (const m of world.members) {
      if (!m.createdAt) continue;
      const timestamp = new Date(m.createdAt);
      const key = timestamp.toDateString();
      if (!byDay.has(key)) byDay.set(key, []);
      byDay.get(key)!.push({ userName: m.userName, userUsername: m.userUsername, userAvatarUrl: m.userAvatarUrl, role: m.role, timestamp });
    }
    for (const group of byDay.values()) {
      const latest = group.reduce((a, b) => (b.timestamp > a.timestamp ? b : a));
      if (group.length === 1) {
        const m = group[0];
        items.push({
          id: `member-${m.userUsername || m.userName}-${m.timestamp.getTime()}`,
          type: 'member',
          primaryText: `${m.userName || m.userUsername || 'Someone'} joined as ${m.role.replace('_', ' ')}`,
          timestamp: m.timestamp,
          avatarUrls: [m.userAvatarUrl],
        });
      } else {
        items.push({
          id: `member-group-${latest.timestamp.getTime()}`,
          type: 'member',
          primaryText: `${group.length} people joined the world`,
          timestamp: latest.timestamp,
          avatarUrls: group.slice(0, 5).map((g) => g.userAvatarUrl),
        });
      }
    }

    for (const p of projects) {
      if (!p.createdAt) continue;
      items.push({ id: `project-${p.id}`, type: 'project', primaryText: `Project added — ${p.name}`, timestamp: new Date(p.createdAt) });
    }

    for (const a of announcements) {
      const who = a.authorName || a.authorUsername || 'Someone';
      items.push({ id: `announcement-${a.id}`, type: 'announcement', primaryText: `${who}: ${a.body}`, timestamp: new Date(a.createdAt) });
    }

    return items.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()).slice(0, 8);
  }, [world, projects, announcements]);

  async function handlePostUpdate(body: string) {
    if (!world || !user?.id) return;
    const res = await fetch('/api/worlds/announcements', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ worldId: world.id, privyId: user.id, body }),
    });
    const data = await res.json();
    if (data.announcement) setAnnouncements((prev) => [data.announcement, ...prev]);
  }

  const established = world?.dateAdded
    ? new Date(world.dateAdded).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }).toUpperCase()
    : null;

  // Overview + Projects + Architects + Tools always show; Events hides when
  // empty; In Process hides until the world has a visible era (builders keep
  // it so they can find the editor).
  const hasVisibleEras = eras.some((e) => e.status !== 'archived');
  const visibleSections = SECTIONS;

  // Prefer live work, then projects, then the world's story. Wait for both
  // payloads so a slower request cannot switch the selected tab twice.
  useEffect(() => {
    if (!projectsLoaded || !erasLoaded || userPickedSection.current || window.location.hash) return;
    setActiveSection(hasVisibleEras || isWorldBuilder ? 'now' : projects.length > 0 ? 'projects' : 'about');
  }, [erasLoaded, hasVisibleEras, isWorldBuilder, projects.length, projectsLoaded]);

  // Per-tab counts so visitors know what's behind a tab before clicking.
  const crewCount = (world?.members?.length ?? 0) + (world?.pendingGhosts?.length ?? 0);
  const sectionCounts: Partial<Record<SectionId, number>> = {
    projects: projects.length,
    builders: crewCount,
    now: eras.filter((e) => e.status !== 'archived').reduce((n, e) => n + e.milestones.length, 0),
  };

  const latestAnnouncement = useMemo(() => {
    if (announcements.length === 0) return null;
    return [...announcements].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
  }, [announcements]);

  // Tabs deep-link via URL hash (#projects) — hash, not query, so links
  // survive the Privy OAuth round-trip that drops query strings. Also listen
  // for hashchange: same-page hash navigation doesn't remount the component.
  useEffect(() => {
    function applyHash() {
      const h = window.location.hash.slice(1);
      const legacy: Record<string, SectionId> = {
        inprocess: 'now', overview: 'about', architects: 'builders', events: 'about', tools: 'about',
      };
      if (legacy[h]) setActiveSection(legacy[h]);
      else if (SECTIONS.some((s) => s.id === h)) setActiveSection(h as SectionId);
    }
    applyHash();
    window.addEventListener('hashchange', applyHash);
    return () => window.removeEventListener('hashchange', applyHash);
  }, []);

  function selectSection(id: SectionId) {
    userPickedSection.current = true;
    setActiveSection(id);
    history.replaceState(null, '', id === 'now' ? window.location.pathname + window.location.search : `#${id}`);
  }

  // Arrow keys page through tabs — skipped while typing in any field.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      userPickedSection.current = true;
      setActiveSection((prev) => {
        const idx = visibleSections.findIndex((s) => s.id === prev);
        if (idx === -1) return prev;
        const next = visibleSections[(idx + (e.key === 'ArrowRight' ? 1 : visibleSections.length - 1)) % visibleSections.length];
        history.replaceState(null, '', next.id === 'now' ? window.location.pathname + window.location.search : `#${next.id}`);
        return next.id;
      });
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visibleSections]);

  // Per-project roadmap pulse for the projects tab — first visible era wins
  // (builders' archived eras shouldn't leak a preview to viewers).
  const roadmapSummaries: Record<string, import('../../components/world/ProjectsLayer').RoadmapSummary> = {};
  for (const era of eras) {
    if (!era.projectId || era.status === 'archived' || roadmapSummaries[era.projectId]) continue;
    if (era.milestones.length === 0) continue;
    const nowMs = era.milestones.find((m) => m.status === 'now');
    roadmapSummaries[era.projectId] = {
      eraTitle: era.title,
      total: era.milestones.length,
      done: era.milestones.filter((m) => m.status === 'done').length,
      nowTitle: nowMs?.title ?? null,
      nodes: era.milestones.map((m) => (m.status === 'done' ? 'done' : m.status === 'now' ? 'now' : 'future')),
    };
  }

  function renderSection() {
    switch (activeSection) {
      case 'projects':   return <ProjectsLayer config={config} projects={projects} slug={slug} worldId={world?.id ?? ''} allTools={allTools} roadmaps={roadmapSummaries} />;
      case 'patrons':    return (
        <PatronsLayer
          worldId={world?.id ?? ''}
          worldTitle={world?.title ?? ''}
          privyId={user?.id ?? null}
          eras={eras}
          projects={projects}
          canEdit={!!isWorldBuilder}
          onViewRoadmap={() => selectSection('now')}
        />
      );
      case 'builders': return <ArchitectsLayer config={config} builders={worldBuilders} collaborators={collaboratorMembers} ghosts={world?.pendingGhosts ?? []} />;
      case 'now':  return (
        <InProcessLayer
          config={config}
          eras={eras}
          worldId={world?.id ?? ''}
          slug={slug}
          projects={projects.map((p) => ({ id: p.id, name: p.name, slug: p.slug }))}
          canEdit={!!isWorldBuilder}
          onChanged={loadEras}
        />
      );
      default:
        return (
          <div className="bg-[var(--page-bg)]">
            <OverviewLayer
              config={config}
              description={world?.description ?? null}
              shortDescription={world?.shortDescription ?? null}
              events={worldEvents}
              onViewEvents={() => document.getElementById('world-events')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              activity={activity}
              canPostUpdate={!!isWorldBuilder}
              onPostUpdate={handlePostUpdate}
            />
            {worldEvents.length > 0 && (
              <section id="world-events" className="scroll-mt-[calc(var(--nav-height)+48px)] border-t border-ink/[0.08]">
                <div className="px-5 md:px-6 pt-5">
                  <h2 className="font-mono text-[10px] font-bold uppercase tracking-[2px] text-ink/55">Events</h2>
                </div>
                <EventsLayer config={config} events={worldEvents} />
              </section>
            )}
            {(toolsList.length > 0 || isWorldBuilder) && (
              <section className="border-t border-ink/[0.08]">
                <div className="px-5 md:px-6 pt-5">
                  <h2 className="font-mono text-[10px] font-bold uppercase tracking-[2px] text-ink/55">Tools used</h2>
                </div>
                <ToolsLayer config={config} toolNames={toolsList} allTools={allTools} canEdit={!!isWorldBuilder} editHref={`/dashboard/worlds/${slug}/details`} />
              </section>
            )}
          </div>
        );
    }
  }

  if (!loading && !world) {
    return (
      <PageShell>
        <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--page-bg)]">
          <p className="font-mono text-[13px] mb-4 text-ink">World not found.</p>
          <Link href="/worlds" className="font-mono text-[13px] underline text-ink">← Back to Worlds</Link>
        </div>
      </PageShell>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--page-bg)]">
      <PageShell>
        <section className="min-h-screen px-3 sm:px-4 md:px-6 py-3 md:py-5">
          <div className="max-w-[1320px] mx-auto">
            {loading && !world && (
              <div className="border border-ink/[0.08] rounded-xl overflow-hidden bg-[var(--page-bg)] animate-pulse" aria-label="Loading world">
                <div className="h-8 bg-ink/[0.06]" />
                <div className="p-4 md:p-5 flex gap-4">
                  <div className="w-20 h-20 md:w-24 md:h-24 rounded-lg bg-ink/[0.08] shrink-0" />
                  <div className="flex-1 pt-1 space-y-3">
                    <div className="h-7 w-1/2 bg-ink/[0.08] rounded" />
                    <div className="h-4 w-3/4 bg-ink/[0.06] rounded" />
                    <div className="h-8 w-56 max-w-full bg-ink/[0.05] rounded" />
                  </div>
                </div>
              </div>
            )}
            {world && (
              <div className="relative z-10 border border-ink/[0.1] rounded-xl overflow-clip bg-[var(--page-bg)]">
                <header>
                  <div className={`${config.bg} min-h-8 px-4 py-2 flex items-center justify-between gap-4`}>
                    <span className={`font-mono text-[9px] uppercase tracking-[2px] ${config.textOn} opacity-75`}>topia://world/{slug}</span>
                    <span className={`inline-flex items-center gap-1.5 font-mono text-[9px] font-bold uppercase tracking-[1.5px] ${config.textOn}`}>
                      <span className="w-1.5 h-1.5 rounded-full bg-green" /> Live world
                    </span>
                  </div>

                  <div className="p-4 md:p-5">
                    <div className="grid grid-cols-[72px_minmax(0,1fr)] sm:grid-cols-[88px_minmax(0,1fr)] lg:grid-cols-[96px_minmax(0,1fr)_auto] gap-4 md:gap-5 items-start">
                      <div className="w-[72px] h-[72px] sm:w-[88px] sm:h-[88px] lg:w-24 lg:h-24 rounded-lg overflow-hidden border border-ink/[0.12] bg-ink/[0.04]">
                        {world.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={world.imageUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center p-2">
                            <span className="font-basement font-black text-[18px] text-ink/25 uppercase">{world.title.slice(0, 2)}</span>
                          </div>
                        )}
                      </div>

                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1.5">
                          <span className={`font-mono text-[9px] font-bold uppercase tracking-[1.5px] px-2 py-0.5 rounded-sm ${config.bg} ${config.textOn}`}>{world.category || 'General'}</span>
                          {established && <span className="font-mono text-[9px] uppercase tracking-[1.5px] text-ink/40">Since {established}</span>}
                        </div>
                        <h1 className="font-basement font-black text-[clamp(26px,4vw,38px)] leading-[0.92] uppercase text-ink break-words">{world.title}</h1>
                        {world.shortDescription && <p className="font-zirkon text-[14px] leading-relaxed text-ink/60 mt-2 max-w-2xl">{world.shortDescription}</p>}
                      </div>

                      <div className="col-span-2 lg:col-span-1 relative flex flex-wrap lg:justify-end items-center gap-2">
                        {stampBurst && (
                          <span className="absolute -top-12 left-10 lg:left-auto lg:right-36 z-20 pointer-events-none">
                            <InkStamp lines={['NOW', 'WATCHING']} tone="lime" size={68} />
                          </span>
                        )}
                        <button
                          onClick={authenticated ? toggleWorldFollow : () => login()}
                          disabled={followPending}
                          className={`min-h-9 inline-flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-wider rounded-md px-3 cursor-pointer transition-colors border ${following ? 'bg-ink text-[var(--page-bg)] border-ink' : 'bg-transparent border-ink/[0.16] text-ink/65 hover:border-ink/35 hover:text-ink'}`}
                        >
                          <svg width="11" height="11" viewBox="0 0 24 24" fill={following ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>
                          {followPending ? '…' : following ? 'Watching' : 'Watch'}
                        </button>
                        <ShareButton kind="world" title={world.title} text={`${world.title} — a world on TOPIA`} iconSize={12} className="min-h-9 inline-flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-wider text-ink/60 hover:text-ink transition-colors border border-ink/[0.16] rounded-md px-3 cursor-pointer bg-transparent" />
                        {isWorldBuilder && <Link href={`/dashboard/worlds/${world.slug}/in-process`} className={`min-h-9 inline-flex items-center font-mono text-[10px] font-bold uppercase tracking-wider rounded-md px-3 no-underline ${config.bg} ${config.textOn}`}>Manage</Link>}
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-ink/[0.08] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div className="grid grid-cols-4 sm:flex sm:items-center sm:gap-x-5 w-full sm:w-auto">
                        <button onClick={() => selectSection('projects')} className="min-h-10 sm:min-h-8 bg-transparent border-none p-0 cursor-pointer text-center sm:text-left"><span className="font-mono text-[13px] font-bold text-ink tabular-nums block sm:inline">{projects.length}</span><span className="font-mono text-[8px] sm:text-[9px] uppercase tracking-[1px] sm:tracking-[1.5px] text-ink/40 block sm:inline sm:ml-1.5 mt-0.5 sm:mt-0">projects</span></button>
                        <button onClick={() => selectSection('now')} className="min-h-10 sm:min-h-8 bg-transparent border-none p-0 cursor-pointer text-center sm:text-left"><span className="font-mono text-[13px] font-bold text-ink tabular-nums block sm:inline">{eras.filter((e) => e.status !== 'archived').length}</span><span className="font-mono text-[8px] sm:text-[9px] uppercase tracking-[1px] sm:tracking-[1.5px] text-ink/40 block sm:inline sm:ml-1.5 mt-0.5 sm:mt-0">roadmaps</span></button>
                        <button onClick={() => selectSection('builders')} className="min-h-10 sm:min-h-8 bg-transparent border-none p-0 cursor-pointer text-center sm:text-left"><span className="font-mono text-[13px] font-bold text-ink tabular-nums block sm:inline">{crewCount}</span><span className="font-mono text-[8px] sm:text-[9px] uppercase tracking-[1px] sm:tracking-[1.5px] text-ink/40 block sm:inline sm:ml-1.5 mt-0.5 sm:mt-0">builders</span></button>
                        <button onClick={() => followers > 0 && setWatchersOpen(true)} disabled={followers === 0} className={`min-h-10 sm:min-h-8 bg-transparent border-none p-0 text-center sm:text-left ${followers > 0 ? 'cursor-pointer' : 'cursor-default'}`}><span className="font-mono text-[13px] font-bold text-ink tabular-nums block sm:inline">{followers}</span><span className="font-mono text-[8px] sm:text-[9px] uppercase tracking-[1px] sm:tracking-[1.5px] text-ink/40 block sm:inline sm:ml-1.5 mt-0.5 sm:mt-0">watching</span></button>
                      </div>
                      {hasSocial && (
                        <div className="flex items-center gap-3">
                          {Object.entries(world.socialLinks || {}).map(([key, url]) => url ? <a key={key} href={url.startsWith('http') ? url : `https://${url}`} target="_blank" rel="noopener noreferrer" className="w-8 h-8 inline-flex items-center justify-center rounded-full border border-ink/[0.12] text-ink/50 hover:text-ink hover:border-ink/30 transition-colors" title={key}><SocialIcon type={key} size={15} /></a> : null)}
                        </div>
                      )}
                    </div>
                  </div>
                </header>

                <div role="tablist" aria-label={`${world.title} sections`} className="sticky top-[env(safe-area-inset-top,0px)] md:top-[var(--nav-height)] z-20 bg-[var(--page-bg)] border-y border-ink/[0.08] px-1 sm:px-2 flex items-center overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
                  {visibleSections.map((s) => {
                    const isActive = activeSection === s.id;
                    const count = sectionCounts[s.id];
                    return (
                      <button key={s.id} id={`world-tab-${s.id}`} role="tab" aria-selected={isActive} aria-controls="world-tabpanel" onClick={() => selectSection(s.id)} className={`min-h-11 font-mono text-[10px] uppercase tracking-[1.5px] px-3 sm:px-4 whitespace-nowrap cursor-pointer bg-transparent border-x-0 border-t-0 border-b-2 border-solid transition-colors flex items-center gap-1.5 ${isActive ? 'text-ink font-bold' : 'text-ink/45 hover:text-ink/75'}`} style={{ borderBottomColor: isActive ? config.hex : 'transparent' }}>
                        {s.label}
                        {count !== undefined && <span className={`font-mono text-[9px] px-1.5 py-px rounded-full tabular-nums ${isActive ? `${config.bg} ${config.textOn}` : 'text-ink/40 border border-ink/[0.12]'}`}>{count}</span>}
                      </button>
                    );
                  })}
                  <span className="hidden lg:inline font-mono text-[9px] text-[var(--text-muted)] ml-auto shrink-0 pr-3">← → to switch</span>
                </div>

                {latestAnnouncement && (
                  <div className="px-4 md:px-5 py-2.5 border-b border-ink/[0.06] bg-ink/[0.02] flex items-center gap-3 min-w-0">
                    <span className="font-mono text-[9px] font-bold uppercase tracking-[2px] shrink-0" style={{ color: 'var(--accent-ink)' }}>Latest</span>
                    <span className="font-mono text-[11px] text-ink/80 truncate min-w-0">{(latestAnnouncement.authorName || latestAnnouncement.authorUsername) ? `${latestAnnouncement.authorName || latestAnnouncement.authorUsername}: ` : ''}{latestAnnouncement.body}</span>
                    <span className="font-mono text-[9px] text-ink/35 shrink-0">{timeAgo(new Date(latestAnnouncement.createdAt))}</span>
                  </div>
                )}

                <main id="world-tabpanel" role="tabpanel" aria-labelledby={`world-tab-${activeSection}`} className="min-h-[360px] min-w-0">
                  {renderSection()}
                </main>
              </div>
            )}

            {watchersOpen && world && (
              <WatchersModal worldId={world.id} worldTitle={world.title} config={config} viewerPrivyId={user?.id ?? null} onClose={() => setWatchersOpen(false)} />
            )}
          </div>
        </section>
      </PageShell>
    </div>
  );
}
