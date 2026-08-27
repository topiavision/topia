'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { PathConfig, COLOR_HEX } from './pathConfig';

interface ContentItem {
  name: string;
  sub: string;
  color: string;
  status: string;
}

export type StampRarity = 'common' | 'rare' | 'legendary';

export type StampCategory = 'event' | 'connect' | 'core';

export interface Stamp {
  kind?: string;             // stable stamp-type id (from lib/profile/stamps)
  category?: StampCategory;  // filter bucket: event / connect / core
  label: string;             // center / top-arc word (event or world name, etc.)
  caption: string;           // the stamp "type" word (FOUNDER, CHECK-IN, …)
  date: string;
  color: string;
  shape: 'circle' | 'rect' | 'seal';
  rarity: StampRarity;
  weight: number;
  emblem?: 'topia' | 'star';
  title: string;
  description: string;
  avatarUrl?: string;
  href?: string;
}

export type StampLayout = Record<string, { x: number; y: number; rot: number }>;
function stampKey(s: Stamp): string { return `${s.caption}|${s.label}`; }

interface Props {
  config: PathConfig;
  sectionLabel: string;
  items: ContentItem[];
  stamps: Stamp[];
  /** When false, only the visa stamps show (full-width); endorsed list hidden. */
  showEndorsed?: boolean;
  /** Profile owner — can reorder & save the stamp arrangement. */
  editable?: boolean;
  /** localStorage key (the profile username) for the saved arrangement. */
  storageKey?: string;
  /** Profile owner's display name — used to swap "You" in descriptions. */
  ownerName?: string;
}

// Deterministic pseudo-random in [0,1) — stable across SSR/CSR (Math.random
// would cause a hydration mismatch; Math.sin of a constant won't).
function rng(n: number): number { const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); }
// 4-point sparkle star fallback emblem (path seals).
const STAR = 'M50 30 L55 45 L70 50 L55 55 L50 70 L45 55 L30 50 L45 45 Z';

// Two-lane (top + bottom) asymmetric scatter that fills the whole width with
// uneven gaps — some stamps sit close/overlapping, others have air. Responsive:
// positions are recomputed from the measured area width.
const BAND_H = 212;
function layoutStamps(stamps: Stamp[], areaW: number) {
  const N = stamps.length;
  const PAD = 4;
  // Keep stamps a healthy size — pack tighter (overlap) on narrow screens
  // rather than shrinking them much.
  const baseSize = Math.max(86, Math.min(118, (areaW / Math.max(5, N)) * 1.25));
  // Uneven cumulative horizontal steps → varied spacing (some touching).
  let acc = 0;
  const cum = stamps.map((_, i) => { acc += i === 0 ? 0 : 0.4 + rng(i * 3 + 1) * 1.1; return acc; });
  const span = cum[N - 1] || 1;
  let prevLane = rng(2) > 0.5 ? 1 : 0;
  return stamps.map((stamp, i) => {
    const size = baseSize * (0.9 + stamp.weight * 0.14);
    const stampH = stamp.shape === 'rect' ? size * 0.56 : size;
    const maxLeft = Math.max(size, areaW - size - PAD * 2);
    const left = N > 1 ? PAD + (cum[i] / span) * maxLeft : Math.max(PAD, (areaW - size) / 2);
    // Lane mostly alternates (uses top & bottom) but sometimes repeats → asymmetry + overlap.
    const lane = i === 0 ? prevLane : rng(i * 7 + 3) > 0.5 ? 1 - prevLane : prevLane;
    prevLane = lane;
    const top = lane === 0 ? PAD + rng(i * 3 + 5) * 22 : Math.max(PAD, BAND_H - stampH - PAD - rng(i * 3 + 9) * 22);
    const rot = (rng(i * 5 + 2) - 0.5) * 18;
    const z = Math.floor(rng(i * 11 + 4) * 12) + 1;
    return { size, stampH, left, top, rot, z };
  });
}

// Stamp colors come straight from the TOPIA brand palette; the inky/aged look
// comes from reduced opacity + a distress texture at render time (see StampSvg).
function inkColor(color: string, fallback: string): string {
  return COLOR_HEX[color] || fallback;
}

