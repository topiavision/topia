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

export function BuilderShell({ title, headerLink, onRequestClose, chat, canvas, variant = 'modal', showClose = true }: {
  title: string;
  /** Permanent escape hatch — "Use the form instead" — visible at every stage. */
  headerLink?: { label: string; onClick: () => void };
  /** Flow decides whether to confirm a discard before actually closing. */
  onRequestClose: () => void;
  chat: React.ReactNode;
  canvas: React.ReactNode;
  /** 'modal' portals a takeover (default). 'page' renders in-flow — the
   * v0-style create pages where the builder IS the page: no backdrop, no
   * scroll lock, nav stays reachable. */
  variant?: 'modal' | 'page';
  /** Hide the × when there's nowhere meaningful to close to. */
  showClose?: boolean;
}) {
  const isModal = variant === 'modal';
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  /* Body scroll lock — position:fixed + top offset, because iOS Safari
   * ignores overflow:hidden alone. Restores scroll on close. */
  useEffect(() => {
    if (!isModal) return;
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
    if (!isModal) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onRequestClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onRequestClose]);

  if (isModal && !mounted) return null;

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
        {showClose && (
          <button onClick={onRequestClose} aria-label="Close" className="font-mono text-[16px] leading-none text-ink/50 hover:text-ink cursor-pointer bg-transparent border-none px-1">×</button>
        )}
      </span>
    </div>
  );

  if (!isModal) {
    return (
      <div className="w-full border border-ink/10 rounded-2xl overflow-hidden bg-[var(--page-bg)]" style={{ boxShadow: `0 0 48px color-mix(in srgb, var(--orange) 8%, transparent)` }}>
        {/* Mobile: canvas band above chat, in flow — the browser handles the
            keyboard, the nav stays reachable. */}
        <div className="sm:hidden flex flex-col" style={{ minHeight: 'calc(100dvh - var(--nav-height) - 24px)' }}>
          {header}
          <div className="shrink-0 max-h-[40vh] overflow-y-auto border-b border-ink/10" style={{ WebkitOverflowScrolling: 'touch' }}>
            {canvas}
          </div>
          <div className="flex-1 min-h-0 flex flex-col">{chat}</div>
        </div>
        {/* Desktop: the full-page two-pane — chat left, live preview right. */}
        <div className="hidden sm:grid grid-cols-[minmax(340px,1fr)_1.3fr]" style={{ height: 'calc(100dvh - var(--nav-height) - 4rem)', minHeight: 480 }}>
          <div className="flex flex-col min-h-0 border-r border-ink/10">
            {header}
            <div className="flex-1 min-h-0 flex flex-col">{chat}</div>
          </div>
          <div className="overflow-y-auto min-h-0">{canvas}</div>
        </div>
      </div>
    );
  }

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
      {/* Desktop: the SAME full-screen takeover, two-pane — every assistant
        * presents one way now, per the founder: full screen, × to exit. */}
      <div className="hidden sm:grid fixed inset-0 z-[2301] grid-cols-[minmax(340px,1fr)_1.3fr] bg-[var(--page-bg)] takeover-card" style={{ height: '100dvh' }}>
        <div className="flex flex-col min-h-0 border-r border-ink/10">
          {header}
          <div className="flex-1 min-h-0 flex flex-col">{chat}</div>
        </div>
        <div className="overflow-y-auto min-h-0">{canvas}</div>
      </div>
    </>
  );

  return createPortal(content, document.body);
}
