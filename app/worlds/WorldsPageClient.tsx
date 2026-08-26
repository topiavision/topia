'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import PageShell from '../components/PageShell';
import { getWorldConfig } from '../components/world/worldConfig';

interface WorldCard {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  category: string | null;
  imageUrl: string | null;
  country: string | null;
  dateAdded: string | null;
  creatorName: string | null;
  creatorSlug: string | null;
  creatorCountry: string | null;
}

interface World {
  id: string;
  name: string;
  description: string;
  builtBy: string;
  image: string;
  orbitIndex: number;
  orbitAngle: number;
  orbitTilt: number;
  orbitRotation: number;
  orbitRadius: number;
}

interface Point3D { x: number; y: number; z: number; }

// Colors come from getWorldConfig (slug hash) so a world's accent here always
// matches its own detail page — the old index-based cycle didn't.
const COLOR_DOT: Record<string, string> = { lime: 'bg-lime', blue: 'bg-blue', pink: 'bg-pink', orange: 'bg-orange', green: 'bg-green' };
const COLOR_TEXT: Record<string, string> = { lime: 'text-[var(--accent-ink)]', blue: 'text-blue', pink: 'text-pink', orange: 'text-orange', green: 'text-green' };
const GIF_MAP: Record<string, string> = { lime: '/gif/spiral.gif', blue: '/gif/surreal.gif', pink: '/gif/Topian-Gif.gif', orange: '/gif/spiral.gif', green: '/gif/surreal.gif' };

// ─── Orbit configs (wider radii for fuller spread) ──────────────
const orbitConfigs = [
  { radius: 0.22, tilt: 8, rotation: 0 },
  { radius: 0.48, tilt: -6, rotation: 30 },
  { radius: 0.34, tilt: 10, rotation: 60 },
  { radius: 0.58, tilt: -4, rotation: 90 },
  { radius: 0.40, tilt: 12, rotation: 120 },
  { radius: 0.20, tilt: -8, rotation: 150 },
  { radius: 0.62, tilt: 6, rotation: 180 },
  { radius: 0.30, tilt: -10, rotation: 210 },
  { radius: 0.52, tilt: 8, rotation: 240 },
  { radius: 0.66, tilt: -5, rotation: 270 },
  { radius: 0.44, tilt: 10, rotation: 300 },
  { radius: 0.56, tilt: -7, rotation: 330 },
];

function rotatePoint(point: Point3D, rotX: number, rotY: number): Point3D {
  const x = point.x * Math.cos(rotY) - point.z * Math.sin(rotY);
  const z = point.x * Math.sin(rotY) + point.z * Math.cos(rotY);
  return { x, y: point.y * Math.cos(rotX) - z * Math.sin(rotX), z: point.y * Math.sin(rotX) + z * Math.cos(rotX) };
}

function getOrbitPosition(angle: number, radius: number, tilt: number, rotation: number, time: number, expansion = 1): Point3D {
  const currentAngle = angle + time * 0.0006 * (1 + radius * 0.5);
  const r = radius * expansion;
  const xp = Math.cos(currentAngle) * r;
  const zp = Math.sin(currentAngle) * r * 0.85;
  const tiltedY = -zp * Math.sin(tilt);
  const tiltedZ = zp * Math.cos(tilt);
  return {
    x: xp * Math.cos(rotation) - tiltedZ * Math.sin(rotation),
    y: tiltedY,
    z: xp * Math.sin(rotation) + tiltedZ * Math.cos(rotation),
  };
}

function buildWorlds(apiWorlds: WorldCard[]): World[] {
  return apiWorlds.map((w, i) => {
    const c = orbitConfigs[i % orbitConfigs.length];
    return {
      id: w.slug,
      name: w.title,
      description: w.description || '',
      builtBy: w.creatorName || '',
      image: w.imageUrl || '',
      orbitIndex: i,
      orbitAngle: (i * 0.618 * Math.PI * 2) % (Math.PI * 2),
      orbitTilt: c.tilt * (Math.PI / 180),
      orbitRotation: c.rotation * (Math.PI / 180),
      orbitRadius: c.radius,
    };
  });
}

