'use client';

import { useEffect, useRef, useState } from 'react';

/* The assistant's billboard — a big, unmissable panel that opens the
 * builder takeover. Not an input: it TEACHES (a typewriter line cycling
 * through real example prompts) and it LAUNCHES (whole panel is the
 * button). Replaces the old inline prompt bar on manage surfaces. */

const ORANGE = 'var(--orange, #FF5C34)';
const orangeMix = (pct: number) => `color-mix(in srgb, var(--orange) ${pct}%, transparent)`;

/** Cycling typewriter: type a prompt, hold, wipe, next. Reduced-motion
 * users get the first prompt, static. */
function useCycler(prompts: string[]) {
  const [text, setText] = useState('');
  const idx = useRef(0);
  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setText(prompts[0] ?? '');
      return;
    }
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const typeOut = (target: string, pos: number) => {
      if (!alive) return;
      setText(target.slice(0, pos));
      if (pos < target.length) timer = setTimeout(() => typeOut(target, pos + 1), 34);
      else timer = setTimeout(wipe, 1700);
    };
    const wipe = () => {
      if (!alive) return;
      idx.current = (idx.current + 1) % prompts.length;
      timer = setTimeout(() => typeOut(prompts[idx.current], 0), 250);
      setText('');
    };
    typeOut(prompts[0] ?? '', 0);
    return () => { alive = false; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return text;
}

export function AssistantLauncher({ heading = 'The Assistant', prompts, onOpen, compact, id }: {
  heading?: string;
  /** Example prompts the typewriter cycles through — real, working seeds. */
  prompts: string[];
  onOpen: () => void;
  compact?: boolean;
  id?: string;
}) {
  const line = useCycler(prompts);

  return (
    <div
      id={id}
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } }}
      className={`ipb-enter ipb-canvas-bg group w-full text-left rounded-xl border cursor-pointer transition-all hover:-translate-y-0.5 ${compact ? 'p-4' : 'p-5 sm:p-6'}`}
      style={{ borderColor: orangeMix(40), boxShadow: `0 0 28px ${orangeMix(8)}` }}
    >
      <div className="flex items-center gap-4">
        <span className={`ipb-orb shrink-0 ${compact ? 'text-[24px]' : 'text-[32px]'}`} style={{ color: ORANGE }}>✦</span>
        <div className="min-w-0 flex-1">
          <span className={`font-basement font-black uppercase text-ink block leading-none ${compact ? 'text-[15px]' : 'text-[clamp(16px,2.2vw,22px)]'}`}>
            {heading}
          </span>
          <span className={`block font-mono text-ink/55 mt-1.5 truncate ${compact ? 'text-[12px]' : 'text-[13px]'}`}>
            “{line}”<span className="ipb-caret">▍</span>
          </span>
        </div>
        <span className="shrink-0 font-mono text-[11px] uppercase tracking-[2px] bg-lime text-obsidian font-bold px-3.5 py-2 rounded-sm group-hover:opacity-90 group-hover:shadow-[0_0_14px_rgba(228,254,82,0.35)] transition-all whitespace-nowrap">
        <span className="hidden sm:inline">Open the assistant </span>→
        </span>
      </div>
    </div>
  );
}
