/* Event Builder engine — pure, dependency-free (imports only other lib/).
 *
 * Turns "a rooftop listening party in Brooklyn, Sept 12, 7pm, free, 60
 * people" into a draft the EventComposer can be prefilled with. The bot
 * NEVER saves an event — it hands the composer a completed draft and the
 * host reviews and publishes, exactly like the import-from-link flow.
 *
 * When-grammar V1 — SUPPORTED: month-name dates ("Sept 12", "September 12th
 * 2026" — year-less resolves to next future), times ("7pm", "7:30 PM",
 * "19:00", ranges "7-10pm" / "7pm to 10pm", "doors at 7"). WON'T parse (null,
 * never guessed): weekdays ("next Friday"), slash dates ("9/12" — ambiguous),
 * "tonight/tomorrow", holidays. Timezone stays the browser default. */

import { DEFAULT_LABELS, SELECT_TYPES, QUESTION_TYPES } from '../events/questions';
import { normalizeUrl } from './free-text';

export interface DraftEventQuestion { label: string; type: string; options: string[]; required: boolean }
export interface DraftEventTier {
  name: string; description: string | null; priceCents: number;
  quantityTotal: number | null; maxPerOrder: number; quantitySold: number;
  isActive: boolean; salesStartAt: string | null; salesEndAt: string | null;
}

export interface DraftEvent {
  eventName: string;
  dateIso: string;      // 'YYYY-MM-DD' or ''
  startTime: string;    // 'HH:MM' 24h or ''
  endTime: string;
  city: string;
  venue: string;
  description: string;
  link: string;
  worldId: string;      // '' = personal
  capacity: number | null;
  approval: boolean;
  questions: DraftEventQuestion[];
  tiers: DraftEventTier[];
}

export const emptyEventDraft = (): DraftEvent => ({
  eventName: '', dateIso: '', startTime: '', endTime: '', city: '', venue: '',
  description: '', link: '', worldId: '', capacity: null, approval: false,
  questions: [], tiers: [],
});

/* ── When-grammar ──────────────────────────────────────────────────── */

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const pad = (n: number) => String(n).padStart(2, '0');

function monthIndex(word: string): number {
  const w = word.toLowerCase().replace(/\.$/, '');
  return MONTHS.findIndex((m) => m === w || (w.length >= 3 && m.startsWith(w)));
}

/** One time token → 'HH:MM' 24h. "7pm"→19:00, "7:30am"→07:30, "19:00" as-is. */
export function parseTimeToken(raw: string): string | null {
  const m = raw.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = m[2] ? parseInt(m[2], 10) : 0;
  const ap = m[3]?.toLowerCase();
  if (h > 23 || min > 59) return null;
  if (ap === 'pm' && h < 12) h += 12;
  if (ap === 'am' && h === 12) h = 0;
  // Bare small hours with no am/pm ("doors at 7") read as evening — events
  // usually are. 8 → 20:00; 10 → 22:00; 13+ stays 24h.
  if (!ap && h >= 1 && h <= 11) h += 12;
  return `${pad(h)}:${pad(min)}`;
}

