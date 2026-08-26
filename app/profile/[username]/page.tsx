'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { usePrivy } from '@privy-io/react-auth';
import PageShell from '../../components/PageShell';
import FollowButton from '../../components/FollowButton';
import MessageButton from '../../components/MessageButton';
import ShareButton from '../../components/ShareButton';

// 3D card modal — loads only when the passport card opens.
const TopiaCardModal = dynamic(() => import('../../components/profile/TopiaCardModal'), { ssr: false });
import { SocialIcon } from '../../components/SocialIcons';
import { roleSlugToLabel } from '../../../lib/profile/roleTags';
import FollowListModal from '../../components/profile/FollowListModal';
import { PATH_CONFIG, resolvePath } from '../../components/profile/pathConfig';
import IdentityLayer, { type Stamp } from '../../components/profile/IdentityLayer';
import EventsLayer from '../../components/profile/EventsLayer';
import WorldsLayer from '../../components/profile/WorldsLayer';
import GuestbookLayer from '../../components/profile/GuestbookLayer';
import ProfileInProcessLayer, { type LifeChapterView, type WorldEraEntry } from '../../components/profile/InProcessLayer';
import { SupportSummary } from '../../components/profile/SupportSummary';
import ToolkitLayer from '../../components/profile/ToolkitLayer';
import Tour, { replayTour, type TourStep } from '../../components/Tour';

// First-visit walkthrough of your own profile — once per account.
const PROFILE_TOUR: TourStep[] = [
  { title: 'This is your profile', body: 'Your passport on Topia — identity, stamps, worlds, and your story in motion. It grows every time you show up: events, quests, worlds. Quick look around?', nextLabel: 'Show me around →', skipLabel: 'Skip — I’ll explore' },
  { target: 'tour-prof-card', title: 'Flip it to connect', body: 'Card opens your Topia card — the back is your QR, the fastest way to connect with someone IRL at an event. It’s also one tap away in the nav, anywhere on Topia.', place: 'below' },
  { target: 'tour-prof-stamps', title: 'Proof you were there', body: 'Visa stamps land as you move through Topia — attend an event, finish a quest, build a world, sign a guestbook. The rest are still waiting for you.', place: 'below' },
  { target: 'tour-prof-tab-events', title: 'Where you’ve shown up', body: 'Every event you host or attend collects here — and going to one is how most stamps get earned.', place: 'below' },
  { target: 'tour-prof-tab-inprocess', title: 'Your story in motion', body: 'The build-in-public timeline, but for you: life chapters you set yourself, plus the roadmaps of every world you build — all in one place.', place: 'below' },
  { target: 'tour-prof-tab-toolkit', title: 'What you build with', body: 'The tools behind your work — pull them from Topia’s tools directory so other creators can see your stack and discover new ones through you.', place: 'below' },
  { target: 'tour-prof-edit', title: 'Finish the picture', body: 'Edit is where your photo, declaration, and links live — plus notifications and “Sign in with In•Process” for onchain minting. That’s the tour — go get stamped. ✦', place: 'below', nextLabel: 'Done' },
];

interface PublicProfile {
  id: string;
  name: string | null;
  username: string | null;
  bio: string | null;
  avatarUrl: string | null;
  socialWebsite: string | null;
  socialTwitter: string | null;
  socialInstagram: string | null;
  socialSoundcloud: string | null;
  socialSpotify: string | null;
  socialLinkedin: string | null;
  socialSubstack: string | null;
  socialFarcaster: string | null;
  roleTags: string | null;
  toolSlugs: string | null;
  path: string | null;
  verifiedProviders: string | null;
  pronouns: string | null;
  customLinks: { label: string; url: string }[] | null;
  createdAt: string;
}

interface ResolvedTool { name: string; slug: string; category: string | null; url?: string | null; }
interface WorldMembership { worldId: string; worldTitle: string; worldSlug: string; worldCategory: string | null; worldImageUrl: string | null; role: string; }
interface EventHostRef { userId: string; name: string | null; username: string | null; avatarUrl: string | null }
interface HostedEvent { id: string; eventName: string; slug: string; date: string | null; city: string | null; imageUrl: string | null; startTime?: string | null; rsvpCount?: number; hosts?: EventHostRef[] }

