'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/* First-run spotlight walkthrough (In Process tab, world HQ, profile).
 *
 * Shows exactly once per account: users.tours_seen (via /api/tours) is the
 * ledger, so it follows people across devices, and skip counts as seen.
 * Steps target element ids that live on the real page; any step whose target
 * isn't in the DOM (empty states, hidden switchers) is skipped, and a step
 * may list fallback targets. Replayable via a
 * `topia:replay-tour` CustomEvent carrying the tour key.
 *
 * Rendered through a portal with fixed positioning — the house rule for
 * overlays (never fight page scroll containers or the iOS keyboard). */

export interface TourStep {
  /** Element id (or fallback list) to spotlight; omit for a centered card. */
  target?: string | string[];
  title: string;
  body: string;
  place?: 'above' | 'below' | 'right';
  nextLabel?: string;
  skipLabel?: string;
}

const ORANGE = 'var(--orange, #FF5C34)';

function resolveTarget(target?: string | string[]): HTMLElement | null {
  if (!target) return null;
  for (const id of Array.isArray(target) ? target : [target]) {
    const el = document.getElementById(id);
    if (el) return el;
  }
  return null;
}

export default function Tour({ tourKey, privyId, enabled, steps }: {
  tourKey: 'inprocess' | 'world-hq' | 'profile';
  privyId: string;
  enabled: boolean;
  steps: TourStep[];
}) {
  const [active, setActive] = useState<TourStep[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [box, setBox] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  const [mounted, setMounted] = useState(false);
  const checkedRef = useRef(false);
  const aliveRef = useRef(true);

  useEffect(() => {
    setMounted(true);
    aliveRef.current = true;
    return () => { aliveRef.current = false; };
  }, []);

  // Steps with missing targets drop out; the centered welcome always stays.
  const resolveSteps = useCallback(() => {
    return steps.filter((s) => !s.target || resolveTarget(s.target));
  }, [steps]);

  const begin = useCallback(() => {
    const usable = resolveSteps();
    if (usable.length === 0) return;
    setIdx(0);
    setActive(usable);
  }, [resolveSteps]);

  // First-run check — once per mount, only when the surface is the viewer's
  // own. Deliberately NOT cancelled on dep changes: enabled/privyId settle
  // asynchronously during page load, and an effect-scoped cancel raced the
  // 900ms delay and silently swallowed the tour. Only unmount cancels.
  useEffect(() => {
    if (!enabled || !privyId || checkedRef.current) return;
    checkedRef.current = true;
    fetch(`/api/tours?privyId=${encodeURIComponent(privyId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!aliveRef.current || !d || (d.seen ?? []).includes(tourKey)) return;
        // Give the page a beat to finish loading the elements we spotlight.
        setTimeout(() => { if (aliveRef.current) begin(); }, 900);
      })
      .catch(() => {});
  }, [enabled, privyId, tourKey, begin]);

  // Replay hook — the ⓘ cards dispatch this.
  useEffect(() => {
    const onReplay = (e: Event) => {
      if ((e as CustomEvent).detail === tourKey) begin();
    };
    window.addEventListener('topia:replay-tour', onReplay);
    return () => window.removeEventListener('topia:replay-tour', onReplay);
  }, [tourKey, begin]);

  const markSeen = useCallback(() => {
    fetch('/api/tours', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ privyId, tour: tourKey }),
    }).catch(() => {});
  }, [privyId, tourKey]);

  const close = useCallback(() => { setActive(null); markSeen(); }, [markSeen]);
  // Backdrop clicks are usually accidental — dismiss without burning the
  // once-per-account flag, so the tour offers itself again next visit.
  const softClose = useCallback(() => { setActive(null); }, []);

  // Track the spotlight target through scroll/resize while a step is up.
  const step = active?.[idx] ?? null;
  useEffect(() => {
    if (!step) return;
    const el = resolveTarget(step.target);
    if (!el) { setBox(null); return; }
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    const measure = () => {
      const r = el.getBoundingClientRect();
      setBox({ top: r.top - 8, left: r.left - 8, width: r.width + 16, height: r.height + 16 });
    };
    measure();
    const t = setTimeout(measure, 450); // after the scrollIntoView settles
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, { passive: true });
    return () => {
      clearTimeout(t);
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure);
    };
  }, [step]);

  // Escape closes (counts as seen, like skip).
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, close]);

  if (!mounted || !active || !step) return null;

  const isLast = idx === active.length - 1;
  const centered = !step.target || !box;

  // Card geometry: clamp inside the viewport on every side.
  const cardW = Math.min(340, typeof window !== 'undefined' ? window.innerWidth - 24 : 340);
  let cardStyle: React.CSSProperties;
  if (centered) {
    cardStyle = { top: '44%', left: '50%', transform: 'translate(-50%,-50%)', width: Math.min(400, cardW + 60) };
  } else {
    const vw = window.innerWidth, vh = window.innerHeight, est = 210;
    let top: number;
    if (step.place === 'above') top = Math.max(12, box!.top - est - 12);
    else if (step.place === 'right') top = Math.max(12, Math.min(box!.top, vh - est - 12));
    else top = Math.min(box!.top + box!.height + 12, vh - est - 12);
    let left = step.place === 'right' ? box!.left + box!.width + 14 : box!.left;
    left = Math.max(12, Math.min(left, vw - cardW - 12));
    cardStyle = { top, left, width: cardW };
  }

  return createPortal(
    <div className="fixed inset-0 z-[3000]" role="dialog" aria-label="Welcome tour">
      {/* veil / spotlight cutout */}
      {centered ? (
        <div className="absolute inset-0" style={{ backgroundColor: 'rgba(0,0,0,0.66)' }} onClick={softClose} />
      ) : (
        <>
          <div className="absolute inset-0" onClick={softClose} />
          <div
            className="absolute rounded-lg pointer-events-none transition-all duration-300"
            style={{
              top: box!.top, left: box!.left, width: box!.width, height: box!.height,
              boxShadow: `0 0 0 3px ${ORANGE}, 0 0 0 9999px rgba(0,0,0,0.66)`,
            }}
          />
        </>
      )}

      {/* step card */}
      <div
        className="absolute rounded-xl p-5 bg-[var(--page-bg)] border border-ink/15 transition-all duration-300"
        style={{ ...cardStyle, borderTopWidth: 3, borderTopColor: centered ? 'var(--lime, #e4fe52)' : ORANGE, boxShadow: '0 18px 50px rgba(0,0,0,0.55)' }}
      >
        <p className="font-mono text-[9px] font-bold uppercase tracking-[2px]" style={{ color: centered ? 'var(--accent-ink, #4f6b00)' : ORANGE }}>
          {idx === 0 ? 'Welcome' : `Step ${idx + 1} of ${active.length}`}
        </p>
        <h4 className={`font-basement font-black uppercase text-ink leading-tight mt-1.5 ${centered ? 'text-[19px]' : 'text-[15px]'}`}>{step.title}</h4>
        <p className="font-mono text-[12px] text-ink/65 leading-relaxed mt-2">{step.body}</p>
        <div className="flex items-center gap-3 flex-wrap mt-4">
          <button
            onClick={() => (isLast ? close() : setIdx(idx + 1))}
            className="font-mono text-[11px] font-bold uppercase tracking-[2px] bg-lime text-obsidian px-3.5 py-2 rounded-sm border-none cursor-pointer hover:opacity-90 transition"
          >
            {step.nextLabel ?? (isLast ? 'Done' : 'Next →')}
          </button>
          {idx > 0 && (
            <button onClick={() => setIdx(idx - 1)} className="font-mono text-[10px] uppercase tracking-[1px] underline bg-transparent border-none cursor-pointer text-ink/45">
              ← Back
            </button>
          )}
          {!isLast && (
            <button onClick={close} className="font-mono text-[10px] uppercase tracking-[1px] underline bg-transparent border-none cursor-pointer text-ink/45">
              {step.skipLabel ?? 'Skip tour'}
            </button>
          )}
          <span className="inline-flex items-center gap-1.5 ml-auto">
            {active.map((_, i) => (
              <span key={i} className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: i === idx ? ORANGE : 'color-mix(in srgb, var(--page-text) 18%, transparent)' }} />
            ))}
          </span>
        </div>
      </div>
    </div>,
    document.body
  );
}

/** Fire a tour again on demand (the ⓘ "how this works" cards use this). */
export function replayTour(key: 'inprocess' | 'world-hq' | 'profile') {
  window.dispatchEvent(new CustomEvent('topia:replay-tour', { detail: key }));
}