// TOPIA logo (logo-vector.svg) as a path so it can be filled any color.
const TOPIA_LOGO_VIEWBOX = '0 0 468 309';
const TOPIA_LOGO_PATH = 'M248.244 0L249.567 0.534218C253.772 5.33588 268.237 51.6617 271.697 60.619C284.721 62.5024 301.944 69.6949 312.074 78.5385C334.862 70.9857 439.759 43.3727 459.298 46.3637C461.484 46.6985 462.317 47.3396 463.571 49.0776C465.702 60.2407 418.051 96.8812 407.934 104.568C398.897 111.44 364.575 134.502 361.352 143.426C360.265 146.449 361.346 149.374 363.035 151.895C367.19 158.093 376.047 165.05 381.599 170.415C393.226 181.651 464.838 248.37 466.894 253.53C467.503 255.059 467.372 255.385 466.745 256.79C464.751 257.837 462.31 257.453 460.273 256.646C447.845 251.725 434.926 245.672 422.753 240.223L344.023 204.894C333.831 200.33 316.223 191.852 306.099 189.27C293.771 205.447 277.044 216.059 259.418 225.553C262.722 206.006 266.939 198.44 280.616 183.724C253.176 201.589 251.517 218.376 246.822 248.511L240.052 290.743C239.381 294.816 238.307 307.771 233.965 308.234C229.102 305.491 216.287 266.833 213.231 258.28C211.027 251.366 208.603 244.524 205.962 237.765C190.337 237.905 177.772 234.302 163.662 228.192C150.793 231.326 138.046 235.939 125.301 239.61C107.921 244.617 22.5531 267.918 11.5262 261.181C10.399 260.492 9.91204 259.752 9.6754 258.429C7.76243 247.734 60.1691 206.796 70.5041 198.825C79.5652 191.839 97.6129 180.372 103.89 171.683C106.356 168.27 107.214 164.968 105.426 161.031C101.754 152.946 89.7704 143.608 83.1539 137.198L35.7116 91.749C29.2976 85.7031 1.00058 60.5289 0 54.5035C1.84713 51.5213 5.91839 52.8537 8.69903 54.0432C54.5271 73.6443 99.6694 95.0959 145.538 114.571C166.759 87.3145 183.573 75.3569 217.473 64.2429C220.258 63.3298 224.912 61.8744 227.492 63.2291C227.084 64.5845 226.105 66.0362 224.718 66.4996C205.103 73.0791 184.079 82.0028 170.459 98.2129C162.061 108.208 164.898 116.703 177.611 118.819C188.237 120.588 193.362 118.159 203.182 116.633L203.824 117.256L203.017 119.542L203.641 119.496L203.042 119.552L203.057 119.215L204.14 119.187C218.667 109.653 225.494 99.9361 231.642 83.452C237.108 68.8023 241.375 9.82322 247.915 0.464021L248.244 0ZM127.123 170.093C115.992 179.188 104.264 188.198 95.9739 199.982C93.7969 202.864 91.6573 205.924 92.3212 209.741C92.6628 211.705 93.7932 213.388 95.449 214.493C105.763 221.372 141.135 213.987 152.546 211.191C177.85 204.991 202.285 196.759 226.506 187.192C264.368 172.237 351.352 131.884 371.972 97.5477C373.482 95.0332 374.438 92.2019 375.419 89.4482C369.854 79.3243 362.37 81.1984 352.097 81.3823C343.178 81.6637 327.813 85.1615 318.664 87.0356C321.999 94.7953 331.85 115.583 328.968 124.298C327.819 127.766 315.478 134.659 311.602 136.988C269.119 162.33 223.691 182.369 176.333 196.657C164.044 200.304 149.084 203.651 136.324 203.945C129.054 187.856 129.113 187.892 127.123 170.093ZM135.125 166.47C140.35 159.41 159.48 132.169 152.141 124.272C150.467 123.501 150.138 123.303 148.314 123.174C138.823 130.001 128.168 155.269 132.383 166.421L133.306 167.331C134.698 167.072 134.124 167.376 135.125 166.47ZM295.857 79.5722C295.137 73.4058 279.032 67.3009 273.833 65.3511C278.374 76.6608 282.609 81.8463 295.857 79.5722Z';

// Distress texture so stamp ink reads aged/mottled (not bright/flat). Reused
// per stamp; TOPIA-branded stamps skip it.
function InkFilter({ idKey, seed }: { idKey: string; seed: number }) {
  return (
    <filter id={`ink-${idKey}`} x="-15%" y="-15%" width="130%" height="130%">
      <feTurbulence type="fractalNoise" baseFrequency="0.45 0.6" numOctaves="2" seed={seed} result="n" />
      {/* white RGB + mottled alpha so the multiply only varies opacity (keeps the color) */}
      <feColorMatrix in="n" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0.45 0 0 0 0.62" result="a" />
      <feComposite in="SourceGraphic" in2="a" operator="arithmetic" k1="1" k2="0" k3="0" k4="0" />
    </filter>
  );
}

