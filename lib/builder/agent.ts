/* The Topia Agent engine — intent routing for /assistant. Pure.
 *
 * The agent ROUTES, specialists DO: create/manage intents carry the typed
 * seed to the bot-first surfaces; discovery and help are the agent's own
 * muscles (search cards, capability cards). Local grammar is the floor;
 * the LLM `agent` parse flow upgrades ambiguous phrasing. */

import { ROLE_TAGS } from '../profile/roleTags';

export type AgentEntity = 'people' | 'tools' | 'worlds' | 'events' | 'grants' | 'projects';

export type AgentIntent =
  | { kind: 'create'; what: 'event' | 'world' | 'project' | 'roadmap'; seed: string }
  | { kind: 'manage'; what: 'profile'; seed: string }
  | { kind: 'discover'; entity: AgentEntity; query: string; role?: string }
  | { kind: 'help' }
  | { kind: 'unknown'; raw: string };

/** What you can do on Topia — powers the help/empty-state cards AND the LLM
 * system prompt, so the agent never invents capabilities. */
export const CAPABILITIES = [
  { glyph: '◍', title: 'Build a world', blurb: 'a scene for your projects, people and roadmaps', href: '/dashboard/create-world' },
  { glyph: '◷', title: 'Host an event', blurb: 'RSVPs, guest questions, tickets — described in one sentence', href: '/events/create' },
  { glyph: '✦', title: 'Roadmap in public', blurb: 'milestones with an audience — In Process on your world', href: '/worlds' },
  { glyph: '$', title: 'Fund milestones', blurb: 'backers support the work directly', href: '/worlds' },
  { glyph: '❒', title: 'Your passport', blurb: 'bio, roles, socials, stamps — edited by talking', href: '/profile' },
  { glyph: '⚒', title: 'Tools directory', blurb: 'what creators actually use, savable to your kit', href: '/resources/tools' },
  { glyph: '💸', title: 'Grants', blurb: 'money for creative work, curated', href: '/resources/grants' },
  { glyph: '✉', title: 'Messages', blurb: 'DMs with the people you meet here', href: '/messages' },
  { glyph: '▷', title: 'Topia TV', blurb: 'watch what the community ships', href: '/tv' },
] as const;

const ENTITY_WORDS: [RegExp, AgentEntity][] = [
  [/\b(?:creators?|people|artists?|members?|folks|users?|topians?)\b/i, 'people'],
  [/\btools?\b|\bsoftware\b|\bapps?\b/i, 'tools'],
  [/\bworlds?\b|\bcommunit(?:y|ies)\b|\bcollectives?\b/i, 'worlds'],
  [/\bevents?\b|\bshows?\b|\bparties\b|\bhappening\b/i, 'events'],
  [/\bgrants?\b|\bfunding\b(?!\s+milestone)/i, 'grants'],
  [/\bprojects?\b/i, 'projects'],
];

/** A role word in the query ("photographers") → its slug for the search
 * role filter. Checks the house vocabulary, tolerant of plurals. */
export function roleFromQuery(text: string): string | null {
  const t = text.toLowerCase();
  for (const { slug, label } of ROLE_TAGS) {
    const l = label.toLowerCase();
    if (t.includes(l) || t.includes(`${l}s`)) return slug;
  }
  return null;
}

export function parseAgentUtterance(text: string): AgentIntent {
  const raw = text.trim();
  if (!raw) return { kind: 'unknown', raw };

  if (/^(?:help|what can (?:i|you) do|what is topia|how does this work|show me around)\b/i.test(raw)) {
    return { kind: 'help' };
  }

  // Creation verbs — routed to the bot-first surfaces, seed carried along.
  const create = raw.match(/\b(?:create|make|start|host|throw|plan|build|new)\b/i);
  if (create) {
    if (/\bevents?\b|\bparty\b|\bshow\b|\bworkshop\b|\bscreening\b|\bgig\b/i.test(raw)) return { kind: 'create', what: 'event', seed: raw };
    if (/\bworlds?\b|\bcommunity\b|\bcollective\b|\blabel\b/i.test(raw)) return { kind: 'create', what: 'world', seed: raw };
    if (/\broadmaps?\b|\bmilestones?\b/i.test(raw)) return { kind: 'create', what: 'roadmap', seed: raw };
    if (/\bprojects?\b/i.test(raw)) return { kind: 'create', what: 'project', seed: raw };
  }
  if (/\b(?:my (?:profile|passport|bio|avatar|pfp)|edit my|update my (?:bio|profile|photo))\b/i.test(raw)) {
    return { kind: 'manage', what: 'profile', seed: raw };
  }

  // Discovery: "show me…", "find…", "what tools should i use for…", "who…"
  const discover = /^(?:show me|find(?:\s+me)?|discover|browse|list|who(?:'s| is| are)?|what|which|any|recommend)\b/i.test(raw)
    || /\b(?:looking for|search for)\b/i.test(raw);
  const role = roleFromQuery(raw);
  if (discover || role) {
    // Scrub ALL scaffolding before entity matching — "show me…" must not hit
    // the events regex's "show", and "what tools do people use" must not hit
    // the people regex's "people".
    const scrubbed = raw
      .replace(/^(?:show me|find(?:\s+me)?|discover|browse|list|recommend|who(?:'s| is| are)?|what|which|any)\b/i, '')
      .replace(/\b(?:should i use|can i use|do people use|are there|is there|to follow|on topia)\b/gi, ' ');
    const entity = ENTITY_WORDS.find(([re]) => re.test(scrubbed))?.[1] ?? (role ? 'people' : null);
    if (entity) {
      // Distill the query: drop the entity nouns and joiners, keep the meat.
      const query = scrubbed
        .replace(/\bfor\b/gi, ' ')
        .replace(/\b(?:creators?|people|artists?|members?|tools?|worlds?|events?|grants?|projects?|communities)\b/gi, ' ')
        .replace(/[?.!]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      return { kind: 'discover', entity, query, ...(role && entity === 'people' ? { role } : {}) };
    }
  }

  return { kind: 'unknown', raw };
}

/* ── LLM clamp for the `agent` parse flow ──────────────────────────── */

const ENTITIES = new Set<AgentEntity>(['people', 'tools', 'worlds', 'events', 'grants', 'projects']);
const CREATABLES = new Set(['event', 'world', 'project', 'roadmap']);

export function clampAgentFields(raw: unknown): AgentIntent | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (r.intent === 'help') return { kind: 'help' };
  if (r.intent === 'create' && typeof r.what === 'string' && CREATABLES.has(r.what)) {
    return { kind: 'create', what: r.what as 'event' | 'world' | 'project' | 'roadmap', seed: typeof r.seed === 'string' ? r.seed.slice(0, 500) : '' };
  }
  if (r.intent === 'manage_profile') {
    return { kind: 'manage', what: 'profile', seed: typeof r.seed === 'string' ? r.seed.slice(0, 500) : '' };
  }
  if (r.intent === 'discover' && typeof r.entity === 'string' && ENTITIES.has(r.entity as AgentEntity)) {
    const role = typeof r.role === 'string' ? r.role.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40) : undefined;
    return {
      kind: 'discover',
      entity: r.entity as AgentEntity,
      query: typeof r.query === 'string' ? r.query.slice(0, 80) : '',
      ...(role ? { role } : {}),
    };
  }
  return null;
}
