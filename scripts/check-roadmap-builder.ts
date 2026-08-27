/* Roadmap Builder assertions. This repo has no test suite; like fee math,
 * the builder's parser is pure logic with a big input surface — a regression
 * here silently turns "wrapping next spring" into a wrong year rather than
 * an obvious break. Every engine entry point takes `now` explicitly, so
 * everything below is pinned and deterministic.
 *
 *   npx tsx scripts/check-roadmap-builder.ts
 */
import { parseNaturalDate, parseDateRange, distributeDates } from '../lib/roadmap-builder/dates';
import { parseSeed } from '../lib/roadmap-builder/parse';
import { TEMPLATES, templateById, instantiate } from '../lib/roadmap-builder/templates';
import { stripFillers, parseUtterance, applyCommand, matchMilestone, draftToBatchPayload, parseDollars } from '../lib/roadmap-builder/commands';
import { clampRoadmapPlan, planToTemplate } from '../lib/roadmap-builder/plan';
import { draftFromEra, diffToPatches, keyForId } from '../lib/roadmap-builder/edit';
import type { EraView } from '../app/components/world/in-process/types';
import { MAX_COUNTABLE_REPEATS } from '../lib/roadmap-builder/types';

const NOW = new Date('2026-08-24T00:00:00'); // pinned — a Monday in August

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  const ok = a === e;
  if (!ok) failures++;
  console.log(`  ${ok ? '✓' : '✗'} ${label}${ok ? '' : `  — got ${a}, expected ${e}`}`);
}

/* ── Date grammar ──────────────────────────────────────────────────── */
console.log('\nDates that must parse (now = Aug 2026):');
const d = (s: string) => parseNaturalDate(s, NOW);
check('"2027" → year', d('2027'), { value: '2027-01-01', precision: 'year' });
check('"December" → this Dec (future)', d('December'), { value: '2026-12-01', precision: 'month' });
check('"march" → next March (passed)', d('march'), { value: '2027-03-01', precision: 'month' });
check('"August" → this month counts as future', d('August'), { value: '2026-08-01', precision: 'month' });
check('"march 2027"', d('march 2027'), { value: '2027-03-01', precision: 'month' });
check('"Sept 2027" abbreviated', d('Sept 2027'), { value: '2027-09-01', precision: 'month' });
check('"March 3" → day, next occurrence', d('March 3'), { value: '2027-03-03', precision: 'day' });
check('"Dec 12, 2026" → day', d('Dec 12, 2026'), { value: '2026-12-12', precision: 'day' });
check('"March 3rd 2027" ordinal', d('March 3rd 2027'), { value: '2027-03-03', precision: 'day' });
check('"by December" strips lead-in', d('by December'), { value: '2026-12-01', precision: 'month' });
check('"in 3 months"', d('in 3 months'), { value: '2026-11-01', precision: 'month' });
check('"in 6 months" rolls the year', d('in 6 months'), { value: '2027-02-01', precision: 'month' });
check('"in a year"', d('in a year'), { value: '2027-08-01', precision: 'month' });
check('"in 2 weeks" → day', d('in 2 weeks'), { value: '2026-09-07', precision: 'day' });
check('"next month"', d('next month'), { value: '2026-09-01', precision: 'month' });
check('"next year" → year', d('next year'), { value: '2027-01-01', precision: 'year' });
check('"end of the year"', d('end of the year'), { value: '2026-12-01', precision: 'month' });
check('"early 2027"', d('early 2027'), { value: '2027-02-01', precision: 'month' });
check('"late 2027"', d('late 2027'), { value: '2027-10-01', precision: 'month' });
check('"next spring" (Aug → next Apr)', d('next spring'), { value: '2027-04-01', precision: 'month' });
check('"fall" → this Oct', d('fall'), { value: '2026-10-01', precision: 'month' });
check('"summer 2027"', d('summer 2027'), { value: '2027-07-01', precision: 'month' });
check('"winter" → next Jan', d('winter'), { value: '2027-01-01', precision: 'month' });
check('"Q1" → next Jan', d('Q1'), { value: '2027-01-01', precision: 'month' });
check('"q3 2027"', d('q3 2027'), { value: '2027-07-01', precision: 'month' });

