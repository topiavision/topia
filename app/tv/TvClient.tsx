'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import PageShell from '../components/PageShell';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';

const CATEGORIES = ['All', 'Featured', 'Live', 'Series', 'Replays'];
const CAT_COLOR: Record<string, { dot: string; text: string; bg: string; textOn: string; border: string }> = {
  Featured: { dot: 'bg-lime',   text: 'text-lime',   bg: 'bg-lime',   textOn: 'text-obsidian', border: 'border-l-lime' },
  Live:     { dot: 'bg-pink',   text: 'text-pink',   bg: 'bg-pink',   textOn: 'text-ink',     border: 'border-l-pink' },
  Series:   { dot: 'bg-blue',   text: 'text-blue',   bg: 'bg-blue',   textOn: 'text-ink',     border: 'border-l-blue' },
  Replays:  { dot: 'bg-orange', text: 'text-orange', bg: 'bg-orange', textOn: 'text-ink',     border: 'border-l-orange' },
};

interface Episode {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  category: string;
  seriesSlug: string | null;
  seriesTitle: string | null;
  episodeNumber: number | null;
  partNumber: number | null;
  videoUrl: string;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
  guestName: string | null;
}

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/* Format an episode index → "001", "002", "010"… These are on-demand
 * programs, not scheduled airings, so we show numbers instead of fake
 * timeslots in the guide. */
function episodeNo(i: number): string {
  return String(i + 1).padStart(3, '0');
}

