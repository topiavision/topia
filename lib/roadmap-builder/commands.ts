/* Refinement commands — the grammar the chat understands once a draft
 * exists, and the pure reducer that applies each command. Bot reply copy
 * lives HERE (not in the UI) so the assertion script can pin the whole
 * conversation deterministically. Anything the grammar doesn't match becomes
 * `unknown`; the UI answers that with chips, never a dead end. */

import type {
  BuilderCommand, DraftMilestone, DraftRoadmap, MilestoneRef, MilestoneStatus, ParsedDate,
} from './types';
import { MAX_DRAFT_MILESTONES, MIN_GOAL_CENTS, MAX_GOAL_CENTS } from './types';
import { formatEraDate } from '../eraDates';
import { addMonths, parseNaturalDate, parseDateRange, distributeDates, isBefore } from './dates';

/* "$500" / "1,200" / "1.5k" → integer cents, or null when it isn't money. */
export function parseDollars(raw: string): number | null {
  const m = raw.trim().match(/^\$?\s*([\d,]+(?:\.\d+)?)\s*(k)?$/i);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ''));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * (m[2] ? 1000 : 1) * 100);
}

export const usdShort = (cents: number) =>
  `$${(cents / 100).toLocaleString('en-US', { maximumFractionDigits: cents % 100 === 0 ? 0 : 2 })}`;

/* ── Parsing ───────────────────────────────────────────────────────── */

const STATUS_WORDS: Record<string, MilestoneStatus> = {
  done: 'done', complete: 'done', completed: 'done', finished: 'done',
  now: 'now', 'in motion': 'now', current: 'now', started: 'now',
  upcoming: 'upcoming', next: 'upcoming', later: 'upcoming',
  paused: 'paused', 'on hold': 'paused',
};

function stripArticle(s: string): string {
  return s.replace(/^(?:the|a|an|my)\s+/i, '').trim();
}

/** Try to split a trailing date off an add-milestone title:
 * "vinyl drop in March" → { title: 'vinyl drop', start: Mar }. */
function splitTrailingDate(text: string, now: Date): { title: string; start: ParsedDate | null } {
  const m = text.match(/^(.{2,}?)\s+(?:in|by|around|for|on)\s+(.{2,40})$/i);
  if (m) {
    const start = parseNaturalDate(m[2], now);
    if (start) return { title: m[1].trim(), start };
  }
  return { title: text.trim(), start: null };
}

/** Conversational filler people naturally lead with ("actually call it X",
 * "let's say September", "I want to make it a year") — stripped so the
 * command grammar sees the command. Loops because fillers stack. */
export function stripFillers(text: string): string {
  let t = text.trim();
  for (let i = 0; i < 3; i++) {
    const next = t
      .replace(/^(?:so|actually|ok(?:ay)?|wait|hmm+|please|maybe|also)[,\s]+/i, '')
      .replace(/^no,\s+/i, '')
      .replace(/^(?:i\s+(?:want|would\s+like)\s+to|i'?d\s+(?:like|love)\s+to|let'?s(?:\s+say)?|how\s+about|what\s+about|can\s+(?:you|we)|could\s+(?:you|we))\s+/i, '')
      .trim();
    if (next === t) break;
    t = next;
  }
  return t;
}

