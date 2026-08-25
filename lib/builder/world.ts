/* World Builder engine — pure, dependency-free. The draft shape, the 12
 * categories (single source; the create-world form imports from here), the
 * refine-stage command grammar, the LLM-output clamp (used by BOTH the
 * client and /api/builder/parse — one validator, applied twice), and the
 * wire payload for POST /api/worlds/create. */

import { normalizeUrl } from './free-text';

/* Moved verbatim from app/dashboard/create-world/page.tsx. Category is
 * write-once (the update route's whitelist excludes it) — the bot says so. */
export const WORLD_CATEGORIES = [
  'Art', 'Music', 'Film', 'Gaming', 'Fashion', 'Technology',
  'Photography', 'Dance', 'Theater', 'Literature', 'Design', 'Other',
];

export interface DraftWorld {
  title: string;
  shortDescription: string | null;
  category: string | null;   // ∈ WORLD_CATEGORIES or null
  country: string | null;
  imageUrl: string | null;
}

export const emptyWorldDraft = (): DraftWorld =>
  ({ title: '', shortDescription: null, category: null, country: null, imageUrl: null });

/* Keyword → category, for free-text answers at the category stage and for
 * sanity-matching what the LLM returns. */
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  Art: ['art', 'artist', 'painting', 'illustration', 'gallery', 'mural'],
  Music: ['music', 'band', 'dj', 'producer', 'songs', 'audio', 'radio', 'album'],
  Film: ['film', 'movie', 'documentary', 'cinema', 'filmmaker'],
  Gaming: ['game', 'gaming', 'esports'],
  Fashion: ['fashion', 'clothing', 'apparel', 'streetwear', 'style'],
  Technology: ['tech', 'technology', 'software', 'app', 'ai', 'web3', 'crypto'],
  Photography: ['photo', 'photos', 'photography', 'photographer', 'camera'],
  Dance: ['dance', 'dancer', 'choreography', 'movement'],
  Theater: ['theater', 'theatre', 'play', 'stage', 'improv'],
  Literature: ['writing', 'poetry', 'book', 'books', 'literature', 'zine', 'novel', 'stories'],
  Design: ['design', 'designer', 'graphic', 'branding', 'typography'],
};

export function matchCategory(text: string): string | null {
  const t = ` ${text.toLowerCase()} `;
  const exact = WORLD_CATEGORIES.find((c) => c.toLowerCase() === text.trim().toLowerCase());
  if (exact) return exact;
  let best: { cat: string; hits: number } | null = null;
  for (const [cat, words] of Object.entries(CATEGORY_KEYWORDS)) {
    const hits = words.filter((w) => new RegExp(`\\b${w}\\b`).test(t)).length;
    if (hits > 0 && (!best || hits > best.hits)) best = { cat, hits };
  }
  return best?.cat ?? null;
}

/* ── Refine-stage commands (local, always available) ───────────────── */

export type WorldCommand =
  | { kind: 'set_title'; title: string }
  | { kind: 'set_description'; text: string }
  | { kind: 'set_category'; category: string }
  | { kind: 'set_country'; country: string }
  | { kind: 'unknown'; raw: string };

export function parseWorldUtterance(text: string): WorldCommand {
  const raw = text.trim();
  if (!raw) return { kind: 'unknown', raw };
  let m = raw.match(/^(?:call\s+it|name\s+it|rename(?:\s+it)?(?:\s+to)?|title\s*:?)\s+(.+)$/i);
  if (m) return { kind: 'set_title', title: m[1].trim().slice(0, 100) };
  m = raw.match(/^(?:description|about|tagline|bio)\s*:?\s+(.+)$/i);
  if (m) return { kind: 'set_description', text: m[1].trim().slice(0, 300) };
  m = raw.match(/^category\s*:?\s+(.+)$/i);
  if (m) {
    const cat = matchCategory(m[1]);
    if (cat) return { kind: 'set_category', category: cat };
  }
  m = raw.match(/^(?:country|based\s+in|location)\s*:?\s+(.+)$/i);
  if (m) return { kind: 'set_country', country: m[1].trim().slice(0, 56) };
  // A bare category name works too ("music").
  const bareCat = matchCategory(raw);
  if (bareCat && raw.split(/\s+/).length <= 3) return { kind: 'set_category', category: bareCat };
  return { kind: 'unknown', raw };
}

/* ── HQ manage commands (WorldManager — live edits over the update
 * whitelist, plus handoffs to the other builders) ──────────────────── */

export const WORLD_SOCIAL_KEYS = ['website', 'twitter', 'instagram', 'soundcloud', 'spotify', 'linkedin', 'substack'] as const;
export type WorldSocialKey = typeof WORLD_SOCIAL_KEYS[number];

export type WorldManageCommand =
  | { kind: 'set_tagline'; text: string }        // shortDescription
  | { kind: 'set_long_description'; text: string }
  | { kind: 'add_tool'; name: string }
  | { kind: 'remove_tool'; name: string }
  | { kind: 'set_social'; key: WorldSocialKey; url: string }
  | { kind: 'want_upload' }
  | { kind: 'handoff_members'; seed: string }
  | { kind: 'immutable'; field: 'title' | 'category' | 'country' }
  | { kind: 'handoff_project'; seed: string }
  | { kind: 'handoff_roadmap'; seed: string }
  | { kind: 'unknown'; raw: string };

