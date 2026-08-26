'use client';

import { useState, useEffect, use, useMemo, useRef, useCallback } from 'react';
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

// Projects lead — the work is the front door of a world. Worlds with no
// projects still land on Overview (see the auto-default effect), so a fresh
// world never opens on an empty grid.
const SECTIONS = [
  { id: 'projects',   label: 'PROJECTS' },
  { id: 'overview',   label: 'OVERVIEW' },
  { id: 'inprocess',  label: 'IN PROCESS' },
  { id: 'architects', label: 'BUILDERS' },
  { id: 'events',     label: 'EVENTS' },
  { id: 'tools',      label: 'TOOLS' },
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
  const { user, authenticated } = usePrivy();
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<SectionId>('overview');
  // True once the visitor deliberately picks a tab (click or arrow key) —
  // stops the projects-first auto-default from yanking them elsewhere.
  const userPickedSection = useRef(false);
  const [followers, setFollowers] = useState(0);
  const [following, setFollowing] = useState(false);
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
      .catch(console.error);
  }, [world?.id]);

  useEffect(() => {
    if (!world?.id) return;
    fetch(`/api/worlds/projects?worldId=${world.id}`)
      .then((r) => r.json())
      .then((data) => {
        const list = data.projects || [];
        setProjects(list);
        // Projects-first default: once we know the world HAS projects, land
        // there — unless a deep link (#hash) or the visitor already chose a
        // tab. Empty worlds keep Overview as the front page.
        if (list.length > 0 && !window.location.hash && !userPickedSection.current) {
          setActiveSection('projects');
        }
      })
      .catch(console.error);
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
  }, [world?.tools, projects]);

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
  const visibleSections = useMemo(
    () => SECTIONS.filter((s) => {
      if (s.id === 'events') return worldEvents.length > 0;
      if (s.id === 'inprocess') return hasVisibleEras || !!isWorldBuilder;
      return true;
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [worldEvents.length, hasVisibleEras, isWorldBuilder],
  );

  // Per-tab counts so visitors know what's behind a tab before clicking.
  const crewCount = (world?.members?.length ?? 0) + (world?.pendingGhosts?.length ?? 0);
  const sectionCounts: Partial<Record<SectionId, number>> = {
    projects: projects.length,
    architects: crewCount,
    events: worldEvents.length,
    tools: toolsList.length,
    inprocess: eras.filter((e) => e.status !== 'archived').reduce((n, e) => n + e.milestones.length, 0),
  };

  // The nearest upcoming event stays pinned in the rail from every tab.
  const onDeckEvent = useMemo(() => {
    const cutoff = Date.now() - 24 * 3600 * 1000; // keep today's event on deck through the day
    return worldEvents
      .filter((e) => e.dateIso && new Date(e.dateIso).getTime() >= cutoff)
      .sort((a, b) => new Date(a.dateIso!).getTime() - new Date(b.dateIso!).getTime())[0] ?? null;
  }, [worldEvents]);

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
      if (SECTIONS.some((s) => s.id === h)) setActiveSection(h as SectionId);
    }
    applyHash();
    window.addEventListener('hashchange', applyHash);
    return () => window.removeEventListener('hashchange', applyHash);
  }, []);

  function selectSection(id: SectionId) {
    userPickedSection.current = true;
    setActiveSection(id);
    history.replaceState(null, '', id === 'overview' ? window.location.pathname + window.location.search : `#${id}`);
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
        history.replaceState(null, '', next.id === 'overview' ? window.location.pathname + window.location.search : `#${next.id}`);
        return next.id;
      });
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visibleSections]);

  // Barcode + machine-readable zone, keyed off the world.
  const bars = (slug || 'TOPIA').split('').flatMap((ch, i) => {
    const code = ch.charCodeAt(0);
    return [
      { type: 'bar' as const, w: ((code * (i + 1)) % 4) + 1 },
      { type: 'gap' as const, w: ((code + i) % 3) + 1 },
    ];
  });
  const mrzLine1 = `W<TOPIA<${(world?.title || slug || '').replace(/[.\s]/g, '<').toUpperCase().padEnd(20, '<')}<<<<<<<<<`;
  const mrzLine2 = `${(world?.id || '').slice(0, 10).padEnd(10, '<')}<<${(established || '').replace(/\s/g, '').padEnd(6, '<')}<<${(world?.category || 'GEN').substring(0, 3).toUpperCase()}<${(slug || '').padEnd(14, '<')}<<`;

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
      case 'architects': return <ArchitectsLayer config={config} builders={worldBuilders} collaborators={collaboratorMembers} ghosts={world?.pendingGhosts ?? []} />;
      case 'events':     return <EventsLayer config={config} events={worldEvents} />;
      case 'tools':      return <ToolsLayer config={config} toolNames={toolsList} allTools={allTools} canEdit={!!isWorldBuilder} editHref={`/dashboard/worlds/${slug}/details`} />;
      case 'inprocess':  return (
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
          <OverviewLayer
            config={config}
            description={world?.description ?? null}
            shortDescription={world?.shortDescription ?? null}
            events={worldEvents}
            onViewEvents={() => selectSection('events')}
            activity={activity}
            canPostUpdate={!!isWorldBuilder}
            onPostUpdate={handlePostUpdate}
          />
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
        {/* Content renders the moment data arrives — the old once-per-session
            LoadingScreen added a hard-coded ~2.3s of dead time ON TOP of the
            fetch waterfall, so first paint was max(2.3s, data). */}
        <section className="min-h-screen px-4 md:px-6 py-4 md:py-6">
          <div className="max-w-[var(--content-max)] mx-auto">
            {world && (
              /* overflow-clip (not hidden) so the sticky rail + tab bar keep working inside the rounded frame */
              <div className="relative z-10 max-w-[1320px] mx-auto border border-ink/[0.08] rounded-lg overflow-clip bg-[var(--page-bg)]">
                <div className="flex flex-col md:grid md:grid-cols-[300px_minmax(0,1fr)]">

                  {/* ═══ LEFT RAIL — the world's passport; identity that never scrolls away ═══ */}
                  <aside className="md:border-r md:border-ink/[0.06]">
                    <div className="md:sticky md:top-[calc(var(--nav-height)+16px)] flex flex-col">

                      {/* Category-colored accent strip */}
                      <div className={`${config.bg} px-4 py-2 flex items-center justify-between relative`}>
                        <div className="absolute inset-0 opacity-[0.04] pointer-events-none" style={{ backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(26,26,26,0.6) 4px, rgba(26,26,26,0.6) 5px), repeating-linear-gradient(-45deg, transparent, transparent 4px, rgba(26,26,26,0.6) 4px, rgba(26,26,26,0.6) 5px)' }} />
                        <span className={`font-mono text-[9px] uppercase tracking-[2px] ${config.textOn} opacity-70 relative z-10`}>topia://world</span>
                        <span className={`font-mono text-[10px] uppercase tracking-wider ${config.textOn} opacity-55 relative z-10`}>WORLD-{world.id.slice(0, 4).toUpperCase()}</span>
                      </div>

                      {/* Identity — image beside title on mobile, stacked on desktop */}
                      <div className="flex flex-row items-center gap-4 px-5 pt-5 md:flex-col md:items-stretch md:gap-0">
                        <div className="flex justify-center shrink-0 md:pb-1">
                          <div className="relative">
                            <div className="absolute -top-2 -left-2 w-4 h-4 z-30"><div className="absolute top-0 left-0 w-full h-[1px] bg-ink/15" /><div className="absolute top-0 left-0 h-full w-[1px] bg-ink/15" /></div>
                            <div className="absolute -top-2 -right-2 w-4 h-4 z-30"><div className="absolute top-0 right-0 w-full h-[1px] bg-ink/15" /><div className="absolute top-0 right-0 h-full w-[1px] bg-ink/15" /></div>
                            <div className="absolute -bottom-2 -left-2 w-4 h-4 z-30"><div className="absolute bottom-0 left-0 w-full h-[1px] bg-ink/15" /><div className="absolute bottom-0 left-0 h-full w-[1px] bg-ink/15" /></div>
                            <div className="absolute -bottom-2 -right-2 w-4 h-4 z-30"><div className="absolute bottom-0 right-0 w-full h-[1px] bg-ink/15" /><div className="absolute bottom-0 right-0 h-full w-[1px] bg-ink/15" /></div>
                            <div className="w-20 h-20 md:w-32 md:h-32 rounded-lg relative overflow-hidden border border-dashed border-ink/15 p-1.5">
                              <div className="w-full h-full rounded-md relative overflow-hidden border-2 border-ink/20">
                                {world.imageUrl ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={world.imageUrl} alt={world.title} className="w-full h-full object-cover relative z-10" />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center bg-ink/5 p-2">
                                    <span className="font-basement font-black text-[clamp(14px,3vw,24px)] text-ink/20 text-center uppercase leading-none">{world.title}</span>
                                  </div>
                                )}
                                <div className="absolute inset-0 pointer-events-none z-20" style={{ opacity: 0.1, backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 1px, rgba(0,0,0,0.4) 1px, rgba(0,0,0,0.4) 2px)', backgroundSize: '100% 2px' }} />
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="min-w-0 md:pt-4">
                          <span className="font-mono text-[10px] font-semibold uppercase tracking-[2px] text-ink/50 block">designation</span>
                          <h1 className="font-basement font-black text-[clamp(20px,5vw,28px)] leading-[0.92] uppercase text-ink mt-0.5">{world.title}</h1>
                          <span className="font-mono text-[12px] text-ink/50 mt-1 block truncate">topia://{slug}</span>
                        </div>
                      </div>

                      {/* Registry fields — ordered visitor-first: what it is (declaration),
                          what you can do (actions), how alive it is (vitals, on deck),
                          then the registry metadata. */}
                      <div className="px-5 pb-5 pt-1 flex flex-col">
                        {world.shortDescription && (
                          <div className="py-3 border-b border-ink/[0.05] last:border-b-0">
                            <span className="font-mono text-[10px] font-semibold uppercase tracking-[2px] text-ink/50 block">declaration</span>
                            <span className="font-zirkon text-[11px] text-ink/50 italic mt-1 block leading-relaxed">&ldquo;{world.shortDescription}&rdquo;</span>
                          </div>
                        )}

                        <div className="py-3 border-b border-ink/[0.05] last:border-b-0 flex flex-wrap items-center gap-1.5">
                          {authenticated && (
                            <button
                              onClick={toggleWorldFollow}
                              disabled={followPending}
                              className={`inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider rounded-sm px-2.5 py-1 cursor-pointer transition-colors border ${
                                following
                                  ? 'bg-ink text-[var(--page-bg)] border-ink'
                                  : 'bg-transparent border-ink/[0.12] text-ink/60 hover:text-ink/80'
                              }`}
                            >
                              <svg width="10" height="10" viewBox="0 0 24 24" fill={following ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
                                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                              </svg>
                              {followPending ? '…' : following ? 'Watching' : 'Watch'}
                            </button>
                          )}
                          <ShareButton
                            kind="world"
                            title={world.title}
                            text={`${world.title} — a world on TOPIA`}
                            iconSize={11}
                            className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-ink/50 hover:text-ink/70 transition-colors border border-ink/[0.12] rounded-sm px-2.5 py-1 cursor-pointer bg-transparent"
                          />
                          {isWorldBuilder && (
                            <Link href={`/dashboard/worlds/${world.slug}`} className="font-mono text-[10px] uppercase tracking-wider text-ink/50 hover:text-ink/70 transition-colors border border-ink/[0.12] rounded-sm px-2.5 py-1 no-underline">
                              Manage
                            </Link>
                          )}
                        </div>

                        {/* Vitals — the four "is this world alive" numbers, glanceable from every tab.
                            WATCHING opens the list of watchers. */}
                        <div className="py-3 border-b border-ink/[0.05] last:border-b-0">
                          <span className="font-mono text-[10px] font-semibold uppercase tracking-[2px] text-ink/50 block mb-1.5">vitals</span>
                          <div className="grid grid-cols-4 border border-ink/[0.08] rounded-md overflow-hidden">
                            {([['crew', crewCount], ['projects', projects.length], ['events', worldEvents.length]] as const).map(([label, n]) => (
                              <div key={label} className="py-2 px-1 text-center bg-ink/[0.02] border-r border-ink/[0.05]">
                                <span className="font-mono text-[15px] font-bold text-ink block tabular-nums">{n}</span>
                                <span className="font-mono text-[8px] uppercase tracking-[1px] text-ink/40 block mt-0.5">{label}</span>
                              </div>
                            ))}
                            <button
                              onClick={() => setWatchersOpen(true)}
                              disabled={followers === 0}
                              title={followers > 0 ? "See who's watching" : undefined}
                              className={`py-2 px-1 text-center bg-ink/[0.02] border-none ${followers > 0 ? 'cursor-pointer hover:bg-ink/[0.06] transition-colors' : 'cursor-default'}`}
                            >
                              <span className="font-mono text-[15px] font-bold text-ink block tabular-nums">{followers}</span>
                              <span className={`font-mono text-[8px] uppercase tracking-[1px] block mt-0.5 ${followers > 0 ? 'underline decoration-dotted underline-offset-2 text-ink/50' : 'text-ink/40'}`}>watching</span>
                            </button>
                          </div>
                        </div>

                        {/* On deck — nearest upcoming event, pinned regardless of active tab */}
                        {onDeckEvent && (
                          <div className="py-3 border-b border-ink/[0.05]">
                            <span className="font-mono text-[10px] font-semibold uppercase tracking-[2px] text-ink/50 block mb-1.5">on deck</span>
                            <div className="border border-ink/[0.08] rounded-md px-3 py-2.5" style={{ borderLeft: `3px solid ${config.hex}` }}>
                              <Link href={`/events/${onDeckEvent.slug}`} className="font-mono text-[13px] font-bold text-ink no-underline hover:underline block truncate">{onDeckEvent.eventName}</Link>
                              <span className="font-mono text-[10px] uppercase tracking-wider mt-0.5 block" style={{ color: 'var(--accent-ink)' }}>
                                {[onDeckEvent.date, onDeckEvent.city].filter(Boolean).join(' · ') || 'Upcoming'}
                              </span>
                              <Link href={`/events/${onDeckEvent.slug}`} className={`inline-block mt-2 font-mono text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-sm no-underline ${config.bg} ${config.textOn}`}>
                                RSVP →
                              </Link>
                            </div>
                          </div>
                        )}

                        <div className="py-3 border-b border-ink/[0.05] last:border-b-0 flex flex-wrap gap-x-8 gap-y-3">
                          <div>
                            <span className="font-mono text-[10px] font-semibold uppercase tracking-[2px] text-ink/50 block">category</span>
                            <span className={`font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 ${config.bg} ${config.textOn} inline-block mt-1`}>{world.category || 'GENERAL'}</span>
                          </div>
                          <div>
                            <span className="font-mono text-[10px] font-semibold uppercase tracking-[2px] text-ink/50 block">status</span>
                            <div className="flex items-center gap-1.5 mt-1.5">
                              <div className="w-1.5 h-1.5 rounded-full bg-green animate-pulse" />
                              <span className="font-mono text-[11px] text-ink/50">LIVE</span>
                            </div>
                          </div>
                          <div>
                            <span className="font-mono text-[10px] font-semibold uppercase tracking-[2px] text-ink/50 block">established</span>
                            <span className="font-mono text-[11px] text-ink/40 mt-1.5 block">{established || '—'}</span>
                          </div>
                        </div>

                        {hasSocial && (
                          <div className="py-3 border-b border-ink/[0.05] last:border-b-0">
                            <span className="font-mono text-[10px] font-semibold uppercase tracking-[2px] text-ink/50 block mb-1.5">connect</span>
                            <div className="flex flex-wrap gap-3">
                              {Object.entries(world.socialLinks || {}).map(([key, url]) =>
                                url ? (
                                  <a key={key} href={url.startsWith('http') ? url : `https://${url}`} target="_blank" rel="noopener noreferrer" className="text-ink/40 hover:text-ink/70 transition-colors" title={key}>
                                    <SocialIcon type={key} size={16} />
                                  </a>
                                ) : null,
                              )}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* MRZ strip — rail footer, desktop only */}
                      <div className="hidden md:block px-5 py-3 border-t border-ink/[0.04]">
                        <div className="flex items-end gap-0 h-4 mb-1">
                          {bars.map((b, i) => (
                            <div key={i} className={b.type === 'bar' ? 'bg-ink/10' : ''} style={{ width: `${b.w}px`, height: b.type === 'bar' ? `${12 + (b.w * 2)}px` : '0px', marginRight: b.type === 'gap' ? `${b.w}px` : '0px' }} />
                          ))}
                        </div>
                        <span className="font-mono text-[9px] tracking-[2px] text-ink/15 uppercase truncate block deco-text" data-deco={mrzLine1} />
                        <span className="font-mono text-[9px] tracking-[2px] text-ink/10 uppercase truncate block deco-text" data-deco={mrzLine2} />
                      </div>
                    </div>
                  </aside>

                  {/* ═══ RIGHT FOLIO — tabbed content ═══ */}
                  <main className="min-w-0 flex flex-col border-t border-ink/[0.06] md:border-t-0">

                    {/* Tab bar — sticks below the iOS status bar on mobile, below the top nav on desktop */}
                    <div
                      role="tablist"
                      className="sticky top-[env(safe-area-inset-top,0px)] md:top-[var(--nav-height)] z-20 bg-[var(--page-bg)] border-b border-ink/[0.06] px-2 md:px-3 flex items-center overflow-x-auto"
                      style={{ scrollbarWidth: 'none' }}
                    >
                      {visibleSections.map((s) => {
                        const isActive = activeSection === s.id;
                        const count = sectionCounts[s.id];
                        return (
                          <button
                            key={s.id}
                            role="tab"
                            aria-selected={isActive}
                            onClick={() => selectSection(s.id)}
                            className={`font-mono text-[10px] uppercase tracking-[1.5px] px-3 py-3 whitespace-nowrap cursor-pointer bg-transparent border-x-0 border-t-0 border-b-2 border-solid transition-colors flex items-center gap-1.5 ${isActive ? 'text-ink font-bold' : 'text-ink/45 hover:text-ink/70'}`}
                            style={{ borderBottomColor: isActive ? config.hex : 'transparent' }}
                          >
                            {s.label}
                            {count !== undefined && (
                              <span className={`font-mono text-[9px] px-1.5 py-px rounded-full tabular-nums ${isActive ? `${config.bg} ${config.textOn}` : 'text-ink/40 border border-ink/[0.1]'}`}>{count}</span>
                            )}
                          </button>
                        );
                      })}
                      <span className="hidden lg:inline font-mono text-[9px] text-[var(--text-muted)] ml-auto shrink-0 pr-2">← → to switch</span>
                    </div>

                    {/* Transmission ticker — the latest announcement, visible above the fold on every tab */}
                    {latestAnnouncement && (
                      <div className="px-4 md:px-5 py-2 border-b border-ink/[0.05] bg-ink/[0.02] flex items-center gap-3 min-w-0">
                        <span className="font-mono text-[9px] font-bold uppercase tracking-[2px] shrink-0" style={{ color: 'var(--accent-ink)' }}>Transmission</span>
                        <span className="font-mono text-[11px] text-ink/80 truncate min-w-0">
                          {(latestAnnouncement.authorName || latestAnnouncement.authorUsername) ? `${latestAnnouncement.authorName || latestAnnouncement.authorUsername}: ` : ''}{latestAnnouncement.body}
                        </span>
                        <span className="font-mono text-[9px] text-ink/35 shrink-0">{timeAgo(new Date(latestAnnouncement.createdAt))}</span>
                      </div>
                    )}

                    {/* Active section */}
                    <div className="flex-1 min-h-[320px]">
                      {renderSection()}
                    </div>
                  </main>
                </div>
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