export function parseUtterance(text: string, now: Date): BuilderCommand {
  const raw = stripFillers(text);
  const t = raw.toLowerCase();
  if (!raw) return { kind: 'unknown', raw: text.trim() };

  // Funding — MUST outrank the add-milestone pattern, or "add a $500 goal to
  // mixing" births a milestone literally titled "$500 goal to mixing".
  // "add a $500 goal to mixing" / "put a 1k goal on the shoot"
  let m = raw.match(/^(?:add|put|set)\s+(?:a\s+)?(\$?[\d,.]+k?)\s+(?:funding\s+)?goal\s+(?:to|on|for)\s+(.+)$/i);
  if (m) {
    const cents = parseDollars(m[1]);
    if (cents !== null) return { kind: 'set_goal', ref: { title: stripArticle(m[2]) }, cents };
  }
  // "fund mixing $500" / "fund the shoot with 1.5k"
  m = raw.match(/^fund\s+(.+?)\s+(?:with\s+|at\s+)?(\$?[\d,.]+k?)$/i);
  if (m) {
    const cents = parseDollars(m[2]);
    if (cents !== null) return { kind: 'set_goal', ref: { title: stripArticle(m[1]) }, cents };
  }
  // "$500 for mixing"
  m = raw.match(/^(\$[\d,.]+k?)\s+(?:for|on)\s+(.+)$/i);
  if (m) {
    const cents = parseDollars(m[1]);
    if (cents !== null) return { kind: 'set_goal', ref: { title: stripArticle(m[2]) }, cents };
  }
  // "remove the goal on mixing" / "clear the goal from the shoot" / "unfund mixing"
  m = raw.match(/^(?:remove|clear|drop)\s+(?:the\s+)?(?:funding\s+)?goal\s+(?:on|from|for)\s+(.+)$/i);
  if (!m) m = raw.match(/^unfund\s+(.+)$/i);
  if (m) return { kind: 'set_goal', ref: { title: stripArticle(m[1]) }, cents: null };

  // add: "add a milestone called X", "add vinyl drop in March", "new milestone: X"
  m = raw.match(/^(?:add|new)\s+(?:a\s+)?(?:milestone\s*[:,]?\s*)?(?:called\s+|named\s+)?(.+)$/i);
  if (m) {
    const { title, start } = splitTrailingDate(stripArticle(m[1]), now);
    if (title) return { kind: 'add_milestone', title, start };
  }

  // remove: "remove the trailer", "delete mixing", "cut episode 3"
  m = raw.match(/^(?:remove|delete|drop|cut|kill)\s+(?:the\s+)?(?:milestone\s+)?(.+)$/i);
  if (m) return { kind: 'remove_milestone', ref: { title: m[1].trim() } };

  // era rename: "rename it to X", "change the name to X" — must outrank the
  // milestone rename or "it" becomes a milestone ref.
  m = raw.match(/^(?:rename\s+(?:it|this)\s+to|change\s+the\s+(?:name|title)\s+to)\s+(.+)$/i);
  if (m) return { kind: 'set_era_title', title: m[1].trim() };

  // rename: "rename mixing to final mix"
  m = raw.match(/^rename\s+(.+?)\s+to\s+(.+)$/i);
  if (m) return { kind: 'rename_milestone', ref: { title: stripArticle(m[1]) }, title: m[2].trim() };

  // era title: "call it Season Two", "title: Orbit"
  m = raw.match(/^(?:call\s+it|name\s+it|title\s*:?)\s+(?!for\s+(?:a|an|one|two|three|\d{1,2})\s+(?:year|month)s?\b)(.+)$/i);
  if (m) return { kind: 'set_era_title', title: m[1].trim() };

  // era description: "description: field recordings from the road"
  m = raw.match(/^(?:description|about|blurb)\s*:?\s+(.+)$/i);
  if (m) return { kind: 'set_era_description', text: m[1].trim() };

  // status: "mark mixing done", "mixing is done", "done with the trailer",
  // "pause the tour", "start recording"
  m = raw.match(/^(?:mark|set)\s+(.+?)\s+(?:as\s+)?(done|complete|completed|finished|now|in motion|current|upcoming|paused|on hold)$/i);
  if (!m) m = raw.match(/^(.+?)\s+is\s+(done|complete|completed|finished|now|in motion|current|paused|on hold)$/i);
  if (m) return { kind: 'set_status', ref: { title: stripArticle(m[1]) }, status: STATUS_WORDS[m[2].toLowerCase()] };
  m = raw.match(/^(?:done|finished)\s+(?:with\s+)?(.+)$/i);
  if (m) return { kind: 'set_status', ref: { title: stripArticle(m[1]) }, status: 'done' };
  m = raw.match(/^pause\s+(.+)$/i);
  if (m) return { kind: 'set_status', ref: { title: stripArticle(m[1]) }, status: 'paused' };
  m = raw.match(/^(?:start|begin)\s+(.+)$/i);
  if (m && !/^over\b/i.test(m[1])) return { kind: 'set_status', ref: { title: stripArticle(m[1]) }, status: 'now' };

  // move: "move mixing to March" (date) / "move mixing to first|last|up|down"
  m = raw.match(/^move\s+(.+?)\s+(?:to\s+(?:the\s+)?)?(first|start|last|end|up|down|earlier|later)$/i);
  if (m) {
    const word = m[2].toLowerCase();
    const to = word === 'start' ? 'first' : word === 'end' ? 'last' : word === 'earlier' ? 'up' : word === 'later' ? 'down' : (word as 'first' | 'last' | 'up' | 'down');
    return { kind: 'move_milestone', ref: { title: stripArticle(m[1]) }, to };
  }
  m = raw.match(/^move\s+(.+?)\s+to\s+(.+)$/i);
  if (m) {
    const date = parseNaturalDate(m[2], now);
    if (date) return { kind: 'set_milestone_date', ref: { title: stripArticle(m[1]) }, start: date, end: null };
  }

  // timeframe: "finish by December", "wrap it up next spring",
  // "runs March to August", or a bare date ("next spring").
  m = raw.match(/^(?:finish|wrap(?:\s+(?:it\s+)?up)?|end|complete|release|ship|launch|drop)\s*(?:it|this)?\s*(?:by|in|around)?\s+(.+)$/i);
  if (m) {
    const end = parseNaturalDate(m[1], now);
    if (end) return { kind: 'set_timeframe', start: null, end };
  }
  // duration: "make it a year", "for 6 months", "a year" — end = now + span,
  // same arithmetic as the timeframe chips.
  m = raw.match(/^(?:make\s+(?:it|this)\s+|call\s+(?:it|this)\s+for\s+|for\s+)?(?:about\s+)?(a|an|one|two|three|\d{1,2})\s+(year|month)s?(?:\s+long)?$/i);
  if (m) {
    const n = m[1] === 'a' || m[1] === 'an' || m[1] === 'one' ? 1 : m[1] === 'two' ? 2 : m[1] === 'three' ? 3 : parseInt(m[1], 10);
    const months = m[2].toLowerCase() === 'year' ? n * 12 : n;
    if (months >= 1 && months <= 60) {
      const r = addMonths(now.getFullYear(), now.getMonth() + 1, months);
      return { kind: 'set_timeframe', start: null, end: { value: `${r.y}-${String(r.m).padStart(2, '0')}-01`, precision: 'month' } };
    }
  }

  const range = parseDateRange(t, now);
  if (range) return { kind: 'set_timeframe', ...range };
  const bare = parseNaturalDate(t, now);
  if (bare) return { kind: 'set_timeframe', start: null, end: bare };

  return { kind: 'unknown', raw };
}

