/* Profile Assistant engine — pure, dependency-free (lib-only imports).
 *
 * Live-edit model like the World Manager: one command → one minimal
 * /api/auth/sync body → "✓ saved". Sync contract quirks this encodes:
 * scalars patch individually (absent keys untouched), but roleTags and
 * toolSlugs are FULL-LIST CSV strings — every change re-sends the whole
 * list, joined. Roles speak labels to humans and slugs to storage
 * (lib/profile/roleTags helpers, both total). */

import { ROLE_TAGS, roleLabelToSlug, roleSlugToLabel } from '../profile/roleTags';
import { ROLES_MAX } from '../events/questions';
import { normalizeUrl } from './free-text';

export const PROFILE_SOCIAL_KEYS = ['website', 'twitter', 'instagram', 'soundcloud', 'spotify', 'linkedin', 'substack', 'farcaster'] as const;
export type ProfileSocialKey = typeof PROFILE_SOCIAL_KEYS[number];

/** The bot's live mirror of the editable profile. roleTags/toolSlugs are
 * SLUG arrays here; joins happen at the wire. */
export interface ProfileState {
  name: string | null;
  bio: string | null;
  pronouns: string | null;
  path: string | null;                 // worldbuilder | catalyst | anchor
  avatarUrl: string | null;
  stackTitle: string | null;
  roleTags: string[];
  toolSlugs: string[];
  socials: Partial<Record<ProfileSocialKey, string>>;
}

export type ProfileCommand =
  | { kind: 'set_bio'; text: string }
  | { kind: 'set_name'; text: string }
  | { kind: 'set_pronouns'; text: string }
  | { kind: 'set_stack_title'; text: string }
  | { kind: 'add_role'; label: string }
  | { kind: 'remove_role'; label: string }
  | { kind: 'add_tool'; name: string }
  | { kind: 'remove_tool'; name: string }
  | { kind: 'set_social'; key: ProfileSocialKey; url: string }
  | { kind: 'set_path'; path: 'worldbuilder' | 'catalyst' | 'anchor' }
  | { kind: 'want_avatar' }
  | { kind: 'handle' }                 // coached to the HandleChangeModal
  | { kind: 'unknown'; raw: string };

/** Fuzzy role match against the house vocabulary: exact label → prefix →
 * substring. Returns the canonical LABEL, or null (free-text roles are
 * allowed by the picker, so null means "use as typed"). */
export function matchRoleLabel(query: string): string | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  const labels = ROLE_TAGS.map((r) => r.label);
  return labels.find((l) => l.toLowerCase() === q)
    ?? labels.find((l) => l.toLowerCase().startsWith(q))
    ?? labels.find((l) => l.toLowerCase().includes(q))
    ?? null;
}

