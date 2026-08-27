'use client';

import { createContext, useContext, useState, useEffect, use, ReactNode } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import LoadingBar from '../../../components/LoadingBar';
import Tour, { replayTour, type TourStep } from '../../../components/Tour';
import { WorldAssistantDock } from '../../../components/builder/world/WorldAssistantDock';
import { WorldData, ToolOption, PendingInvite, ProjectItem } from '../../_components/types';

// First-visit walkthrough of a world's HQ — once per account, builders only.
const HQ_TOUR: TourStep[] = [
  { title: 'Your world’s workspace', body: 'The management view now mirrors the public world: Now, Projects, Patrons, Builders, and About. Quick tour?', nextLabel: 'Show me around →', skipLabel: 'Skip — I’ll explore' },
  { target: 'tour-hq-now', title: 'Start with what’s moving', body: 'Edit the horizontal roadmap, choose the current milestone, and publish process updates from Now.', place: 'right' },
  { target: 'tour-hq-projects', title: 'The work itself', body: 'Each project gets its own page in your world’s orbit — with credits, links, media, and its own roadmap.', place: 'right' },
  { target: 'tour-hq-patrons', title: 'See what patrons fund', body: 'Patrons summarizes every open goal. Funding details stay attached to the exact project or milestone they unlock.', place: 'right' },
  { target: 'tour-hq-builders', title: 'Bring in builders', body: 'Invite worldbuilders and collaborators, then make their permissions clear.', place: 'right' },
  { target: 'tour-hq-about', title: 'Shape the public story', body: 'About holds the world image, description, tools, and social links. Done — go build. ✦', place: 'right', nextLabel: 'Done' },
];

/* ── Context ─────────────────────────────────────────────────── */

interface WorldDashboardContextValue {
  world: WorldData;
  slug: string;
  projects: ProjectItem[];
  setProjects: React.Dispatch<React.SetStateAction<ProjectItem[]>>;
  allTools: ToolOption[];
  currentUserId: string;
  privyId: string;
  members: WorldData['members'];
  setMembers: React.Dispatch<React.SetStateAction<WorldData['members']>>;
  pendingInvites: PendingInvite[];
  setPendingInvites: React.Dispatch<React.SetStateAction<PendingInvite[]>>;
  imageUrl: string;
  setImageUrl: React.Dispatch<React.SetStateAction<string>>;
  isBuilder: boolean;
  isOwner: boolean;
  currentUserRole: string;
}

const WorldDashboardContext = createContext<WorldDashboardContextValue | null>(null);

export function useWorldDashboard() {
  const ctx = useContext(WorldDashboardContext);
  if (!ctx) throw new Error('useWorldDashboard must be used within WorldDashboardLayout');
  return ctx;
}

/* ── Layout ──────────────────────────────────────────────────── */

