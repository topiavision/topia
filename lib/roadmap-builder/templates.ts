/* Roadmap templates — the "intelligence" of the builder, hand-written.
 *
 * Each template is a milestone arc with relative timing fractions; the seed
 * step picks one by keyword, `instantiate` stretches it across the user's
 * timeframe. No LLM anywhere — the magic is that a creator's projects mostly
 * follow well-known arcs, and a good default beats an empty form. */

import type { DraftMilestone, DraftRoadmap, ParsedDate, TemplateId } from './types';
import { MAX_COUNTABLE_REPEATS } from './types';
import { addMonths, distributeDates } from './dates';

export interface TemplateMilestone { title: string; description?: string; frac: number }

export interface RoadmapTemplate {
  id: TemplateId;
  /** "an album" — slots into bot copy. */
  label: string;
  /** Chip text in the describe stage. */
  chipLabel: string;
  /** Free-text detection; hit-count picks the template, catalog order breaks ties. */
  keywords: string[];
  /** Era title when the project has no name to borrow. */
  defaultEraTitle: string;
  defaultSpanMonths: number;
  milestones: TemplateMilestone[];
  /** "8 episodes" support: repeated items spread across a band of the arc. */
  countable?: { unit: RegExp; itemTitle: string; fromFrac: number; toFrac: number };
}

export const TEMPLATES: RoadmapTemplate[] = [
  {
    id: 'album', label: 'an album', chipLabel: 'Album / EP',
    keywords: ['album', 'ep', 'single', 'mixtape', 'record', 'lp', 'music', 'song', 'songs', 'tracks'],
    defaultEraTitle: 'The Album', defaultSpanMonths: 9,
    milestones: [
      { title: 'Writing & demos', frac: 0 },
      { title: 'Pre-production', frac: 0.15 },
      { title: 'Recording', frac: 0.3 },
      { title: 'Mixing', frac: 0.55 },
      { title: 'Mastering', frac: 0.7 },
      { title: 'Singles & rollout', frac: 0.82 },
      { title: 'Release day', frac: 1 },
    ],
    countable: { unit: /tracks?|songs?|singles?/, itemTitle: 'Single {N}', fromFrac: 0.75, toFrac: 0.95 },
  },
  {
    id: 'podcast', label: 'a podcast', chipLabel: 'Podcast / show',
    keywords: ['podcast', 'show', 'series', 'episode', 'episodes', 'radio', 'season'],
    defaultEraTitle: 'Season One', defaultSpanMonths: 6,
    milestones: [
      { title: 'Concept & format', frac: 0 },
      { title: 'Trailer', frac: 0.15 },
      { title: 'Record the first batch', frac: 0.3 },
      { title: 'Launch', frac: 0.45 },
      { title: 'Season finale', frac: 1 },
    ],
    countable: { unit: /episodes?/, itemTitle: 'Episode {N}', fromFrac: 0.5, toFrac: 0.92 },
  },
  {
    id: 'film', label: 'a film', chipLabel: 'Film / doc',
    keywords: ['film', 'documentary', 'doc', 'movie', 'short', 'video', 'screening'],
    defaultEraTitle: 'The Film', defaultSpanMonths: 12,
    milestones: [
      { title: 'Treatment', frac: 0 },
      { title: 'Script', frac: 0.12 },
      { title: 'Pre-production', frac: 0.25 },
      { title: 'The shoot', frac: 0.42 },
      { title: 'Edit', frac: 0.6 },
      { title: 'Sound & color', frac: 0.8 },
      { title: 'Premiere', frac: 1 },
    ],
  },
  {
    id: 'book', label: 'a book', chipLabel: 'Book / zine',
    keywords: ['book', 'zine', 'novel', 'memoir', 'poetry', 'chapbook', 'anthology', 'chapters', 'writing'],
    defaultEraTitle: 'The Book', defaultSpanMonths: 10,
    milestones: [
      { title: 'Outline', frac: 0 },
      { title: 'First draft', frac: 0.2 },
      { title: 'Edit & revise', frac: 0.5 },
      { title: 'Design & layout', frac: 0.7 },
      { title: 'Print', frac: 0.85 },
      { title: 'Launch', frac: 1 },
    ],
    countable: { unit: /chapters?|issues?/, itemTitle: 'Chapter {N}', fromFrac: 0.2, toFrac: 0.48 },
  },
  {
    id: 'fashion', label: 'a collection', chipLabel: 'Fashion drop',
    keywords: ['fashion', 'collection', 'clothing', 'apparel', 'merch', 'drop', 'streetwear', 'looks'],
    defaultEraTitle: 'The Collection', defaultSpanMonths: 8,
    milestones: [
      { title: 'Concept & moodboard', frac: 0 },
      { title: 'Sourcing', frac: 0.18 },
      { title: 'Samples', frac: 0.38 },
      { title: 'Production', frac: 0.6 },
      { title: 'Lookbook', frac: 0.8 },
      { title: 'The drop', frac: 1 },
    ],
    countable: { unit: /looks?|pieces?/, itemTitle: 'Look {N}', fromFrac: 0.35, toFrac: 0.55 },
  },
  {
    id: 'tour', label: 'a tour', chipLabel: 'Tour / events',
    keywords: ['tour', 'shows', 'gigs', 'dates', 'residency', 'concert', 'live'],
    defaultEraTitle: 'The Tour', defaultSpanMonths: 6,
    milestones: [
      { title: 'Routing & booking', frac: 0 },
      { title: 'Announce', frac: 0.2 },
      { title: 'Rehearsals', frac: 0.35 },
      { title: 'First show', frac: 0.5 },
      { title: 'Final show', frac: 1 },
    ],
    countable: { unit: /shows?|dates?|gigs?|stops?/, itemTitle: 'Show {N}', fromFrac: 0.5, toFrac: 0.95 },
  },
  {
    id: 'exhibition', label: 'an exhibition', chipLabel: 'Exhibition',
    keywords: ['exhibition', 'exhibit', 'gallery', 'installation', 'art show', 'opening', 'paintings', 'sculpture'],
    defaultEraTitle: 'The Exhibition', defaultSpanMonths: 8,
    milestones: [
      { title: 'Concept', frac: 0 },
      { title: 'Making the work', frac: 0.15 },
      { title: 'Lock the venue', frac: 0.5 },
      { title: 'Install', frac: 0.85 },
      { title: 'Opening night', frac: 0.92 },
      { title: 'Close', frac: 1 },
    ],
    countable: { unit: /pieces?|works?|paintings?/, itemTitle: 'Piece {N}', fromFrac: 0.15, toFrac: 0.45 },
  },
  {
    id: 'product', label: 'a product', chipLabel: 'Product / app',
    keywords: ['app', 'product', 'startup', 'website', 'platform', 'game', 'tool', 'software', 'launch'],
    defaultEraTitle: 'Version One', defaultSpanMonths: 8,
    milestones: [
      { title: 'Spec it out', frac: 0 },
      { title: 'Prototype', frac: 0.18 },
      { title: 'Alpha', frac: 0.4 },
      { title: 'Beta', frac: 0.65 },
      { title: 'Launch', frac: 0.9 },
      { title: 'v1.1', frac: 1 },
    ],
  },
  {
    id: 'generic', label: 'a project', chipLabel: 'Something else',
    keywords: [],
    defaultEraTitle: 'Year One', defaultSpanMonths: 6,
    milestones: [
      { title: 'Kickoff', frac: 0 },
      { title: 'First draft', frac: 0.25 },
      { title: 'In the thick of it', frac: 0.5 },
      { title: 'Final push', frac: 0.8 },
      { title: 'Ship it', frac: 1 },
    ],
  },
];