/* ── Milestone resolution ──────────────────────────────────────────── */

export type MatchResult =
  | { ok: true; index: number }
  | { ok: false; candidates: number[] }; // empty = no match, >1 = ambiguous

export function matchMilestone(ref: MilestoneRef, milestones: DraftMilestone[]): MatchResult {
  if ('index' in ref) {
    return ref.index >= 0 && ref.index < milestones.length
      ? { ok: true, index: ref.index }
      : { ok: false, candidates: [] };
  }
  const q = ref.title.trim().toLowerCase();
  if (!q) return { ok: false, candidates: [] };
  const titles = milestones.map((m) => m.title.toLowerCase());

  const exact = titles.reduce<number[]>((acc, t, i) => (t === q ? [...acc, i] : acc), []);
  if (exact.length === 1) return { ok: true, index: exact[0] };
  if (exact.length > 1) return { ok: false, candidates: exact };

  const prefix = titles.reduce<number[]>((acc, t, i) => (t.startsWith(q) ? [...acc, i] : acc), []);
  if (prefix.length === 1) return { ok: true, index: prefix[0] };
  if (prefix.length > 1) return { ok: false, candidates: prefix };

  // Token subset: every word of the query appears in the title.
  const qWords = q.split(/\s+/).filter(Boolean);
  const subset = titles.reduce<number[]>((acc, t, i) => (qWords.every((w) => t.includes(w)) ? [...acc, i] : acc), []);
  if (subset.length === 1) return { ok: true, index: subset[0] };
  if (subset.length > 1) return { ok: false, candidates: subset };

  const substr = titles.reduce<number[]>((acc, t, i) => (t.includes(q) || q.includes(t) ? [...acc, i] : acc), []);
  if (substr.length === 1) return { ok: true, index: substr[0] };
  return { ok: false, candidates: substr };
}

