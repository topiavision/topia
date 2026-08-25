'use client';

import { useState } from 'react';

/* The assistant bar — the obvious go-to on manage surfaces. A persistent
 * "✦ tell me what you want" input that launches the surface's builder bot
 * with the typed text as its first processed message. Suggestion chips
 * launch with a canned seed so nobody has to guess what it understands.
 *
 * Deliberately NOT the ⌘K command palette: the palette searches and goes
 * places (global overlay); this bar does things to the surface it sits on.
 * Different look (inline, orange ✦), no keyboard shortcut claimed. */

const ORANGE = 'var(--orange, #FF5C34)';
const orangeMix = (pct: number) => `color-mix(in srgb, var(--orange) ${pct}%, transparent)`;

export function AssistantBar({ placeholder, suggestions = [], onLaunch, id }: {
  placeholder: string;
  /** 2-4 canned prompts; clicking launches the bot with that seed. */
  suggestions?: string[];
  onLaunch: (seed: string) => void;
  id?: string;
}) {
  const [text, setText] = useState('');

  const go = (seed: string) => {
    const t = seed.trim();
    if (!t) return;
    setText('');
    onLaunch(t);
  };

  return (
    <div
      id={id}
      className="ipb-enter rounded-lg border p-3 sm:p-3.5"
      style={{ borderColor: orangeMix(35), backgroundColor: orangeMix(4) }}
    >
      <div className="flex items-center gap-2.5">
        <span className="ipb-orb text-[15px] shrink-0" style={{ color: ORANGE }}>✦</span>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); go(text); } }}
          placeholder={placeholder}
          enterKeyHint="go"
          className="w-full bg-transparent border-none outline-none font-mono text-[16px] sm:text-[13px] text-ink placeholder:text-ink/40"
        />
        <button
          onClick={() => go(text)}
          disabled={!text.trim()}
          aria-label="Ask the assistant"
          className="font-mono text-[13px] font-bold px-2.5 py-1 rounded-sm bg-lime text-obsidian hover:opacity-90 hover:shadow-[0_0_14px_rgba(228,254,82,0.35)] transition-all cursor-pointer border-none disabled:opacity-30 shrink-0"
        >
          →
        </button>
      </div>
      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2.5 pl-6">
          {suggestions.map((s, i) => (
            <button
              key={s}
              onClick={() => go(s)}
              className="ipb-enter font-mono text-[10px] uppercase tracking-[1px] px-2 py-1 rounded-full border border-ink/12 text-ink/50 hover:border-ink/40 hover:text-ink bg-transparent cursor-pointer transition-all hover:-translate-y-px"
              style={{ ['--d' as string]: `${i * 60}ms` }}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
