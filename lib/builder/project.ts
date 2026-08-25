/* Project Builder engine — pure, dependency-free. Draft shape, the member
 * matcher for credits, the refine grammar, the LLM-output clamp (shared by
 * client and /api/builder/parse), and the wire payload for
 * POST /api/worlds/projects — including the house convention that tools are
 * stored as 'tool:Name' strings inside the tags jsonb array. */

import { normalizeUrl, classifyMediaUrl } from './free-text';

export interface DraftCredit { userId: string; name: string; role: string | null }
export interface DraftLink { label: string; url: string }

export interface DraftProject {
  name: string;
  description: string | null;
  imageUrl: string | null;
  videoUrl: string | null;
  url: string | null;
  links: DraftLink[];
  tags: string[];        // plain topic tags, no 'tool:' prefix here
  tools: string[];       // matched directory display names; serialized as 'tool:Name'
  credits: DraftCredit[];
}

export const emptyProjectDraft = (): DraftProject => ({
  name: '', description: null, imageUrl: null, videoUrl: null, url: null,
  links: [], tags: [], tools: [], credits: [],
});

/* ── Member matching for credits ───────────────────────────────────── */

export interface MemberOption { userId: string; name: string | null; username: string | null }

export type MemberMatch =
  | { ok: true; userId: string }
  | { ok: false; candidates: number[] }; // indexes into the members array

/* Same ladder as the roadmap's matchMilestone: exact → prefix → token
 * subset → substring, against both display name and username. */
export function matchMemberName(query: string, members: MemberOption[]): MemberMatch {
  const q = query.trim().toLowerCase();
  if (!q) return { ok: false, candidates: [] };
  const keys = members.map((m) => [
    (m.name ?? '').toLowerCase(),
    (m.username ?? '').toLowerCase(),
  ]);
  const tiers: ((k: string) => boolean)[] = [
    (k) => k === q,
    (k) => k.startsWith(q),
    (k) => q.split(/\s+/).every((w) => k.includes(w)),
    (k) => k.includes(q) || (k.length > 2 && q.includes(k)),
  ];
  for (const test of tiers) {
    const hits = keys.reduce<number[]>((acc, pair, i) => (pair.some((k) => k && test(k)) ? [...acc, i] : acc), []);
    if (hits.length === 1) return { ok: true, userId: members[hits[0]].userId };
    if (hits.length > 1) return { ok: false, candidates: hits };
  }
  return { ok: false, candidates: [] };
}

/* ── Refine-stage commands (local, always available) ───────────────── */

export type ProjectCommand =
  | { kind: 'set_name'; name: string }
  | { kind: 'set_description'; text: string }
  | { kind: 'add_tag'; tag: string }
  | { kind: 'remove_tag'; tag: string }
  | { kind: 'set_url'; url: string; media: 'video' | 'link' }
  | { kind: 'unknown'; raw: string };

export function parseProjectUtterance(text: string): ProjectCommand {
  const raw = text.trim();
  if (!raw) return { kind: 'unknown', raw };
  let m = raw.match(/^(?:call\s+it|name\s+it|rename(?:\s+it)?(?:\s+to)?|title\s*:?)\s+(.+)$/i);
  if (m) return { kind: 'set_name', name: m[1].trim().slice(0, 100) };
  m = raw.match(/^(?:description|about|blurb)\s*:?\s+(.+)$/i);
  if (m) return { kind: 'set_description', text: m[1].trim().slice(0, 300) };
  m = raw.match(/^(?:add\s+)?tags?\s*:?\s+(.+)$/i) ?? raw.match(/^tag\s+(?:it\s+)?(.+)$/i);
  if (m) return { kind: 'add_tag', tag: m[1].trim().slice(0, 40) };
  m = raw.match(/^(?:remove|drop|delete)\s+(?:the\s+)?tag\s+(.+)$/i);
  if (m) return { kind: 'remove_tag', tag: m[1].trim() };
  // A bare pasted URL routes itself.
  const url = normalizeUrl(raw);
  if (url && !/\s/.test(raw.trim())) return { kind: 'set_url', url, media: classifyMediaUrl(url) };
  return { kind: 'unknown', raw };
}

/* ── LLM-output clamp ──────────────────────────────────────────────── */

export interface ExtractedProject {
  name?: string;
  description?: string;
  url?: string;
  videoUrl?: string;
  tags?: string[];
  tools?: string[];
  credits?: { name: string; role: string | null }[];
}

export function clampProjectFields(raw: unknown): ExtractedProject {
  const out: ExtractedProject = {};
  if (!raw || typeof raw !== 'object') return out;
  const r = raw as Record<string, unknown>;
  if (typeof r.name === 'string' && r.name.trim()) out.name = r.name.trim().slice(0, 100);
  if (typeof r.description === 'string' && r.description.trim()) out.description = r.description.trim().slice(0, 300);
  for (const key of ['url', 'videoUrl'] as const) {
    if (typeof r[key] === 'string') {
      const u = normalizeUrl(r[key] as string);
      if (u) out[key] = u;
    }
  }
  if (Array.isArray(r.tags)) {
    const tags = r.tags
      .filter((t): t is string => typeof t === 'string')
      .map((t) => t.trim().replace(/^#/, '').slice(0, 40))
      .filter((t) => t.length > 0 && !t.toLowerCase().startsWith('tool:'));
    if (tags.length) out.tags = [...new Set(tags)].slice(0, 8);
  }
  if (Array.isArray(r.tools)) {
    const tools = r.tools
      .filter((t): t is string => typeof t === 'string')
      .map((t) => t.trim().slice(0, 60))
      .filter(Boolean);
    if (tools.length) out.tools = [...new Set(tools)].slice(0, 10);
  }
  if (Array.isArray(r.credits)) {
    const credits = r.credits
      .filter((c): c is Record<string, unknown> => Boolean(c) && typeof c === 'object')
      .map((c) => ({
        name: typeof c.name === 'string' ? c.name.trim().slice(0, 60) : '',
        role: typeof c.role === 'string' && c.role.trim() ? c.role.trim().slice(0, 80) : null,
      }))
      .filter((c) => c.name.length > 0);
    if (credits.length) out.credits = credits.slice(0, 10);
  }
  return out;
}

/* ── Wire payload ──────────────────────────────────────────────────── */

export function projectToPayload(draft: DraftProject, worldId: string, privyId: string) {
  return {
    worldId,
    privyId,
    name: draft.name.trim(),
    description: draft.description?.trim() || null,
    content: null,
    imageUrl: draft.imageUrl || null,
    videoUrl: draft.videoUrl || null,
    url: draft.url || null,
    links: draft.links.length ? draft.links : null,
    // House convention: one jsonb array, tools ride as 'tool:Name'.
    tags: [...draft.tags, ...draft.tools.map((t) => `tool:${t}`)],
    credits: draft.credits.map((c) => ({ userId: c.userId, role: c.role })),
  };
}