console.log('\nDates that must NOT parse (no guessing):');
for (const bad of ['next Tuesday', 'by Christmas', '3/15', 'soon', 'ASAP', 'two weeks after mixing']) {
  check(`"${bad}" → null`, d(bad), null);
}

console.log('\nRanges:');
check('"March to August" stays forward', parseDateRange('March to August', NOW),
  { start: { value: '2027-03-01', precision: 'month' }, end: { value: '2027-08-01', precision: 'month' } });
check('"from October until March"', parseDateRange('from October until March', NOW),
  { start: { value: '2026-10-01', precision: 'month' }, end: { value: '2027-03-01', precision: 'month' } });
check('distribute 0/.5/1 over Sep→Mar', distributeDates(
  { value: '2026-09-01', precision: 'month' }, { value: '2027-03-01', precision: 'month' }, [0, 0.5, 1],
).map((x) => x.value), ['2026-09-01', '2026-12-01', '2027-03-01']);

/* ── Seed parsing ──────────────────────────────────────────────────── */
console.log('\nSeed parsing:');
const seed = parseSeed('a podcast called Signal, 8 episodes, wrapping next spring', NOW);
check('template = podcast', seed.templateId, 'podcast');
check('name = Signal', seed.projectName, 'Signal');
check('quantity = 8', seed.quantity, 8);
check('end = Apr 2027', seed.end, { value: '2027-04-01', precision: 'month' });

const seed2 = parseSeed('an album, out by December', NOW);
check('album detected', seed2.templateId, 'album');
check('album end = Dec 2026', seed2.end, { value: '2026-12-01', precision: 'month' });
check('no name extracted', seed2.projectName, null);

const seed3 = parseSeed('I want to make some pottery and sell it', NOW);
check('no keywords → generic', seed3.templateId, 'generic');
check('quoted title wins: \'a zine, "Field Notes"\'', parseSeed('a zine, "Field Notes"', NOW).projectName, 'Field Notes');
check('documentary → film', parseSeed('a documentary about my grandmother', NOW).templateId, 'film');

/* ── Template instantiation ────────────────────────────────────────── */
console.log('\nTemplate instantiation:');
const pod = instantiate(templateById('podcast'), { projectName: 'Signal', quantity: 8, end: { value: '2027-04-01', precision: 'month' }, now: NOW });
check('title borrows project name', pod.title, 'Signal');
check('5 base + 8 episodes = 13 milestones', pod.milestones.length, 13);
check('first milestone is NOW', pod.milestones[0].status, 'now');
check('rest upcoming', pod.milestones.slice(1).every((m) => m.status === 'upcoming'), true);
check('start = current month', pod.start, { value: '2026-08-01', precision: 'month' });
const values = pod.milestones.map((m) => m.start!.value);
check('dates monotonic non-decreasing', [...values].sort().join(), values.join());
check('nothing pinned at birth', pod.milestones.every((m) => !m.datePinned), true);
check('episode cap holds', instantiate(templateById('podcast'), { projectName: null, quantity: 99, end: null, now: NOW }).milestones.length, 5 + MAX_COUNTABLE_REPEATS);
check('no-name falls back to template title', instantiate(templateById('album'), { projectName: null, quantity: null, end: null, now: NOW }).title, 'The Album');
check('default span: album end = May 2027', instantiate(templateById('album'), { projectName: null, quantity: null, end: null, now: NOW }).end, { value: '2027-05-01', precision: 'month' });
check('every template has a terminal frac of 1', TEMPLATES.every((t) => t.milestones[t.milestones.length - 1].frac === 1), true);

/* ── Command grammar + reducer ─────────────────────────────────────── */
console.log('\nCommands:');
let draft = instantiate(templateById('album'), { projectName: 'Night Drives', quantity: null, end: { value: '2027-05-01', precision: 'month' }, now: NOW });
draft = { ...draft, project: { mode: 'new', name: 'Night Drives' } };

const c1 = parseUtterance('add vinyl drop in April', NOW);
check('add parses w/ date', c1, { kind: 'add_milestone', title: 'vinyl drop', start: { value: '2027-04-01', precision: 'month' } });
let r = applyCommand(draft, c1, NOW);
check('add succeeded', r.ok, true);
check('8 milestones now', r.draft.milestones.length, 8);
check('vinyl drop inserted chronologically (before May release)',
  r.draft.milestones.findIndex((m) => m.title === 'vinyl drop') < r.draft.milestones.findIndex((m) => m.title === 'Release day'), true);