/* ── The reducer ───────────────────────────────────────────────────── */

export interface ApplyResult { draft: DraftRoadmap; reply: string; ok: boolean }

const fmt = (d: ParsedDate | null) => (d ? formatEraDate(d.value, d.precision) ?? '' : '');

let keyCounter = 0;
function freshKey(draft: DraftRoadmap): string {
  // Keys only need to be unique within one draft; scan avoids global state.
  const used = new Set(draft.milestones.map((m) => m.key));
  let k: string;
  do { k = `m${++keyCounter}`; } while (used.has(k));
  return k;
}

function sortByDate(ms: DraftMilestone[]): DraftMilestone[] {
  // Stable: undated milestones keep their relative position at the end.
  return [...ms].sort((a, b) => {
    if (!a.start && !b.start) return 0;
    if (!a.start) return 1;
    if (!b.start) return -1;
    return a.start.value < b.start.value ? -1 : a.start.value > b.start.value ? 1 : 0;
  });
}

function ambiguousReply(candidates: number[], milestones: DraftMilestone[], raw?: string): string {
  if (candidates.length === 0) {
    return raw
      ? `I couldn't find a milestone matching “${raw}” — tap one on the roadmap, or try its exact name.`
      : `I couldn't find that milestone — tap one on the roadmap, or try its exact name.`;
  }
  const names = candidates.map((i) => `“${milestones[i].title}”`).join(' or ');
  return `Which one — ${names}?`;
}