export default function WorldDashboardLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const { user, authenticated, ready } = usePrivy();
  const router = useRouter();

  const [world, setWorld] = useState<WorldData | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [members, setMembers] = useState<WorldData['members']>([]);
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [imageUrl, setImageUrl] = useState('');
  const [allTools, setAllTools] = useState<ToolOption[]>([]);
  const [projects, setProjects] = useState<ProjectItem[]>([]);

  /* Fetch world, tools, user profile */
  useEffect(() => {
    const worldP = fetch(`/api/worlds?slug=${slug}${ready && authenticated && user?.id ? `&manage=1&privyId=${encodeURIComponent(user.id)}` : ''}`)
      .then(r => r.json())
      .then(data => {
        if (data.worlds?.length > 0) {
          const w = data.worlds[0];
          setWorld(w);
          setImageUrl(w.imageUrl || '');
          setMembers(w.members || []);
          setPendingInvites(w.pendingInvites || []);
        }
      });

    const toolsP = fetch('/api/tools')
      .then(r => r.json())
      .then(d => setAllTools(d.tools || []))
      .catch(() => {});

    const userP =
      ready && authenticated && user?.id
        ? fetch(`/api/auth/profile?privyId=${encodeURIComponent(user.id)}`)
            .then(r => r.json())
            .then(d => { if (d.user) setCurrentUserId(d.user.id); })
            .catch(() => {})
        : Promise.resolve();

    Promise.all([worldP, toolsP, userP])
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [slug, ready, authenticated, user?.id]);

  /* Fetch projects once world loads */
  useEffect(() => {
    if (!world?.id) return;
    fetch(`/api/worlds/projects?worldId=${world.id}`)
      .then(r => r.json())
      .then(d => setProjects(d.projects || []))
      .catch(console.error);
  }, [world?.id]);

  /* Authorization check — any member can view, only owners/builders can edit */
  const currentMember = world && currentUserId ? world.members.find(m => m.userId === currentUserId) : null;
  const isMember = !!currentMember;
  const authorized = isMember;
  const isOwner = currentMember?.role === 'owner';
  const isBuilder = isOwner || currentMember?.role === 'world_builder';
  const currentUserRole = currentMember?.role || '';

  /* If the slug doesn't resolve to a world, bounce back to the worlds list
     after a moment (e.g. a stale/typed URL like /dashboard/worlds/details). */
  useEffect(() => {
    if (loading || !ready || world) return;
    const t = setTimeout(() => router.replace('/dashboard/worlds'), 4000);
    return () => clearTimeout(t);
  }, [loading, ready, world, router]);

  /* Guards */
  if (loading || !ready || (authenticated && !currentUserId))
    return (
      <div className="flex items-center justify-center py-20">
        <LoadingBar />
      </div>
    );

  if (!world)
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4 text-center px-4">
        <p className="font-mono text-[14px] font-bold" style={{ color: 'var(--foreground)' }}>World not found</p>
        <p className="font-mono text-[12px] opacity-60 max-w-xs" style={{ color: 'var(--foreground)' }}>
          “{slug}” doesn’t match a world you can manage. It may have been removed, or the link is missing a world.
        </p>
        <Link
          href="/dashboard/worlds"
          className="font-mono text-[12px] uppercase tracking-widest px-4 py-2 rounded-lg border no-underline hover:opacity-70 transition"
          style={{ color: 'var(--foreground)', borderColor: 'var(--foreground)' }}
        >
          ← Back to your worlds
        </Link>
        <p className="font-mono text-[11px] opacity-40" style={{ color: 'var(--foreground)' }}>Taking you there…</p>
      </div>
    );

  if (!authenticated || !authorized)
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <p className="font-mono text-[13px]" style={{ color: 'var(--foreground)' }}>
          {!authenticated ? 'Please log in.' : 'Not authorized.'}
        </p>
      </div>
    );

  return (
    <WorldDashboardContext.Provider
      value={{
        world,
        slug,
        projects,
        setProjects,
        allTools,
        currentUserId: currentUserId!,
        privyId: user!.id,
        members,
        setMembers,
        pendingInvites,
        setPendingInvites,
        imageUrl,
        setImageUrl,
        isBuilder,
        isOwner,
        currentUserRole,
      }}
    >
      {/* A compact identity rail keeps context without turning every editor
          into another marketing hero. */}
      <div className="border border-ink/[0.1] rounded-xl px-3.5 py-3 sm:px-4 mb-5 bg-ink/[0.015] flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {imageUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={imageUrl} alt="" className="w-10 h-10 rounded-lg object-cover border border-ink/10 shrink-0" />
            ) : (
              <div className="w-10 h-10 rounded-lg bg-lime flex items-center justify-center shrink-0">
                <span className="font-basement text-[17px] text-obsidian">{world.title[0]?.toUpperCase()}</span>
              </div>
            )}
            <div className="min-w-0">
              <span className="font-mono text-[9px] uppercase tracking-[2px] text-ink/35 block">Manage world</span>
              <h1 className="font-basement font-black text-[clamp(16px,3vw,21px)] uppercase leading-none text-ink mt-1 truncate">
                {world.title}
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="font-mono text-[9px] uppercase tracking-[1.5px] text-ink/40 hidden md:block">
              {currentUserRole === 'owner' ? 'Lead worldbuilder' : currentUserRole === 'world_builder' ? 'Worldbuilder' : 'Collaborator'}
            </span>
            <a
              href={`/worlds/${slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="min-h-9 inline-flex items-center font-mono text-[10px] uppercase tracking-[1.5px] bg-lime text-obsidian px-3 rounded-md hover:opacity-90 transition no-underline font-bold"
            >
              Public view ↗
            </a>
            {isBuilder && (
              <button
                onClick={() => replayTour('world-hq')}
                title="Replay the tour"
                aria-label="Replay the tour"
                className="w-9 h-9 font-mono text-[11px] border border-ink/15 text-ink/45 rounded-md hover:text-ink hover:border-ink/35 transition cursor-pointer bg-transparent"
              >
                ?
              </button>
            )}
          </div>
      </div>
      {/* The assistant is the go-to: tell it what to change, it does it or
          opens the right builder. Sits on every manage subpage. */}
      <WorldAssistantDock
        world={{ ...world, slug, imageUrl, members }}
        allTools={allTools}
        privyId={user!.id}
        isBuilder={isBuilder}
        setProjects={setProjects}
        setImageUrl={setImageUrl}
      />
      {children}

      <Tour tourKey="world-hq" privyId={user!.id} enabled={isBuilder} steps={HQ_TOUR} />
    </WorldDashboardContext.Provider>
  );
}