check('added milestone is pinned', r.draft.milestones.find((m) => m.title === 'vinyl drop')!.datePinned, true);
draft = r.draft;

r = applyCommand(draft, parseUtterance('rename mixing to Final mix', NOW), NOW);
check('rename fuzzy-matched', r.ok, true);
check('renamed', r.draft.milestones.some((m) => m.title === 'Final mix'), true);
draft = r.draft;

r = applyCommand(draft, parseUtterance('mark recording done', NOW), NOW);
check('mark done', r.ok, true);
check('recording done', r.draft.milestones.find((m) => m.title === 'Recording')!.status, 'done');
draft = r.draft;

r = applyCommand(draft, parseUtterance('start mastering', NOW), NOW);
check('only one NOW at a time', r.draft.milestones.filter((m) => m.status === 'now').length, 1);
check('mastering is the now', r.draft.milestones.find((m) => m.status === 'now')!.title, 'Mastering');
check('former current milestone becomes done when NOW moves forward', r.draft.milestones[0].status, 'done');
draft = r.draft;

r = applyCommand(draft, parseUtterance('finish by March 2028', NOW), NOW);
check('set_timeframe applied', r.ok, true);
check('era end moved', r.draft.end, { value: '2028-03-01', precision: 'month' });
check('PINNED vinyl drop survived re-flow', r.draft.milestones.find((m) => m.title === 'vinyl drop')!.start, { value: '2027-04-01', precision: 'month' });
check('unpinned milestones re-flowed to the new end',
  r.draft.milestones.filter((m) => !m.datePinned).some((m) => m.start!.value > '2027-05-01'), true);
draft = r.draft;

r = applyCommand(draft, parseUtterance('remove the trailer', NOW), NOW);
check('no-match is a graceful miss', r.ok, false);
check('draft untouched on miss', r.draft.milestones.length, draft.milestones.length);

check('backwards span rejected', applyCommand(draft, { kind: 'set_timeframe', start: { value: '2027-06-01', precision: 'month' }, end: { value: '2027-01-01', precision: 'month' } }, NOW).ok, false);
check('unknown input → unknown command', parseUtterance('do a kickflip', NOW).kind, 'unknown');
check('bare date in refine → set_timeframe', parseUtterance('next summer', NOW), { kind: 'set_timeframe', start: null, end: { value: '2027-07-01', precision: 'month' } });
check('ambiguous ref lists candidates', (() => {
  const m = matchMilestone({ title: 'the' }, draft.milestones);
  return !m.ok;
})(), true);

/* ── Funding goals ─────────────────────────────────────────────────── */
console.log('\nFunding:');
check('"$500" → 50000c', parseDollars('$500'), 50000);
check('"1,200" → 120000c', parseDollars('1,200'), 120000);
check('"1.5k" → 150000c', parseDollars('1.5k'), 150000);
check('"March" is not money', parseDollars('March'), null);
check('"add a $500 goal to mixing" parses as set_goal (not add_milestone)',
  parseUtterance('add a $500 goal to mixing', NOW),
  { kind: 'set_goal', ref: { title: 'mixing' }, cents: 50000 });
check('"fund mastering with 1k"', parseUtterance('fund mastering with 1k', NOW),
  { kind: 'set_goal', ref: { title: 'mastering' }, cents: 100000 });
check('"remove the goal on mixing"', parseUtterance('remove the goal on mixing', NOW),
  { kind: 'set_goal', ref: { title: 'mixing' }, cents: null });

r = applyCommand(draft, parseUtterance('fund vinyl drop $800', NOW), NOW);
check('goal set on the milestone', r.draft.milestones.find((m) => m.title === 'vinyl drop')!.goalCents, 80000);
check('goal reply mentions the amount', r.reply.includes('$800'), true);
draft = r.draft;
check('sub-$1 goal refused', applyCommand(draft, { kind: 'set_goal', ref: { title: 'vinyl drop' }, cents: 50 }, NOW).ok, false);
check('$2M goal refused', applyCommand(draft, { kind: 'set_goal', ref: { title: 'vinyl drop' }, cents: 200_000_000 }, NOW).ok, false);
r = applyCommand(draft, parseUtterance('unfund vinyl drop', NOW), NOW);
check('unfund clears it', r.draft.milestones.find((m) => m.title === 'vinyl drop')!.goalCents, null);
check('other milestones stay unfunded by default', draft.milestones.every((m) => m.title === 'vinyl drop' || m.goalCents === null), true);