export function applyCommand(draft: DraftRoadmap, cmd: BuilderCommand, now: Date): ApplyResult {
  switch (cmd.kind) {
    case 'add_milestone': {
      if (draft.milestones.length >= MAX_DRAFT_MILESTONES) {
        return { draft, ok: false, reply: `That's ${MAX_DRAFT_MILESTONES} milestones — a roadmap this dense stops reading as one. Save it and add more from the timeline if you need to.` };
      }
      const ms: DraftMilestone = {
        key: freshKey(draft), title: cmd.title, description: null,
        start: cmd.start, end: null, status: 'upcoming', datePinned: !!cmd.start,
        goalCents: null, goalBlurb: null, goalExternalCents: null,
      };
      const milestones = cmd.start ? sortByDate([...draft.milestones, ms]) : [...draft.milestones, ms];
      return {
        draft: { ...draft, milestones },
        ok: true,
        reply: cmd.start
          ? `Added “${cmd.title}” in ${fmt(cmd.start)}.`
          : `Added “${cmd.title}” at the end. Say “move ${cmd.title.toLowerCase()} to March” to place it.`,
      };
    }
    case 'remove_milestone': {
      const r = matchMilestone(cmd.ref, draft.milestones);
      if (!r.ok) return { draft, ok: false, reply: ambiguousReply(r.candidates, draft.milestones, 'title' in cmd.ref ? cmd.ref.title : undefined) };
      const gone = draft.milestones[r.index];
      return {
        draft: { ...draft, milestones: draft.milestones.filter((_, i) => i !== r.index) },
        ok: true, reply: `Removed “${gone.title}”.`,
      };
    }
    case 'rename_milestone': {
      const r = matchMilestone(cmd.ref, draft.milestones);
      if (!r.ok) return { draft, ok: false, reply: ambiguousReply(r.candidates, draft.milestones, 'title' in cmd.ref ? cmd.ref.title : undefined) };
      const milestones = draft.milestones.map((m, i) => (i === r.index ? { ...m, title: cmd.title } : m));
      return { draft: { ...draft, milestones }, ok: true, reply: `Renamed it to “${cmd.title}”.` };
    }
    case 'set_milestone_date': {
      const r = matchMilestone(cmd.ref, draft.milestones);
      if (!r.ok) return { draft, ok: false, reply: ambiguousReply(r.candidates, draft.milestones, 'title' in cmd.ref ? cmd.ref.title : undefined) };
      const target = draft.milestones[r.index];
      const updated: DraftMilestone = {
        ...target,
        start: cmd.start ?? target.start,
        end: cmd.end ?? target.end,
        datePinned: true,
      };
      const milestones = sortByDate(draft.milestones.map((m, i) => (i === r.index ? updated : m)));
      return {
        draft: { ...draft, milestones }, ok: true,
        reply: `“${target.title}” is now ${fmt(updated.start)}. That date is pinned — it'll survive timeline changes.`,
      };
    }
    case 'set_status': {
      const r = matchMilestone(cmd.ref, draft.milestones);
      if (!r.ok) return { draft, ok: false, reply: ambiguousReply(r.candidates, draft.milestones, 'title' in cmd.ref ? cmd.ref.title : undefined) };
      // Only one milestone is "now" at a time — the ring means something.
      const milestones = draft.milestones.map((m, i) => {
        if (i === r.index) return { ...m, status: cmd.status };
        if (cmd.status === 'now' && m.status === 'now') {
          return { ...m, status: (i < r.index ? 'done' : 'upcoming') as MilestoneStatus };
        }
        return m;
      });
      const word = { done: 'done ✓', now: 'in motion', upcoming: 'upcoming', paused: 'paused' }[cmd.status];
      return { draft: { ...draft, milestones }, ok: true, reply: `“${draft.milestones[r.index].title}” marked ${word}.` };
    }
    case 'set_milestone_description': {
      const r = matchMilestone(cmd.ref, draft.milestones);
      if (!r.ok) return { draft, ok: false, reply: ambiguousReply(r.candidates, draft.milestones, 'title' in cmd.ref ? cmd.ref.title : undefined) };
      const milestones = draft.milestones.map((m, i) => (i === r.index ? { ...m, description: cmd.text } : m));
      return { draft: { ...draft, milestones }, ok: true, reply: cmd.text ? `Noted on “${draft.milestones[r.index].title}”.` : `Cleared the note on “${draft.milestones[r.index].title}”.` };
    }
    case 'set_goal': {
      const r = matchMilestone(cmd.ref, draft.milestones);
      if (!r.ok) return { draft, ok: false, reply: ambiguousReply(r.candidates, draft.milestones, 'title' in cmd.ref ? cmd.ref.title : undefined) };
      if (cmd.cents !== null && cmd.cents < MIN_GOAL_CENTS) {
        return { draft, ok: false, reply: `A goal has to be at least $1.` };
      }
      if (cmd.cents !== null && cmd.cents > MAX_GOAL_CENTS) {
        return { draft, ok: false, reply: `Goals top out at $1,000,000.` };
      }
      const target = draft.milestones[r.index];
      const milestones = draft.milestones.map((m, i) => (i === r.index
        ? {
            ...m,
            goalCents: cmd.cents,
            goalBlurb: cmd.blurb !== undefined ? cmd.blurb : m.goalBlurb,
            goalExternalCents: cmd.externalCents !== undefined ? cmd.externalCents : m.goalExternalCents,
          }
        : m));
      return {
        draft: { ...draft, milestones }, ok: true,
        reply: cmd.cents === null
          ? `Cleared the goal on “${target.title}”.`
          : `Set a ${usdShort(cmd.cents)} goal on “${target.title}” — it goes live with the roadmap, and backers see exactly what it pays for if you add a line in its editor.`,
      };
    }
    case 'move_milestone': {
      const r = matchMilestone(cmd.ref, draft.milestones);
      if (!r.ok) return { draft, ok: false, reply: ambiguousReply(r.candidates, draft.milestones, 'title' in cmd.ref ? cmd.ref.title : undefined) };
      const ms = [...draft.milestones];
      const [target] = ms.splice(r.index, 1);
      let at = typeof cmd.to === 'number' ? cmd.to
        : cmd.to === 'first' ? 0
        : cmd.to === 'last' ? ms.length
        : cmd.to === 'up' ? Math.max(0, r.index - 1)
        : Math.min(ms.length, r.index + 1);
      at = Math.max(0, Math.min(ms.length, at));
      ms.splice(at, 0, { ...target, start: null, end: null, datePinned: false });
      return {
        draft: { ...draft, milestones: ms }, ok: true,
        reply: `Moved “${target.title}” — I cleared its date so the order sticks; tap it to set a new one.`,
      };
    }
    case 'set_era_title': {
      // A still-unnamed-then-borrowed project name follows the title — the
      // two started as the same answer, so a rename means both.
      const project = draft.project.mode === 'new' && draft.project.name === draft.title
        ? { mode: 'new' as const, name: cmd.title }
        : draft.project;
      return { draft: { ...draft, title: cmd.title, project }, ok: true, reply: `Calling it “${cmd.title}”.` };
    }
    case 'set_era_description':
      return { draft: { ...draft, description: cmd.text }, ok: true, reply: `Noted the description.` };
    case 'set_timeframe': {
      const start = cmd.start ?? draft.start;
      const end = cmd.end ?? draft.end;
      if (start && end && isBefore(end, start)) {
        return { draft, ok: false, reply: `That wraps before it starts — pick a later end date.` };
      }
      if (!start || !end) return { draft, ok: false, reply: `I need a date to work with — try “by December” or “March to August”.` };
      // Re-flow only the unpinned milestones across the new span, preserving
      // their relative spacing; pinned dates are untouched.
      const unpinned = draft.milestones.filter((m) => !m.datePinned);
      const fracs = unpinned.map((_, i) => (unpinned.length === 1 ? 0 : i / (unpinned.length - 1)));
      const dates = distributeDates(start, end, fracs);
      let u = 0;
      const milestones = sortByDate(draft.milestones.map((m) => (m.datePinned ? m : { ...m, start: dates[u++] })));
      const pinnedCount = draft.milestones.length - unpinned.length;
      return {
        draft: { ...draft, start, end, milestones }, ok: true,
        reply: `Re-flowed the timeline: ${fmt(start)} → ${fmt(end)}.${pinnedCount ? ` (${pinnedCount} pinned date${pinnedCount > 1 ? 's' : ''} left alone.)` : ''}`,
      };
    }
    case 'seed':
      // Seeds are applied by the UI via instantiate(); reaching here is a bug.
      return { draft, ok: false, reply: 'Something went sideways — try that again?' };
    case 'unknown':
    default:
      return {
        draft, ok: false,
        reply: `Didn't catch that — I'm simpler than I look. Try one of the buttons below, or tap a milestone on the roadmap to edit it directly.`,
      };
  }
}

