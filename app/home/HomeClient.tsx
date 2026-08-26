'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePrivy } from '@privy-io/react-auth';
import PageShell from '../components/PageShell';
import PassportLoop from '../components/home/PassportLoop';
import CompleteProfileModal from '../components/home/CompleteProfileModal';
import BlobImage from '../components/BlobImage';
import EventCover from '../events/EventCover';
import NewsletterSignup from '../components/NewsletterSignup';
import GlitchType from '../components/ui/GlitchType';
import { isRealPhoto } from '../../lib/avatar';
import { openFeedbackWidget } from '../../lib/openFeedback';
import { isEventOver } from '../../lib/events/localDay';

interface Episode {
  id: string;
  slug: string;
  title: string;
  category: string;
  thumbnailUrl: string | null;
  videoUrl: string;
  seriesTitle: string | null;
  guestName: string | null;
}

interface EventHost {
  userId: string;
  name: string | null;
  username: string | null;
  avatarUrl: string | null;
}

interface EventItem {
  id: string;
  eventName: string;
  slug: string;
  date: string | null;
  dateIso: string | null;
  city: string | null;
  address: string | null;
  imageUrl: string | null;
  rsvpCount: number;
  startTime: string | null;
  endTime?: string | null;
  timezone?: string | null;
  hosts: EventHost[];
}

interface Profile {
  id: string;
  username: string | null;
  name: string | null;
  avatarUrl: string | null;
  roleTags: string | null;
  path: string | null;
  pronouns: string | null;
  isWorldBuilder?: boolean;
  createdAt?: string;
}

// Snooze ledger for the deferred complete-your-profile popup (epoch ms until
// which it stays hidden). localStorage so it survives across sessions.
const COMPLETE_PROFILE_SNOOZE_KEY = 'topia:complete-profile-snooze';

// Fisher-Yates shuffle — returns a new randomly-ordered array.
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Hero headline that types + cycles through taglines with a blinking cursor.
const HERO_PHRASES = ['It is what you make it.', 'A network you own.', 'Culture before tech.', 'Built by us — for us.'];
function CyclingHeadline() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((x) => (x + 1) % HERO_PHRASES.length), 3600);
    return () => clearInterval(t);
  }, []);
  return (
    <span className="inline-flex items-baseline">
      <GlitchType key={i} text={HERO_PHRASES[i]} speed={24} flicker={false} />
      <span className="hero-cursor ml-1.5 w-[3px] h-[0.8em] inline-block self-center animate-pulse" />
    </span>
  );
}

// ── Wireframe globe — the SAME canvas lat/long grid the world pages use
// (app/components/WorldGlobe.tsx), just darker + more opaque and slowly
// auto-rotating instead of drag-driven. Decorative hero background only.
function rotateGlobePoint(p: { x: number; y: number; z: number }, rx: number, ry: number) {
  const x = p.x * Math.cos(ry) - p.z * Math.sin(ry);
  const z = p.x * Math.sin(ry) + p.z * Math.cos(ry);
  return { x, y: p.y * Math.cos(rx) - z * Math.sin(rx), z: p.y * Math.sin(rx) + z * Math.cos(rx) };
}
function globeS2C(theta: number, phi: number, r: number) {
  return { x: r * Math.sin(phi) * Math.cos(theta), y: r * Math.cos(phi), z: r * Math.sin(phi) * Math.sin(theta) };
}
function GridGlobe() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const DENSITY = 10; // degrees between grid lines — matches WorldGlobe
    const STEP = 4;     // sampling step for smooth curves
    // Darker, more opaque grey than the world globe's depth fade.
    const R = 54, Gc = 54, B = 54; // #363636
    const alpha = (zf: number) => 0.3 + zf * 0.35; // ~0.3 (back) → ~0.65 (front)

    let raf = 0;
    let ry = 0;
    const rx = 0.32; // slight tilt, like the world globe's resting rotation

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = container.clientWidth;
      const h = container.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (reduce) draw();
    };

    const draw = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      const cx = w / 2;
      const cy = h / 2;
      const radius = Math.min(w, h) * 0.46;
      ctx.clearRect(0, 0, w, h);
      ctx.lineWidth = 1;

      // Latitude lines
      for (let lat = DENSITY; lat < 180; lat += DENSITY) {
        const phi = (lat * Math.PI) / 180;
        ctx.beginPath();
        for (let lon = 0; lon <= 360; lon += STEP) {
          const p = rotateGlobePoint(globeS2C((lon * Math.PI) / 180, phi, radius), rx, ry);
          if (lon === 0) ctx.moveTo(cx + p.x, cy - p.y);
          else ctx.lineTo(cx + p.x, cy - p.y);
        }
        const tp = rotateGlobePoint(globeS2C(0, phi, radius), rx, ry);
        ctx.strokeStyle = `rgba(${R},${Gc},${B},${alpha((tp.z + radius) / (2 * radius))})`;
        ctx.stroke();
      }

      // Longitude lines
      for (let lon = 0; lon < 360; lon += DENSITY) {
        const theta = (lon * Math.PI) / 180;
        ctx.beginPath();
        for (let lat = 0; lat <= 180; lat += STEP) {
          const p = rotateGlobePoint(globeS2C(theta, (lat * Math.PI) / 180, radius), rx, ry);
          if (lat === 0) ctx.moveTo(cx + p.x, cy - p.y);
          else ctx.lineTo(cx + p.x, cy - p.y);
        }
        const tp = rotateGlobePoint(globeS2C(theta, Math.PI / 2, radius), rx, ry);
        ctx.strokeStyle = `rgba(${R},${Gc},${B},${alpha((tp.z + radius) / (2 * radius))})`;
        ctx.stroke();
      }

      if (!reduce) {
        ry += 0.0007; // very slow auto-rotation
        raf = requestAnimationFrame(draw);
      }
    };

    resize();
    draw();
    const ro = new ResizeObserver(resize);
    ro.observe(container);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, []);

  return (
    <div ref={containerRef} aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(820px,120vw)] aspect-square">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
    </div>
  );
}

