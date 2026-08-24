/* In Process is deliberately the orange subsystem: it ignores the per-world
 * accent from worldConfig. Everything reads ORANGE from here — never a raw
 * hex, per the CSS-variables-only rule in CLAUDE.md. */
export const ORANGE = 'var(--orange, #FF5C34)';
export const STATUS_META: Record<string, string> = { done: 'DONE ✓', now: 'NOW', upcoming: 'UPCOMING', paused: 'PAUSED' };

/* Orange as punctuation: a translucent wash for hairlines, tinted card
 * backgrounds and the detail panel's left rule. Takes a percentage so call
 * sites read as intent rather than as a color-mix incantation. */
export const orangeMix = (pct: number) => `color-mix(in srgb, var(--orange) ${pct}%, transparent)`;