// Initial episodes come server-rendered from page.tsx so the player (the LCP
// element) is in the initial HTML; the client fetch only runs as a fallback.
export default function TvClient({ initialEpisodes }: { initialEpisodes: Episode[] }) {
  const [activeCategory, setActiveCategory] = useState('All');
  const [activeEp, setActiveEp] = useState<Episode | null>(initialEpisodes[0] ?? null);
  const [searchQuery, setSearchQuery] = useState('');
  const [episodes, setEpisodes] = useState<Episode[]>(initialEpisodes);
  const [loading, setLoading] = useState(initialEpisodes.length === 0);

  // Player state. TOPIA TV autoplays MUTED by default (reliable across
  // browsers, and avoids blasting sound at visitors). A "Tap to unmute"
  // overlay nudges viewers to restore sound. See the autoplay effect below.
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(true);
  const [needsUnmute, setNeedsUnmute] = useState(false);
  const [controlsHidden, setControlsHidden] = useState(false);
  const [volume, setVolume] = useState(0.85);

  /* ── Load episodes + auto-select the first one so the channel
        starts playing the moment the page is ready. 10s timeout so a hung
        request shows a retry instead of spinning forever. ────────────── */
  const [loadError, setLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  useEffect(() => {
    // Server-rendered episodes are already in state; only fetch when SSR gave
    // us none (DB hiccup) or the viewer explicitly hit retry.
    if (initialEpisodes.length > 0 && loadAttempt === 0) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(false);
    fetchWithTimeout('/api/tv/episodes')
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        const eps: Episode[] = json.episodes ?? [];
        setEpisodes(eps);
        if (eps.length > 0) setActiveEp(eps[0]);
      })
      .catch((err) => {
        console.error('tv episodes load failed', err);
        if (!cancelled) setLoadError(true);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [loadAttempt]);

  /* ── Filtering ───────────────────────────────────────── */
  const filtered = useMemo(() => {
    let list = episodes;
    if (activeCategory !== 'All') list = list.filter((e) => e.category === activeCategory);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter((e) =>
        e.title.toLowerCase().includes(q) ||
        (e.seriesTitle ?? '').toLowerCase().includes(q) ||
        (e.guestName ?? '').toLowerCase().includes(q),
      );
    }
    return list;
  }, [episodes, activeCategory, searchQuery]);

  /* ── Reset + autoplay (muted) when the active episode changes ──
        Muted autoplay is always allowed by browsers, so this just works.
        We show the "Tap to unmute" overlay so viewers can restore sound. */
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !activeEp) return;
    setCurrentTime(0);
    setDuration(0);
    setPlaying(false);
    v.muted = true;
    setMuted(true);
    v.volume = volume;
    v.load();
    const tryPlay = async () => {
      try {
        await v.play();
        setNeedsUnmute(true); // muted by default — invite the viewer to unmute
      } catch {
        // Even muted autoplay blocked — user will press play manually.
        setNeedsUnmute(false);
      }
    };
    void tryPlay();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeEp?.id]);

  /* ── Player controls ────────────────────────────────── */
  function togglePlay() {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => {});
    else v.pause();
  }
  function skip(seconds: number) {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.max(0, Math.min(v.duration || 0, v.currentTime + seconds));
  }
  function seek(pct: number) {
    const v = videoRef.current;
    if (!v || !v.duration) return;
    v.currentTime = pct * v.duration;
  }
  function toggleMute() {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
    if (!v.muted) setNeedsUnmute(false);
  }
  function changeVolume(val: number) {
    const v = videoRef.current;
    setVolume(val);
    if (!v) return;
    v.volume = val;
    if (val > 0 && v.muted) { v.muted = false; setMuted(false); }
  }
  function toggleFullscreen() {
    const v = videoRef.current;
    if (!v) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else v.requestFullscreen?.();
  }

  /* ── Derived ─────────────────────────────────────────── */
  const c = activeEp ? CAT_COLOR[activeEp.category] || CAT_COLOR.Featured : null;
  const progressPct = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;
  const displayDuration = duration > 0
    ? formatTime(duration)
    : activeEp?.durationSeconds ? formatTime(activeEp.durationSeconds) : '—:—';

  return (
    <PageShell>
      <section className="min-h-screen bg-[#f5f0e8] px-4 md:px-6 py-4 md:py-6">
        <div className="max-w-[var(--content-max)] mx-auto min-h-[700px] md:h-[calc(100vh-var(--nav-height)-48px)]">
          <div className="h-full grid grid-rows-[auto_auto_1fr] grid-cols-1 md:grid-cols-[2fr_1fr] gap-[3px] border border-obsidian/15 rounded-lg overflow-hidden bg-ink/20">

            {/* ROW 1 — Header */}
            <div className="p-4 flex flex-col justify-between transition-colors duration-300" style={{ backgroundColor: 'var(--accent, #e4fe52)' }}>
              <span className="font-mono text-[12px] uppercase tracking-[2px] opacity-50" style={{ color: 'var(--accent-text, #1a1a1a)' }}>tv // watch</span>
              <h1 className="font-basement font-black text-[clamp(24px,3vw,36px)] leading-[0.85] uppercase mt-1" style={{ color: 'var(--accent-text, #1a1a1a)' }}>TOPIA TV.</h1>
            </div>
            <div className="bg-[var(--page-bg)] px-4 py-3 flex flex-col justify-center">
              {/* One channel for now — the collective feed. Per-user channels
                  can bring a mode toggle back when they actually exist. */}
              <div className="flex items-center gap-2 mb-1">
                <span className="font-mono text-[13px] uppercase tracking-wider px-2 py-0.5 text-ink bg-ink/15">
                  Collective
                </span>
              </div>
              <span className="font-mono text-[12px] text-ink/40 tracking-wider">
                {activeEp ? (
                  <><span className="text-ink/20">now playing:</span> <span className={`font-bold ${c?.text}`}>{activeEp.title}</span></>
                ) : <span className="text-ink/20">select a program</span>}
              </span>
            </div>

            {/* ROW 2 — Category tabs + Search. Wraps on mobile so no chip or
                the search field ever pushes past the viewport. */}
            <div className="md:col-span-2 bg-[var(--page-bg)] border-t border-b border-ink/[0.04] px-4 py-2 flex items-center justify-between gap-2 flex-wrap md:flex-nowrap">
              <div className="flex items-center gap-1.5 flex-wrap">
                {CATEGORIES.map((cat) => {
                  const cc = cat !== 'All' ? CAT_COLOR[cat] : null;
                  const isActive = activeCategory === cat;
                  return (
                    <button key={cat} onClick={() => setActiveCategory(cat)}
                      className={`font-mono text-[13px] uppercase tracking-wider px-2 py-1 transition-all bg-transparent border-none cursor-pointer ${isActive ? `${cc ? cc.text : 'text-ink'} bg-ink/15` : 'text-ink/50 hover:text-ink'}`}>
                      {cat}
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="search..."
                  className="font-mono text-[11px] bg-transparent border border-ink/[0.06] focus:border-ink/20 text-ink/60 placeholder:text-ink/15 px-2.5 py-1 rounded outline-none w-28 focus:w-40 transition-all"
                />
                <span className="font-mono text-[12px] text-ink/15 hidden md:inline shrink-0">
                  {loading ? '…' : `${filtered.length} program${filtered.length === 1 ? '' : 's'}`}
                </span>
              </div>
            </div>

            {/* ROW 3 — Main: TV (left) + Guide (right) */}

            {/* THE TV */}
            <div className="bg-[var(--page-bg)] p-4 md:p-6 flex items-center justify-center min-h-[300px]">
              <div className="relative w-full h-full rounded-lg overflow-hidden" style={{ border: '1px solid var(--border-color)' }}>
                <div className="relative w-full h-full rounded overflow-hidden bg-[var(--page-bg)]">
                  {activeEp ? (
                    // Real video — keeps event handlers tied to the ref.
                    // Autoplay is managed imperatively in the effect on
                    // activeEp.id (we attempt unmuted; on rejection we
                    // mute + retry and show the "Tap to unmute" overlay).
                    // We omit the JSX `muted` prop so React doesn't keep
                    // flipping it back during reconciles.
                    <video
                      ref={videoRef}
                      key={activeEp.id}
                      src={activeEp.videoUrl}
                      poster={activeEp.thumbnailUrl ?? undefined}
                      className="w-full h-full object-cover"
                      preload="metadata"
                      // LCP element — prioritize its fetch (types lag React 19)
                      {...({ fetchPriority: 'high' } as unknown as React.VideoHTMLAttributes<HTMLVideoElement>)}
                      playsInline
                      onPlay={() => setPlaying(true)}
                      onPause={() => setPlaying(false)}
                      onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
                      onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
                      onEnded={() => setPlaying(false)}
                      onClick={togglePlay}
                    />
                  ) : (
                    // Idle channel — bumper loop
                    <video src="/brand/vhs-loop.mp4" autoPlay loop muted playsInline className="w-full h-full object-cover" />
                  )}

                  {/* Decorative overlays */}
                  <div className="absolute inset-0 pointer-events-none z-[2] opacity-[0.08]" style={{ background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.3) 2px, rgba(0,0,0,0.3) 4px)' }} />
                  <div className="absolute inset-0 pointer-events-none z-[3]" style={{ background: 'linear-gradient(135deg, rgba(245,240,232,0.03) 0%, transparent 50%, transparent 100%)' }} />
                  <div className="absolute inset-0 pointer-events-none z-[4]" style={{ boxShadow: 'inset 0 0 80px rgba(0,0,0,0.5)' }} />

                  {/* Category pill */}
                  <div className="absolute top-3 left-3 z-[5]">
                    {activeEp && !controlsHidden && (
                      <div className={`${c?.bg} px-2 py-1 rounded-sm`}>
                        <span className={`font-mono text-[13px] font-bold uppercase ${c?.textOn}`}>{activeEp.category}</span>
                      </div>
                    )}
                  </div>

                  {/* "Tap to unmute" affordance — only when the browser
                      forced us to mute the autoplay. Click → unmutes and
                      hides itself. */}
                  {activeEp && playing && needsUnmute && (
                    <button
                      onClick={() => {
                        const v = videoRef.current;
                        if (!v) return;
                        v.muted = false;
                        v.volume = volume || 0.85;
                        setMuted(false);
                        setNeedsUnmute(false);
                      }}
                      className="absolute top-3 right-3 z-[6] inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[2px] bg-lime text-obsidian px-2.5 py-1.5 rounded-sm cursor-pointer transition hover:opacity-90 border-none animate-pulse"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>
                      Tap to unmute
                    </button>
                  )}

                  {/* Center play button overlay when paused + episode loaded */}
                  {activeEp && !playing && (
                    <button
                      onClick={togglePlay}
                      className="absolute inset-0 z-[5] flex items-center justify-center bg-transparent border-none cursor-pointer group"
                      aria-label="Play"
                    >
                      <div className="w-16 h-16 rounded-full bg-ink/15 backdrop-blur-sm border border-ink/40 flex items-center justify-center group-hover:bg-ink/25 transition">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" className="text-ink ml-1"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                      </div>
                    </button>
                  )}

                  {/* Bottom overlay: title + controls (hidden via the toggle) */}
                  {(!controlsHidden || !activeEp) && (
                  <div className="absolute bottom-0 left-0 right-0 z-[5] bg-gradient-to-t from-black/95 via-black/50 to-transparent p-4">
                    {activeEp ? (
                      <>
                        <div className="flex items-end justify-between mb-3 gap-3">
                          <div className="min-w-0">
                            {activeEp.seriesTitle && (
                              <span className="font-mono text-[10px] uppercase tracking-[2px] text-ink/40 block mb-1 truncate">
                                {activeEp.seriesTitle}{activeEp.episodeNumber ? ` · EP ${String(activeEp.episodeNumber).padStart(3, '0')}` : ''}{activeEp.partNumber ? ` · PART ${activeEp.partNumber === 1 ? 'I' : activeEp.partNumber === 2 ? 'II' : activeEp.partNumber}` : ''}
                              </span>
                            )}
                            <h2 className={`font-basement font-black uppercase text-ink leading-[0.9] line-clamp-2 ${activeEp.title.length > 45 ? 'text-[clamp(15px,1.8vw,22px)]' : activeEp.title.length > 28 ? 'text-[clamp(18px,2.2vw,28px)]' : 'text-[clamp(22px,2.8vw,36px)]'}`}>{activeEp.title}</h2>
                            {activeEp.guestName && (
                              <span className="font-mono text-[11px] text-ink/50 tracking-wider mt-1 block">w/ {activeEp.guestName}</span>
                            )}
                          </div>
                          <button
                            onClick={togglePlay}
                            className={`${c?.bg} px-4 py-2 rounded-sm shrink-0 hover:opacity-80 transition-opacity border-none cursor-pointer`}
                          >
                            <span className={`font-mono text-[11px] uppercase tracking-wider font-bold ${c?.textOn}`}>{playing ? '❚❚ pause' : 'watch →'}</span>
                          </button>
                        </div>

                        {/* Seek bar */}
                        <div
                          className="w-full h-[3px] bg-ink/20 rounded-full mb-3 group cursor-pointer relative"
                          onClick={(e) => {
                            const rect = e.currentTarget.getBoundingClientRect();
                            seek((e.clientX - rect.left) / rect.width);
                          }}
                        >
                          <div className="h-full rounded-full bg-ink transition-[width] duration-100" style={{ width: `${progressPct}%` }} />
                        </div>

                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <div className="flex items-center gap-3">
                            <button onClick={() => skip(-10)} className="text-ink hover:opacity-70 transition-opacity bg-transparent border-none cursor-pointer" title="Back 10s">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12.5 3L2 12l10.5 9V3zm11 0L13 12l10.5 9V3z"/></svg>
                            </button>
                            <button onClick={togglePlay} className="w-8 h-8 rounded-full border border-ink/30 hover:bg-ink/10 flex items-center justify-center transition-colors bg-transparent cursor-pointer" title={playing ? 'Pause' : 'Play'}>
                              {playing ? (
                                <svg width="10" height="12" viewBox="0 0 10 12"><rect x="0" y="0" width="3.5" height="12" fill="currentColor" className="text-ink" /><rect x="6.5" y="0" width="3.5" height="12" fill="currentColor" className="text-ink" /></svg>
                              ) : (
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" className="text-ink ml-0.5"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                              )}
                            </button>
                            <button onClick={() => skip(10)} className="text-ink hover:opacity-70 transition-opacity bg-transparent border-none cursor-pointer" title="Forward 10s">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M11.5 3v18L22 12 11.5 3zm-11 0v18L11 12 .5 3z"/></svg>
                            </button>
                            <span className="font-mono text-[13px] text-ink tabular-nums">
                              {formatTime(currentTime)} / {displayDuration}
                            </span>
                          </div>

                          <div className="flex items-center gap-3">
                            <div className="flex items-center gap-1.5">
                              <button onClick={toggleMute} className="text-ink hover:opacity-70 transition-opacity bg-transparent border-none cursor-pointer" title={muted ? 'Unmute' : 'Mute'}>
                                {muted ? (
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>
                                ) : (
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 010 7.07"/></svg>
                                )}
                              </button>
                              <input
                                type="range"
                                min={0} max={1} step={0.05}
                                value={muted ? 0 : volume}
                                onChange={(e) => changeVolume(parseFloat(e.target.value))}
                                className="w-16 h-[2px] accent-ink"
                                aria-label="Volume"
                              />
                            </div>
                            <button onClick={toggleFullscreen} className="text-ink hover:opacity-70 transition-opacity bg-transparent border-none cursor-pointer" title="Fullscreen">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3"/></svg>
                            </button>
                            <button onClick={() => setControlsHidden(true)} className="text-ink hover:opacity-70 transition-opacity bg-transparent border-none cursor-pointer" title="Hide controls">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                            </button>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div>
                        <span className="font-basement font-black text-[clamp(24px,2vw,28px)] uppercase text-ink/60">NOW STREAMING</span>
                        <span className="font-mono text-[13px] text-ink/25 block mt-1">select a program from the guide →</span>
                      </div>
                    )}
                  </div>
                  )}

                  {/* Floating "show controls" button when hidden */}
                  {activeEp && controlsHidden && (
                    <button
                      onClick={() => setControlsHidden(false)}
                      className="absolute bottom-3 right-3 z-[7] inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[1.5px] bg-ink/15 backdrop-blur-sm text-ink border border-ink/30 px-2.5 py-1.5 rounded-sm cursor-pointer hover:bg-ink/25 transition"
                      title="Show controls"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                      Controls
                    </button>
                  )}
                </div>

                {/* "Power" indicator */}
                <div className="absolute bottom-[-1px] left-1/2 -translate-x-1/2 z-10">
                  <div className={`w-2 h-1 rounded-t-sm ${activeEp ? 'bg-lime' : 'bg-red-500'} opacity-60`} />
                </div>
              </div>
            </div>

            {/* TV GUIDE */}
            <div className="relative bg-[var(--page-bg)] overflow-y-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(245,240,232,0.1) transparent' }}>
              <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(245,240,232,1) 4px, rgba(245,240,232,1) 5px), repeating-linear-gradient(-45deg, transparent, transparent 4px, rgba(245,240,232,1) 4px, rgba(245,240,232,1) 5px)' }} />
              <div className="absolute inset-0 pointer-events-none opacity-[0.04]" style={{ backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 47px, rgba(245,240,232,1) 47px, rgba(245,240,232,1) 48px)' }} />

              <div className="relative z-10 px-3 py-2 border-b border-ink/[0.06]">
                <span className="font-mono text-[12px] uppercase tracking-[2px] text-ink/25">tv guide // {loading ? '…' : `${filtered.length} programs`}</span>
              </div>

              <div className="relative z-10">
                {loading ? (
                  <div className="py-12 text-center">
                    <span className="font-mono text-[12px] uppercase tracking-[2px] text-ink/25">loading…</span>
                  </div>
                ) : loadError && episodes.length === 0 ? (
                  <div className="py-12 px-4 text-center">
                    <span className="font-mono text-[12px] uppercase tracking-[2px] text-[var(--text-muted)] block">couldn&rsquo;t load the channel</span>
                    <button onClick={() => setLoadAttempt((n) => n + 1)} className="mt-3 font-mono text-[11px] uppercase tracking-[2px] text-[var(--accent-ink)] hover:opacity-70 bg-transparent border-none cursor-pointer">
                      retry
                    </button>
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="py-12 px-4 text-center">
                    <span className="font-mono text-[12px] uppercase tracking-[2px] text-ink/25 block">no programs match</span>
                    {searchQuery && (
                      <button onClick={() => setSearchQuery('')} className="mt-3 font-mono text-[11px] uppercase tracking-[2px] text-[var(--accent-ink)] hover:opacity-70 bg-transparent border-none cursor-pointer">
                        clear search
                      </button>
                    )}
                  </div>
                ) : filtered.map((item, i) => {
                  const ic = CAT_COLOR[item.category] || CAT_COLOR.Featured;
                  const isActive = activeEp?.id === item.id;
                  const dur = item.durationSeconds ? formatTime(item.durationSeconds) : '—:—';
                  return (
                    <div
                      key={item.id}
                      role="button"
                      tabIndex={0}
                      className={`flex items-stretch border-b border-ink/[0.04] cursor-pointer transition-all duration-150 ${isActive ? 'bg-ink/[0.06]' : 'hover:bg-ink/[0.03]'}`}
                      onClick={() => setActiveEp(item)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setActiveEp(item); } }}
                    >
                      <div className={`w-1 shrink-0 ${ic.dot}`} />

                      {/* Episode number — replaces the old fake time-slot.
                          TOPIA TV is on-demand, not scheduled airings. */}
                      <div className="w-14 shrink-0 px-2 py-3 flex items-center justify-center border-r border-ink/[0.04]">
                        <span className={`font-basement font-black text-[15px] tracking-wider ${isActive ? ic.text : 'text-ink/30'} transition-colors`}>
                          {episodeNo(i)}
                        </span>
                      </div>

                      <div className="flex-1 px-3 py-3 min-w-0">
                        <span className={`font-mono text-[12px] font-bold block truncate ${isActive ? ic.text : 'text-ink'} transition-colors`}>{item.title}</span>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="font-mono text-[12px] text-ink/30">{item.category}</span>
                          <span className="font-mono text-[12px] text-ink/20">·</span>
                          <span className="font-mono text-[12px] text-ink/30">{dur}</span>
                          {item.guestName && (
                            <>
                              <span className="font-mono text-[12px] text-ink/20">·</span>
                              <span className="font-mono text-[12px] text-ink/30 truncate">{item.guestName}</span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Thumbnail — prefer an explicit thumbnailUrl image
                          when set, otherwise render the video's first frame
                          via <video preload="metadata">. No placeholder
                          GIFs, no extra storage step. */}
                      <div className="w-16 h-12 shrink-0 overflow-hidden my-1 mr-2 rounded-sm bg-ink/[0.04]">
                        {item.thumbnailUrl ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img src={item.thumbnailUrl} alt="" className="w-full h-full object-cover opacity-80" />
                        ) : (
                          <video
                            src={item.videoUrl}
                            className="w-full h-full object-cover opacity-80"
                            preload="metadata"
                            muted
                            playsInline
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="relative z-10 px-3 py-2 border-t border-ink/[0.06]">
                <span className="font-mono text-[12px] text-ink/15 uppercase tracking-wider">topia://tv</span>
              </div>
            </div>

          </div>
        </div>
      </section>
    </PageShell>
  );
}
