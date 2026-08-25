/* Natural-language date parsing for the Roadmap Builder.
 *
 * V1 grammar — SUPPORTED (all deterministic given `now`):
 *   - bare 4-digit years            "2027"            → year precision
 *   - month names ± year           "December", "march 2027" → month precision;
 *     a month with no year resolves to its NEXT future occurrence
 *   - month + day ± year           "March 3", "Dec 12, 2026" → day precision
 *   - relative                      "in 3 weeks/months/years", "next month",
 *                                   "next year", "end of the year",
 *                                   "early/mid/late 2027"
 *   - seasons                       "spring", "next summer", "fall 2027"
 *   - quarters                      "Q1", "q3 2027"
 *   - ranges                        "March to August", "from X until Y"
 *
 * V1 explicitly WON'T parse — returns null, never guesses:
 *   weekdays ("next Tuesday"), holidays ("by Christmas"), numeric slash
 *   dates ("3/15" — ambiguous), fuzzy words ("soon", "ASAP"), durations
 *   anchored to other milestones ("two weeks after mixing"), non-English. */

import type { ParsedDate, Precision } from './types';

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

const pad = (n: number) => String(n).padStart(2, '0');

function make(y: number, m: number, d: number, precision: Precision): ParsedDate {
  // Normalize like InProcessFields.normalizeDate: month → 1st, year → Jan 1.
  if (precision === 'year') return { value: `${y}-01-01`, precision };
  if (precision === 'month') return { value: `${y}-${pad(m)}-01`, precision };
  return { value: `${y}-${pad(m)}-${pad(d)}`, precision };
}

function monthIndex(word: string): number {
  const w = word.toLowerCase().replace(/\.$/, '');
  const i = MONTHS.findIndex((m) => m === w || (w.length >= 3 && m.startsWith(w)));
  return i; // 0-based, -1 if not a month
}

export function addMonths(y: number, m: number, delta: number): { y: number; m: number } {
  const idx = y * 12 + (m - 1) + delta;
  return { y: Math.floor(idx / 12), m: (idx % 12 + 12) % 12 + 1 };
}

/** Parse one natural date expression. `after` (default `now`) anchors
 * year-less months/seasons to their next occurrence at-or-after it. */