// Old-school draggable window. Drag by the title bar (or the file icon when
// closed); stays inside `boundsRef` and clear of [data-keepclear] zones.
function DraggablePopup({ boundsRef, title, children }: { boundsRef: React.RefObject<HTMLElement | null>; title: string; children: React.ReactNode }) {
  const elRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [closed, setClosed] = useState(false);
  const drag = useRef<{ dx: number; dy: number } | null>(null);

  // Clamp to bounds, then push out of any [data-keepclear] zone (header text,
  // scroll cue) so the window/icon can never cover them.
  function clamp(x: number, y: number) {
    const b = boundsRef.current?.getBoundingClientRect();
    const c = elRef.current?.getBoundingClientRect();
    if (!b || !c) return { x, y };
    const maxX = Math.max(0, b.width - c.width);
    const maxY = Math.max(0, b.height - c.height);
    let nx = Math.min(Math.max(0, x), maxX);
    let ny = Math.min(Math.max(0, y), maxY);
    boundsRef.current!.querySelectorAll('[data-keepclear]').forEach((z) => {
      const zr = z.getBoundingClientRect();
      const rx = zr.left - b.left, ry = zr.top - b.top, rr = zr.right - b.left, rb = zr.bottom - b.top;
      const ox = Math.min(nx + c.width, rr) - Math.max(nx, rx);
      const oy = Math.min(ny + c.height, rb) - Math.max(ny, ry);
      if (ox > 0 && oy > 0) {
        const pushes = [
          { axis: 0, d: rr - nx },
          { axis: 0, d: -(nx + c.width - rx) },
          { axis: 1, d: rb - ny },
          { axis: 1, d: -(ny + c.height - ry) },
        ].sort((a, b) => Math.abs(a.d) - Math.abs(b.d));
        const best = pushes[0];
        if (best.axis === 0) nx += best.d; else ny += best.d;
        nx = Math.min(Math.max(0, nx), maxX);
        ny = Math.min(Math.max(0, ny), maxY);
      }
    });
    return { x: nx, y: ny };
  }

  useEffect(() => {
    const place = () => {
      const b = boundsRef.current?.getBoundingClientRect();
      const c = elRef.current?.getBoundingClientRect();
      if (!b || !c) return;
      // Find the bottom of the hero text (kicker/wordmark + glitch tagline),
      // ignoring the scroll-cue button, so the popup defaults just below it.
      let textBottom = b.height * 0.3;
      boundsRef.current!.querySelectorAll('[data-keepclear]').forEach((z) => {
        if (z.tagName === 'BUTTON') return;
        textBottom = Math.max(textBottom, z.getBoundingClientRect().bottom - b.top);
      });
      const x = (b.width - c.width) / 2; // horizontally centered on the page
      const y = textBottom + 24;         // just under the header text
      setPos(clamp(x, y));
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boundsRef]);

  // Re-clamp when toggling window/icon (their sizes differ).
  useEffect(() => {
    const id = requestAnimationFrame(() => setPos((p) => (p ? clamp(p.x, p.y) : p)));
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closed]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (!pos) return;
    const b = boundsRef.current!.getBoundingClientRect();
    drag.current = { dx: e.clientX - b.left - pos.x, dy: e.clientY - b.top - pos.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const b = boundsRef.current!.getBoundingClientRect();
    setPos(clamp(e.clientX - b.left - drag.current.dx, e.clientY - b.top - drag.current.dy));
  };
  const onPointerUp = () => { drag.current = null; };

  // Closed → a draggable desktop "text file" icon; double-click reopens.
  if (closed) {
    return (
      <div
        ref={elRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onDoubleClick={() => setClosed(false)}
        title="Double-click to open"
        className="absolute z-20 flex flex-col items-center gap-1 w-[78px] p-1.5 cursor-grab active:cursor-grabbing touch-none select-none group"
        style={{ left: pos?.x ?? 16, top: pos?.y ?? 16, visibility: pos ? 'visible' : 'hidden' }}
      >
        <span className="relative block w-9 h-11 pointer-events-none" style={{ background: '#e8e4dc', boxShadow: 'inset -1px -1px 0 #9a9a9a, inset 1px 1px 0 #ffffff', clipPath: 'polygon(0 0, 70% 0, 100% 26%, 100% 100%, 0 100%)' }}>
          <span className="absolute" style={{ top: 0, right: 0, width: '30%', height: '26%', background: '#bcb8ac' }} />
          <span className="absolute left-1.5 right-1.5 top-5 h-px bg-obsidian/30" />
          <span className="absolute left-1.5 right-1.5 top-6 h-px bg-obsidian/30" />
          <span className="absolute left-1.5 right-2.5 top-7 h-px bg-obsidian/30" />
        </span>
        <span className="font-mono text-[9px] uppercase tracking-wider text-bone px-1 rounded-sm bg-obsidian/70 group-hover:bg-lime group-hover:text-obsidian transition-colors pointer-events-none">{title}</span>
      </div>
    );
  }

  return (
    <div
      ref={elRef}
      className="absolute z-20 select-none"
      style={{
        left: pos?.x ?? 0, top: pos?.y ?? 0, visibility: pos ? 'visible' : 'hidden',
        width: 'min(360px, calc(100% - 32px))',
        background: '#c4c4c4',
        boxShadow: 'inset -2px -2px 0 #7a7a7a, inset 2px 2px 0 #fdfdfd, 7px 7px 0 rgba(0,0,0,0.45)',
      }}
    >
      {/* Title bar — drag handle. Inset 2px so it sits INSIDE the window's
          bevel frame (like a real win95 title bar) instead of painting over
          it and overhanging the body. */}
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        className="flex items-center justify-between gap-2 px-2 py-1 mx-[2px] mt-[2px] cursor-grab active:cursor-grabbing touch-none"
        style={{ background: 'linear-gradient(90deg, var(--accent, #e4fe52), #aacb33)' }}
      >
        <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-obsidian truncate">{title}</span>
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => setClosed(true)}
          className="w-4 h-4 flex items-center justify-center text-[9px] text-obsidian font-bold leading-none cursor-pointer shrink-0"
          style={{ background: '#c4c4c4', boxShadow: 'inset -1px -1px 0 #7a7a7a, inset 1px 1px 0 #fdfdfd' }}
          title="Close"
        >✕</button>
      </div>
      <div className="p-4 space-y-3" style={{ color: '#1a1a1a' }}>
        {children}
      </div>
    </div>
  );
}


const CAT_DOT: Record<string, string> = { Featured: 'bg-lime', Live: 'bg-pink', Series: 'bg-blue', Replays: 'bg-orange' };

const txt = { color: 'var(--foreground)' };
const card: React.CSSProperties = { backgroundColor: 'var(--background)', borderColor: 'var(--border-color)', color: 'var(--foreground)' };

function fmtEventDate(e: EventItem): string {
  if (e.dateIso) {
    const d = new Date(e.dateIso + 'T00:00:00');
    if (!isNaN(d.getTime())) return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase();
  }
  return (e.date ?? '').toUpperCase();
}

function SectionHead({ label, title, href, linkText }: { label: string; title: string; href?: string; linkText?: string }) {
  return (
    <div className="flex items-end justify-between mb-5">
      <div>
        <span className="font-mono text-[11px] uppercase tracking-[3px] opacity-40 block mb-1" style={txt}>{label}</span>
        <h2 className="font-basement font-black text-[clamp(26px,4vw,44px)] leading-[0.9] uppercase" style={txt}>{title}</h2>
      </div>
      {href && (
        <Link href={href} className="font-mono text-[11px] uppercase tracking-[2px] opacity-60 hover:opacity-100 no-underline border-b pb-0.5 shrink-0 transition-opacity" style={{ color: 'var(--foreground)', borderColor: 'var(--border-color)' }}>
          {linkText ?? 'View all →'}
        </Link>
      )}
    </div>
  );
}

/* ── Inline TV player — autoplays muted on the home page (like the TV page) ── */
function HomeTVPlayer({ episode }: { episode: Episode }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    // Muted inline autoplay: set the property imperatively (React's muted prop
    // isn't reliable for this) and retry once the media is ready, since the
    // first play() can land before the source is buffered on mobile.
    v.muted = true;
    v.defaultMuted = true;
    const tryPlay = () => { v.play().catch(() => {}); };
    tryPlay();
    v.addEventListener('canplay', tryPlay);
    v.addEventListener('loadeddata', tryPlay);
    return () => {
      v.removeEventListener('canplay', tryPlay);
      v.removeEventListener('loadeddata', tryPlay);
    };
  }, [episode.id]);

  const toggleMute = () => {
    const v = ref.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
    if (v.paused) v.play().catch(() => {});
  };

  return (
    <div className="group relative aspect-video rounded-xl overflow-hidden bg-obsidian">
      <video
        ref={ref}
        src={episode.videoUrl}
        poster={episode.thumbnailUrl ?? undefined}
        muted={muted}
        autoPlay
        loop
        playsInline
        preload="auto"
        className="w-full h-full object-cover"
      />
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.85), transparent 50%)' }} />

      {/* Live/category chip */}
      <div className="absolute top-4 left-4 flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${CAT_DOT[episode.category] ?? 'bg-lime'} animate-pulse`} />
        <span className="font-mono text-[10px] uppercase tracking-[2px] text-bone/80">Now playing · {episode.category}</span>
      </div>

      {/* Unmute toggle */}
      <button
        onClick={toggleMute}
        className="absolute top-3.5 right-4 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[1.5px] px-2.5 py-1 rounded-full bg-bone/90 text-obsidian hover:bg-bone transition cursor-pointer"
      >
        {muted ? '🔇 Tap to unmute' : '🔊 Sound on'}
      </button>

      {/* Title + open-TV link */}
      <div className="absolute bottom-0 left-0 right-0 p-4 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-basement font-black text-[clamp(16px,2.5vw,28px)] uppercase text-bone leading-tight break-words line-clamp-2">{episode.title}</h3>
          {(episode.seriesTitle || episode.guestName) && (
            <span className="font-mono text-[11px] text-bone/60">{[episode.seriesTitle, episode.guestName].filter(Boolean).join(' · ')}</span>
          )}
        </div>
        <Link href="/tv" className="shrink-0 font-mono text-[10px] uppercase tracking-[2px] px-3 py-1.5 rounded-sm bg-lime text-obsidian font-bold no-underline hover:opacity-80 transition">Open TV →</Link>
      </div>
    </div>
  );
}