/* ── Wire payload ──────────────────────────────────────────────────── */
console.log('\nBatch payload:');
const body = draftToBatchPayload(draft, 'world-1', 'privy-1');
check('newProjectName carried', body.newProjectName, 'Night Drives');
check('no projectId when new', body.projectId, undefined);
check('era title', body.era.title, 'Night Drives');
check('era status always active', body.era.status, 'active');
check('sortOrder = array index', body.milestones.map((m) => m.sortOrder).join(), body.milestones.map((_, i) => i).join());
check('dates are normalized YYYY-MM-DD', body.milestones.every((m) => !m.startDate || /^\d{4}-\d{2}-\d{2}$/.test(m.startDate)), true);
check('no funding fields in payload', 'goalCents' in (body.milestones[0] as object), false);

/* ── Live edit: hydrate + diff-to-patches ──────────────────────────── */
console.log('\nEdit mode:');
const ERA: EraView = {
  id: 'era-1', title: 'Season One', description: 'building in public',
  projectId: 'p1', projectName: 'Signal', projectSlug: 'signal',
  startDate: '2026-08-01', endDate: '2027-04-01', startPrecision: 'month', endPrecision: 'month',
  startLabel: null, endLabel: null, status: 'active', inProcessUrl: null,
  posts: [],
  milestones: [
    { id: 'm-aaa', title: 'Concept', description: null, startDate: '2026-08-01', endDate: null, startPrecision: 'month', endPrecision: null, dateLabel: null, status: 'done', imageUrl: null },
    { id: 'm-bbb', title: 'Trailer', description: null, startDate: '2026-10-01', endDate: null, startPrecision: 'month', endPrecision: null, dateLabel: null, status: 'now', imageUrl: null },
    { id: 'm-ccc', title: 'Launch', description: null, startDate: '2027-04-01', endDate: null, startPrecision: 'day', endPrecision: null, dateLabel: null, status: 'upcoming', imageUrl: null },
  ],
};
const hydrated = draftFromEra(ERA, new Map([['m-bbb', { goalCents: 50000, blurb: 'gear' }]]));
check('hydrate: project carried', hydrated.project, { mode: 'existing', id: 'p1', name: 'Signal' });
check('hydrate: keys are ex-<id>', hydrated.milestones.map((m) => m.key), ['ex-m-aaa', 'ex-m-bbb', 'ex-m-ccc'].map(String));
check('hydrate: day precision carried', hydrated.milestones[2].start, { value: '2027-04-01', precision: 'day' });
check('hydrate: goal joined from map', hydrated.milestones[1].goalCents, 50000);
check('hydrate: nothing pinned (re-flow must work)', hydrated.milestones.every((m) => !m.datePinned), true);
check('no-op diff is empty', diffToPatches(hydrated, hydrated), []);

let er = applyCommand(hydrated, parseUtterance('rename trailer to Teaser', NOW), NOW);
check('rename → one ms-put', diffToPatches(hydrated, er.draft),
  [{ kind: 'ms-put', milestoneId: 'm-bbb', body: { title: 'Teaser' } }]);

er = applyCommand(hydrated, parseUtterance('mark trailer done', NOW), NOW);
check('status → one ms-put', diffToPatches(hydrated, er.draft),
  [{ kind: 'ms-put', milestoneId: 'm-bbb', body: { status: 'done' } }]);

er = applyCommand(hydrated, parseUtterance('add vinyl drop in March', NOW), NOW);
const addPatches = diffToPatches(hydrated, er.draft);
check('add → one ms-post', addPatches.filter((p) => p.kind === 'ms-post').length, 1);
const post = addPatches.find((p) => p.kind === 'ms-post');
check('add carries sortOrder of its slot', typeof (post && 'body' in post ? post.body.sortOrder : undefined), 'number');
check('add may resort neighbours only via sortOrder puts',
  addPatches.filter((p) => p.kind === 'ms-put').every((p) => Object.keys((p as { body: object }).body).join() === 'sortOrder'), true);