export function parseEventWhen(text: string, now: Date): { dateIso: string | null; startTime: string | null; endTime: string | null } {
  const t = text.toLowerCase();
  let dateIso: string | null = null;

  // "Sept 12" / "september 12th, 2026" — year-less → next future occurrence.
  const dm = t.match(/\b([a-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?\b/);
  if (dm) {
    const mi = monthIndex(dm[1]);
    const day = parseInt(dm[2], 10);
    if (mi >= 0 && day >= 1 && day <= 31) {
      let y = dm[3] ? parseInt(dm[3], 10) : now.getFullYear();
      if (!dm[3]) {
        const candidate = new Date(y, mi, day);
        if (candidate.getTime() < now.getTime() - 86400000) y += 1;
      }
      dateIso = `${y}-${pad(mi + 1)}-${pad(day)}`;
    }
  }

  // Time range first ("7-10pm", "7pm to 10pm", "7:30–9pm"), then single time.
  let startTime: string | null = null;
  let endTime: string | null = null;
  const range = t.match(/\b(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s*(?:-|–|—|to|until)\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm))\b/);
  if (range) {
    const end = parseTimeToken(range[2]);
    // A range like "7-10pm" borrows the meridiem for the start.
    const startRaw = /am|pm/i.test(range[1]) ? range[1] : range[1] + (range[2].match(/am|pm/i)?.[0] ?? '');
    const start = parseTimeToken(startRaw);
    if (start && end) { startTime = start; endTime = end; }
  }
  if (!startTime) {
    const single = t.match(/\b(?:at|from|doors(?:\s+at)?)?\s*\b(\d{1,2}(?::\d{2})?\s*(?:am|pm))\b/);
    if (single) startTime = parseTimeToken(single[1]);
    else {
      const bare = t.match(/\bdoors\s+at\s+(\d{1,2}(?::\d{2})?)\b/);
      if (bare) startTime = parseTimeToken(bare[1]);
    }
  }

  return { dateIso, startTime, endTime };
}

export function parseCapacity(text: string): number | null {
  const m = text.match(/\b(?:cap(?:acity|ped)?(?:\s+(?:at|of|to))?|limit(?:ed)?(?:\s+to)?|room\s+for|max(?:imum)?(?:\s+of)?)\s+(\d{1,6})\b/i)
    ?? text.match(/\b(\d{1,6})\s+(?:people|guests|spots|seats|attendees)\b/i);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return n >= 1 && n <= 100000 ? n : null;
}

/* ── Questions ─────────────────────────────────────────────────────── */

const VALID_QTYPES = new Set(QUESTION_TYPES.map((q) => q.value));

/** One asked-for thing → a typed question. "their instagram" → the
 * instagram type with its house label; "choose a track: A, B or C" → a
 * select with options; anything else → short_text with the phrase as label. */
export function phraseToQuestion(phrase: string): DraftEventQuestion | null {
  const p = phrase.trim().replace(/^(?:their|the|a|an)\s+/i, '').replace(/[.?]+$/, '');
  if (!p) return null;
  if (/instagram|\big\b/i.test(p)) return { label: DEFAULT_LABELS.instagram, type: 'instagram', options: [], required: false };
  if (/twitter|\bx\s*handle\b/i.test(p)) return { label: DEFAULT_LABELS.twitter, type: 'twitter', options: [], required: false };
  if (/\brole\b|what.*(?:do|they).*do/i.test(p)) return { label: DEFAULT_LABELS.roles, type: 'roles', options: [], required: false };
  const sel = p.match(/^(.*?)(?:\s*[:—-]\s*|\s*\()([^)]+?)\)?$/);
  if (sel && /,| or /i.test(sel[2])) {
    const options = sel[2].split(/,| or /i).map((o) => o.trim()).filter(Boolean).slice(0, 12);
    if (options.length >= 2) {
      return { label: cap(sel[1].trim() || 'Pick one'), type: 'single_select', options, required: false };
    }
  }
  const label = cap(p).slice(0, 120);
  return { label: label.endsWith('?') ? label : `${label}?`, type: 'short_text', options: [], required: false };
}

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** "their instagram and t-shirt size" → questions. A whole-text select
 * ("choose a track: vinyl, tape or digital") is tried first, since the
 * comma split would otherwise shred its option list. */
export function parseQuestionList(text: string): DraftEventQuestion[] {
  const whole = phraseToQuestion(text);
  if (whole && SELECT_TYPES.has(whole.type) && whole.options.length >= 2) return [whole];
  return text
    .split(/,|\band\b|;|\n/i)
    .map(phraseToQuestion)
    .filter((q): q is DraftEventQuestion => q !== null)
    .slice(0, 8);
}

/* ── Ticket tiers ──────────────────────────────────────────────────── */

/** "$25 early bird limited to 50, $40 at the door" → tiers. */
export function parseTierList(text: string): DraftEventTier[] {
  const out: DraftEventTier[] = [];
  for (const part of text.split(/,|;|\n/).map((p) => p.trim()).filter(Boolean)) {
    const price = part.match(/\$\s*(\d+(?:\.\d{1,2})?)/);
    if (!price) continue;
    const priceCents = Math.round(parseFloat(price[1]) * 100);
    const qty = part.match(/\b(?:limit(?:ed)?\s+to|only|first|x)\s*(\d{1,6})\b/i) ?? part.match(/\b(\d{1,6})\s+(?:available|tickets|spots)\b/i);
    let name = part
      .replace(price[0], '')
      .replace(qty?.[0] ?? '', '')
      .replace(/\b(?:tickets?|each|for)\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^[-–—:]+|[-–—:]+$/g, '')
      .trim();
    name = name.replace(/^at the door$/i, 'Door');
    if (!name) name = priceCents === 0 ? 'Free' : 'General';
    out.push({
      name: cap(name).slice(0, 60), description: null, priceCents,
      quantityTotal: qty ? parseInt(qty[1], 10) : null, maxPerOrder: 10,
      quantitySold: 0, isActive: true, salesStartAt: null, salesEndAt: null,
    });
    if (out.length >= 6) break;
  }
  return out;
}

