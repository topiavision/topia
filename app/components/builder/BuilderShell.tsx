'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useKeyboardViewport } from '../../hooks/useKeyboardViewport';

/* The builder bots' shared chrome. Desktop: two-pane (modal takeover or the
 * v0-style in-flow card). Phones: ONE presentation for every variant — the
 * exact full-screen portal takeover the Messages modal uses, because that's
 * the one mobile surface that has survived real iPhones:
 *   - an opaque under-layer pinned to 100lvh (the page and the nav pill can
 *     never show through, even mid-keyboard-animation),
 *   - a content layer clamped to the *visible* viewport via
 *     useKeyboardViewport, so the composer sits flush on the keyboard,
 *   - --safe-top padding for the status bar, iOS-proof body scroll lock.
 * No in-flow height math against the floating pill — that approach broke on
 * every device it met (#207, #208).
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
  /** 'modal' portals a takeover (default). 'page' renders in-flow on desktop —
   * the v0-style create pages where the builder IS the page. Phones get the
   * full-screen takeover either way. */
  variant?: 'modal' | 'page';
  /** Hide the × when there's nowhere meaningful to close to. */
  showClose?: boolean;
}) {
  const isModal = variant === 'modal';
  const [mounted, setMounted] = useState(false);
  const [shown, setShown] = useState(false);
  // Phones: chat leads, the live preview is a collapsible drawer. Desktop
  // keeps the two-pane spread.
  const [canvasOpen, setCanvasOpen] = useState(false);
  const mobileLayerRef = useRef<HTMLDivElement>(null);
  useKeyboardViewport(mobileLayerRef);

  useEffect(() => {
    const open = () => setCanvasOpen(true);
    window.addEventListener('topia:open-builder-canvas', open);
    return () => window.removeEventListener('topia:open-builder-canvas', open);
  }, []);

  // Double-rAF so the takeover's first paint is the transparent frame and the
  // fade actually plays (same dance as MessagesModal).
  useEffect(() => {
    setMounted(true);
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => { raf2 = requestAnimationFrame(() => setShown(true)); });
    return () => { cancelAnimationFrame(raf1); cancelAnimationFrame(raf2); };
  }, []);

  /* Body scroll lock — position:fixed + top offset, because iOS Safari
   * ignores overflow:hidden alone. Modal variant locks always; page variant
   * locks only while the phone takeover is the visible presentation, and
   * follows the breakpoint live (rotate/resize across 640px). */
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 640px)');
    let restore: (() => void) | null = null;
    const lock = () => {
      if (restore) return;
      const scrollY = window.scrollY;
      const { style } = document.body;
      const prev = { position: style.position, top: style.top, width: style.width, overflow: style.overflow };
      const prevHtmlOverflow = document.documentElement.style.overflow;
      style.position = 'fixed';
      style.top = `-${scrollY}px`;
      style.width = '100%';
      style.overflow = 'hidden';
      document.documentElement.style.overflow = 'hidden';
      restore = () => {
        style.position = prev.position;
        style.top = prev.top;
        style.width = prev.width;
        style.overflow = prev.overflow;
        document.documentElement.style.overflow = prevHtmlOverflow;
        window.scrollTo(0, scrollY);
        restore = null;
      };
    };
    const sync = () => { if (isModal || !mq.matches) lock(); else restore?.(); };
    sync();
    mq.addEventListener('change', sync);
    return () => { mq.removeEventListener('change', sync); restore?.(); };
  }, [isModal]);

  useEffect(() => {
    if (!isModal) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onRequestClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isModal, onRequestClose]);

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
          <button onClick={onRequestClose} aria-label="Close" className="flex items-center justify-center text-ink/50 hover:text-ink w-8 h-8 -my-1 -mr-2 rounded-full active:bg-ink/10 bg-transparent border-none cursor-pointer transition-colors">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        )}
      </span>
    </div>
  );

  const previewDrawer = (
    <>
      <button
        onClick={() => setCanvasOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-2.5 border-b border-ink/10 bg-transparent cursor-pointer shrink-0"
        aria-expanded={canvasOpen}
      >
        <span className="font-mono text-[10px] font-bold uppercase tracking-[2px] text-ink/50">▤ Live preview</span>
        <span className="font-mono text-[11px] text-ink/40">{canvasOpen ? 'hide ▴' : 'show ▾'}</span>
      </button>
      {canvasOpen && (
        <div className="shrink-0 max-h-[62%] overflow-y-auto border-b border-ink/10" style={{ WebkitOverflowScrolling: 'touch' }}>
          {canvas}
        </div>
      )}
    </>
  );

  /* ── Phones, both variants: the Messages-modal takeover, verbatim. ──
   * Under-layer: opaque, 100lvh, un-clamped — while useKeyboardViewport
   * shrinks the sheet above it to the visible viewport, this is what keeps
   * the page and the FrostedPill from ever peeking through. */
  const mobileTakeover = (
    <>
      <div
        className={`sm:hidden fixed inset-0 z-[2300] bg-[var(--page-bg)] transition-opacity duration-200 ${shown ? 'opacity-100' : 'opacity-0'}`}
        style={{ height: '100lvh', touchAction: 'none' }}
      />
      <div
        ref={mobileLayerRef}
        className={`sm:hidden fixed inset-0 z-[2301] flex flex-col text-ink transition-opacity duration-200 ${shown ? 'opacity-100' : 'opacity-0'}`}
        style={{ height: '100dvh', overflow: 'hidden', paddingTop: 'var(--safe-top, 0px)' }}
      >
        {header}
        {previewDrawer}
        <div className="flex-1 min-h-0 flex flex-col">{chat}</div>
      </div>
    </>
  );

  if (!isModal) {
    return (
      <>
        {/* Desktop: the in-flow two-pane card — chat left, live preview right. */}
        <div className="hidden sm:block w-full border border-ink/10 rounded-2xl overflow-hidden bg-[var(--page-bg)]" style={{ boxShadow: `0 0 48px color-mix(in srgb, var(--orange) 8%, transparent)` }}>
          <div className="grid grid-cols-[minmax(340px,1fr)_1.3fr]" style={{ height: 'calc(100dvh - var(--nav-height) - 4rem)', minHeight: 480 }}>
            <div className="flex flex-col min-h-0 border-r border-ink/10">
              {header}
              <div className="flex-1 min-h-0 flex flex-col">{chat}</div>
            </div>
            <div className="overflow-y-auto min-h-0">{canvas}</div>
          </div>
        </div>
        {mounted && createPortal(mobileTakeover, document.body)}
      </>
    );
  }

  if (!mounted) return null;

  const content = (
    <>
      {/* Desktop backdrop — lvh so a late keyboard frame never reveals the page. */}
      <div className="hidden sm:block fixed inset-0 z-[2300] bg-black/70 backdrop-blur-[2px]" style={{ height: '100lvh' }} onClick={onRequestClose} />
      {mobileTakeover}
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