er = applyCommand(hydrated, parseUtterance('remove the concept', NOW), NOW);
check('remove → one ms-delete', diffToPatches(hydrated, er.draft).filter((p) => p.kind === 'ms-delete'),
  [{ kind: 'ms-delete', milestoneId: 'm-aaa' }]);

er = applyCommand(hydrated, parseUtterance('call it Season Two', NOW), NOW);
check('era title → era-put', diffToPatches(hydrated, er.draft), [{ kind: 'era-put', body: { title: 'Season Two' } }]);

// Pin one date, then re-flow: pinned survives, others move, era dates move.
const pinned = applyCommand(hydrated, { kind: 'set_milestone_date', ref: { title: 'Launch' }, start: { value: '2027-04-01', precision: 'day' }, end: null }, NOW);
er = applyCommand(pinned.draft, parseUtterance('finish by December 2027', NOW), NOW);
const flow = diffToPatches(pinned.draft, er.draft);
check('re-flow: era-put present', flow.some((p) => p.kind === 'era-put'), true);
check('re-flow: pinned milestone date untouched (sortOrder-only ok)',
  flow.filter((p) => p.kind === 'ms-put' && p.milestoneId === 'm-ccc')
    .every((p) => !('startDate' in (p as { body: object }).body)), true);
check('re-flow: unpinned milestones patched', flow.filter((p) => p.kind === 'ms-put').length >= 1, true);
check('keyForId round trip', keyForId('abc'), 'ex-abc');

/* ── Loom feedback (Latasha, Aug 25): fillers, corrections, durations, plans ── */
console.log('\nfeedback-round:');
const NOWD = new Date('2026-08-24T12:00:00');
check('filler: actually call it', parseUtterance('so actually call it Tosh55.xyz', NOWD),
  { kind: 'set_era_title', title: 'Tosh55.xyz' });
check('filler: lets say month-year', parseUtterance("let's say September 2027", NOWD),
  { kind: 'set_timeframe', start: null, end: { value: '2027-09-01', precision: 'month' } });
check('filler: i want to make it a year', parseUtterance('I want to make it a year', NOWD),
  { kind: 'set_timeframe', start: null, end: { value: '2027-08-01', precision: 'month' } });
check('duration: for 6 months', parseUtterance('for 6 months', NOWD),
  { kind: 'set_timeframe', start: null, end: { value: '2027-02-01', precision: 'month' } });
check('era rename: rename it to', parseUtterance('rename it to Night Garden', NOWD),
  { kind: 'set_era_title', title: 'Night Garden' });
check('milestone rename untouched', parseUtterance('rename mixing to final mix', NOWD),
  { kind: 'rename_milestone', ref: { title: 'mixing' }, title: 'final mix' });
check('stripFillers leaves commands alone', stripFillers('add vinyl drop in March'), 'add vinyl drop in March');
check("lets-call-this stays a duration", parseUtterance("let's call this for 6 months", NOWD).kind, 'set_timeframe');
const planOk = clampRoadmapPlan({ projectName: '  Tosh55.xyz ', months: 99.7, milestones: ['Design the core flow', ' Design the core flow ', 'Build the MVP', 42, 'Launch'] });
check('plan clamp: dedupe + trim + month cap', planOk,
  { projectName: 'Tosh55.xyz', months: 36, milestones: ['Design the core flow', 'Build the MVP', 'Launch'] });
check('plan clamp: one milestone is not an arc', clampRoadmapPlan({ milestones: ['Ship it'] }), null);
check('plan clamp: junk null', clampRoadmapPlan('lol'), null);
const ptpl = planToTemplate(planOk!);
check('plan template fracs span 0..1', ptpl.milestones.map((p) => p.frac), [0, 0.5, 1]);
check('plan template months', ptpl.defaultSpanMonths, 36);

if (failures > 0) {
  console.error(`\n❌ ${failures} roadmap-builder assertion(s) failed.\n`);
  process.exit(1);
}
console.log('\n✅ Roadmap builder holds.\n');