export function templateById(id: TemplateId): RoadmapTemplate {
  return TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[TEMPLATES.length - 1];
}

/** Build a fresh draft from a template: start = current month, milestones
 * spread across the span, first one 'now' so the ring-on-now payoff shows
 * immediately, and nothing pinned so a timeframe change re-flows cleanly. */
export function instantiate(t: RoadmapTemplate, opts: {
  projectName: string | null;
  quantity: number | null;
  end: ParsedDate | null;
  now: Date;
}): DraftRoadmap {
  const { now } = opts;
  const start: ParsedDate = { value: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`, precision: 'month' };
  let end = opts.end;
  if (!end) {
    const r = addMonths(now.getFullYear(), now.getMonth() + 1, t.defaultSpanMonths);
    end = { value: `${r.y}-${String(r.m).padStart(2, '0')}-01`, precision: 'month' };
  }

  const items: { title: string; description: string | null; frac: number }[] =
    t.milestones.map((m) => ({ title: m.title, description: m.description ?? null, frac: m.frac }));

  if (opts.quantity && t.countable) {
    const n = Math.min(opts.quantity, MAX_COUNTABLE_REPEATS);
    const { itemTitle, fromFrac, toFrac } = t.countable;
    for (let i = 0; i < n; i++) {
      const frac = n === 1 ? fromFrac : fromFrac + ((toFrac - fromFrac) * i) / (n - 1);
      items.push({ title: itemTitle.replace('{N}', String(i + 1)), description: null, frac });
    }
    items.sort((a, b) => a.frac - b.frac);
  }

  const dates = distributeDates(start, end, items.map((i) => i.frac));
  const milestones: DraftMilestone[] = items.map((item, i) => ({
    key: `m${i + 1}`,
    title: item.title,
    description: item.description,
    start: dates[i],
    end: null,
    status: i === 0 ? 'now' : 'upcoming',
    datePinned: false,
    goalCents: null,
    goalBlurb: null,
  }));

  return {
    project: { mode: 'none' },
    templateId: t.id,
    title: (opts.projectName ?? t.defaultEraTitle).trim(),
    description: null,
    start,
    end,
    milestones,
  };
}