export function parseProfileUtterance(text: string): ProfileCommand {
  const raw = text.trim();
  if (!raw) return { kind: 'unknown', raw };

  if (/^(?:handle|username)\b/i.test(raw)) return { kind: 'handle' };
  if (/\b(?:photo|avatar|picture|pfp|headshot|selfie)\b/i.test(raw) && !/^https?:/i.test(raw)) {
    return { kind: 'want_avatar' };
  }

  let m = raw.match(/^bio\s*:?\s+([^]+)$/i);
  if (m) return { kind: 'set_bio', text: m[1].trim().slice(0, 280) };
  m = raw.match(/^name\s*:?\s+(.+)$/i);
  if (m) return { kind: 'set_name', text: m[1].trim().slice(0, 60) };
  m = raw.match(/^pronouns\s*:?\s+(.+)$/i);
  if (m) return { kind: 'set_pronouns', text: m[1].trim().slice(0, 24) };
  m = raw.match(/^(?:stack(?:\s+title)?)\s*:?\s+(.+)$/i);
  if (m) return { kind: 'set_stack_title', text: m[1].trim().slice(0, 60) };

  m = raw.match(/^(?:i'?m\s+an?|i\s+am\s+an?|add\s+(?:the\s+)?role|role\s*:)\s+(.+)$/i);
  if (m) return { kind: 'add_role', label: m[1].trim().slice(0, 40) };
  m = raw.match(/^(?:remove|drop)\s+(?:the\s+)?role\s+(.+)$/i);
  if (m) return { kind: 'remove_role', label: m[1].trim() };

  m = raw.match(/^(?:add|use)\s+(?:the\s+tool\s+|tool\s+)(.+)$/i);
  if (m) return { kind: 'add_tool', name: m[1].trim().slice(0, 60) };
  m = raw.match(/^(?:remove|drop)\s+(?:the\s+tool\s+|tool\s+)(.+)$/i);
  if (m) return { kind: 'remove_tool', name: m[1].trim().slice(0, 60) };

  m = raw.match(/^path\s*:?\s+(worldbuilder|catalyst|anchor)$/i);
  if (m) return { kind: 'set_path', path: m[1].toLowerCase() as 'worldbuilder' | 'catalyst' | 'anchor' };
  if (/^(worldbuilder|anchor)$/i.test(raw)) return { kind: 'set_path', path: raw.toLowerCase() as 'worldbuilder' | 'anchor' };

  for (const key of PROFILE_SOCIAL_KEYS) {
    const sm = raw.match(new RegExp(`^${key}\\s*:?\\s+(\\S+)$`, 'i'));
    if (sm) {
      const url = normalizeUrl(sm[1]);
      if (url) return { kind: 'set_social', key, url };
    }
  }
  const bare = normalizeUrl(raw);
  if (bare && !/\s/.test(raw.trim())) {
    const host = new URL(bare).hostname.replace(/^www\./, '');
    const key = PROFILE_SOCIAL_KEYS.find((k) => (k === 'twitter' ? host.includes('x.com') || host.includes('twitter') : host.includes(k)));
    return { kind: 'set_social', key: key ?? 'website', url: bare };
  }
  return { kind: 'unknown', raw };
}

/* ── LLM-output clamp (client + /api/builder/parse profile flow) ───── */

export interface ExtractedProfile {
  bio?: string;
  pronouns?: string;
  roleLabels?: string[];   // canonical labels only
  tools?: string[];        // names, matched to directory slugs client-side
  socials?: Partial<Record<ProfileSocialKey, string>>;
}

export function clampProfileFields(raw: unknown): ExtractedProfile {
  const out: ExtractedProfile = {};
  if (!raw || typeof raw !== 'object') return out;
  const r = raw as Record<string, unknown>;
  if (typeof r.bio === 'string' && r.bio.trim()) out.bio = r.bio.trim().slice(0, 280);
  if (typeof r.pronouns === 'string' && r.pronouns.trim()) out.pronouns = r.pronouns.trim().slice(0, 24);
  if (Array.isArray(r.roleLabels)) {
    const labels = r.roleLabels
      .filter((x): x is string => typeof x === 'string')
      .map((x) => matchRoleLabel(x) ?? '')
      .filter(Boolean);
    if (labels.length) out.roleLabels = [...new Set(labels)].slice(0, ROLES_MAX);
  }
  if (Array.isArray(r.tools)) {
    const tools = r.tools.filter((x): x is string => typeof x === 'string').map((x) => x.trim().slice(0, 60)).filter(Boolean);
    if (tools.length) out.tools = [...new Set(tools)].slice(0, 12);
  }
  if (r.socials && typeof r.socials === 'object') {
    const socials: ExtractedProfile['socials'] = {};
    for (const key of PROFILE_SOCIAL_KEYS) {
      const v = (r.socials as Record<string, unknown>)[key];
      if (typeof v === 'string') {
        const u = normalizeUrl(v);
        if (u) socials[key] = u;
      }
    }
    if (Object.keys(socials).length) out.socials = socials;
  }
  return out;
}

/* ── Wire helpers ──────────────────────────────────────────────────── */

const SOCIAL_FIELD: Record<ProfileSocialKey, string> = {
  website: 'socialWebsite', twitter: 'socialTwitter', instagram: 'socialInstagram',
  soundcloud: 'socialSoundcloud', spotify: 'socialSpotify', linkedin: 'socialLinkedin',
  substack: 'socialSubstack', farcaster: 'socialFarcaster',
};

/** The minimal sync body for one applied command against the NEW state.
 * roleTags/toolSlugs are full-list CSV per the sync contract. */
export function commandToSyncBody(cmd: ProfileCommand, next: ProfileState): Record<string, unknown> | null {
  switch (cmd.kind) {
    case 'set_bio': return { bio: next.bio };
    case 'set_name': return { name: next.name };
    case 'set_pronouns': return { pronouns: next.pronouns };
    case 'set_stack_title': return { stackTitle: next.stackTitle };
    case 'set_path': return { path: next.path };
    case 'add_role':
    case 'remove_role': return { roleTags: next.roleTags.join(',') || null };
    case 'add_tool':
    case 'remove_tool': return { toolSlugs: next.toolSlugs.join(',') || null };
    case 'set_social': return { [SOCIAL_FIELD[cmd.key]]: next.socials[cmd.key] ?? null };
    default: return null;
  }
}

/** Apply a command to the local mirror. Returns null when nothing changes
 * (already present, over the cap, etc.) with a reason for the bot to say. */
export function applyProfileCommand(state: ProfileState, cmd: ProfileCommand):
  | { next: ProfileState; reply: string }
  | { next: null; reply: string } {
  switch (cmd.kind) {
    case 'set_bio': return { next: { ...state, bio: cmd.text }, reply: 'Bio updated.' };
    case 'set_name': return { next: { ...state, name: cmd.text }, reply: `You're ${cmd.text}.` };
    case 'set_pronouns': return { next: { ...state, pronouns: cmd.text }, reply: 'Pronouns set.' };
    case 'set_stack_title': return { next: { ...state, stackTitle: cmd.text }, reply: 'Stack titled.' };
    case 'set_path': return { next: { ...state, path: cmd.path }, reply: cmd.path === 'catalyst' ? 'Path set — note catalysts can\'t create worlds.' : `Path set: ${cmd.path}.` };
    case 'add_role': {
      const label = matchRoleLabel(cmd.label) ?? cmd.label.trim();
      const slug = roleLabelToSlug(label);
      if (state.roleTags.includes(slug)) return { next: null, reply: `${label} is already on your passport.` };
      if (state.roleTags.length >= ROLES_MAX) {
        return { next: null, reply: `You're at ${ROLES_MAX} roles — remove one first (“remove role ${roleSlugToLabel(state.roleTags[0])}”).` };
      }
      return { next: { ...state, roleTags: [...state.roleTags, slug] }, reply: `${label} — added.` };
    }
    case 'remove_role': {
      const label = matchRoleLabel(cmd.label) ?? cmd.label.trim();
      const slug = roleLabelToSlug(label);
      if (!state.roleTags.includes(slug)) return { next: null, reply: `${label} isn't on your passport.` };
      return { next: { ...state, roleTags: state.roleTags.filter((s) => s !== slug) }, reply: `${label} — removed.` };
    }
    case 'set_social':
      return { next: { ...state, socials: { ...state.socials, [cmd.key]: cmd.url } }, reply: `${cmd.key} linked.` };
    default:
      return { next: null, reply: '' };
  }
}
