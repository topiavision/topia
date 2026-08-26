'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import gsap from 'gsap';
import { Draggable } from 'gsap/Draggable';
import { PATH_CONFIG, resolvePath, type UserPath } from '../profile/pathConfig';
import FitText from '../profile/FitText';
import BlobImage from '../BlobImage';

export interface LoopProfile {
  id: string;
  username: string | null;
  name: string | null;
  avatarUrl: string | null;
  roleTags: string | null;
  path: string | null;
  isWorldBuilder?: boolean;
  createdAt?: string;
}

interface Props {
  profiles: LoopProfile[];
  /** Show the "complete your profile" nudge card in the lineup. */
  showCompleteCta?: boolean;
}

// Brand star mark (public/brand/logo.svg) — same path TopiaCard uses.
const LOGO_PATH = 'M248.244 0L249.567 0.534218C253.772 5.33588 268.237 51.6617 271.697 60.619C284.721 62.5024 301.944 69.6949 312.074 78.5385C334.862 70.9857 439.759 43.3727 459.298 46.3637C461.484 46.6985 462.317 47.3396 463.571 49.0776C465.702 60.2407 418.051 96.8812 407.934 104.568C398.897 111.44 364.575 134.502 361.352 143.426C360.265 146.449 361.346 149.374 363.035 151.895C367.19 158.093 376.047 165.05 381.599 170.415C393.226 181.651 464.838 248.37 466.894 253.53C467.503 255.059 467.372 255.385 466.745 256.79C464.751 257.837 462.31 257.453 460.273 256.646C447.845 251.725 434.926 245.672 422.753 240.223L344.023 204.894C333.831 200.33 316.223 191.852 306.099 189.27C293.771 205.447 277.044 216.059 259.418 225.553C262.722 206.006 266.939 198.44 280.616 183.724C253.176 201.589 251.517 218.376 246.822 248.511L240.052 290.743C239.381 294.816 238.307 307.771 233.965 308.234C229.102 305.491 216.287 266.833 213.231 258.28C211.027 251.366 208.603 244.524 205.962 237.765C190.337 237.905 177.772 234.302 163.662 228.192C150.793 231.326 138.046 235.939 125.301 239.61C107.921 244.617 22.5531 267.918 11.5262 261.181C10.399 260.492 9.91204 259.752 9.6754 258.429C7.76243 247.734 60.1691 206.796 70.5041 198.825C79.5652 191.839 97.6129 180.372 103.89 171.683C106.356 168.27 107.214 164.968 105.426 161.031C101.754 152.946 89.7704 143.608 83.1539 137.198L35.7116 91.749C29.2976 85.7031 1.00058 60.5289 0 54.5035C1.84713 51.5213 5.91839 52.8537 8.69903 54.0432C54.5271 73.6443 99.6694 95.0959 145.538 114.571C166.759 87.3145 183.573 75.3569 217.473 64.2429C220.258 63.3298 224.912 61.8744 227.492 63.2291C227.084 64.5845 226.105 66.0362 224.718 66.4996C205.103 73.0791 184.079 82.0028 170.459 98.2129C162.061 108.208 164.898 116.703 177.611 118.819C188.237 120.588 193.362 118.159 203.182 116.633L203.824 117.256L203.017 119.542L203.641 119.496L203.042 119.552L203.057 119.215L204.14 119.187C218.667 109.653 225.494 99.9361 231.642 83.452C237.108 68.8023 241.375 9.82322 247.915 0.464021L248.244 0ZM127.123 170.093C115.992 179.188 104.264 188.198 95.9739 199.982C93.7969 202.864 91.6573 205.924 92.3212 209.741C92.6628 211.705 93.7932 213.388 95.449 214.493C105.763 221.372 141.135 213.987 152.546 211.191C177.85 204.991 202.285 196.759 226.506 187.192C264.368 172.237 351.352 131.884 371.972 97.5477C373.482 95.0332 374.438 92.2019 375.419 89.4482C369.854 79.3243 362.37 81.1984 352.097 81.3823C343.178 81.6637 327.813 85.1615 318.664 87.0356C321.999 94.7953 331.85 115.583 328.968 124.298C327.819 127.766 315.478 134.659 311.602 136.988C269.119 162.33 223.691 182.369 176.333 196.657C164.044 200.304 149.084 203.651 136.324 203.945C129.054 187.856 129.113 187.892 127.123 170.093ZM135.125 166.47C140.35 159.41 159.48 132.169 152.141 124.272C150.467 123.501 150.138 123.303 148.314 123.174C138.823 130.001 128.168 155.269 132.383 166.421L133.306 167.331C134.698 167.072 134.124 167.376 135.125 166.47ZM295.857 79.5722C295.137 73.4058 279.032 67.3009 273.833 65.3511C278.374 76.6608 282.609 81.8463 295.857 79.5722Z';

