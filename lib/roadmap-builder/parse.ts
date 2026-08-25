/* Seed parsing — turns the first free-text description ("a podcast called
 * Signal, 8 episodes, wrapping next spring") into template + name + count +
 * timeframe. Chips can produce the same seed directly; this is the sugar. */

import type { ParsedDate, TemplateId } from './types';
import { TEMPLATES } from './templates';
import { parseNaturalDate, parseDateRange } from './dates';

export interface Seed {
  templateId: TemplateId;
  projectName: string | null;
  quantity: number | null;
  end: ParsedDate | null;
  start: ParsedDate | null;
}

function detectTemplate(text: string): TemplateId {
  const t = ` ${text.toLowerCase()} `;
  let best: { id: TemplateId; hits: number } = { id: 'generic', hits: 0 };
  for (const tpl of TEMPLATES) {
    let hits = 0;
    for (const kw of tpl.keywords) {
      // Word-boundary match so "ep" doesn't fire inside "episode".
      if (new RegExp(`\\b${kw}\\b`).test(t)) hits++;
    }
    if (hits > best.hits) best = { id: tpl.id, hits };
  }
  return best.id;
}

function extractProjectName(text: string): string | null {
  // "called Signal" / 'named "The Long Way"' / "titled X" — stop at commas,
  // periods, or a following clause.
  let m = text.match(/(?:called|named|titled)\s+["'“”]?([^"'“”,.\n]+)["'“”]?/i);
  if (m) return m[1].trim().slice(0, 80) || null;
  // A bare quoted string reads as the name: 'a zine, "Field Notes"'.
  m = text.match(/["“]([^"”]{2,80})["”]/);
  if (m) return m[1].trim() || null;
  return null;
}

function extractQuantity(text: string, templateId: TemplateId): number | null {
  const tpl = TEMPLATES.find((t) => t.id === templateId);
  if (!tpl?.countable) return null;
  const m = text.toLowerCase().match(/(\d{1,2})\s+([a-z]+)/g);
  if (!m) return null;
  for (const pair of m) {
    const [, num, unit] = pair.match(/(\d{1,2})\s+([a-z]+)/)!;
    if (tpl.countable.unit.test(unit)) {
      const n = parseInt(num, 10);
      if (n >= 1) return n;
    }
  }
  return null;
}

function extractTimeframe(text: string, now: Date): { start: ParsedDate | null; end: ParsedDate | null } {
  // Explicit range anywhere in the tail: "March to August".
  const range = parseDateRange(text, now);
  if (range) return range;
  // "by December" / "wrapping next spring" / "out March 2027" / "due 2027".
  const m = text.match(/\b(?:by|until|till|before|wrapping(?:\s+up)?(?:\s+by|\s+in)?|due|out(?:\s+by|\s+in)?|releasing(?:\s+in)?|dropping(?:\s+in)?|done(?:\s+by)?|finished(?:\s+by)?)\s+(.{2,40})$/i);
  if (m) {
    const end = parseNaturalDate(m[1], now);
    if (end) return { start: null, end };
  }
  // Last resort: a trailing clause after the final comma that parses cleanly
  // as a date ("…, next spring").
  const tail = text.split(',').pop()?.trim();
  if (tail && tail !== text.trim()) {
    const end = parseNaturalDate(tail, now);
    if (end) return { start: null, end };
  }
  return { start: null, end: null };
}

export function parseSeed(text: string, now: Date): Seed {
  const templateId = detectTemplate(text);
  const { start, end } = extractTimeframe(text, now);
  return {
    templateId,
    projectName: extractProjectName(text),
    quantity: extractQuantity(text, templateId),
    end,
    start,
  };
}