const STAMP_COLORS = ['lime', 'blue', 'pink', 'orange', 'green'];
const SECTIONS = [
  { id: 'identity', label: 'PASSPORT' },
  { id: 'events',   label: 'EVENTS' },
  { id: 'worlds',   label: 'WORLDS' },
  { id: 'inprocess',label: 'IN PROCESS' },
  { id: 'toolkit',  label: 'STACK' },
  { id: 'guestbook',label: 'GUESTBOOK' },
] as const;

export default function PublicProfilePage() {
  const params = useParams();
  const username = params?.username as string;
  const { ready, authenticated, user } = usePrivy();

  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [tools, setTools] = useState<ResolvedTool[]>([]);
  const [worldMemberships, setWorldMemberships] = useState<WorldMembership[]>([]);
  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [isFollowing, setIsFollowing] = useState(false);
  const [isOwnProfile, setIsOwnProfile] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [followModal, setFollowModal] = useState<null | 'followers' | 'following'>(null);
  const [fetchError, setFetchError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [hostedEvents, setHostedEvents] = useState<HostedEvent[]>([]);
  const [attendedEvents, setAttendedEvents] = useState<HostedEvent[]>([]);
  const [stamps, setStamps] = useState<Stamp[]>([]);
  const [activeSection, setActiveSection] = useState<typeof SECTIONS[number]['id']>('identity');
  const [cardOpen, setCardOpen] = useState(false);

  useEffect(() => {
    if (!username || !ready) return;
    const url = new URL(`/api/profile/${encodeURIComponent(username)}`, window.location.origin);
    if (authenticated && user?.id) url.searchParams.set('viewerPrivyId', user.id);
    fetch(url.toString())
      .then((r) => { if (r.status === 404) { setNotFound(true); return null; } if (!r.ok) { setFetchError(true); return null; } return r.json(); })
      .then((data) => {
        if (!data) return;
        if (!data.user) { setNotFound(true); return; }
        setProfile(data.user);
        setTools(data.tools ?? []);
        setWorldMemberships(data.worldMemberships ?? []);
        setFollowerCount(data.followerCount ?? 0);
        setFollowingCount(data.followingCount ?? 0);
        setIsFollowing(data.isFollowing ?? false);
        setIsOwnProfile(data.isOwnProfile ?? false);
        setStamps(data.stamps ?? []);
      })
      .catch(() => setFetchError(true))
      .finally(() => setLoading(false));
  }, [username, ready, authenticated, user]);

  useEffect(() => {
    if (!profile?.id) return;
    // Hosted + attended ('going' → passport stamps) load together so they land
    // in a single render rather than flashing in one after the other.
    Promise.all([
      fetch(`/api/events?hostUserId=${profile.id}`).then(r => r.json()).catch(() => ({ events: [] })),
      fetch(`/api/events?attendeeUserId=${profile.id}`).then(r => r.json()).catch(() => ({ events: [] })),
    ]).then(([hosted, attended]) => {
      setHostedEvents(hosted.events || []);
      setAttendedEvents(attended.events || []);
    });
  }, [profile?.id]);

  // Life // In Process: personal chapters + eras of worlds they build in.
  const [lifeChapters, setLifeChapters] = useState<LifeChapterView[]>([]);
  const [profileEras, setProfileEras] = useState<WorldEraEntry[]>([]);
  const loadInProcess = useCallback(() => {
    if (!username) return;
    fetch(`/api/profile/in-process?username=${encodeURIComponent(username)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        setLifeChapters(d.chapters ?? []);
        setProfileEras(d.worldEras ?? []);
      })
      .catch(() => {});
  }, [username]);
  useEffect(() => { loadInProcess(); }, [loadInProcess]);

  const sortedWorlds = useMemo(() => {
    return [...worldMemberships].sort((a, b) => {
      const priority = (r: string) => r === 'owner' ? 0 : r === 'world_builder' ? 1 : 2;
      return priority(a.role) - priority(b.role);
    });
  }, [worldMemberships]);

  const roleTags = profile?.roleTags ? profile.roleTags.split(',').map((s) => s.trim()).filter(Boolean) : [];
  const hasOwnedWorlds = sortedWorlds.some((w) => w.role === 'owner' || w.role === 'world_builder');
  // Hide the Worlds tab entirely when this person isn't part of any world;
  // In Process shows when there's a roadmap to see (owners always see it,
  // so they can start one).
  const visibleSections = SECTIONS.filter((s) => {
    if (s.id === 'worlds') return sortedWorlds.length > 0;
    if (s.id === 'inprocess') return lifeChapters.length > 0 || profileEras.length > 0 || isOwnProfile;
    return true;
  });
  const path = resolvePath(profile?.path, roleTags, hasOwnedWorlds);
  const config = PATH_CONFIG[path];

  const verifiedSet = new Set(
    (profile?.verifiedProviders ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
  );

  /** Pull a display handle from one of our stored URLs. */
  function handleFromUrl(type: string, url: string | null): string | null {
    if (!url) return null;
    try {
      const u = new URL(url.includes('://') ? url : `https://${url}`);
      const parts = u.pathname.split('/').filter(Boolean);
      switch (type) {
        case 'twitter':
        case 'instagram':
        case 'farcaster':
          return parts[0]?.replace(/^@/, '') ?? null;
        case 'linkedin': {
          const i = parts.indexOf('in');
          return i >= 0 ? (parts[i + 1] ?? null) : null;
        }
        case 'spotify': {
          const i = parts.indexOf('user');
          return i >= 0 ? (parts[i + 1] ?? null) : null;
        }
        case 'soundcloud':
          return parts[0] ?? null;
        case 'substack':
          return u.hostname.replace(/^www\./, '').split('.')[0] || null;
        default:
          return null;
      }
    } catch { return null; }
  }

  const ensureHttp = (u: string) => /^https?:\/\//i.test(u) ? u : `https://${u}`;
  const socialLinks = profile ? [
    { type: 'website',    url: profile.socialWebsite,    label: 'WEB',  verified: false },
    { type: 'twitter',    url: profile.socialTwitter,    label: 'X',    verified: verifiedSet.has('twitter') },
    { type: 'instagram',  url: profile.socialInstagram,  label: 'IG',   verified: verifiedSet.has('instagram') },
    { type: 'farcaster',  url: profile.socialFarcaster,  label: 'FC',   verified: verifiedSet.has('farcaster') },
    { type: 'soundcloud', url: profile.socialSoundcloud, label: 'SC',   verified: false },
    { type: 'spotify',    url: profile.socialSpotify,    label: 'SPOT', verified: verifiedSet.has('spotify') },
    { type: 'linkedin',   url: profile.socialLinkedin,   label: 'LI',   verified: verifiedSet.has('linkedin') },
    { type: 'substack',   url: profile.socialSubstack,   label: 'SUB',  verified: false },
  ]
    .filter((l) => l.url)
    .map((l) => ({ ...l, url: ensureHttp(l.url!) }))
    .map((l) => ({
      ...l,
      // Preserve the case as the provider stored it (e.g. @AnneliSam stays as-is).
      handle: l.verified ? handleFromUrl(l.type, l.url) ?? null : null,
    }))
    // Verified (OAuth-linked) profiles first; pasted links after. Stable within each group.
    .sort((a, b) => Number(b.verified) - Number(a.verified)) : [];

  const memberSince = profile?.createdAt
    ? new Date(profile.createdAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }).toUpperCase()
    : null;

  // Endorsed worlds list for the IDENTITY section
  const endorsedItems = useMemo(() => sortedWorlds.map((w, i) => ({
    name: w.worldTitle.toUpperCase(),
    sub: w.role === 'owner' ? 'Owner' : w.role === 'world_builder' ? 'Builder' : 'Collab',
    color: STAMP_COLORS[i % STAMP_COLORS.length],
    status: w.role === 'owner' ? 'LIVE' : w.role === 'world_builder' ? 'ACTIVE' : 'COLLAB',
  })), [sortedWorlds]);

  // Visa stamps come from the profile API (computeProfileStamps) — earned
  // milestones across events, worlds, and community.

  // Events count = hosted + attended (RSVP'd), deduped.
  const eventCount = useMemo(
    () => new Set([...hostedEvents, ...attendedEvents].map((e) => e.id)).size,
    [hostedEvents, attendedEvents],
  );
  const stats = {
    worlds: sortedWorlds.length,
    events: eventCount,
    followers: followerCount,
    following: followingCount,
  };

  const sectionLabel = path === 'worldbuilder' ? 'ENDORSED WORLDS'
    : path === 'catalyst' ? 'CERTIFIED SERVICES'
    : 'VISITED WORLDS';

  // Barcode + MRZ
  const bars = (username || 'TOPIA').split('').flatMap((ch, i) => {
    const code = ch.charCodeAt(0);
    return [
      { type: 'bar' as const, w: ((code * (i + 1)) % 4) + 1 },
      { type: 'gap' as const, w: ((code + i) % 3) + 1 },
    ];
  });
  const mrzLine1 = `P<TOPIA<${(profile?.name || username || '').replace(/[.\s]/g, '<').toUpperCase().padEnd(20, '<')}<<<<<<<<<`;
  const mrzLine2 = `${(profile?.id || '').slice(0, 10).padEnd(10, '<')}<<${(memberSince || '').replace(/\s/g, '').padEnd(6, '<')}<<${path.substring(0, 3).toUpperCase()}<${(username || '').padEnd(14, '<')}<<`;

  if (!loading && (notFound || fetchError)) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-[var(--page-bg)]">
        <PageShell><div /></PageShell>
        <p className="font-mono text-[15px] uppercase tracking-tight text-ink">
          {fetchError ? 'Could not load profile — please try again.' : 'Profile not found.'}
        </p>
        <Link href="/" className="font-mono text-[15px] uppercase tracking-tight border-b hover:opacity-70 transition text-ink border-ink/20">
          ← Back to TOPIA
        </Link>
      </div>
    );
  }

  function renderSection() {
    switch (activeSection) {
      case 'events':    return <EventsLayer config={config} hosted={hostedEvents} attended={attendedEvents} />;
      case 'worlds':    return <WorldsLayer config={config} isWorldBuilder={path === 'worldbuilder'} worlds={sortedWorlds} isOwnProfile={isOwnProfile} ownerName={profile?.username ? `@${profile.username}` : (profile?.name || '')} />;
      case 'toolkit':   return <ToolkitLayer config={config} tools={tools} username={profile?.username ?? username} />;
      case 'inprocess': return (
        <>
          <ProfileInProcessLayer chapters={lifeChapters} worldEras={profileEras} isOwnProfile={isOwnProfile} onChanged={loadInProcess} />
          {/* Cumulative across every goal this person owns — projects and life
            * alike. Renders nothing when they have none. */}
          {profile && <SupportSummary ownerUserId={profile.id} displayName={profile.name || profile.username} />}
        </>
      );
      case 'guestbook': return <GuestbookLayer config={config} profileUsername={username} />;
      default:          return <IdentityLayer config={config} sectionLabel={sectionLabel} items={endorsedItems} stamps={stamps} showEndorsed={false} editable={isOwnProfile} storageKey={username} ownerName={profile?.username ? `@${profile.username}` : (profile?.name || '')} />;
    }
  }

  return (
    <div className="min-h-screen bg-[var(--page-bg)]">
      <PageShell>
        {/* Content renders the moment data arrives — the old LoadingScreen +
            full-viewport fade held the page invisible ~2.3s regardless of how
            fast the data came back. */}
        <section className="min-h-screen px-4 md:px-6 py-4 md:py-6">
          <div className="max-w-[var(--content-max)] mx-auto">
            {profile && (
              <div className="relative z-10 grid grid-cols-1 gap-[3px] border border-ink/[0.08] rounded-lg overflow-hidden">

                {/* ═══ ROW 1 — UNIFIED ID CARD ═══ */}
                <div className="bg-[var(--page-bg)] relative overflow-hidden">
                  {/* Path-colored accent strip */}
                  <div className={`${config.bg} px-4 py-2 flex items-center justify-between relative`}>
                    <div className="absolute inset-0 opacity-[0.04] pointer-events-none" style={{ backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(26,26,26,0.6) 4px, rgba(26,26,26,0.6) 5px), repeating-linear-gradient(-45deg, transparent, transparent 4px, rgba(26,26,26,0.6) 4px, rgba(26,26,26,0.6) 5px)' }} />
                    <span className={`font-mono text-[9px] uppercase tracking-[2px] ${config.textOn} opacity-70 relative z-10`}>topia://identity</span>
                    <span className={`font-mono text-[11px] uppercase tracking-wider ${config.textOn} opacity-55 relative z-10`}>TOPIA-ID-{profile.id.slice(0, 4).toUpperCase()}</span>
                  </div>

                  {/* Photo + Fields */}
                  <div className="flex flex-col md:flex-row relative">
                    <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-[0.01]" viewBox="0 0 800 400" preserveAspectRatio="xMidYMid slice">
                      {Array.from({ length: 12 }, (_, i) => {
                        const r = 80 + i * 15;
                        return (<g key={i}>
                          <ellipse cx="400" cy="200" rx={r * 1.5} ry={r * 0.6} fill="none" stroke="#f5f0e8" strokeWidth="0.5" transform={`rotate(${i * 8} 400 200)`} />
                          <ellipse cx="400" cy="200" rx={r * 0.6} ry={r} fill="none" stroke="#f5f0e8" strokeWidth="0.3" transform={`rotate(${i * 8 + 30} 400 200)`} />
                        </g>);
                      })}
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden">
                      <img src="/brand/logo-white.png" alt="" className="w-32 md:w-40 opacity-[0.012] select-none" draggable={false} />
                    </div>

                    {/* Photo */}
                    <div className="flex items-center justify-center py-6 px-4 md:p-5 relative z-10 md:w-[28%] shrink-0">
                      <div className="flex flex-col items-center">
                        <div className="relative mb-2">
                          <div className="absolute -top-2 -left-2 w-4 h-4 z-30"><div className="absolute top-0 left-0 w-full h-[1px] bg-ink/15" /><div className="absolute top-0 left-0 h-full w-[1px] bg-ink/15" /></div>
                          <div className="absolute -top-2 -right-2 w-4 h-4 z-30"><div className="absolute top-0 right-0 w-full h-[1px] bg-ink/15" /><div className="absolute top-0 right-0 h-full w-[1px] bg-ink/15" /></div>
                          <div className="absolute -bottom-2 -left-2 w-4 h-4 z-30"><div className="absolute bottom-0 left-0 w-full h-[1px] bg-ink/15" /><div className="absolute bottom-0 left-0 h-full w-[1px] bg-ink/15" /></div>
                          <div className="absolute -bottom-2 -right-2 w-4 h-4 z-30"><div className="absolute bottom-0 right-0 w-full h-[1px] bg-ink/15" /><div className="absolute bottom-0 right-0 h-full w-[1px] bg-ink/15" /></div>
                          <div className="w-28 h-28 md:w-36 md:h-36 rounded-full flex items-center justify-center border border-dashed border-ink/10">
                            <div className="w-24 h-24 md:w-32 md:h-32 rounded-full relative overflow-hidden border-2 border-ink/20">
                              {profile.avatarUrl ? (
                                <img src={profile.avatarUrl} alt={profile.name ?? username} className="w-full h-full object-cover relative z-10" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center bg-ink/5">
                                  <span className="font-basement text-3xl text-ink/20">{(profile.name || username)[0]?.toUpperCase()}</span>
                                </div>
                              )}
                              <div className="absolute inset-0 pointer-events-none z-20" style={{ opacity: 0.12, backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 1px, rgba(0,0,0,0.4) 1px, rgba(0,0,0,0.4) 2px)', backgroundSize: '100% 2px' }} />
                            </div>
                          </div>
                        </div>
                        <span className="font-mono text-[11px] text-ink/40 mt-1">@{username}</span>
                        <span className="font-mono text-[8px] uppercase tracking-[2px] text-ink/10 mt-2 deco-text" data-deco="P1" />
                      </div>
                    </div>

                    {/* Identity fields */}
                    <div className="flex-1 px-3 py-2 md:px-4 md:py-2.5 flex flex-col justify-center relative z-10">
                      <div className="py-1 border-b border-ink/[0.04]">
                        <span className="font-mono text-[10px] font-semibold uppercase tracking-[2px] text-ink/50 block">full name</span>
                        <div className="flex items-baseline gap-2 mt-0.5">
                          <h1 className="font-basement font-black text-[clamp(18px,2.2vw,28px)] leading-[0.9] uppercase text-ink">{profile.name || username}</h1>
                          {profile.pronouns && (
                            <span className="font-mono text-[10px] lowercase tracking-wider text-ink/40">
                              ({profile.pronouns})
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="py-1 border-b border-ink/[0.04] flex items-center justify-between">
                        <div>
                          <span className="font-mono text-[10px] font-semibold uppercase tracking-[2px] text-ink/50 block">handle</span>
                          <span className="font-mono text-[13px] text-ink/60 mt-0.5 block">@{username}</span>
                        </div>
                      </div>
                      <div className="py-1 border-b border-ink/[0.04] flex items-center justify-between">
                        <div>
                          <span className="font-mono text-[10px] font-semibold uppercase tracking-[2px] text-ink/50 block">issued</span>
                          <span className="font-mono text-[11px] text-ink/40 mt-0.5 block">{memberSince || '—'}</span>
                        </div>
                        <div className="text-right">
                          <span className="font-mono text-[10px] font-semibold uppercase tracking-[2px] text-ink/50 block">status</span>
                          <div className="flex items-center gap-1.5 mt-0.5 justify-end">
                            <div className="w-1.5 h-1.5 rounded-full bg-green animate-pulse" />
                            <span className="font-mono text-[11px] text-ink/50">VALID</span>
                          </div>
                        </div>
                      </div>
                      <div className="py-1 border-b border-ink/[0.04] grid grid-cols-2 gap-x-6">
                        <div className="min-w-0">
                          <span className="font-mono text-[10px] font-semibold uppercase tracking-[2px] text-ink/50 block">what you do</span>
                          {roleTags.length > 0 ? (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {roleTags.slice(0, 3).map((slug) => (
                                <span
                                  key={slug}
                                  className="font-mono text-[9px] uppercase tracking-[1px] px-1.5 py-0.5 rounded-sm border border-ink/15 text-ink/55 leading-none"
                                >
                                  {roleSlugToLabel(slug)}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="font-mono text-[11px] text-ink/40 mt-0.5 block">—</span>
                          )}
                        </div>
                        {profile.bio && (
                          <div>
                            <span className="font-mono text-[10px] font-semibold uppercase tracking-[2px] text-ink/50 block">declaration</span>
                            <span className="font-zirkon text-[11px] text-ink/50 italic mt-0.5 block leading-relaxed line-clamp-2">&ldquo;{profile.bio}&rdquo;</span>
                          </div>
                        )}
                      </div>
                      <div className="py-1 flex flex-col gap-2.5 md:flex-row md:items-center md:justify-between md:gap-3">
                        <div className="min-w-0 md:flex-1">
                          <span className="font-mono text-[10px] font-semibold uppercase tracking-[2px] text-ink/50 block mb-1.5">links</span>
                          {socialLinks.length > 0 ? (
                            <div className="flex items-center flex-wrap gap-x-3 gap-y-1.5">
                              {socialLinks.map((link) => {
                                if (link.verified) {
                                  // Verified: lime icon only (no handle). The lime tint itself
                                  // signals the account is verified. --accent-ink stays legible
                                  // on both light and dark.
                                  return (
                                    <a
                                      key={link.type}
                                      href={link.url!}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="hover:opacity-70 transition-opacity"
                                      style={{ color: 'var(--accent-ink)' }}
                                      title={`${link.label} · verified`}
                                    >
                                      <SocialIcon type={link.type} size={16} />
                                    </a>
                                  );
                                }
                                // Unverified pasted URL / RSVP handle — muted icon
                                return (
                                  <a
                                    key={link.type}
                                    href={link.url!}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-ink/50 hover:text-ink/60 transition-colors"
                                    title={link.label}
                                  >
                                    <SocialIcon type={link.type} size={16} />
                                  </a>
                                );
                              })}
                              {/* Custom links — render inline as small labeled pills */}
                              {Array.isArray(profile.customLinks) && profile.customLinks
                                .filter((l) => l?.url && l?.label)
                                .slice(0, 6)
                                .map((cl, idx) => (
                                  <a
                                    key={`custom-${idx}`}
                                    href={cl.url.startsWith('http') ? cl.url : `https://${cl.url}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="font-mono text-[10px] uppercase tracking-[1px] text-ink/50 hover:text-ink hover:border-ink/40 border border-ink/15 px-2 py-0.5 rounded-sm transition-colors no-underline"
                                    title={cl.label}
                                  >
                                    {cl.label}
                                  </a>
                                ))}
                            </div>
                          ) : Array.isArray(profile.customLinks) && profile.customLinks.length > 0 ? (
                            <div className="flex items-center flex-wrap gap-3">
                              {profile.customLinks.filter((l) => l?.url && l?.label).slice(0, 6).map((cl, idx) => (
                                <a
                                  key={`custom-${idx}`}
                                  href={cl.url.startsWith('http') ? cl.url : `https://${cl.url}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="font-mono text-[10px] uppercase tracking-[1px] text-ink/50 hover:text-ink hover:border-ink/40 border border-ink/15 px-2 py-0.5 rounded-sm transition-colors no-underline"
                                >
                                  {cl.label}
                                </a>
                              ))}
                            </div>
                          ) : (
                            <span className="font-mono text-[11px] text-ink/20">—</span>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 md:shrink-0">
                          <button
                            id="tour-prof-card"
                            onClick={() => setCardOpen(true)}
                            className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-ink/50 hover:text-ink/60 transition-colors border border-ink/[0.08] rounded-sm px-2 py-0.5 cursor-pointer bg-transparent"
                          >
                            Card
                          </button>
                          <ShareButton
                            kind="profile"
                            title={profile.name || username}
                            text={`${profile.name || username} on TOPIA`}
                            iconSize={11}
                            storyImageUrl={`/api/profile/${username}/card?format=story`}
                            storyFilename={`${username}-topia-story.png`}
                            className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-ink/50 hover:text-ink/60 transition-colors border border-ink/[0.08] rounded-sm px-2 py-0.5 cursor-pointer bg-transparent"
                          />
                          {isOwnProfile && (
                            <Link id="tour-prof-edit" href="/profile" className="font-mono text-[10px] uppercase tracking-wider text-ink/50 hover:text-ink/60 transition-colors border border-ink/[0.08] rounded-sm px-2 py-0.5 no-underline">
                              Edit
                            </Link>
                          )}
                          {isOwnProfile && (
                            <button
                              onClick={() => replayTour('profile')}
                              title="Replay the tour"
                              aria-label="Replay the tour"
                              className="inline-flex items-center font-mono text-[10px] uppercase tracking-wider text-ink/50 hover:text-ink/60 transition-colors border border-ink/[0.08] rounded-sm px-2 py-0.5 cursor-pointer bg-transparent"
                            >
                              ?
                            </button>
                          )}
                          {!isOwnProfile && profile.id && (
                            <MessageButton
                              targetUserId={profile.id}
                              className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-ink/50 hover:text-ink/60 transition-colors border border-ink/[0.08] rounded-sm px-2 py-0.5 cursor-pointer bg-transparent"
                            />
                          )}
                          {!isOwnProfile && profile.id && (
                            <FollowButton
                              targetUserId={profile.id}
                              initialIsFollowing={isFollowing}
                              onFollowChange={(following) => {
                                setIsFollowing(following);
                                setFollowerCount((c) => following ? c + 1 : c - 1);
                              }}
                            />
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* ═══ ROW 2 — STATS BAR ═══ */}
                <div className="bg-[var(--page-bg)] border-t border-b border-ink/[0.04] px-4 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-0">
                    {[
                      { label: 'Worlds', value: String(stats.worlds), tab: null },
                      { label: 'Events', value: String(stats.events), tab: null },
                      // One combined number; the modal splits it back into
                      // followers / following tabs.
                      { label: 'Connects', value: String(stats.followers + stats.following), tab: 'followers' as const },
                    ].map((stat, i, arr) => {
                      const cls = `flex flex-col px-3 md:px-5 ${i < arr.length - 1 ? 'border-r border-ink/[0.06]' : ''} ${i === 0 ? 'pl-0' : ''}`;
                      const inner = (
                        <>
                          <span className="font-mono text-[9px] font-semibold uppercase tracking-[2px] text-ink/20">{stat.label}</span>
                          <span className="font-mono text-[15px] md:text-[15px] text-ink font-bold leading-none mt-0.5">{stat.value}</span>
                        </>
                      );
                      return stat.tab ? (
                        <button
                          key={stat.label}
                          type="button"
                          onClick={() => setFollowModal(stat.tab)}
                          className={`${cls} text-left items-start hover:opacity-70 transition-opacity cursor-pointer`}
                        >
                          {inner}
                        </button>
                      ) : (
                        <div key={stat.label} className={cls}>{inner}</div>
                      );
                    })}
                  </div>
                  <div className="hidden md:flex items-center gap-3">
                    <div className="w-32 h-[2px] rounded-full" style={{ background: `linear-gradient(90deg, transparent, ${config.hex}30, ${config.hex}60, ${config.hex}30, transparent)` }} />
                    <span className="font-mono text-[9px] uppercase tracking-[2px] text-ink/15 deco-text" data-deco="topia://stats" />
                  </div>
                </div>

                {/* ═══ ROW 3 — SECTION TAB NAV ═══
                    Wraps on mobile so every tab is always fully visible (a
                    scrolling row reads as cut-off text on phones); single
                    row with the section counter on md+. */}
                <div className="bg-[var(--page-bg)] border-b border-ink/[0.06] px-4 py-2 flex items-center gap-1 flex-wrap md:flex-nowrap md:overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
                  {visibleSections.map((s) => {
                    const isActive = activeSection === s.id;
                    return (
                      <button
                        key={s.id}
                        id={`tour-prof-tab-${s.id}`}
                        onClick={() => setActiveSection(s.id)}
                        className={`font-mono text-[10px] uppercase tracking-wider px-2.5 py-1 transition-all rounded-sm whitespace-nowrap cursor-pointer ${isActive ? `${config.bg} ${config.textOn} font-bold` : 'text-ink/50 hover:text-ink/50 bg-transparent'}`}
                      >
                        {s.label}
                      </button>
                    );
                  })}
                  <span className="hidden md:inline font-mono text-[9px] text-ink/15 ml-auto shrink-0">{visibleSections.length} sections</span>
                </div>

                {/* ═══ ROW 4 — ACTIVE SECTION CONTENT ═══ */}
                {/* Was fixed-height (h-280px + overflow-hidden) which cropped
                    longer sections like a guestbook with drawings. Switching
                    to min-height lets content flow naturally; the layers
                    that need internal scrolling already declare their own
                    overflow-y-auto. */}
                <div className={`bg-[var(--page-bg)] ${activeSection === 'identity' ? 'min-h-[250px] md:min-h-[290px]' : activeSection === 'worlds' ? 'min-h-[250px] md:min-h-[300px]' : 'min-h-[260px] md:min-h-[420px]'}`}>
                  {renderSection()}
                </div>

                {/* ═══ ROW 5 — MRZ STRIP ═══ */}
                <div className="bg-[var(--page-bg)] px-4 py-3 flex items-center justify-between border-t border-ink/[0.04]">
                  <div className="flex-1 flex flex-col gap-1 min-w-0">
                    <div className="flex items-end gap-0 h-4">
                      {bars.map((b, i) => (
                        <div key={i} className={b.type === 'bar' ? 'bg-ink/10' : ''} style={{ width: `${b.w}px`, height: b.type === 'bar' ? `${12 + (b.w * 2)}px` : '0px', marginRight: b.type === 'gap' ? `${b.w}px` : '0px' }} />
                      ))}
                    </div>
                    <span className="font-mono text-[9px] tracking-[2px] text-ink/15 uppercase truncate block deco-text" data-deco={mrzLine1} />
                    <span className="font-mono text-[9px] tracking-[2px] text-ink/10 uppercase truncate block deco-text" data-deco={mrzLine2} />
                  </div>
                  <div className="flex items-center gap-3 shrink-0 ml-4">
                    <span className="font-mono text-[9px] text-ink/10 hidden md:block deco-text" data-deco={`${profile.id.slice(0, 6)}···${profile.id.slice(-4)}`} />
                    <img src="/brand/logo-white.png" alt="" className="w-4 h-4 opacity-20" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                    <span className="font-mono text-[8px] text-ink/10 uppercase deco-text" data-deco="P1" />
                  </div>
                </div>

              </div>
            )}
          </div>
        </section>
      </PageShell>

      {profile && (
        <TopiaCardModal
          open={cardOpen}
          onClose={() => setCardOpen(false)}
          name={profile.name || username}
          username={username}
          avatarUrl={profile.avatarUrl}
          roleTags={roleTags}
          path={path}
          // Own card gets the flip-to-QR back face (the viewer's permanent
          // connect code — same one scanned at event doors).
          showConnectQr={isOwnProfile}
        />
      )}

      {profile && followModal && (
        <FollowListModal
          userId={profile.id}
          initialTab={followModal}
          followerCount={followerCount}
          followingCount={followingCount}
          onClose={() => setFollowModal(null)}
        />
      )}

      <Tour tourKey="profile" privyId={user?.id ?? ''} enabled={isOwnProfile && !!profile} steps={PROFILE_TOUR} />
    </div>
  );
}