/* ── LLM-output clamp (client AND /api/builder/parse) ──────────────── */

export interface ExtractedEvent {
  eventName?: string;
  description?: string;
  dateIso?: string;
  startTime?: string;
  endTime?: string;
  city?: string;
  venue?: string;
  link?: string;
  capacity?: number;
  questions?: DraftEventQuestion[];
  tiers?: { name: string; priceCents: number; quantityTotal: number | null }[];
}

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
const HHMM_RE = /^\d{2}:\d{2}$/;

export function clampEventFields(raw: unknown): ExtractedEvent {
  const out: ExtractedEvent = {};
  if (!raw || typeof raw !== 'object') return out;
  const r = raw as Record<string, unknown>;
  if (typeof r.eventName === 'string' && r.eventName.trim()) out.eventName = r.eventName.trim().slice(0, 120);
  if (typeof r.description === 'string' && r.description.trim()) out.description = r.description.trim().slice(0, 1000);
  if (typeof r.dateIso === 'string' && ISO_RE.test(r.dateIso)) out.dateIso = r.dateIso;
  for (const k of ['startTime', 'endTime'] as const) {
    if (typeof r[k] === 'string' && HHMM_RE.test(r[k] as string)) out[k] = r[k] as string;
  }
  for (const k of ['city', 'venue'] as const) {
    if (typeof r[k] === 'string' && (r[k] as string).trim()) out[k] = (r[k] as string).trim().slice(0, 80);
  }
  if (typeof r.link === 'string') {
    const u = normalizeUrl(r.link);
    if (u) out.link = u;
  }
  if (typeof r.capacity === 'number' && Number.isInteger(r.capacity) && r.capacity >= 1 && r.capacity <= 100000) {
    out.capacity = r.capacity;
  }
  if (Array.isArray(r.questions)) {
    const qs = r.questions
      .filter((q): q is Record<string, unknown> => Boolean(q) && typeof q === 'object')
      .map((q): DraftEventQuestion | null => {
        const label = typeof q.label === 'string' ? q.label.trim().slice(0, 120) : '';
        if (!label) return null;
        let type = typeof q.type === 'string' && VALID_QTYPES.has(q.type) ? q.type : 'short_text';
        const options = Array.isArray(q.options)
          ? q.options.filter((o): o is string => typeof o === 'string').map((o) => o.trim().slice(0, 60)).filter(Boolean).slice(0, 12)
          : [];
        // Select types without options can't render — demote to short_text.
        if (SELECT_TYPES.has(type) && type !== 'roles' && options.length < 2) type = 'short_text';
        return { label, type, options: SELECT_TYPES.has(type) && type !== 'roles' ? options : [], required: false };
      })
      .filter((q): q is DraftEventQuestion => q !== null);
    if (qs.length) out.questions = qs.slice(0, 8);
  }
  if (Array.isArray(r.tiers)) {
    const tiers = r.tiers
      .filter((t): t is Record<string, unknown> => Boolean(t) && typeof t === 'object')
      .map((t) => ({
        name: typeof t.name === 'string' ? t.name.trim().slice(0, 60) : '',
        priceCents: typeof t.priceCents === 'number' && Number.isInteger(t.priceCents) && t.priceCents >= 0 && t.priceCents <= 100_000_000 ? t.priceCents : -1,
        quantityTotal: typeof t.quantityTotal === 'number' && Number.isInteger(t.quantityTotal) && t.quantityTotal >= 1 ? t.quantityTotal : null,
      }))
      .filter((t) => t.name && t.priceCents >= 0);
    if (tiers.length) out.tiers = tiers.slice(0, 6);
  }
  return out;
}

/* ── Handoff to the composer ───────────────────────────────────────── */

/** The EventComposerInitial shape + staged extras — one mapping, one place. */
export function draftToComposer(draft: DraftEvent) {
  return {
    initial: {
      eventName: draft.eventName,
      dateIso: draft.dateIso,
      startTime: draft.startTime,
      endTime: draft.endTime,
      timezone: '',            // '' = composer falls back to the browser zone
      city: draft.city,
      venue: draft.venue,
      link: draft.link,
      description: draft.description,
      imageUrl: '',
      worldId: draft.worldId,
      published: false,
      rsvpCapacity: draft.capacity,
      rsvpApprovalRequired: draft.approval,
    },
    initialQuestions: draft.questions.map((q) => ({ ...q })),
    initialTickets: { tiers: draft.tiers.map((t) => ({ ...t })), promos: [] },
  };
}