export function parseNaturalDate(text: string, now: Date, after?: Date): ParsedDate | null {
  const anchor = after ?? now;
  const t = text.trim().toLowerCase()
    .replace(/^(?:by|until|till|before|around|wrapping(?:\s+up)?(?:\s+by|\s+in)?|due)\s+/, '')
    .replace(/^(?:the\s+)?/, '')
    .replace(/[.!?]+$/, '')
    .trim();
  if (!t) return null;

  const aY = anchor.getFullYear();
  const aM = anchor.getMonth() + 1; // 1-based

  // Resolve a 1-based month with no year to its next occurrence.
  const nextOccurrence = (m: number) => (m >= aM ? aY : aY + 1);

  // "in N weeks/months/years"
  let m = t.match(/^in\s+(?:about\s+|around\s+)?(\d{1,2}|a|an)\s+(week|month|year)s?$/);
  if (m) {
    const n = m[1] === 'a' || m[1] === 'an' ? 1 : parseInt(m[1], 10);
    if (m[2] === 'week') {
      const d = new Date(now.getTime() + n * 7 * 86400000);
      return make(d.getFullYear(), d.getMonth() + 1, d.getDate(), 'day');
    }
    const delta = m[2] === 'month' ? n : n * 12;
    const r = addMonths(now.getFullYear(), now.getMonth() + 1, delta);
    return make(r.y, r.m, 1, 'month');
  }

  // "next month" / "next year"
  if (/^next\s+month$/.test(t)) {
    const r = addMonths(now.getFullYear(), now.getMonth() + 1, 1);
    return make(r.y, r.m, 1, 'month');
  }
  if (/^next\s+year$/.test(t)) return make(now.getFullYear() + 1, 1, 1, 'year');

  // "end of the year" / "end of 2027"
  m = t.match(/^end\s+of\s+(?:the\s+year|this\s+year|year)$/);
  if (m) return make(now.getFullYear(), 12, 1, 'month');
  m = t.match(/^end\s+of\s+(\d{4})$/);
  if (m) return make(parseInt(m[1], 10), 12, 1, 'month');

  // "early/mid/late 2027"
  m = t.match(/^(early|mid|late)\s+(\d{4})$/);
  if (m) {
    const mm = m[1] === 'early' ? 2 : m[1] === 'mid' ? 6 : 10;
    return make(parseInt(m[2], 10), mm, 1, 'month');
  }

  // Seasons: month precision on the season's core month.
  m = t.match(/^(?:(next|this)\s+)?(spring|summer|fall|autumn|winter)(?:\s+(?:of\s+)?(\d{4}))?$/);
  if (m) {
    const mm = { spring: 4, summer: 7, fall: 10, autumn: 10, winter: 1 }[m[2]]!;
    let y: number;
    if (m[3]) y = parseInt(m[3], 10);
    // "next spring" = the first spring strictly ahead of us; a season whose
    // month already passed (or is underway) rolls to next year.
    else if (m[1] === 'next') y = mm > aM ? aY : aY + 1;
    else y = nextOccurrence(mm);
    return make(y, mm, 1, 'month');
  }

  // Quarters: "Q1", "q3 2027" → Jan/Apr/Jul/Oct, month precision.
  m = t.match(/^q([1-4])(?:\s+(\d{4}))?$/);
  if (m) {
    const mm = (parseInt(m[1], 10) - 1) * 3 + 1;
    const y = m[2] ? parseInt(m[2], 10) : nextOccurrence(mm);
    return make(y, mm, 1, 'month');
  }

  // "March 3, 2027" / "March 3" / "Dec 12 2026" → day precision
  m = t.match(/^([a-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?$/);
  if (m) {
    const mi = monthIndex(m[1]);
    const day = parseInt(m[2], 10);
    if (mi >= 0 && day >= 1 && day <= 31) {
      const y = m[3] ? parseInt(m[3], 10) : nextOccurrence(mi + 1);
      return make(y, mi + 1, day, 'day');
    }
  }

  // "March 2027" / "December" → month precision
  m = t.match(/^([a-z]+)\.?(?:\s+(?:of\s+)?(\d{4}))?$/);
  if (m) {
    const mi = monthIndex(m[1]);
    if (mi >= 0) {
      const y = m[2] ? parseInt(m[2], 10) : nextOccurrence(mi + 1);
      return make(y, mi + 1, 1, 'month');
    }
  }

  // Bare year: "2027"
  m = t.match(/^(\d{4})$/);
  if (m) {
    const y = parseInt(m[1], 10);
    if (y >= 1900 && y <= 2200) return make(y, 1, 1, 'year');
  }

  return null;
}

/** Parse "X to Y" / "from X until Y" / "X – Y" ranges. The end side is
 * anchored after the start so "March to August" never runs backwards. */
export function parseDateRange(text: string, now: Date): { start: ParsedDate | null; end: ParsedDate | null } | null {
  const t = text.trim().toLowerCase().replace(/^from\s+/, '');
  const m = t.match(/^(.+?)\s*(?:\bto\b|\buntil\b|\bthrough\b|[–—]|\s-\s)\s*(.+)$/);
  if (!m) return null;
  const start = parseNaturalDate(m[1], now);
  if (!start) return null;
  const end = parseNaturalDate(m[2], now, new Date(`${start.value}T00:00:00`));
  if (!end) return null;
  return { start, end };
}

/** Spread fractions [0..1] across a start→end span as month-precision dates.
 * Used by template instantiation and set_timeframe redistribution. */
export function distributeDates(start: ParsedDate, end: ParsedDate, fracs: number[]): ParsedDate[] {
  const s = new Date(`${start.value}T00:00:00`);
  const e = new Date(`${end.value}T00:00:00`);
  const sIdx = s.getFullYear() * 12 + s.getMonth();
  const eIdx = Math.max(sIdx, e.getFullYear() * 12 + e.getMonth());
  return fracs.map((f) => {
    const idx = Math.round(sIdx + (eIdx - sIdx) * Math.min(1, Math.max(0, f)));
    return make(Math.floor(idx / 12), (idx % 12) + 1, 1, 'month');
  });
}

/** True when a ends strictly after b starts — used to reject backwards spans. */
export function isBefore(a: ParsedDate, b: ParsedDate): boolean {
  return a.value < b.value;
}