export function parseWorldManageUtterance(text: string): WorldManageCommand {
  const raw = text.trim();
  if (!raw) return { kind: 'unknown', raw };

  // Things this bot must be honest about: the update route cannot touch these.
  if (/^(?:rename|call\s+it|name\s+it|title\s*:)/i.test(raw)) return { kind: 'immutable', field: 'title' };
  if (/^category\b/i.test(raw)) return { kind: 'immutable', field: 'category' };
  if (/^(?:country|location)\b/i.test(raw)) return { kind: 'immutable', field: 'country' };

  // Handoffs before field commands — "add a project called X" is not a tagline.
  if (/\b(?:add|new|create|start|make)\b.*\bproject\b/i.test(raw) || /^project\s*:/i.test(raw)) {
    return { kind: 'handoff_project', seed: raw };
  }
  if (/\broadmap\b|\bmilestone\b|in.?process/i.test(raw)) {
    return { kind: 'handoff_roadmap', seed: raw };
  }
  if (/\b(?:invite|member|collaborator|add\s+\S+\s+to\s+the\s+(?:world|team))\b/i.test(raw)) {
    return { kind: 'handoff_members', seed: raw };
  }

  if (/\b(?:cover|header|image|photo|banner)\b/i.test(raw) && !/^https?:/i.test(raw)) {
    return { kind: 'want_upload' };
  }

  let m = raw.match(/^(?:tagline|short\s*description|one.?liner)\s*:?\s+(.+)$/i);
  if (m) return { kind: 'set_tagline', text: m[1].trim().slice(0, 300) };
  m = raw.match(/^(?:description|about|story)\s*:?\s+(.+)$/i);
  if (m) return { kind: 'set_long_description', text: m[1].trim().slice(0, 5000) };
  m = raw.match(/^(?:add|use)\s+(?:the\s+tool\s+|tool\s+)?(.+?)(?:\s+to\s+(?:our|the)\s+tools?)?$/i);
  if (m && /\btool/i.test(raw)) return { kind: 'add_tool', name: m[1].replace(/\b(?:the\s+)?tools?\b/gi, '').trim().slice(0, 60) };
  m = raw.match(/^(?:remove|drop|delete)\s+(?:the\s+tool\s+|tool\s+)?(.+?)(?:\s+from\s+(?:our|the)\s+tools?)?$/i);
  if (m) return { kind: 'remove_tool', name: m[1].replace(/\b(?:the\s+)?tools?\b/gi, '').trim().slice(0, 60) };
  for (const key of WORLD_SOCIAL_KEYS) {
    const sm = raw.match(new RegExp(`^${key}\\s*:?\\s+(\\S+)$`, 'i'));
    if (sm) {
      const url = normalizeUrl(sm[1]);
      if (url) return { kind: 'set_social', key, url };
    }
  }
  // A bare pasted URL: classify by hostname when it maps to a platform.
  const bare = normalizeUrl(raw);
  if (bare && !/\s/.test(raw)) {
    const host = new URL(bare).hostname.replace(/^www\./, '');
    const key = (['twitter', 'instagram', 'soundcloud', 'spotify', 'linkedin', 'substack'] as const)
      .find((k) => host.includes(k === 'twitter' ? 'x.com' : k) || host.includes(k));
    return { kind: 'set_social', key: key ?? 'website', url: bare };
  }
  return { kind: 'unknown', raw };
}

/* ── LLM-output clamp — defense on both sides of the wire ──────────── */

export function clampWorldFields(raw: unknown): Partial<DraftWorld> {
  const out: Partial<DraftWorld> = {};
  if (!raw || typeof raw !== 'object') return out;
  const r = raw as Record<string, unknown>;
  if (typeof r.title === 'string' && r.title.trim()) out.title = r.title.trim().slice(0, 100);
  if (typeof r.shortDescription === 'string' && r.shortDescription.trim()) {
    out.shortDescription = r.shortDescription.trim().slice(0, 300);
  }
  if (typeof r.category === 'string') {
    const cat = WORLD_CATEGORIES.find((c) => c.toLowerCase() === (r.category as string).trim().toLowerCase());
    if (cat) out.category = cat;
  }
  if (typeof r.country === 'string' && r.country.trim()) out.country = r.country.trim().slice(0, 56);
  if (typeof r.imageUrl === 'string') {
    const u = normalizeUrl(r.imageUrl);
    if (u) out.imageUrl = u;
  }
  return out;
}

/* ── Wire payload ──────────────────────────────────────────────────── */

export function worldToCreatePayload(draft: DraftWorld, privyId: string) {
  return {
    privyId,
    title: draft.title.trim(),
    shortDescription: draft.shortDescription?.trim() || '',
    category: draft.category ?? '',
    country: draft.country?.trim() ?? '',
    imageUrl: draft.imageUrl ?? '',
  };
}