// One stamp's SVG — reused in the strip and the detail modal.
function StampSvg({ stamp, idKey, config }: { stamp: Stamp; idKey: string; config: PathConfig }) {
  const c = inkColor(stamp.color, config.hex);
  const isRect = stamp.shape === 'rect';
  const isRare = stamp.rarity !== 'common';
  const isLegend = stamp.rarity === 'legendary';
  const ringOp = 0.7 + stamp.weight * 0.3;
  const branded = stamp.emblem === 'topia';                  // TOPIA-branded → full color, no texture
  const inkF = branded ? undefined : `url(#ink-${idKey})`;
  const inkOp = branded ? 1 : 0.94;                           // slightly opaque so it isn't too bright
  const seed = (Number(idKey) || 7) % 90;

  const topiaEmblem = (fill: string) => (
    <svg x="19" y="33.5" width="62" height="40" viewBox={TOPIA_LOGO_VIEWBOX} preserveAspectRatio="xMidYMid meet">
      <path d={TOPIA_LOGO_PATH} fill={fill} />
    </svg>
  );

  if (stamp.shape === 'seal') {
    const chrome = branded && stamp.color === 'silver'; // only the TOPIA member seal is metallic
    return (
      <svg viewBox="0 0 100 100" className="stamp-svg w-full h-full" shapeRendering="geometricPrecision">
        <defs>
          <path id={`sealTop-${idKey}`} d="M 50,50 m -33,0 a 33,33 0 1,1 66,0" />
          <path id={`sealBot-${idKey}`} d="M 50,50 m 33,0 a 33,33 0 1,1 -66,0" />
          {!branded && <InkFilter idKey={idKey} seed={seed} />}
          {chrome && (
            <>
              <linearGradient id={`chrome-${idKey}`} x1="0" y1="0" x2="0.9" y2="1">
                <stop offset="0%" stopColor="#ffffff" />
                <stop offset="22%" stopColor="#c4cad6" />
                <stop offset="46%" stopColor="#878d9c" />
                <stop offset="60%" stopColor="#dde1ea" />
                <stop offset="80%" stopColor="#9aa0af" />
                <stop offset="100%" stopColor="#f4f6fb" />
              </linearGradient>
              <linearGradient id={`holo-${idKey}`} x1="0" y1="0" x2="1" y2="0.35">
                <stop offset="0%" stopColor="#b9a8ff" />
                <stop offset="25%" stopColor="#9fe0ff" />
                <stop offset="50%" stopColor="#a6ffcf" />
                <stop offset="75%" stopColor="#fff2a6" />
                <stop offset="100%" stopColor="#ffaedb" />
              </linearGradient>
              <radialGradient id={`holoGlow-${idKey}`} cx="0.5" cy="0.45" r="0.55">
                <stop offset="0%" stopColor="#a6ffe0" stopOpacity="0.32" />
                <stop offset="55%" stopColor="#b9a8ff" stopOpacity="0.12" />
                <stop offset="100%" stopColor="#000000" stopOpacity="0" />
              </radialGradient>
            </>
          )}
        </defs>
        <circle cx="50" cy="50" r="48" fill="#0c0c0e" opacity={chrome ? 0.72 : 0.5} />
        <g filter={inkF} opacity={inkOp}>
          {chrome ? (
            <>
              <circle cx="50" cy="50" r="41" fill={`url(#holoGlow-${idKey})`} />
              <circle cx="50" cy="50" r="47.6" fill="none" stroke="#ffffff" strokeWidth="0.5" opacity={0.5} />
              <circle cx="50" cy="50" r="46.5" fill="none" stroke={`url(#chrome-${idKey})`} strokeWidth="3.4" />
              <circle cx="50" cy="50" r="42.4" fill="none" stroke={`url(#chrome-${idKey})`} strokeWidth="1.2" opacity={0.85} />
              <circle cx="50" cy="50" r="44.6" fill="none" stroke={`url(#holo-${idKey})`} strokeWidth="2" opacity={0.6} strokeDasharray="0.6 2.3" />
            </>
          ) : (
            <>
              <circle cx="50" cy="50" r="47" fill="none" stroke={c} strokeWidth="3" opacity={ringOp} />
              <circle cx="50" cy="50" r="42" fill="none" stroke={c} strokeWidth="1" opacity={ringOp * 0.75} />
              <circle cx="50" cy="50" r="44.5" fill="none" stroke={c} strokeWidth="1.4" opacity={ringOp * 0.7} strokeDasharray="0.4 2.6" />
            </>
          )}
          <text fill={chrome ? `url(#chrome-${idKey})` : c} opacity={chrome ? 1 : 0.95} style={{ fontFamily: "'Space Mono', monospace", fontSize: '8.5px', fontWeight: 'bold', letterSpacing: '2px', textTransform: 'uppercase' }}>
            <textPath href={`#sealTop-${idKey}`} startOffset="50%" textAnchor="middle">{stamp.label}</textPath>
          </text>
          <text fill={chrome ? `url(#chrome-${idKey})` : c} opacity={chrome ? 0.92 : 0.8} style={{ fontFamily: "'Space Mono', monospace", fontSize: '6px', letterSpacing: '2.5px', textTransform: 'uppercase' }}>
            <textPath href={`#sealBot-${idKey}`} startOffset="50%" textAnchor="middle">{`• ${stamp.caption} •`}</textPath>
          </text>
          {branded ? topiaEmblem(chrome ? `url(#chrome-${idKey})` : c) : (
            <path d={STAR} fill="none" stroke={c} strokeWidth="2.4" opacity={0.9} transform="translate(15 15) scale(0.7)" />
          )}
        </g>
      </svg>
    );
  }

  if (isRect) {
    return (
      <svg viewBox="0 0 120 55" className="stamp-svg w-full h-full">
        <defs>{!branded && <InkFilter idKey={idKey} seed={seed} />}</defs>
        <g filter={inkF} opacity={inkOp}>
          {isLegend && <rect x="2" y="2" width="116" height="51" rx="3" fill={c} opacity={0.1} />}
          {isRare && <rect x="0.5" y="0.5" width="119" height="54" rx="4" fill="none" stroke={c} strokeWidth="0.7" opacity={ringOp * 0.65} strokeDasharray="1 4" />}
          <rect x="2" y="2" width="116" height="51" rx="3" fill="none" stroke={c} strokeWidth={isRare ? 2.6 : 2.2} opacity={ringOp} />
          <rect x="6" y="6" width="108" height="43" rx="1" fill="none" stroke={c} strokeWidth="0.7" opacity={ringOp * 0.6} />
          {stamp.avatarUrl ? (
            <>
              {/* Connection stamp — name centered, everything else small around it */}
              {[17, 103].map((ax) => (
                <g key={ax} transform={`translate(${ax} 27.5)`} stroke={c} fill="none" strokeWidth="1" opacity={ringOp * 0.8}>
                  <ellipse rx="6" ry="2.3" />
                  <ellipse rx="6" ry="2.3" transform="rotate(60)" />
                  <ellipse rx="6" ry="2.3" transform="rotate(120)" />
                  <circle r="1.1" fill={c} stroke="none" />
                </g>
              ))}
              <text x="60" y="14" textAnchor="middle" fill={c} opacity={0.65} style={{ fontFamily: "'Space Mono', monospace", fontSize: '5px', letterSpacing: '3px', textTransform: 'uppercase' }}>{stamp.caption}</text>
              <text x="60" y="32" textAnchor="middle" fill={c} opacity={0.97} style={{ fontFamily: "'Space Mono', monospace", fontSize: '9px', fontWeight: 'bold', letterSpacing: '0.5px' }}>{stamp.label}</text>
              <text x="60" y="45" textAnchor="middle" fill={c} opacity={0.6} style={{ fontFamily: "'Space Mono', monospace", fontSize: '5.5px', letterSpacing: '1px' }}>{stamp.date}</text>
            </>
          ) : (
            <>
              <text x="60" y="18" textAnchor="middle" fill={c} opacity={0.7} style={{ fontFamily: "'Space Mono', monospace", fontSize: '5px', letterSpacing: '3px', textTransform: 'uppercase' }}>{stamp.caption}</text>
              <text x="60" y="32" textAnchor="middle" fill={c} opacity={0.95} style={{ fontFamily: "'Space Mono', monospace", fontSize: '8px', fontWeight: 'bold', letterSpacing: '1px' }}>{stamp.label}</text>
              <text x="60" y="44" textAnchor="middle" fill={c} opacity={0.6} style={{ fontFamily: "'Space Mono', monospace", fontSize: '6px' }}>{stamp.date}</text>
            </>
          )}
        </g>
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 100 100" className="stamp-svg w-full h-full">
      <defs>
        <path id={`arcTop-${idKey}`} d="M 50,50 m -34,0 a 34,34 0 1,1 68,0" />
        <path id={`arcBot-${idKey}`} d="M 50,50 m 34,0 a 34,34 0 1,1 -68,0" />
        {!branded && <InkFilter idKey={idKey} seed={seed} />}
      </defs>
      <g filter={inkF} opacity={inkOp}>
        {isLegend && <circle cx="50" cy="50" r="46" fill={c} opacity={0.1} />}
        {isRare && <circle cx="50" cy="50" r="49" fill="none" stroke={c} strokeWidth="0.7" opacity={ringOp * 0.65} strokeDasharray="1 4" />}
        <circle cx="50" cy="50" r="46" fill="none" stroke={c} strokeWidth={isRare ? 2.8 : 2.2} opacity={ringOp} />
        <circle cx="50" cy="50" r="38" fill="none" stroke={c} strokeWidth="0.9" opacity={ringOp * 0.65} />
        {isLegend && [0, 45, 90, 135, 180, 225, 270, 315].map((a) => {
          const rad = (a * Math.PI) / 180;
          return <circle key={a} cx={50 + Math.cos(rad) * 49} cy={50 + Math.sin(rad) * 49} r="1.3" fill={c} opacity={0.85} />;
        })}
        <text fill={c} opacity={0.9} style={{ fontFamily: "'Space Mono', monospace", fontSize: '7px', fontWeight: 'bold', letterSpacing: '2px', textTransform: 'uppercase' }}>
          <textPath href={`#arcTop-${idKey}`} startOffset="50%" textAnchor="middle">{stamp.label}</textPath>
        </text>
        <text fill={c} opacity={0.55} style={{ fontFamily: "'Space Mono', monospace", fontSize: '6px', letterSpacing: '2.5px', textTransform: 'uppercase' }}>
          <textPath href={`#arcBot-${idKey}`} startOffset="50%" textAnchor="middle">{`• ${stamp.caption} • TOPIA •`}</textPath>
        </text>
        <text x="50" y="48" textAnchor="middle" fill={c} opacity={0.95} style={{ fontFamily: "'Space Mono', monospace", fontSize: '10px', fontWeight: 'bold' }}>{stamp.date}</text>
      </g>
    </svg>
  );
}

export default function IdentityLayer({ config, sectionLabel, items, stamps, showEndorsed = true, editable = false, storageKey, ownerName }: Props) {
  const [selected, setSelected] = useState<Stamp | null>(null);
  const selColor = selected ? inkColor(selected.color, config.hex) : config.hex;
  const selRectShape = selected?.shape === 'rect';

  // Measure the stamp area so the scatter fills the width responsively.
  const areaRef = useRef<HTMLDivElement>(null);
  const [areaW, setAreaW] = useState(640);
  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const measure = () => setAreaW(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Owner reorder: custom positions stored as fractions of the area so they
  // stay responsive. Falls back to the auto scatter for un-placed stamps.
  const lsKey = storageKey ? `topia:stamp-layout:${storageKey}` : null;
  const [reorder, setReorder] = useState(false);
  const [custom, setCustom] = useState<StampLayout>({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  // Load any saved arrangement (client-side; per-device).
  useEffect(() => {
    if (!lsKey) return;
    try { const raw = localStorage.getItem(lsKey); if (raw) setCustom(JSON.parse(raw)); } catch { /* ignore */ }
  }, [lsKey]);
  const drag = useRef<{ key: string; offX: number; offY: number; size: number; stampH: number; rot: number } | null>(null);

  // Filter views — ALL is default; EVENTS = event stamps, CONNECTS = mutual
  // follows, CORE = everything else. Zero-count buckets are hidden.
  const [filter, setFilter] = useState<'all' | StampCategory>('all');
  const catOf = (s: Stamp): StampCategory => s.category ?? 'core';
  const counts: Record<'all' | StampCategory, number> = { all: stamps.length, event: 0, connect: 0, core: 0 };
  for (const s of stamps) counts[catOf(s)] += 1;
  const FILTERS: { key: 'all' | StampCategory; label: string }[] = [
    { key: 'all', label: 'ALL' }, { key: 'event', label: 'EVENTS' }, { key: 'connect', label: 'CONNECTS' }, { key: 'core', label: 'CORE' },
  ];
  const visible = filter === 'all' ? stamps : stamps.filter((s) => catOf(s) === filter);

  const placedAuto = layoutStamps(visible, areaW);
  const placed = visible.map((stamp, i) => {
    const base = placedAuto[i];
    const cp = custom[stampKey(stamp)];
    if (!cp) return base;
    return {
      ...base,
      left: Math.min(Math.max(0, cp.x * (areaW - base.size)), Math.max(0, areaW - base.size)),
      top: Math.min(Math.max(0, cp.y * (BAND_H - base.stampH)), Math.max(0, BAND_H - base.stampH)),
      rot: cp.rot,
    };
  });

  const onDragStart = (e: React.PointerEvent, stamp: Stamp, p: { size: number; stampH: number; left: number; top: number; rot: number }) => {
    if (!reorder) return;
    e.preventDefault();
    const rect = areaRef.current?.getBoundingClientRect();
    if (!rect) return;
    drag.current = { key: stampKey(stamp), offX: e.clientX - rect.left - p.left, offY: e.clientY - rect.top - p.top, size: p.size, stampH: p.stampH, rot: p.rot };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onDragMove = (e: React.PointerEvent) => {
    const d = drag.current;
    const rect = areaRef.current?.getBoundingClientRect();
    if (!d || !rect) return;
    const left = Math.min(Math.max(0, e.clientX - rect.left - d.offX), Math.max(0, areaW - d.size));
    const top = Math.min(Math.max(0, e.clientY - rect.top - d.offY), Math.max(0, BAND_H - d.stampH));
    const x = areaW - d.size > 0 ? left / (areaW - d.size) : 0;
    const y = BAND_H - d.stampH > 0 ? top / (BAND_H - d.stampH) : 0;
    setCustom((c) => ({ ...c, [d.key]: { x, y, rot: d.rot } }));
    setDirty(true);
  };
  const onDragEnd = () => { drag.current = null; };

  const saveLayout = () => {
    setSaving(true);
    try { if (lsKey) localStorage.setItem(lsKey, JSON.stringify(custom)); } catch { /* ignore */ }
    setDirty(false);
    setReorder(false);
    setSaving(false);
  };
  const resetLayout = () => { setCustom({}); setDirty(true); };

  return (
    <div className={`grid grid-cols-1 ${showEndorsed ? 'md:grid-cols-[2fr_3fr]' : ''} gap-[3px] h-full`}>
      {/* Left — Endorsed list */}
      {showEndorsed && (
      <div className="grid grid-rows-[auto_1fr] gap-[3px] overflow-hidden">
        <div className={`${config.bg} px-4 py-2.5 flex items-center justify-between`}>
          <span className={`font-mono text-[11px] uppercase tracking-wider font-bold ${config.textOn}`}>{sectionLabel}</span>
          <span className={`font-mono text-[9px] uppercase tracking-[2px] ${config.textOn} opacity-30`}>{items.length} entries</span>
        </div>
        <div className="relative bg-[var(--page-bg)] overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
          <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(245,240,232,1) 4px, rgba(245,240,232,1) 5px), repeating-linear-gradient(-45deg, transparent, transparent 4px, rgba(245,240,232,1) 4px, rgba(245,240,232,1) 5px)' }} />
          <div className="absolute inset-0 pointer-events-none opacity-[0.04]" style={{ backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 47px, rgba(245,240,232,1) 47px, rgba(245,240,232,1) 48px)' }} />
          <div className="absolute top-0 bottom-0 left-[28px] w-[1px] bg-ink/[0.06] pointer-events-none z-[1]" />
          <div className="relative z-10">
            {items.length === 0 ? (
              <div className="flex items-center justify-center py-10">
                <span className="font-mono text-[11px] text-ink/20 uppercase tracking-wider">No entries yet</span>
              </div>
            ) : items.map((item, i) => (
              <div key={item.name} className="flex items-center hover:bg-ink/[0.02] transition-colors cursor-pointer border-b border-ink/[0.04]" style={{ minHeight: '48px' }}>
                <div className="w-[28px] shrink-0 flex items-center justify-center"><span className="font-mono text-[9px] text-ink/15">{String(i + 1).padStart(2, '0')}</span></div>
                <div className="w-[2px] shrink-0 self-stretch" style={{ backgroundColor: COLOR_HEX[item.color] || '#f5f0e8' }} />
                <div className="flex-1 flex items-center justify-between gap-3 px-3 py-3 min-w-0">
                  <div className="flex-1 min-w-0">
                    <span className="font-mono text-[12px] uppercase font-bold text-ink block truncate">{item.name}</span>
                    <span className="font-mono text-[9px] text-ink/30">{item.sub}</span>
                  </div>
                  <span className="font-mono text-[8px] uppercase tracking-wider text-ink/25 border border-ink/[0.08] rounded-sm px-2 py-0.5 shrink-0">{item.status}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      )}

      {/* Right — Visa stamps (organic scatter, scrolls sideways) */}
      <div id="tour-prof-stamps" className={`${showEndorsed ? 'border-l border-ink/[0.04]' : ''} bg-[var(--page-bg)] p-4 relative overflow-hidden`}>
        <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-[0.008]" viewBox="0 0 300 400" preserveAspectRatio="xMidYMid slice">
          {Array.from({ length: 8 }, (_, i) => (
            <ellipse key={i} cx="150" cy="200" rx={60 + i * 20} ry={40 + i * 15} fill="none" stroke="#f5f0e8" strokeWidth="0.4" transform={`rotate(${i * 12} 150 200)`} />
          ))}
        </svg>
        <div className="flex items-center justify-between mb-3 relative z-10 gap-2">
          <span className="font-mono text-[9px] uppercase tracking-[2px] text-ink/25 shrink-0">visa stamps // travel log</span>
          <div className="flex items-center gap-2">
            {stamps.length > 0 && !reorder && <span className="font-mono text-[9px] uppercase tracking-[2px] text-ink/20">{stamps.length} earned</span>}
            {editable && stamps.length > 0 && (
              reorder ? (
                <>
                  <button onClick={resetLayout} className="font-mono text-[8px] uppercase tracking-[1.5px] px-2 py-1 rounded-sm border border-ink/15 text-ink/50 hover:text-ink hover:border-ink/40 transition cursor-pointer bg-transparent">Reset</button>
                  <button onClick={() => { setReorder(false); setDirty(false); try { const raw = lsKey && localStorage.getItem(lsKey); setCustom(raw ? JSON.parse(raw) : {}); } catch { setCustom({}); } }} className="font-mono text-[8px] uppercase tracking-[1.5px] px-2 py-1 rounded-sm border border-ink/15 text-ink/50 hover:text-ink hover:border-ink/40 transition cursor-pointer bg-transparent">Cancel</button>
                  <button onClick={saveLayout} disabled={saving} className="font-mono text-[8px] uppercase tracking-[1.5px] px-2.5 py-1 rounded-sm font-bold text-obsidian transition cursor-pointer disabled:opacity-50" style={{ backgroundColor: config.hex }}>{saving ? 'Saving…' : dirty ? 'Save' : 'Done'}</button>
                </>
              ) : (
                <button onClick={() => { setFilter('all'); setReorder(true); }} className="font-mono text-[8px] uppercase tracking-[1.5px] px-2 py-1 rounded-sm border border-ink/15 text-ink/50 hover:text-ink hover:border-ink/40 transition cursor-pointer bg-transparent flex items-center gap-1">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="5 9 2 12 5 15" /><polyline points="9 5 12 2 15 5" /><polyline points="15 19 12 22 9 19" /><polyline points="19 9 22 12 19 15" /><line x1="2" y1="12" x2="22" y2="12" /><line x1="12" y1="2" x2="12" y2="22" /></svg>
                  Reorder
                </button>
              )
            )}
          </div>
        </div>
        {reorder && <p className="font-mono text-[8px] uppercase tracking-[1.5px] text-ink/30 mb-2 relative z-10">Drag stamps to rearrange · then save</p>}
        {/* Filter views — ALL [10] EVENTS [4] CONNECTS [3] … */}
        {!reorder && stamps.length > 0 && (
          <div className="flex items-center gap-3 mb-2 relative z-10">
            {FILTERS.filter((f) => f.key === 'all' || counts[f.key] > 0).map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`font-mono text-[8px] uppercase tracking-[1.5px] bg-transparent border-none p-0 cursor-pointer transition ${filter === f.key ? 'text-ink font-bold' : 'text-ink/30 hover:text-ink/60'}`}
              >
                {f.label} [{counts[f.key]}]
              </button>
            ))}
          </div>
        )}
        <p className="font-mono text-[10px] text-ink/35 mb-3 relative z-10">
          Stamps land as this creator shows up — events, connects, worlds. Tap any stamp for its story.
        </p>
        {stamps.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 relative z-10" style={{ minHeight: 180 }}>
            <span className="font-mono text-[11px] text-ink/30 uppercase tracking-wider">No stamps yet</span>
            <Link href="/events" className="font-mono text-[10px] uppercase tracking-[1px] no-underline" style={{ color: 'var(--accent-ink)' }}>they start at events →</Link>
          </div>
        ) : visible.length === 0 ? (
          <div className="flex items-center justify-center relative z-10" style={{ height: BAND_H }}>
            <span className="font-mono text-[11px] text-ink/20 uppercase tracking-wider">No stamps here yet</span>
          </div>
        ) : (
          <div ref={areaRef} className="relative z-10" style={{ height: BAND_H }}>
            {visible.map((stamp, i) => {
              const p = placed[i];
              return (
                <button
                  key={i}
                  onClick={() => { if (!reorder) setSelected(stamp); }}
                  onPointerDown={reorder ? (e) => onDragStart(e, stamp, p) : undefined}
                  onPointerMove={reorder ? onDragMove : undefined}
                  onPointerUp={reorder ? onDragEnd : undefined}
                  title={reorder ? 'Drag to move' : `${stamp.title} — ${stamp.date}`}
                  className={`absolute group bg-transparent border-none p-0 ${reorder ? 'cursor-grab active:cursor-grabbing touch-none' : 'cursor-pointer transition-transform duration-300 hover:!z-[60] hover:scale-[1.14]'}`}
                  style={{ left: `${p.left}px`, top: `${p.top}px`, width: `${p.size}px`, height: `${p.stampH}px`, transform: `rotate(${p.rot}deg)`, zIndex: drag.current?.key === stampKey(stamp) ? 70 : p.z }}
                >
                  <StampSvg stamp={stamp} idKey={String(i)} config={config} />
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Stamp detail modal */}
      {selected && (
        <div className="fixed inset-0 z-[3000] flex items-center justify-center p-4" onClick={() => setSelected(null)}>
          <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" />
          <div
            className="relative z-10 w-full max-w-[460px] bg-[var(--page-bg)] border border-ink/15 rounded-2xl overflow-hidden flex"
            style={{ boxShadow: `0 0 0 1px ${selColor}22, 0 24px 60px rgba(0,0,0,0.6)` }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Left — details */}
            <div className="flex-1 p-6 flex flex-col justify-center gap-3 min-w-0">
              <span className="font-mono text-[9px] uppercase tracking-[2px] px-2 py-0.5 rounded-sm self-start border" style={{ color: selColor, borderColor: `${selColor}55` }}>
                {selected.rarity}
              </span>
              <h3 className="font-basement font-black text-[24px] uppercase leading-[0.95] text-ink">{selected.title}</h3>
              <p className="font-mono text-[11px] leading-[1.7] text-ink/55">{editable && ownerName && selected.description.startsWith(ownerName + ' ') ? 'You ' + selected.description.slice(ownerName.length + 1) : selected.description}</p>
              {selected.href && (
                <Link href={selected.href} onClick={() => setSelected(null)} className="flex items-center gap-2.5 no-underline group/avatar mt-0.5">
                  <span className="w-9 h-9 rounded-full overflow-hidden border border-ink/20 shrink-0 bg-[var(--page-bg)] flex items-center justify-center">
                    {selected.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={selected.avatarUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="font-mono text-[12px] text-ink/40">{(selected.title[0] || '?').toUpperCase()}</span>
                    )}
                  </span>
                  <span className="font-mono text-[12px] text-ink/70 group-hover/avatar:text-ink underline decoration-ink/20 transition-colors truncate">
                    {selected.href.replace('/profile/', '@')} →
                  </span>
                </Link>
              )}
              <div className="mt-1 pt-3 border-t border-ink/10">
                <span className="font-mono text-[8px] uppercase tracking-[2px] text-ink/30 block">Issued</span>
                <span className="font-mono text-[13px] uppercase tracking-wider text-ink">{selected.date}</span>
              </div>
            </div>
            {/* Right — the stamp */}
            <div className="w-[176px] shrink-0 flex items-center justify-center border-l border-ink/10 bg-ink/[0.02] p-5">
              <div style={{ width: 150, height: selRectShape ? 84 : 150 }}>
                <StampSvg stamp={selected} idKey="modal" config={config} />
              </div>
            </div>
            {/* Close */}
            <button
              onClick={() => setSelected(null)}
              aria-label="Close"
              className="absolute top-2.5 right-2.5 w-7 h-7 flex items-center justify-center rounded-full text-ink/50 hover:text-ink hover:bg-ink/10 transition cursor-pointer bg-transparent border-none"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
