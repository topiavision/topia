'use client';

/* The floating ✦ — the assistant follows you down the page. Fixed orb,
 * bottom-right, sitting above the mobile FrostedPill's clearance and under
 * the builder takeovers (z 2200 < 2300). Surfaces mount it alongside the
 * launcher and hide it while a builder is open. */

export function FloatingAssistant({ onOpen, hidden, label = 'Open the assistant' }: {
  onOpen: () => void;
  hidden?: boolean;
  label?: string;
}) {
  if (hidden) return null;
  return (
    <button
      onClick={onOpen}
      aria-label={label}
      title={label}
      className="ipb-float fixed z-[2200] w-12 h-12 rounded-full bg-obsidian text-lime text-[20px] leading-none inline-flex items-center justify-center cursor-pointer border right-4 sm:right-6 bottom-[var(--mobile-nav-clearance)] sm:bottom-6"
      style={{ borderColor: 'color-mix(in srgb, var(--orange) 45%, transparent)' }}
    >
      <span className="ipb-orb">✦</span>
    </button>
  );
}
