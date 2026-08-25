'use client';

import { useEffect, useRef, useState } from 'react';

/* The builder bots' shared chat surface: transcript with typewriter bot
 * replies, typing dots, staggered chips, composer. Generic over the chip
 * type — each flow keeps its own discriminated union (so its handleChip
 * switch stays exhaustiveness-checked) and ChatPane only reads label/accent.
 *
 * Style consts are local (not imported from world/) so shared code never
 * reaches into a domain folder. Values mirror InProcessFields. */

const inputCls = 'w-full border border-ink/15 bg-transparent px-3 py-2 font-mono text-[16px] sm:text-[13px] rounded-sm outline-none text-ink placeholder:text-ink/30 focus:border-ink/40';
const orangeMix = (pct: number) => `color-mix(in srgb, var(--orange) ${pct}%, transparent)`;

export interface ChatMessage { id: string; role: 'bot' | 'user'; text: string }
export interface ChipBase { label: string; accent?: boolean }

/* Bot replies type themselves out — the single biggest "someone's there"
 * cue. ~1s max regardless of length; already-seen messages render settled. */
function BotText({ text, animate, onGrow }: { text: string; animate: boolean; onGrow: () => void }) {
  const [shown, setShown] = useState(animate ? 0 : text.length);
  useEffect(() => {
    if (!animate) return;
    const step = Math.max(1, Math.ceil(text.length / 40));
    const iv = setInterval(() => {
      setShown((s) => {
        const next = Math.min(text.length, s + step);
        if (next >= text.length) clearInterval(iv);
        return next;
      });
      onGrow();
    }, 24);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const done = shown >= text.length;
  return <>{text.slice(0, shown)}{!done && <span className="ipb-caret">▍</span>}</>;
}

function TypingDots() {
  return (
    <div className="self-start rounded-lg px-3 py-2.5 bg-ink/[0.06] flex items-center gap-1 ipb-enter">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="ipb-dot w-1.5 h-1.5 rounded-full"
          style={{ backgroundColor: 'var(--orange)', ['--d' as string]: `${i * 160}ms` }}
        />
      ))}
    </div>
  );
}

export function ChatPane<C extends ChipBase>({ messages, chips, onChip, onSubmit, disabled, typing, extra, placeholder }: {
  messages: ChatMessage[];
  chips: C[];
  onChip: (chip: C) => void;
  onSubmit: (text: string) => void;
  disabled: boolean;
  /** A reply is on its way — show the thinking dots. */
  typing: boolean;
  /** Slot above the composer — date pickers, file inputs, etc. */
  extra?: React.ReactNode;
  placeholder?: string;
}) {
  const [text, setText] = useState('');
  const scrollerRef = useRef<HTMLDivElement>(null);
  // Ids already on screen in a previous commit — only genuinely new bot
  // messages play the typewriter. Mutated in an effect, never during render.
  const committed = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const m of messages) committed.current.add(m.id);
  }, [messages]);

  const scrollToEnd = () => {
    const el = scrollerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  };
  useEffect(scrollToEnd, [messages, chips, typing, extra]);

  const submit = () => {
    const t = text.trim();
    if (!t || disabled) return;
    setText('');
    onSubmit(t);
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div ref={scrollerRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-3 flex flex-col gap-2" style={{ WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain' }}>
        {messages.map((m) => {
          const animate = m.role === 'bot' && !committed.current.has(m.id);
          return (
            <div
              key={m.id}
              className={`ipb-enter max-w-[85%] rounded-lg px-3 py-2 font-mono text-[13px] leading-relaxed whitespace-pre-wrap ${
                m.role === 'bot' ? 'self-start bg-ink/[0.06] text-ink' : 'self-end text-ink border'
              }`}
              style={m.role === 'user' ? { backgroundColor: orangeMix(12), borderColor: orangeMix(45) } : undefined}
            >
              {m.role === 'bot' ? <BotText text={m.text} animate={animate} onGrow={scrollToEnd} /> : m.text}
            </div>
          );
        })}
        {typing && <TypingDots />}
        {chips.length > 0 && !typing && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {chips.map((c, i) => (
              <button
                key={`${c.label}-${i}`}
                onClick={() => onChip(c)}
                className={`ipb-enter font-mono text-[11px] uppercase tracking-[1px] px-2.5 py-1.5 rounded-full cursor-pointer transition-all hover:-translate-y-px ${
                  c.accent
                    ? 'bg-lime text-obsidian font-bold border-none hover:opacity-90 hover:shadow-[0_0_14px_rgba(228,254,82,0.35)]'
                    : 'bg-transparent text-ink/60 border border-ink/15 hover:border-ink/40 hover:text-ink'
                }`}
                style={{ ['--d' as string]: `${i * 45}ms` }}
              >
                {c.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="shrink-0 px-4 pb-4 pt-2 border-t border-ink/10">
        {extra}
        <div className="flex items-center gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }}
            placeholder={disabled ? 'Saving…' : placeholder ?? 'Type anything…'}
            disabled={disabled}
            className={inputCls}
            enterKeyHint="send"
          />
          <button
            onClick={submit}
            disabled={disabled || !text.trim()}
            aria-label="Send"
            className="font-mono text-[11px] uppercase tracking-[2px] bg-lime text-obsidian font-bold px-3 py-2 rounded-sm hover:opacity-90 hover:shadow-[0_0_14px_rgba(228,254,82,0.35)] transition-all cursor-pointer border-none disabled:opacity-40 shrink-0"
          >
            ↑
          </button>
        </div>
      </div>
    </div>
  );
}