// Full TopiaCard proportions — this deck is the hero of the section.
const CARD_W = 300;
const CARD_H = 375;
// Auto-advance one card this often until the visitor interacts.
const AUTO_ADVANCE_MS = 3000;

/* eslint-disable @typescript-eslint/no-explicit-any */
// GSAP's buildSeamlessLoop helper — the engine behind the GreenSock
// "seamless loop" cards CodePen this deck replicates. Every card runs the
// same staggered animation and the sequence is tripled so the playhead can
// loop through the middle copy forever without a seam.
function buildSeamlessLoop(items: HTMLElement[], spacing: number, animateFunc: (el: HTMLElement) => gsap.core.Timeline) {
  const rawSequence = gsap.timeline({ paused: true });
  const seamlessLoop = gsap.timeline({
    paused: true,
    repeat: -1,
    onRepeat(this: any) {
      if (this._time === this._dur) this._tTime += this._dur - 0.01;
    },
    onReverseComplete(this: any) {
      this.totalTime(this.rawTime() + this.duration() * 100);
    },
  });
  const cycleDuration = spacing * items.length;
  let dur = 0;

  items.concat(items).concat(items).forEach((_, i) => {
    const anim = animateFunc(items[i % items.length]);
    rawSequence.add(anim, i * spacing);
    if (!dur) dur = anim.duration();
  });

  seamlessLoop.fromTo(
    rawSequence,
    { time: cycleDuration + dur / 2 },
    { time: '+=' + cycleDuration, duration: cycleDuration, ease: 'none' }
  );
  return seamlessLoop;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

function accentFor(p: LoopProfile): string {
  const roleTags = (p.roleTags ?? '').split(',').map((t) => t.trim()).filter(Boolean);
  const resolved = resolvePath(p.path, roleTags, !!p.isWorldBuilder);
  return (PATH_CONFIG[resolved as UserPath] ?? PATH_CONFIG.anchor).hex;
}

// One passport card — the same design language (and size) as TopiaCard, the
// shareable identity card. Names are never truncated: long ones wrap at a
// smaller size instead. A slight 3D tilt lifts the card on hover.
function PassportCard({ p }: { p: LoopProfile }) {
  const roleTags = (p.roleTags ?? '').split(',').map((t) => t.trim()).filter(Boolean);
  const resolved = resolvePath(p.path, roleTags, !!p.isWorldBuilder);
  const cfg = PATH_CONFIG[resolved as UserPath] ?? PATH_CONFIG.anchor;
  const accent = cfg.hex;
  const onAccent = resolved === 'worldbuilder' ? '#0a0a0a' : '#f5f0e8';
  const initial = (p.name || p.username || '?')[0]?.toUpperCase() ?? '?';
  const issued = p.createdAt ? new Date(p.createdAt).getFullYear() : new Date().getFullYear();
  const displayName = p.name || `@${p.username}`;

  return (
    <div
      className="relative w-full h-full rounded-2xl overflow-hidden transition-transform duration-300 ease-out group-hover:[transform:perspective(900px)_rotateX(5deg)_rotateY(-7deg)_translateY(-6px)]"
      style={{
        background: '#0f0f0f',
        border: `1px solid ${accent}55`,
        boxShadow: `0 30px 60px -20px rgba(0,0,0,0.7), 0 0 40px -12px ${accent}66`,
      }}
    >
      {/* path glow */}
      <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(circle at 50% 30%, ${accent}33 0%, transparent 60%)` }} />

      <div className="relative h-full flex flex-col p-5">
        <div className="flex items-center justify-between">
          <svg width="34" height="22" viewBox="0 0 468 309" fill="none" aria-hidden>
            <path d={LOGO_PATH} fill={accent} />
          </svg>
          <span className="font-mono text-[8px] tracking-[2px] uppercase text-bone/40">identity</span>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center min-h-0">
          <div className="w-24 h-24 rounded-full overflow-hidden flex items-center justify-center shrink-0" style={{ border: `3px solid ${accent}`, background: '#161616' }}>
            {p.avatarUrl ? (
              // 96px circle → request 192px for retina instead of the full upload
              <BlobImage src={p.avatarUrl} alt="" width={192} height={192} sizes="96px" draggable={false} className="w-full h-full object-cover" />
            ) : (
              <span className="font-basement font-black text-[40px] text-bone/50">{initial}</span>
            )}
          </div>
          <FitText
            text={displayName}
            maxSize={26}
            minSize={14}
            className="font-basement font-black uppercase text-bone mt-4 text-center px-2 break-words w-full"
          />
          <div className="font-mono text-[11px] text-bone/55 mt-1 break-all text-center px-2 max-w-full">@{p.username}</div>
          <div className="mt-3 font-mono text-[9px] font-bold tracking-[3px] uppercase px-3 py-1 rounded" style={{ background: accent, color: onAccent }}>{cfg.label}</div>
          {roleTags.length > 0 && (
            <div className="font-mono text-[8px] tracking-[2px] uppercase text-bone/40 mt-3 text-center px-2 max-w-full">
              {roleTags.slice(0, 3).map((r) => r.replace(/-/g, ' ')).join('  ·  ')}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between font-mono text-[8px] tracking-[2px] uppercase text-bone/35">
          <span>issued {issued}</span>
          <span>topia.vision</span>
        </div>
      </div>
    </div>
  );
}

// The DISCOVER deck: TOPIA passport cards fanned through a 3D center stage
// over a giant TOPIANS wordmark — the GreenSock seamless-loop treatment.
// Auto-advances one card every few seconds until the visitor interacts, then
// it's all theirs: drag/flick, horizontal trackpad scrub, or arrow keys.
export default function PassportLoop({ profiles, showCompleteCta = false }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const draggedRef = useRef(false);
  const [interacted, setInteracted] = useState(false);
  // Reduced-motion users get a plain scrollable strip instead of the deck.
  const [staticMode, setStaticMode] = useState(false);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) setStaticMode(true);
  }, []);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap || staticMode || profiles.length === 0) return;
    const items = gsap.utils.toArray<HTMLElement>('.passport-item', wrap);
    if (items.length < 3) return;

    gsap.registerPlugin(Draggable);

    // Cards server-render VISIBLE (stacked on the center stage) so the section
    // is never a full-viewport blank hole before hydration / if JS dies.
    // GSAP owns opacity from here: hide them all, then seamlessLoop.time(0)
    // below immediately renders the proper fanned-out states.
    gsap.set(items, { opacity: 0 });

    // Ambient glow colors, aligned with the deck order (CTA card is lime).
    const accents = items.map((el) => {
      const idAttr = el.getAttribute('data-profile');
      const p = profiles.find((x) => x.id === idAttr);
      return p ? accentFor(p) : '#e4fe52';
    });

    // Cover-flow through the center: cards travel right → left while tilting
    // in perspective. Opacity fades linearly (not eased) and the stagger is
    // tight, so the stage reads as a crowded spread — a dozen-plus cards
    // overlapping shoulder-to-shoulder around the center one.
    const spacing = 0.05;
    const snapTime = gsap.utils.snap(spacing);
    const animateFunc = (element: HTMLElement) => {
      const tl = gsap.timeline();
      tl.fromTo(
        element,
        { scale: 0.5 },
        { scale: 1, zIndex: 100, duration: 0.5, yoyo: true, repeat: 1, ease: 'power1.in', immediateRender: false }
      )
        .fromTo(
          element,
          { opacity: 0 },
          { opacity: 1, duration: 0.5, yoyo: true, repeat: 1, ease: 'none', immediateRender: false },
          0
        )
        .fromTo(
          element,
          { xPercent: 420 },
          { xPercent: -420, duration: 1, ease: 'none', immediateRender: false },
          0
        )
        .fromTo(
          element,
          { rotationY: 52 },
          { rotationY: -52, duration: 1, ease: 'none', immediateRender: false },
          0
        );
      return tl;
    };

    const seamlessLoop = buildSeamlessLoop(items, spacing, animateFunc);
    const playhead = { offset: 0 };
    const wrapTime = gsap.utils.wrap(0, seamlessLoop.duration());
    let lastCenter = -1;
    const updateGlow = () => {
      const idx = Math.round(wrapTime(playhead.offset) / spacing) % items.length;
      if (idx !== lastCenter && glowRef.current) {
        lastCenter = idx;
        glowRef.current.style.backgroundColor = accents[idx];
      }
    };
    const scrub = gsap.to(playhead, {
      offset: 0,
      onUpdate() {
        seamlessLoop.time(wrapTime(playhead.offset));
        updateGlow();
      },
      duration: 0.7,
      ease: 'power3',
      paused: true,
    });
    const vars = scrub.vars as { offset: number };
    const scrubTo = (offset: number) => {
      vars.offset = offset;
      scrub.invalidate().restart();
    };
    seamlessLoop.time(0); // render the initial card states
    updateGlow();

    // Gentle attract mode: one card every few seconds, suspended while the
    // pointer is over the deck and retired for good on the first real
    // interaction (press, drag, scrub, or keys).
    let hovering = false;
    let autoTimer: ReturnType<typeof setInterval> | undefined = setInterval(() => {
      if (!hovering && !document.hidden) scrubTo(snapTime(vars.offset) + spacing);
    }, AUTO_ADVANCE_MS);
    const stopAuto = () => {
      if (autoTimer) { clearInterval(autoTimer); autoTimer = undefined; }
    };
    const markInteracted = () => { stopAuto(); setInteracted(true); };

    // Drag / flick to scrub, snapping to the nearest card on release.
    const proxy = document.createElement('div');
    let startOffset = 0;
    const draggable = Draggable.create(proxy, {
      type: 'x',
      trigger: wrap,
      onPress() {
        stopAuto();
        wrap.classList.add('deck-dragging');
        draggedRef.current = false;
        startOffset = vars.offset;
        gsap.set(proxy, { x: 0 });
      },
      onDrag() {
        draggedRef.current = true;
        markInteracted();
        scrubTo(startOffset + (this.startX - this.x) * 0.0008);
      },
      onRelease() {
        wrap.classList.remove('deck-dragging');
        if (draggedRef.current) scrubTo(snapTime(vars.offset));
        // Let the click event (if any) read draggedRef before clearing it.
        setTimeout(() => { draggedRef.current = false; }, 0);
      },
    })[0];

    // Horizontal trackpad / shift-wheel scrubbing — vertical scroll stays
    // with the page.
    let wheelSnap: ReturnType<typeof setTimeout> | undefined;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
      e.preventDefault();
      markInteracted();
      scrubTo(vars.offset + e.deltaX * 0.0008);
      clearTimeout(wheelSnap);
      wheelSnap = setTimeout(() => scrubTo(snapTime(vars.offset)), 180);
    };
    wrap.addEventListener('wheel', onWheel, { passive: false });

    // Arrow keys page one card at a time.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      markInteracted();
      scrubTo(snapTime(vars.offset) + (e.key === 'ArrowRight' ? spacing : -spacing));
    };
    wrap.addEventListener('keydown', onKey);

    const onEnter = () => { hovering = true; };
    const onLeave = () => { hovering = false; };
    wrap.addEventListener('mouseenter', onEnter);
    wrap.addEventListener('mouseleave', onLeave);

    return () => {
      stopAuto();
      wrap.removeEventListener('wheel', onWheel);
      wrap.removeEventListener('keydown', onKey);
      wrap.removeEventListener('mouseenter', onEnter);
      wrap.removeEventListener('mouseleave', onLeave);
      clearTimeout(wheelSnap);
      draggable.kill();
      scrub.kill();
      seamlessLoop.kill();
      gsap.set(items, { clearProps: 'all' });
    };
  }, [profiles, staticMode]);

  const suppressDragClick = (e: React.MouseEvent) => { if (draggedRef.current) e.preventDefault(); };

  const ctaInner = (
    <>
      <span className="w-12 h-12 rounded-full border-2 border-dashed flex items-center justify-center font-mono text-[22px] text-[var(--accent-ink)]" style={{ borderColor: 'var(--border-color)' }}>+</span>
      <span className="font-basement font-black text-[18px] uppercase leading-tight" style={{ color: 'var(--foreground)' }}>Complete your passport</span>
      <span className="font-mono text-[10px] uppercase tracking-[2px] text-[var(--accent-ink)]">Finish onboarding →</span>
    </>
  );

  if (staticMode) {
    return (
      <div className="flex gap-4 overflow-x-auto -mx-4 px-4 md:-mx-8 md:px-8 pb-2" style={{ scrollbarWidth: 'none' }}>
        {showCompleteCta && (
          <Link href="/onboarding" className="flex flex-col items-center justify-center text-center gap-3 shrink-0 no-underline rounded-2xl border-2 border-dashed p-5 hover:border-[var(--accent-ink)] transition-colors" style={{ width: CARD_W, height: CARD_H, borderColor: 'var(--border-color)' }}>
            {ctaInner}
          </Link>
        )}
        {profiles.map((p) => (
          <Link key={p.id} href={`/profile/${p.username}`} className="block shrink-0 no-underline" style={{ width: CARD_W, height: CARD_H }}>
            <PassportCard p={p} />
          </Link>
        ))}
      </div>
    );
  }

  return (
    <div
      ref={wrapRef}
      tabIndex={0}
      role="region"
      aria-label="Discover Topians — drag or use arrow keys to browse"
      className="relative -mx-4 md:-mx-8 select-none outline-none cursor-grab [&.deck-dragging]:cursor-grabbing"
      style={{ height: CARD_H + 100, touchAction: 'pan-y' }}
    >
      {/* Ambient glow — takes on the centered card's path color. Lives
          outside the clip layer so its falloff fades naturally instead of
          being cut off at the section edge. */}
      <div
        ref={glowRef}
        aria-hidden
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full pointer-events-none"
        style={{
          // Capped at the viewport width — an unclipped 720px glow was
          // widening the iOS layout viewport and shrinking the whole page.
          width: `min(${CARD_W * 2.4}px, 100vw)`,
          height: CARD_H * 0.9,
          backgroundColor: '#e4fe52',
          opacity: 0.1,
          filter: 'blur(90px)',
          transition: 'background-color 0.7s ease',
        }}
      />

      {/* Giant TOPIANS wordmark behind the deck */}
      <div aria-hidden className="absolute inset-x-0 top-[44%] -translate-y-1/2 flex justify-center pointer-events-none">
        <span
          className="font-basement font-black uppercase whitespace-nowrap leading-none select-none"
          style={{
            fontSize: 'clamp(56px, 15vw, 210px)',
            color: 'transparent',
            WebkitTextStroke: '1.5px rgba(245,240,232,0.16)',
            letterSpacing: '0.02em',
          }}
        >
          TOPIANS
        </span>
      </div>

      {/* Clip layer — only the flying cards get clipped; glow + wordmark
          above sit outside it */}
      <div className="absolute inset-0 overflow-hidden">
        {/* Center stage — every card lives here; GSAP fans them across it */}
        <div
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
          style={{ width: CARD_W, height: CARD_H, perspective: '1400px' }}
        >
          {showCompleteCta && (
            <Link
              href="/onboarding"
              onClick={suppressDragClick}
              data-profile="cta"
              className="passport-item absolute inset-0 flex flex-col items-center justify-center text-center gap-3 no-underline rounded-2xl border-2 border-dashed p-5 hover:border-[var(--accent-ink)] transition-colors cursor-grab [.deck-dragging_&]:cursor-grabbing"
              style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--page-bg)' }}
              draggable={false}
            >
              {ctaInner}
            </Link>
          )}
          {profiles.map((p) => (
            <Link
              key={p.id}
              href={`/profile/${p.username}`}
              onClick={suppressDragClick}
              data-profile={p.id}
              className="passport-item group absolute inset-0 block no-underline cursor-grab [.deck-dragging_&]:cursor-grabbing"
              draggable={false}
            >
              <PassportCard p={p} />
            </Link>
          ))}
        </div>
      </div>

      {/* Drag affordance — fades away after the first interaction */}
      <div
        aria-hidden
        className={`absolute left-1/2 -translate-x-1/2 bottom-3 flex items-center gap-2.5 font-mono text-[9px] uppercase tracking-[3px] transition-opacity duration-700 pointer-events-none ${interacted ? 'opacity-0' : 'opacity-40'}`}
        style={{ color: 'var(--foreground)' }}
      >
        <span aria-hidden>←</span> drag <span aria-hidden>→</span>
      </div>
    </div>
  );
}