/* ── Wire shape ────────────────────────────────────────────────────── */

export interface BatchMilestonePayload {
  title: string; description: string | null;
  startDate: string | null; endDate: string | null;
  startPrecision: string | null; endPrecision: string | null;
  status: MilestoneStatus; sortOrder: number;
}

export interface BatchBody {
  privyId: string; worldId: string;
  projectId?: string; newProjectName?: string;
  era: {
    title: string; description: string | null;
    startDate: string | null; endDate: string | null;
    startPrecision: string | null; endPrecision: string | null;
    status: 'active';
  };
  milestones: BatchMilestonePayload[];
}

/** The single place the draft→wire mapping lives. */
export function draftToBatchPayload(draft: DraftRoadmap, worldId: string, privyId: string): BatchBody {
  const body: BatchBody = {
    privyId, worldId,
    era: {
      title: draft.title.trim() || 'Untitled roadmap',
      description: draft.description?.trim() || null,
      startDate: draft.start?.value ?? null,
      endDate: draft.end?.value ?? null,
      startPrecision: draft.start?.precision ?? null,
      endPrecision: draft.end?.precision ?? null,
      status: 'active',
    },
    milestones: draft.milestones.map((m, i) => ({
      title: m.title.trim(),
      description: m.description?.trim() || null,
      startDate: m.start?.value ?? null,
      endDate: m.end?.value ?? null,
      startPrecision: m.start?.precision ?? null,
      endPrecision: m.end?.precision ?? null,
      status: m.status,
      sortOrder: i,
    })),
  };
  if (draft.project.mode === 'existing') body.projectId = draft.project.id;
  else if (draft.project.mode === 'new') body.newProjectName = draft.project.name.trim();
  return body;
}
