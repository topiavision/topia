'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

/* The builder bots' shared chrome, extracted byte-faithful from the Roadmap
 * Builder: portal takeover, iOS-proof scroll lock, Escape, 100lvh backdrop,
 * mobile full-bleed (canvas band on top, chat below), desktop two-pane card.
 * This embeds the repo's hard-won mobile-keyboard lessons (CLAUDE.md rule 3):
 * plain flex column, no visualViewport code, browser handles the keyboard.
 *
 * Flows own everything conversational; the shell owns the room it happens in.
 * Orange is THE builder accent across all flows — deliberately not a prop. */

const ORANGE = 'var(--orange, #FF5C34)';

export function BuilderShell({ title, headerLink, onRequestClose, chat, canvas }: {
  title: string;
  /** Permanent escape hatch — "Use the form instead" — visible at every stage. */
  headerLink?: { label: string; onClick: () => void };
  /** Flow decides whether to confirm a discard before actually closing. */
  onRequestClose: () => void;
  chat: React.ReactNode;
  canvas: React.ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  /* Body scroll lock — position:fixed + top offset, because iOS Safari
   * ignores overflow:hidden alone. Restores scroll on close. */
  useEffect(() => {
    const scrollY = window.scrollY;
    const { style } = document.body;
    const prev = { position: style.position, top: style.top, width: style.width, overflow: style.overflow };
    const prevHtmlOverflow = document.documentElement.style.overflow;
    style.position = 'fixed';
    style.top = `-${scrollY}px`;
    style.width = '100%';
    style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    return () => {
      style.position = prev.position;
      style.top = prev.top;
      style.width = prev.width;
      style.overflow = prev.overflow;
      document.documentElement.style.overflow = prevHtmlOverflow;
      window.scrollTo(0, scrollY);
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onRequestClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onRequestClose]);

  if (!mounted) return null;

  const header = (
    <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-ink/10 shrink-0">
      <span className="font-mono text-[10px] font-bold uppercase tracking-[3px] whitespace-nowrap" style={{ color: ORANGE }}>
        <span className="ipb-orb">✦</span> {title}
      </span>
      <span className="flex items-center gap-3 min-w-0">
        {headerLink && (
          <button
            onClick={headerLink.onClick}
            className="font-mono text-[10px] uppercase tracking-[1px] underline cursor-pointer bg-transparent border-none text-ink/45 hover:text-ink/80 truncate"
          >
            {headerLink.label}
          </button>
        )}
        <button onClick={onRequestClose} aria-label="Close" className="font-mono text-[16px] leading-none text-ink/50 hover:text-ink cursor-pointer bg-transparent border-none px-1">×</button>
      </span>
    </div>
  );

  const content = (
    <>
      {/* Backdrop — lvh so a late keyboard frame never reveals the page. */}
      <div className="fixed inset-0 z-[2300] bg-black/70 backdrop-blur-[2px]" style={{ height: '100lvh' }} onClick={onRequestClose} />
      {/* Mobile: full-bleed takeover; the browser handles the keyboard. */}
      <div className="sm:hidden fixed inset-0 z-[2301] flex flex-col bg-[var(--page-bg)]" style={{ height: '100dvh', paddingTop: 'var(--safe-top, 0px)' }}>
        {header}
        <div className="shrink-0 max-h-[42%] overflow-y-auto border-b border-ink/10" style={{ WebkitOverflowScrolling: 'touch' }}>
          {canvas}
        </div>
        <div className="flex-1 min-h-0 flex flex-col">{chat}</div>
      </div>
      {/* Desktop: centered two-pane card — chat left, canvas right. */}
      <div className="hidden sm:flex fixed inset-0 z-[2301] items-center justify-center p-6 pointer-events-none">
        <div
          className="takeover-card pointer-events-auto w-full max-w-5xl h-[min(720px,88lvh)] grid grid-cols-[minmax(320px,1fr)_1.2fr] bg-[var(--page-bg)] border border-ink/10 rounded-2xl overflow-hidden"
          style={{ boxShadow: `0 24px 80px rgba(0,0,0,0.5), 0 0 48px color-mix(in srgb, var(--orange) 10%, transparent)` }}
        >
          <div className="flex flex-col min-h-0 border-r border-ink/10">
            {header}
            <div className="flex-1 min-h-0 flex flex-col">{chat}</div>
          </div>
          <div className="overflow-y-auto min-h-0">{canvas}</div>
        </div>
      </div>
    </>
  );

  return createPortal(content, document.body);
}