export default function HomeClient({
  initialEpisodes,
  initialEvents,
  initialProfiles,
}: {
  initialEpisodes: Episode[];
  initialEvents: EventItem[];
  initialProfiles: Profile[];
}) {
  const { ready, authenticated, user, login } = usePrivy();
  // Server-seeded public data. Events: upcoming first, capped at 7. Profiles:
  // shuffled per visit so Discover stays fresh; real-photo guard for cache.
  const [episodes] = useState<Episode[]>(initialEpisodes);
  const [events] = useState<EventItem[]>(() => {
    // End-time aware (event's own timezone): tonight's event must stay in
    // this list for its whole night, not vanish at UTC midnight.
    const upcoming = initialEvents.filter((e) => !e.dateIso || !isEventOver(e));
    return (upcoming.length ? upcoming : initialEvents).slice(0, 7);
  });
  const [profiles] = useState<Profile[]>(() => shuffle(initialProfiles.filter((p) => isRealPhoto(p.avatarUrl))));
  // null = unknown / logged out; true/false = the viewer's profile completeness.
  const [viewerComplete, setViewerComplete] = useState<boolean | null>(null);
  // The deferred half of signup: signup itself only asks for name · handle ·
  // photo, and this popup collects craft tags + bio later. Deliberately NOT
  // shown right after signup — only to accounts older than a day, and a
  // dismissal snoozes it for days.
  const [completeProfileOpen, setCompleteProfileOpen] = useState(false);
  const [viewerExtras, setViewerExtras] = useState<{ roleTags: string[]; bio: string } | null>(null);

  useEffect(() => {
    if (!user?.id) { setViewerComplete(null); return; }
    let timer: ReturnType<typeof setTimeout> | undefined;
    fetch(`/api/auth/profile?privyId=${encodeURIComponent(user.id)}`)
      .then((r) => r.json())
      .then((d) => {
        const u = d.user;
        // Require a real uploaded photo — an auto-generated fallback avatar
        // still counts as an incomplete profile (prompts onboarding). Role
        // tags moved out of the signup flow, so they no longer gate the
        // deck's "finish onboarding" CTA — the popup below picks them up.
        const coreDone = !!(u && isRealPhoto(u.avatarUrl) && u.name && u.username);
        setViewerComplete(coreDone);

        // Nudge for the deferred extras only when signup is behind them.
        if (!coreDone || !u) return;
        const missingExtras = !u.roleTags || !u.bio;
        const oldEnough = u.createdAt
          ? Date.now() - new Date(u.createdAt).getTime() > 24 * 60 * 60 * 1000
          : false;
        let snoozed = false;
        try { snoozed = Number(localStorage.getItem(COMPLETE_PROFILE_SNOOZE_KEY) ?? 0) > Date.now(); } catch { /* ignore */ }
        if (missingExtras && oldEnough && !snoozed) {
          setViewerExtras({
            roleTags: u.roleTags ? String(u.roleTags).split(',').map((s: string) => s.trim()).filter(Boolean) : [],
            bio: u.bio ?? '',
          });
          // No auto-open: the modal used to slam in at 2500ms on top of the
          // other first-session interruptions. The persistent passport chip
          // (FrostedPill) is the nudge; the data staged here serves the modal
          // whenever the user opens it deliberately.
        }
      })
      .catch(() => {});
    return () => clearTimeout(timer);
  }, [user?.id]);

  const closeCompleteProfile = (saved: boolean) => {
    setCompleteProfileOpen(false);
    // Saved → long snooze (re-appears only if something is still missing).
    // Dismissed → short snooze so it stays polite, not naggy.
    const days = saved ? 14 : 3;
    try { localStorage.setItem(COMPLETE_PROFILE_SNOOZE_KEY, String(Date.now() + days * 24 * 60 * 60 * 1000)); } catch { /* ignore */ }
  };

  const heroRef = useRef<HTMLElement>(null);

  const featuredEp = episodes[0];
  const moreEps = episodes.slice(1, 5);
  const featuredEvent = events[0];
  const restEvents = events.slice(1, 7);
  // Legibility floor: these boxes are real content (honest empty states with
  // a door to the full directory/channel), not placeholders — 30% was ghostly.
  const emptyBox = 'border rounded-xl py-16 text-center font-mono text-[12px] uppercase tracking-[2px] opacity-[0.55]';

  return (
    <PageShell>
      {completeProfileOpen && viewerExtras && user?.id && (
        <CompleteProfileModal
          privyId={user.id}
          initialRoleTags={viewerExtras.roleTags}
          initialBio={viewerExtras.bio}
          onClose={closeCompleteProfile}
        />
      )}
      <div className="home-cursor min-h-screen" style={{ backgroundColor: 'var(--page-bg)' }}>

        {/* ── HERO ── */}
        <header ref={heroRef} className="relative overflow-hidden border-b min-h-[640px] md:min-h-[680px] flex items-start" style={{ borderColor: 'var(--border-color)' }}>
          {/* Subtle halftone texture (matches the rest of the app) */}
          <div aria-hidden className="absolute inset-0 pointer-events-none z-0" style={{ backgroundImage: 'radial-gradient(circle, rgba(245,240,232,0.7) 1px, transparent 1px)', backgroundSize: '22px 22px', opacity: 0.05 }} />
          <GridGlobe />

          <div className="relative z-10 max-w-[1200px] w-full mx-auto px-4 md:px-8 pt-6 md:pt-24 pb-28">
            {/* Kicker + wordmark — fully static, isolated from the headline's
                reflow so they never repaint/shimmer while it cycles. */}
            <div data-keepclear className="inline-block max-w-full align-top">
              <span className="font-mono text-[12px] uppercase tracking-[4px] opacity-40 block mb-4" style={txt}>topia // welcome to beta</span>
              <h1 className="font-basement font-black text-[clamp(48px,11vw,128px)] leading-[0.82] uppercase select-none" style={txt}>
                TOPIA<span style={{ color: 'var(--accent, #e4fe52)' }}>.</span>
              </h1>
            </div>
            {/* The only glitching element — the lime cycling tagline. */}
            <div data-keepclear className="hero-tagline block w-fit max-w-full font-mono font-bold text-[clamp(20px,3.2vw,40px)] uppercase mt-3 leading-tight" style={{ minHeight: '1.2em' }}>
              <CyclingHeadline />
            </div>
            {/* Logged-out visitors get a join door right in the hero — before
                this the page had no sign-up CTA anywhere. keepclear so the
                welcome.txt popup can never sit on top of it. */}
            {!authenticated && (
              <div data-keepclear className="block w-fit mt-6">
                <button
                  onClick={() => { if (ready) login(); }}
                  className="font-mono text-[12px] font-bold uppercase tracking-[2px] px-6 py-3 rounded-sm cursor-pointer border-none bg-lime text-obsidian hover:opacity-90 transition"
                >
                  Sign up →
                </button>
              </div>
            )}
          </div>

          {/* Draggable retro pop-up holding the intro copy */}
          <DraggablePopup boundsRef={heroRef} title="welcome.txt">
            {/* Concrete orientation first — what this place actually IS. */}
            <p className="font-mono text-[12px] leading-[1.7] font-bold">Worlds to join, events to attend, creators to meet — and a passport that fills up as you show up.</p>
            <p className="font-mono text-[11px] leading-[1.7]"><span className="font-bold">What is TOPIA?</span> Not another algorithm to fight. Not another platform to feed. It&apos;s the infrastructure: a network of world builders your algorithm can&apos;t contain, and a community to support your ecosystem.</p>
            <p className="font-mono text-[11px] leading-[1.7]">We&apos;re still building. You&apos;re here early because we need you — to tell us what&apos;s working, what&apos;s missing, and what TOPIA should become.</p>
            {/* Primary CTA by viewer state: logged out → join; logged in with an
                incomplete passport → finish onboarding. Feedback stays as a
                secondary text link (it silently requires login anyway). */}
            <div className="flex items-center gap-3 flex-wrap pt-0.5">
              {!authenticated ? (
                <button
                  onClick={() => { if (ready) login(); }}
                  className="font-mono text-[11px] font-bold uppercase tracking-[2px] px-3.5 py-2 rounded-sm cursor-pointer border-none bg-lime text-obsidian hover:opacity-90 transition"
                >
                  Sign up →
                </button>
              ) : viewerComplete === false ? (
                <Link
                  href="/onboarding"
                  className="font-mono text-[11px] font-bold uppercase tracking-[2px] px-3.5 py-2 rounded-sm no-underline bg-lime text-obsidian hover:opacity-90 transition"
                >
                  Finish your passport →
                </Link>
              ) : null}
              <button
                onClick={openFeedbackWidget}
                className="font-mono text-[11px] uppercase tracking-[2px] bg-transparent border-none cursor-pointer p-0 underline underline-offset-2 hover:opacity-70 transition"
                style={{ color: '#1a1a1a' }}
              >
                ✎ Share feedback
              </button>
            </div>
          </DraggablePopup>

          {/* Scroll cue — centered on the divider, clear of the popup */}
          <button
            data-keepclear
            onClick={() => document.getElementById('explore')?.scrollIntoView({ behavior: 'smooth' })}
            className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 inline-flex flex-col items-center gap-0.5 group bg-transparent border-none cursor-pointer p-0"
          >
            <span className="font-mono text-[10px] uppercase tracking-[3px] opacity-40 group-hover:opacity-100 transition-opacity text-center" style={txt}>see what&apos;s possible on topia</span>
            <svg className="text-lime animate-bounce" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        </header>

        <div id="explore" className="max-w-[1200px] mx-auto px-4 md:px-8 py-10 md:py-14">

          {/* ── DISCOVER PROFILES — passport cards in a seamless GSAP loop,
                 links to the /topians directory ── */}
          <section className="mb-16">
            <div className="flex items-end justify-between mb-5">
              <Link href="/topians" className="no-underline group/disc">
                <span className="font-mono text-[11px] uppercase tracking-[3px] opacity-40 block mb-1" style={txt}>the community</span>
                <h2 className="font-basement font-black text-[clamp(26px,4vw,44px)] leading-[0.9] uppercase group-hover/disc:opacity-80 transition-opacity" style={txt}>Discover</h2>
              </Link>
              <Link href="/topians" className="font-mono text-[11px] uppercase tracking-[2px] opacity-60 hover:opacity-100 no-underline border-b pb-0.5 shrink-0 transition-opacity" style={{ color: 'var(--foreground)', borderColor: 'var(--border-color)' }}>
                All Topians →
              </Link>
            </div>

            {profiles.length === 0 && viewerComplete !== false ? (
              // No client refetch exists — an empty server seed stays empty, so
              // say so honestly and point at the full directory instead of
              // pretending to load forever.
              <Link href="/topians" className={`block no-underline hover:opacity-80 transition-opacity ${emptyBox}`} style={{ ...txt, borderColor: 'var(--border-color)' }}>
                No profiles to show yet — browse all Topians →
              </Link>
            ) : (
              <PassportLoop profiles={profiles} showCompleteCta={viewerComplete === false} />
            )}
          </section>

          {/* ── EVENTS ── */}
          <section className="mb-16">
            <SectionHead label="happening on topia" title="Events" href="/events" />
            {events.length === 0 ? (
              <div className={emptyBox} style={{ ...txt, borderColor: 'var(--border-color)' }}>No upcoming events</div>
            ) : (
              <>
                {/* Featured event — image + details column */}
                {featuredEvent && (
                  <div className="grid grid-cols-1 md:grid-cols-[1.4fr_1fr] gap-3 mb-3 rounded-xl overflow-hidden border" style={card}>
                    {/* Image fills the column and crops (object-cover) so the
                        flyer never stretches the row — the details drive height. */}
                    <Link href={`/events/${featuredEvent.slug}`} className="group block relative aspect-[16/10] md:aspect-auto bg-obsidian overflow-hidden no-underline">
                      {featuredEvent.imageUrl ? (
                        // Largest above-the-fold image on /home → priority so
                        // it's preloaded instead of waiting for hydration.
                        <EventCover src={featuredEvent.imageUrl} alt={featuredEvent.eventName} priority className="absolute inset-0 w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-500" />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center font-basement font-black text-[40px] uppercase text-bone/15">TOPIA</div>
                      )}
                      <span className="absolute top-3 left-3 z-10 font-mono text-[9px] uppercase tracking-[2px] bg-lime text-obsidian px-2 py-0.5 rounded-sm font-bold">Featured</span>
                    </Link>

                    <div className="p-5 md:p-6 flex flex-col">
                      <span className="font-mono text-[10px] uppercase tracking-[2px] text-orange font-bold">{fmtEventDate(featuredEvent)}{featuredEvent.startTime ? ` · ${featuredEvent.startTime}` : ''}</span>
                      <h3 className="font-basement font-black text-[clamp(22px,2.6vw,32px)] uppercase leading-[0.95] mt-2 mb-4" style={txt}>{featuredEvent.eventName}</h3>

                      <dl className="space-y-2.5 font-mono text-[12px]" style={txt}>
                        <div className="flex items-start gap-2">
                          <dt className="opacity-40 uppercase tracking-wider text-[10px] w-20 shrink-0 pt-0.5">Presented by</dt>
                          <dd className="font-bold opacity-90">TOPIA</dd>
                        </div>
                        {featuredEvent.hosts.length > 0 && (
                          <div className="flex items-start gap-2">
                            <dt className="opacity-40 uppercase tracking-wider text-[10px] w-20 shrink-0 pt-0.5">Hosts</dt>
                            <dd className="flex items-center gap-2 flex-wrap">
                              <div className="flex -space-x-1.5">
                                {featuredEvent.hosts.slice(0, 5).map((h) => (
                                  <span key={h.userId} className="block w-6 h-6 rounded-full overflow-hidden border-2 bg-obsidian" style={{ borderColor: 'var(--background)' }} title={h.name || h.username || ''}>
                                    {h.avatarUrl ? (
                                      <BlobImage src={h.avatarUrl} alt="" width={48} height={48} sizes="24px" className="w-full h-full object-cover" />
                                    ) : (
                                      <span className="w-full h-full flex items-center justify-center text-[9px] opacity-50">{(h.name || h.username || '?')[0]?.toUpperCase()}</span>
                                    )}
                                  </span>
                                ))}
                              </div>
                              <span className="opacity-70 text-[11px]">{featuredEvent.hosts.map((h) => h.name || h.username).filter(Boolean).slice(0, 2).join(', ')}{featuredEvent.hosts.length > 2 ? ` +${featuredEvent.hosts.length - 2}` : ''}</span>
                            </dd>
                          </div>
                        )}
                        {(featuredEvent.city || featuredEvent.address) && (
                          <div className="flex items-start gap-2">
                            <dt className="opacity-40 uppercase tracking-wider text-[10px] w-20 shrink-0 pt-0.5">Location</dt>
                            <dd className="opacity-80">{[featuredEvent.address, featuredEvent.city].filter(Boolean).join(', ')}</dd>
                          </div>
                        )}
                        <div className="flex items-start gap-2">
                          <dt className="opacity-40 uppercase tracking-wider text-[10px] w-20 shrink-0 pt-0.5">RSVPs</dt>
                          <dd className="opacity-80">{featuredEvent.rsvpCount} going</dd>
                        </div>
                      </dl>

                      <Link href={`/events/${featuredEvent.slug}`} className="mt-5 self-start inline-flex items-center font-mono text-[11px] uppercase tracking-[2px] px-5 py-2.5 rounded-sm bg-[var(--foreground)] text-[var(--background)] font-bold no-underline hover:opacity-80 transition">
                        View Event →
                      </Link>
                    </div>
                  </div>
                )}

                {/* Rest of upcoming events */}
                {restEvents.length > 0 && (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {restEvents.map((ev) => (
                      <Link key={ev.id} href={`/events/${ev.slug}`} className="group block rounded-xl overflow-hidden border hover:opacity-90 transition-opacity no-underline" style={card}>
                        <div className="aspect-[4/3] bg-obsidian/[0.06] overflow-hidden">
                          {ev.imageUrl ? (
                            <EventCover src={ev.imageUrl} alt={ev.eventName} lazy className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-500" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center font-basement font-black text-[28px] uppercase opacity-15" style={txt}>TOPIA</div>
                          )}
                        </div>
                        <div className="p-3">
                          <span className="font-mono text-[10px] uppercase tracking-[1.5px] text-orange font-bold">{fmtEventDate(ev)}{ev.city ? ` · ${ev.city}` : ''}</span>
                          <h3 className="font-basement font-black text-[15px] uppercase leading-tight mt-1 mb-1.5 line-clamp-2" style={txt}>{ev.eventName}</h3>
                          <span className="font-mono text-[10px] opacity-40" style={txt}>{ev.rsvpCount} going</span>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </>
            )}
          </section>

          {/* ── TOPIA TV ── */}
          <section className="mb-16">
            <SectionHead label="now playing" title="Topia TV" href="/tv" linkText="Open TV →" />
            {episodes.length === 0 ? (
              // Same honesty as Discover: nothing refetches client-side, so an
              // empty guide is "off air", not "loading".
              <Link href="/tv" className={`block no-underline hover:opacity-80 transition-opacity ${emptyBox}`} style={{ ...txt, borderColor: 'var(--border-color)' }}>
                Nothing airing yet — Topia TV →
              </Link>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-3">
                {featuredEp && <HomeTVPlayer episode={featuredEp} />}
                {/* Guide panel — mirrors the TV page (now playing / up next) */}
                <div className="relative rounded-xl overflow-hidden border bg-obsidian flex flex-col min-h-[260px]" style={{ borderColor: 'var(--border-color)' }}>
                  {/* CRT scanline texture */}
                  <div className="absolute inset-0 pointer-events-none opacity-[0.05] z-[1]" style={{ backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(245,240,232,1) 3px, rgba(245,240,232,1) 4px)' }} />
                  <div className="relative z-[2] flex items-center justify-between px-3 py-2.5 border-b border-bone/[0.08]">
                    <span className="font-mono text-[10px] uppercase tracking-[2px] text-bone/40">Topia TV // Guide</span>
                    <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-lime animate-pulse" /><span className="font-mono text-[9px] uppercase tracking-[2px] text-lime">Live</span></span>
                  </div>

                  {/* Now playing */}
                  {featuredEp && (
                    <div className="relative z-[2] flex items-stretch border-b border-bone/[0.08] bg-bone/[0.05]">
                      <div className={`w-1 shrink-0 ${CAT_DOT[featuredEp.category] ?? 'bg-lime'}`} />
                      <div className="px-3 py-2.5 min-w-0 flex-1">
                        <span className="font-mono text-[8px] uppercase tracking-[2px] text-[var(--accent-ink)] block mb-1">▸ Now playing</span>
                        <span className="font-mono text-[12px] font-bold uppercase text-bone block truncate">{featuredEp.title}</span>
                        <span className="font-mono text-[9px] text-bone/40 uppercase tracking-wider">{[featuredEp.category, featuredEp.guestName].filter(Boolean).join(' · ')}</span>
                      </div>
                    </div>
                  )}

                  {/* Up next */}
                  <div className="relative z-[2] px-3 pt-2.5 pb-1">
                    <span className="font-mono text-[8px] uppercase tracking-[2px] text-bone/30">Up next</span>
                  </div>
                  <div className="relative z-[2] flex-1 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
                    {moreEps.map((ep, i) => (
                      <Link key={ep.id} href="/tv" className="group flex items-stretch border-b border-bone/[0.04] hover:bg-bone/[0.03] transition-colors no-underline">
                        <div className={`w-1 shrink-0 ${CAT_DOT[ep.category] ?? 'bg-lime'} opacity-40 group-hover:opacity-100 transition-opacity`} />
                        <div className="w-10 shrink-0 flex items-center justify-center border-r border-bone/[0.04]">
                          <span className="font-basement font-black text-[13px] text-bone/25 group-hover:text-bone/60 transition-colors">{String(i + 2).padStart(3, '0')}</span>
                        </div>
                        <div className="flex-1 px-3 py-2.5 min-w-0">
                          <span className="font-mono text-[11px] font-bold uppercase text-bone block truncate">{ep.title}</span>
                          <span className="font-mono text-[9px] text-bone/30 uppercase tracking-wider">{ep.category}</span>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* ── NEWSLETTER SIGN-UP ── */}
          <NewsletterSignup />

        </div>
      </div>
    </PageShell>
  );
}