/* ── Galaxy Canvas ─────────────────────────────────────────────── */
function GalaxyMap({ worlds, activeWorld, activeData, activeColor, onHover, onSelect, expanded, isDark }: {
  worlds: World[];
  activeWorld: string | null;
  activeData: WorldCard | null;
  activeColor: string;
  onHover: (name: string | null) => void;
  onSelect: (slug: string) => void;
  expanded?: boolean;
  isDark: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<number>(0);
  const isDraggingRef = useRef(false);
  const dragMovedRef = useRef(false);
  const lastMouseRef = useRef({ x: 0, y: 0 });
  const rotationRef = useRef({ x: 0.3, y: 0 });
  const velocityRef = useRef({ x: 0, y: 0 });
  const timeRef = useRef(0);
  const isHoveringRef = useRef(false);
  const worldPositionsRef = useRef<{ id: string; x: number; y: number }[]>([]);
  const activeWorldRef = useRef<string | null>(null);
  const activationRef = useRef<Map<string, number>>(new Map());
  const expansionRef = useRef(0);         // 0→1 startup expansion
  const startTimeRef = useRef(Date.now());
  const resizeFnRef = useRef<(() => void) | null>(null);
  const onSelectRef = useRef(onSelect);
  const isDarkRef = useRef(isDark);
  const [transitioning, setTransitioning] = useState(false);

  useEffect(() => { activeWorldRef.current = activeWorld; }, [activeWorld]);
  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);
  useEffect(() => { isDarkRef.current = isDark; }, [isDark]);

  // Show loading overlay during expand/collapse, poll resize until settled
  const prevExpandedRef = useRef(expanded);
  useEffect(() => {
    if (prevExpandedRef.current === expanded) return;
    prevExpandedRef.current = expanded;
    setTransitioning(true);
    let frame = 0;
    const interval = setInterval(() => {
      resizeFnRef.current?.();
      frame++;
      if (frame >= 12) {
        clearInterval(interval);
        setTransitioning(false);
      }
    }, 50);
    return () => { clearInterval(interval); setTransitioning(false); };
  }, [expanded]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    function onMove(e: MouseEvent) {
      const rect = container!.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      let closest: string | null = null, closestDist = 34;
      worldPositionsRef.current.forEach(wp => {
        const dist = Math.sqrt((wp.x - mx) ** 2 + (wp.y - my) ** 2);
        if (dist < closestDist) { closestDist = dist; closest = wp.id; }
      });
      onHover(closest);
    }
    function onLeave() { onHover(null); }
    function onClick() {
      if (dragMovedRef.current) return;
      const id = activeWorldRef.current;
      if (id) onSelectRef.current(id);
    }
    container.addEventListener('mousemove', onMove);
    container.addEventListener('mouseleave', onLeave);
    container.addEventListener('click', onClick);
    return () => {
      container.removeEventListener('mousemove', onMove);
      container.removeEventListener('mouseleave', onLeave);
      container.removeEventListener('click', onClick);
    };
  }, [onHover]);

  useEffect(() => {
    const canvas = canvasRef.current, container = containerRef.current;
    if (!canvas || !container) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    function resize() {
      const rect = container!.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
      canvas!.width = rect.width * dpr; canvas!.height = rect.height * dpr;
      canvas!.style.width = rect.width + 'px'; canvas!.style.height = rect.height + 'px';
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resizeFnRef.current = resize;

    function animate() {
      const w = canvas!.width / (window.devicePixelRatio || 1), h = canvas!.height / (window.devicePixelRatio || 1);
      const cx = w * 0.5, cy = h * 0.5;
      const scale = w * 0.75;
      const dark = isDarkRef.current;

      // Theme-aware colors for canvas drawing
      const ringColor = dark ? '245,240,232' : '26,26,26';
      const dotColor = '228,254,82'; // lime accent stays the same
      const labelColor = dark ? '245,240,232' : '26,26,26';

      const elapsed = (Date.now() - startTimeRef.current) / 1000;
      expansionRef.current = Math.min(1, 1 - Math.pow(1 - Math.min(elapsed / 1.2, 1), 3));

      if (!isHoveringRef.current && !isDraggingRef.current) rotationRef.current.y += 0.002;
      if (!isDraggingRef.current) {
        rotationRef.current.x += velocityRef.current.x;
        rotationRef.current.y += velocityRef.current.y;
        velocityRef.current.x *= 0.92;
        velocityRef.current.y *= 0.92;
      }
      timeRef.current += 1;

      const rotX = rotationRef.current.x, rotY = rotationRef.current.y, time = timeRef.current;
      const expansion = expansionRef.current;
      ctx!.clearRect(0, 0, w, h);
      ctx!.imageSmoothingEnabled = true;
      const positions: { id: string; x: number; y: number; activation: number }[] = [];

      // Draw orbit rings
      const uniqueOrbits = new Map<string, { radius: number; tilt: number; rotation: number }>();
      worlds.forEach(wd => {
        const key = `${wd.orbitRadius.toFixed(2)}-${wd.orbitTilt.toFixed(2)}-${wd.orbitRotation.toFixed(2)}`;
        if (!uniqueOrbits.has(key)) uniqueOrbits.set(key, { radius: wd.orbitRadius, tilt: wd.orbitTilt, rotation: wd.orbitRotation });
      });
      uniqueOrbits.forEach(({ radius, tilt, rotation }) => {
        ctx!.beginPath();
        for (let i = 0; i <= 96; i++) {
          const angle = (i / 96) * Math.PI * 2;
          const pos = getOrbitPosition(angle, radius, tilt, rotation, 0, expansion);
          const rot = rotatePoint(pos, rotX, rotY);
          if (i === 0) ctx!.moveTo(cx + rot.x * scale, cy - rot.y * scale);
          else ctx!.lineTo(cx + rot.x * scale, cy - rot.y * scale);
        }
        ctx!.strokeStyle = `rgba(${ringColor},${0.08 * expansion})`;
        ctx!.lineWidth = 1;
        ctx!.stroke();
      });

      // Draw world dots + labels with smooth activation
      const activeId = activeWorldRef.current;
      ctx!.textBaseline = 'middle';
      worlds.forEach(wd => {
        const pos = getOrbitPosition(wd.orbitAngle, wd.orbitRadius, wd.orbitTilt, wd.orbitRotation, time, expansion);
        const rot = rotatePoint(pos, rotX, rotY);
        const sx = cx + rot.x * scale, sy = cy - rot.y * scale;

        const target = activeId === wd.id ? 1 : 0;
        const cur = activationRef.current.get(wd.id) ?? 0;
        const next = cur + (target - cur) * 0.22;
        activationRef.current.set(wd.id, next);
        const t = next;

        if (t > 0.02) {
          const glowR = 6 + t * 14;
          ctx!.beginPath(); ctx!.arc(sx, sy, glowR, 0, Math.PI * 2);
          const g = ctx!.createRadialGradient(sx, sy, 1, sx, sy, glowR);
          g.addColorStop(0, `rgba(${dotColor},${0.32 * t})`);
          g.addColorStop(1, `rgba(${dotColor},0)`);
          ctx!.fillStyle = g; ctx!.fill();
        }

        const dotR = 2.6 + t * 2.8;
        ctx!.beginPath(); ctx!.arc(sx, sy, dotR, 0, Math.PI * 2);
        ctx!.fillStyle = `rgba(${dotColor},${(0.5 + t * 0.5) * expansion})`;
        ctx!.fill();

        ctx!.font = '500 10.5px "GT Zirkon", "Inter", sans-serif';
        ctx!.fillStyle = `rgba(${labelColor},${(0.2 + t * 0.7) * expansion})`;
        ctx!.fillText(wd.name, sx + 10, sy + 0.5);
        positions.push({ id: wd.id, x: sx, y: sy, activation: t });
      });

      worldPositionsRef.current = positions.map(p => ({ id: p.id, x: p.x, y: p.y }));

      // Position the hover popover on the active (or fading) world
      if (popoverRef.current) {
        let target: { x: number; y: number; activation: number } | null = null;
        let maxAct = 0;
        positions.forEach(p => { if (p.activation > maxAct) { maxAct = p.activation; target = p; } });
        if (target && maxAct > 0.04) {
          const t = target as { x: number; y: number; activation: number };
          popoverRef.current.style.opacity = String(Math.min(1, maxAct * 1.1));
          popoverRef.current.style.transform = `translate3d(${t.x + 18}px, ${t.y - 12}px, 0)`;
        } else {
          popoverRef.current.style.opacity = '0';
        }
      }

      animRef.current = requestAnimationFrame(animate);
    }

    resize(); animate();
    window.addEventListener('resize', resize);
    return () => { cancelAnimationFrame(animRef.current); window.removeEventListener('resize', resize); };
  }, [worlds]);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    isDraggingRef.current = true;
    dragMovedRef.current = false;
    lastMouseRef.current = { x: e.clientX, y: e.clientY };
    velocityRef.current = { x: 0, y: 0 };
  }, []);
  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDraggingRef.current) return;
    const dx = e.clientX - lastMouseRef.current.x, dy = e.clientY - lastMouseRef.current.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) dragMovedRef.current = true;
    rotationRef.current.y += dx * 0.004; rotationRef.current.x += dy * 0.004;
    velocityRef.current = { x: dy * 0.0015, y: dx * 0.0015 };
    lastMouseRef.current = { x: e.clientX, y: e.clientY };
  }, []);
  const onMouseUp = useCallback(() => { isDraggingRef.current = false; }, []);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full cursor-grab active:cursor-grabbing"
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseEnter={() => { isHoveringRef.current = true; }}
      onMouseLeave={() => { isHoveringRef.current = false; isDraggingRef.current = false; }}
    >
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" style={{ opacity: transitioning ? 0 : 1, transition: 'opacity 0.2s ease-out' }} />
      {transitioning && (
        <div className="absolute inset-0 flex items-center justify-center z-[3]">
          <span className="font-mono text-[13px] uppercase tracking-wider animate-pulse" style={{ color: 'var(--foreground)', opacity: 0.3 }}>Loading constellation...</span>
        </div>
      )}
      <div
        ref={popoverRef}
        className="absolute top-0 left-0 pointer-events-none will-change-transform transition-opacity duration-150 z-[4]"
        style={{ opacity: 0 }}
      >
        {activeData && (
          <div className="backdrop-blur-md rounded-md px-4 py-3 max-w-[280px]" style={{ backgroundColor: 'color-mix(in srgb, var(--background) 85%, transparent)', border: '1px solid var(--border-color)', boxShadow: '0 12px 40px rgba(0,0,0,0.3)' }}>
            <div className="flex items-center gap-2 mb-1.5">
              <div className={`w-1.5 h-1.5 rounded-full ${COLOR_DOT[activeColor]}`} />
              {activeData.creatorName && (
                <span className="font-mono text-[13px] uppercase tracking-[2px]" style={{ color: 'var(--text-muted)' }}>
                  {activeData.creatorName}
                </span>
              )}
            </div>
            <h3 className={`font-basement font-black text-[15px] uppercase leading-[0.95] ${COLOR_TEXT[activeColor]}`}>
              {activeData.title}
            </h3>
            {activeData.description && (
              <p className="font-mono text-[12px] mt-2 leading-relaxed line-clamp-3" style={{ color: 'var(--foreground)', opacity: 0.45 }}>
                {activeData.description}
              </p>
            )}
            <span className="font-mono text-[13px] uppercase tracking-[2px] block mt-2" style={{ color: 'var(--foreground)', opacity: 0.3 }}>
              click to enter →
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Page ──────────────────────────────────────────────────────── */
export default function WorldsPageClient({ initialWorlds }: { initialWorlds: WorldCard[] }) {
  const router = useRouter();
  // Server-provided; the list is fully public so there is no client refetch.
  const [allWorlds] = useState<WorldCard[]>(initialWorlds);
  const [orbitWorlds] = useState<World[]>(() => buildWorlds(initialWorlds));
  const [activeWorld, setActiveWorld] = useState<string | null>(null);
  const [lastActive, setLastActive] = useState<{ data: WorldCard; color: string } | null>(null);
  const [search, setSearch] = useState('');
  const [mapFullscreen, setMapFullscreen] = useState(false);
  const [catFilter, setCatFilter] = useState<string | null>(null);

  // Detect current theme for canvas colors
  const [isDark, setIsDark] = useState(true);
  useEffect(() => {
    const check = () => setIsDark(document.documentElement.getAttribute('data-theme') !== 'light');
    check();
    const observer = new MutationObserver(check);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  const handleHover = useCallback((id: string | null) => setActiveWorld(id), []);
  const handleSelect = useCallback((slug: string) => router.push(`/worlds/${slug}`), [router]);

  const active = allWorlds.find(w => w.slug === activeWorld);
  const activeColor = active ? getWorldConfig(active.slug).color : 'lime';
  const filteredWorlds = search
    ? allWorlds.filter(w => w.title.toLowerCase().includes(search.toLowerCase()))
    : allWorlds;
  const categories = Array.from(new Set(allWorlds.map(w => w.category).filter((c): c is string => !!c)));
  const mobileWorlds = filteredWorlds.filter(w => !catFilter || w.category === catFilter);

  useEffect(() => {
    if (active) setLastActive({ data: active, color: activeColor });
  }, [active, activeColor]);

  return (
    <div className="min-h-screen w-full overflow-x-hidden" style={{ backgroundColor: 'var(--page-bg)' }}>
      <PageShell>
        <section className="min-h-screen px-3 sm:px-4 md:px-6 py-3 md:py-6" style={{ backgroundColor: 'var(--page-bg)' }}>
          <div className="max-w-[var(--content-max)] mx-auto md:h-[calc(100vh-var(--nav-height,80px)-48px)]">

            {/* ── Mobile explore — search + cards. The constellation is a
                hover instrument, so it stays desktop-only; touch gets a
                first-class card list in the same registry language. ── */}
            <div className="md:hidden pb-24">
              <div className="rounded-lg overflow-hidden mb-3" style={{ border: '1px solid var(--border-color)' }}>
                <div className="p-5" style={{ backgroundColor: 'var(--accent, #e4fe52)' }}>
                  <span className="font-mono text-[11px] uppercase tracking-[2px]" style={{ color: 'var(--on-accent-muted)' }}>
                    worlds // constellation
                  </span>
                  <h1 className="font-basement font-black text-[40px] leading-[0.85] uppercase mt-2" style={{ color: 'var(--accent-text, #1a1a1a)' }}>
                    WORLDS
                  </h1>
                </div>
                <div className="px-4 py-3" style={{ backgroundColor: 'var(--surface)', borderTop: '1px solid var(--border-color)' }}>
                  <span className="font-mono text-[12px]" style={{ color: 'var(--foreground)', opacity: 0.7 }}>
                    every world is an ecosystem — built by creators, for their communities.
                  </span>
                </div>
              </div>

              {/* 16px font so iOS doesn't zoom on focus */}
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="search worlds…"
                className="w-full font-mono text-[16px] bg-transparent rounded-lg outline-none px-4 py-3 mb-3"
                style={{ color: 'var(--foreground)', border: '1px solid var(--border-color)' }}
              />

              {categories.length > 1 && (
                <div className="flex gap-1.5 overflow-x-auto pb-1 mb-3" style={{ scrollbarWidth: 'none' }}>
                  <button
                    onClick={() => setCatFilter(null)}
                    className="font-mono text-[11px] uppercase tracking-wider px-3 py-1.5 rounded-full whitespace-nowrap cursor-pointer transition-colors"
                    style={catFilter === null
                      ? { backgroundColor: 'var(--accent, #e4fe52)', color: 'var(--accent-text, #1a1a1a)', border: '1px solid transparent' }
                      : { color: 'var(--text-muted)', border: '1px solid var(--border-color)', background: 'transparent' }}
                  >
                    All
                  </button>
                  {categories.map(cat => (
                    <button
                      key={cat}
                      onClick={() => setCatFilter(catFilter === cat ? null : cat)}
                      className="font-mono text-[11px] uppercase tracking-wider px-3 py-1.5 rounded-full whitespace-nowrap cursor-pointer transition-colors"
                      style={catFilter === cat
                        ? { backgroundColor: 'var(--accent, #e4fe52)', color: 'var(--accent-text, #1a1a1a)', border: '1px solid transparent' }
                        : { color: 'var(--text-muted)', border: '1px solid var(--border-color)', background: 'transparent' }}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              )}

              <div className="space-y-3">
                {mobileWorlds.length === 0 && (
                  <p className="font-mono text-[12px] py-6 text-center" style={{ color: 'var(--text-muted)' }}>
                    no worlds match{search ? ` “${search}”` : ''} yet.
                  </p>
                )}
                {mobileWorlds.map(world => {
                  const cfg = getWorldConfig(world.slug);
                  return (
                    <Link
                      key={world.slug}
                      href={`/worlds/${world.slug}`}
                      className="block rounded-lg overflow-hidden no-underline"
                      style={{ border: '1px solid var(--border-color)', backgroundColor: 'var(--surface)' }}
                    >
                      {world.imageUrl ? (
                        <img src={world.imageUrl} alt="" className="w-full h-36 object-cover" />
                      ) : (
                        <div className={`w-full h-20 ${cfg.bg} opacity-80`} />
                      )}
                      <div className="p-4 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full shrink-0 ${cfg.bg}`} />
                            <h2 className="font-basement font-black text-[17px] uppercase leading-none truncate" style={{ color: 'var(--foreground)' }}>
                              {world.title}
                            </h2>
                          </div>
                          <p className="font-mono text-[11px] uppercase tracking-wider mt-1.5 truncate" style={{ color: 'var(--text-muted)' }}>
                            {[world.category, world.creatorName].filter(Boolean).join(' · ')}
                          </p>
                          {world.description && (
                            <p className="font-mono text-[12px] mt-1.5 line-clamp-2" style={{ color: 'var(--foreground)', opacity: 0.5 }}>
                              {world.description}
                            </p>
                          )}
                        </div>
                        <span className="font-mono text-[14px] shrink-0" style={{ color: 'var(--text-muted)' }}>→</span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>

            <div className="h-full hidden md:grid grid-rows-[auto_auto_1fr] grid-cols-1 md:grid-cols-[1fr_1fr] gap-[3px] rounded-lg overflow-hidden" style={{ border: '1px solid var(--border-color)' }}>

              {/* ROW 1 — Title bar */}
              <div className="p-3 sm:p-5 md:p-6 flex flex-col justify-between transition-colors duration-300" style={{ backgroundColor: 'var(--accent, #e4fe52)' }}>
                <span className="font-mono text-[11px] uppercase tracking-[2px]" style={{ color: 'var(--on-accent-muted)' }}>
                  worlds // constellation
                </span>
                <h1 className="font-basement font-black text-[clamp(32px,5vw,64px)] leading-[0.85] uppercase mt-2" style={{ color: 'var(--accent-text, #1a1a1a)' }}>
                  WORLDS
                </h1>
              </div>
              <div className="p-4 flex items-center justify-between" style={{ backgroundColor: 'var(--surface)', borderLeft: '1px solid var(--border-color)' }}>
                <div className="leading-snug">
                  <span className="font-mono text-[13px] block" style={{ color: 'var(--foreground)' }}>a world is a creator&apos;s scene — their projects, people, and plans.</span>
                  <span className="font-mono text-[13px] block opacity-70" style={{ color: 'var(--foreground)' }}>step inside any of them; watch the ones you love.</span>
                </div>
                <div className="w-12 h-12 rounded flex items-center justify-center shrink-0" style={{ backgroundColor: 'color-mix(in srgb, var(--foreground) 8%, transparent)' }}>
                  <img src="/brand/logo-white.png" alt="" className="w-8 h-8 opacity-40 dark:opacity-40" style={{ filter: isDark ? 'none' : 'invert(1)' }} />
                </div>
              </div>

              {/* ROW 2 — Navigation bar */}
              <div className="md:col-span-2 px-4 py-2 flex items-center justify-between" style={{ backgroundColor: 'var(--surface)', borderTop: '1px solid var(--border-color)', borderBottom: '1px solid var(--border-color)' }}>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="search..."
                    className="font-mono text-[12px] bg-transparent rounded outline-none w-32 focus:w-48 transition-all"
                    style={{ color: 'var(--foreground)', border: '1px solid var(--border-color)', padding: '4px 10px' }}
                  />
                  <span className="font-mono text-[12px]" style={{ color: 'var(--foreground)', opacity: 0.3 }}>←</span>
                  <span className="font-mono text-[13px] tracking-wider">
                    {active ? (
                      <><span style={{ color: 'var(--text-muted)' }}>world:</span> <span className={`font-bold ${COLOR_TEXT[activeColor]}`}>{active.title}</span></>
                    ) : (
                      <span style={{ color: 'var(--text-muted)' }}>hover a world to explore</span>
                    )}
                  </span>
                  <span className="font-mono text-[12px]" style={{ color: 'var(--foreground)', opacity: 0.3 }}>→</span>
                </div>
                <div className="flex gap-1.5">
                  {allWorlds.slice(0, 7).map((w) => (
                    <div key={w.slug} className={`w-1.5 h-1.5 rounded-full ${COLOR_DOT[getWorldConfig(w.slug).color]} ${activeWorld === w.slug ? 'scale-[2]' : 'opacity-40'} transition-all`} />
                  ))}
                  {allWorlds.length > 7 && <span className="font-mono text-[13px] ml-1" style={{ color: 'var(--text-muted)' }}>+{allWorlds.length - 7}</span>}
                </div>
              </div>

              {/* ROW 3 — Main content */}
              {/* Left: Galaxy Map + Ledger Index */}
              <div className={`${mapFullscreen ? 'md:col-span-2' : ''} grid ${mapFullscreen ? 'grid-rows-[1fr]' : 'grid-rows-[2fr_1fr]'} gap-[3px] overflow-hidden transition-all duration-500`}>
                {/* Galaxy Map */}
                <div className="relative h-[250px] sm:h-[300px] md:h-auto md:min-h-[200px]" style={{ backgroundColor: 'var(--surface)' }}>
                  <GalaxyMap
                    worlds={orbitWorlds}
                    activeWorld={activeWorld}
                    activeData={lastActive?.data ?? null}
                    activeColor={lastActive?.color ?? 'lime'}
                    onHover={handleHover}
                    onSelect={handleSelect}
                    expanded={mapFullscreen}
                    isDark={isDark}
                  />
                  <div className="absolute bottom-2 left-3">
                    <span className="font-mono text-[13px] uppercase tracking-wider deco-text" style={{ color: 'var(--foreground)', opacity: 0.15 }} data-deco="topia://constellation" />
                  </div>
                  <button
                    onClick={() => setMapFullscreen(!mapFullscreen)}
                    className="absolute top-3 right-3 z-[5] font-mono text-[12px] uppercase tracking-wider backdrop-blur-sm px-3 py-1.5 rounded transition-colors hover:opacity-80"
                    style={{ color: 'var(--text-muted)', backgroundColor: 'color-mix(in srgb, var(--background) 60%, transparent)' }}
                  >
                    {mapFullscreen ? '← exit' : '⛶ expand'}
                  </button>
                </div>

                {/* Ledger Index */}
                <div className={`relative overflow-y-auto max-h-[200px] sm:max-h-[240px] md:max-h-none ${mapFullscreen ? 'hidden' : ''}`} style={{ backgroundColor: 'var(--surface)', scrollbarWidth: 'thin', scrollbarColor: 'color-mix(in srgb, var(--foreground) 10%, transparent) transparent' }}>
                  {/* Crosshatch texture */}
                  <div className="absolute inset-0 opacity-[0.03] pointer-events-none"
                    style={{ backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 4px, var(--foreground) 4px, var(--foreground) 5px), repeating-linear-gradient(-45deg, transparent, transparent 4px, var(--foreground) 4px, var(--foreground) 5px)' }}
                  />
                  {/* Ruled lines */}
                  <div className="absolute inset-0 pointer-events-none opacity-[0.04]"
                    style={{ backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 39px, var(--foreground) 39px, var(--foreground) 40px)' }}
                  />
                  <div className="absolute top-0 bottom-0 left-[28px] w-[1px] pointer-events-none z-[1]" style={{ backgroundColor: 'color-mix(in srgb, var(--foreground) 6%, transparent)' }} />

                  <div className="relative z-10">
                    {filteredWorlds.map((world, i) => {
                      const color = getWorldConfig(world.slug).color;
                      const isActive = activeWorld === world.slug;
                      return (
                        <Link
                          key={world.slug}
                          href={`/worlds/${world.slug}`}
                          className="flex items-center no-underline cursor-pointer transition-all duration-150"
                          style={{
                            minHeight: '40px',
                            borderBottom: '1px solid var(--border-color)',
                            backgroundColor: isActive ? 'color-mix(in srgb, var(--foreground) 4%, transparent)' : 'transparent',
                          }}
                          onMouseEnter={() => setActiveWorld(world.slug)}
                          onMouseLeave={() => setActiveWorld(null)}
                        >
                          <div className="w-[28px] shrink-0 flex items-center justify-center">
                            <span className="font-mono text-[13px] deco-text" style={{ color: 'var(--foreground)', opacity: 0.15 }} data-deco={String(i + 1).padStart(2, '0')} />
                          </div>
                          <div className={`w-[2px] shrink-0 self-stretch ${COLOR_DOT[color]}`} />
                          <div className="flex-1 px-3 py-2 min-w-0">
                            <span className={`font-mono text-[13px] uppercase font-bold ${isActive ? COLOR_TEXT[color] : ''} transition-colors truncate block`} style={isActive ? {} : { color: 'var(--text-muted)' }}>
                              {world.title}
                            </span>
                          </div>
                          {world.creatorName && (
                            <span className="font-mono text-[13px] pr-3 shrink-0" style={{ color: 'var(--foreground)', opacity: 0.2 }}>{world.creatorName}</span>
                          )}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Right: Preview panel */}
              <div className={`overflow-hidden max-h-[280px] sm:max-h-[320px] md:max-h-none ${mapFullscreen ? 'hidden' : ''}`} style={{ borderLeft: '1px solid var(--border-color)' }}>
                {active ? (
                  <div className="h-full grid grid-rows-[1fr_auto]">
                    {/* Image area */}
                    <div className="relative overflow-hidden">
                      {active.imageUrl ? (
                        <img src={active.imageUrl} alt={active.title} className="w-full h-full object-cover" />
                      ) : (
                        <img src={GIF_MAP[activeColor]} alt="" className="w-full h-full object-cover" />
                      )}
                      <div className="absolute inset-0" style={{ background: `linear-gradient(to top, var(--surface), color-mix(in srgb, var(--surface) 20%, transparent), transparent)` }} />
                      <div className="absolute bottom-0 left-0 right-0 p-5">
                        <div className="flex items-center gap-2 mb-2">
                          <div className={`w-2 h-2 rounded-full ${COLOR_DOT[activeColor]}`} />
                          {active.creatorName && <span className="font-mono text-[13px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{active.creatorName}</span>}
                        </div>
                        <h2 className="font-basement font-black text-[clamp(24px,3vw,36px)] uppercase leading-[0.9]" style={{ color: 'var(--foreground)' }}>
                          {active.title}
                        </h2>
                      </div>
                    </div>

                    {/* Bottom detail bar */}
                    <div className="grid grid-cols-[1fr_auto]" style={{ borderTop: '1px solid var(--border-color)' }}>
                      <div className="p-4">
                        <p className="font-mono text-[13px] leading-relaxed mb-3" style={{ color: 'var(--foreground)', opacity: 0.4 }}>
                          {active.description || 'A world in the TOPIA constellation.'}
                        </p>
                        <div className="flex gap-2">
                          {['ecosystem', 'culture', 'community'].map(tag => (
                            <span key={tag} className="font-mono text-[13px] uppercase tracking-wider px-2 py-0.5 rounded" style={{ color: 'var(--foreground)', opacity: 0.2, border: '1px solid var(--border-color)' }}>{tag}</span>
                          ))}
                        </div>
                      </div>
                      <Link
                        href={`/worlds/${active.slug}`}
                        className={`flex items-center justify-center px-6 no-underline transition-opacity hover:opacity-80 ${getWorldConfig(active.slug).bg}`}
                      >
                        <span className={`font-mono text-[12px] uppercase tracking-wider font-bold ${getWorldConfig(active.slug).textOn}`}>
                          enter →
                        </span>
                      </Link>
                    </div>
                  </div>
                ) : (
                  <div className="h-full relative overflow-hidden">
                    <video src="/brand/vhs-loop.mp4" autoPlay loop muted playsInline className="w-full h-full object-cover" />
                    <div className="absolute inset-0 pointer-events-none z-[2] opacity-[0.05]"
                      style={{ background: `repeating-linear-gradient(0deg, transparent, transparent 2px, color-mix(in srgb, var(--foreground) 30%, transparent) 2px, color-mix(in srgb, var(--foreground) 30%, transparent) 4px)` }}
                    />
                    <div className="absolute inset-0 pointer-events-none z-[3]"
                      style={{ boxShadow: 'inset 0 0 60px rgba(0,0,0,0.4)' }}
                    />
                    <div className="absolute bottom-0 left-0 right-0 z-[4] p-5" style={{ background: `linear-gradient(to top, color-mix(in srgb, var(--surface) 90%, transparent), color-mix(in srgb, var(--surface) 40%, transparent), transparent)` }}>
                      <span className="font-mono text-[11px] uppercase tracking-wider block mb-2" style={{ color: 'var(--foreground)', opacity: 0.3 }}>featured</span>
                      <span className="font-basement font-black text-[clamp(24px,2.5vw,28px)] uppercase" style={{ color: 'var(--foreground)', opacity: 0.8 }}>EXPLORE THE CONSTELLATION</span>
                      <span className="font-mono text-[12px] block mt-2" style={{ color: 'var(--text-muted)' }}>hover a world to preview</span>
                    </div>
                  </div>
                )}
              </div>

            </div>
          </div>
        </section>
      </PageShell>
    </div>
  );
}
