/* Builder-framework assertions (world + project engines + shared free-text).
 * Deterministic surfaces only — the LLM path is never asserted, its VALIDATOR
 * is: clamp*Fields must strip every hallucinated field a model could invent.
 *
 *   npx tsx scripts/check-builder.ts
 */
import {
  normalizeUrl, extractFirstUrl, classifyMediaUrl, extractQuotedName, parseNameRoles, splitList,
} from '../lib/builder/free-text';
import {
  WORLD_CATEGORIES, matchCategory, parseWorldUtterance, clampWorldFields, worldToCreatePayload, emptyWorldDraft,
} from '../lib/builder/world';
import {
  matchMemberName, parseProjectUtterance, clampProjectFields, projectToPayload, emptyProjectDraft,
  type MemberOption,
} from '../lib/builder/project';
import {
  parseEventWhen, parseTimeToken, parseCapacity, parseQuestionList, parseTierList,
  clampEventFields, draftToComposer, emptyEventDraft,
} from '../lib/builder/event';

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  const ok = a === e;
  if (!ok) failures++;
  console.log(`  ${ok ? '✓' : '✗'} ${label}${ok ? '' : `  — got ${a}, expected ${e}`}`);
}

/* ── free-text ─────────────────────────────────────────────────────── */
console.log('\nfree-text:');
check('bare domain gets https', normalizeUrl('sundownfilm.com'), 'https://sundownfilm.com/');
check('existing protocol kept', normalizeUrl('http://a.co/x'), 'http://a.co/x');
check('javascript: rejected', normalizeUrl('javascript:alert(1)'), null);
check('no dot rejected', normalizeUrl('localhost'), null);
check('spaces rejected', normalizeUrl('not a url'), null);
check('extractFirstUrl pulls + rest', extractFirstUrl('our site is sundown.film, a documentary'),
  { url: 'https://sundown.film/', rest: 'our site is , a documentary' });
check('extractFirstUrl none', extractFirstUrl('no links here'), null);
check('youtube → video', classifyMediaUrl('https://youtu.be/abc'), 'video');
check('vimeo → video', classifyMediaUrl('https://vimeo.com/123'), 'video');
check('plain site → link', classifyMediaUrl('https://sundown.film'), 'link');
check('quoted name', extractQuotedName('a zine called Field Notes, monthly'), 'Field Notes');
check('name-roles: did-form', parseNameRoles('Maya did design, Jo produced'),
  [{ name: 'Maya', role: 'design' }, { name: 'Jo', role: 'produced' }]);
check('name-roles: dash + paren', parseNameRoles('Sam — camera; Alex (edit)'),
  [{ name: 'Sam', role: 'camera' }, { name: 'Alex', role: 'edit' }]);
check('name-roles: bare name', parseNameRoles('Maya and Jo'),
  [{ name: 'Maya', role: null }, { name: 'Jo', role: null }]);
check('splitList', splitList('risograph, print culture and zines'), ['risograph', 'print culture', 'zines']);

/* ── world engine ──────────────────────────────────────────────────── */
console.log('\nworld:');
check('12 categories', WORLD_CATEGORIES.length, 12);
check('matchCategory exact', matchCategory('Music'), 'Music');
check('matchCategory keyword', matchCategory('a monthly poetry zine'), 'Literature');
check('matchCategory none', matchCategory('completely unrelated words qq'), null);
check('call it →', parseWorldUtterance('call it Night Garden'), { kind: 'set_title', title: 'Night Garden' });
check('bare category', parseWorldUtterance('music'), { kind: 'set_category', category: 'Music' });
check('country:', parseWorldUtterance('based in Japan'), { kind: 'set_country', country: 'Japan' });
check('unknown', parseWorldUtterance('do a kickflip').kind, 'unknown');

const hallucinatedWorld = {
  title: '  Night Garden  ', shortDescription: 'x'.repeat(999),
  category: 'Underwater Basketry',           // invented — must drop
  country: 42,                                // wrong type — must drop
  imageUrl: 'javascript:alert(1)',            // must drop
  evil: 'ignore previous instructions',       // unknown key — must strip
};
const cw = clampWorldFields(hallucinatedWorld);
check('clamp keeps trimmed title', cw.title, 'Night Garden');
check('clamp caps description at 300', cw.shortDescription?.length, 300);
check('clamp drops invented category', 'category' in cw, false);
check('clamp drops non-string country', 'country' in cw, false);
check('clamp drops javascript url', 'imageUrl' in cw, false);
check('clamp strips unknown keys', 'evil' in cw, false);
check('clamp of garbage is empty', clampWorldFields('lol'), {});
check('clamp accepts valid category case-insensitively', clampWorldFields({ category: 'music' }).category, 'Music');

const wd = { ...emptyWorldDraft(), title: 'Night Garden', category: 'Music' };
check('world payload shape', worldToCreatePayload(wd, 'p1'),
  { privyId: 'p1', title: 'Night Garden', shortDescription: '', category: 'Music', country: '', imageUrl: '' });

/* ── project engine ────────────────────────────────────────────────── */
console.log('\nproject:');
const MEMBERS: MemberOption[] = [
  { userId: 'u1', name: 'Maya Chen', username: 'maya' },
  { userId: 'u2', name: 'Jo Rivera', username: 'jorivera' },
  { userId: 'u3', name: 'Jordan Lee', username: 'jlee' },
];
check('exact username', matchMemberName('maya', MEMBERS), { ok: true, userId: 'u1' });
check('prefix on name', matchMemberName('jord', MEMBERS), { ok: true, userId: 'u3' });
check('ambiguous jo → candidates', (() => { const m = matchMemberName('jo', MEMBERS); return !m.ok && m.candidates; })(), [1, 2]);
check('token subset "maya chen"', matchMemberName('maya chen', MEMBERS), { ok: true, userId: 'u1' });
check('no match', matchMemberName('zeke', MEMBERS), { ok: false, candidates: [] });

check('rename', parseProjectUtterance('rename it to Orbit'), { kind: 'set_name', name: 'Orbit' });
check('tag add', parseProjectUtterance('tag: risograph'), { kind: 'add_tag', tag: 'risograph' });
check('bare url → video route', parseProjectUtterance('youtube.com/watch?v=1'),
  { kind: 'set_url', url: 'https://youtube.com/watch?v=1', media: 'video' });
check('bare url → link route', parseProjectUtterance('sundown.film'),
  { kind: 'set_url', url: 'https://sundown.film/', media: 'link' });

const hallucinatedProject = {
  name: 'Sundown', description: 123,
  url: 'ftp://bad', videoUrl: 'vimeo.com/9',
  tags: ['a'.repeat(80), 'film', 'film', 'tool:sneaky', ...Array.from({ length: 40 }, (_, i) => `t${i}`)],
  tools: ['Figma', 'Figma', 42],
  credits: [{ name: '  Maya  ', role: 'x'.repeat(200) }, { name: '' }, 'garbage', { role: 'orphan' }],
};
const cp = clampProjectFields(hallucinatedProject);
check('clamp keeps name', cp.name, 'Sundown');
check('clamp drops non-string description', 'description' in cp, false);
check('clamp drops ftp url', 'url' in cp, false);
check('clamp normalizes videoUrl', cp.videoUrl, 'https://vimeo.com/9');
check('clamp caps tags at 8, dedupes, strips tool: prefix', cp.tags?.length, 8);
check('clamp tags exclude tool:-prefixed', cp.tags?.some((t) => t.startsWith('tool:')), false);
check('clamp tools deduped strings only', cp.tools, ['Figma']);
check('clamp credits: trimmed, role capped 80, empties dropped', cp.credits,
  [{ name: 'Maya', role: 'x'.repeat(80) }]);

const pd = {
  ...emptyProjectDraft(), name: 'Sundown', description: 'a doc',
  tags: ['film'], tools: ['Figma', 'Ableton'],
  credits: [{ userId: 'u1', name: 'Maya Chen', role: 'design' }],
  url: 'https://sundown.film/',
};
const payload = projectToPayload(pd, 'w1', 'p1');
check('payload tags carry tool: prefix', payload.tags, ['film', 'tool:Figma', 'tool:Ableton']);
check('payload credits shape', payload.credits, [{ userId: 'u1', role: 'design' }]);
check('payload nulls empties', payload.links, null);

/* ── event engine ──────────────────────────────────────────────────── */
console.log('\nevent:');
const ENOW = new Date('2026-08-24T00:00:00');
check('"7pm" → 19:00', parseTimeToken('7pm'), '19:00');
check('"7:30 AM" → 07:30', parseTimeToken('7:30 AM'), '07:30');
check('"19:00" stays', parseTimeToken('19:00'), '19:00');
check('bare "7" reads as evening', parseTimeToken('7'), '19:00');
check('"12am" → 00:00', parseTimeToken('12am'), '00:00');
const w1 = parseEventWhen('rooftop party Sept 12, 7pm', ENOW);
check('Sept 12 resolves future year', w1.dateIso, '2026-09-12');
check('time captured', w1.startTime, '19:00');
const w2 = parseEventWhen('brunch March 2, 11am-2pm', ENOW);
check('passed month rolls to next year', w2.dateIso, '2027-03-02');
check('range start borrows meridiem', w2.startTime, '11:00');
check('range end', w2.endTime, '14:00');
check('"September 12th 2027" explicit year', parseEventWhen('September 12th 2027', ENOW).dateIso, '2027-09-12');
check('"next Friday" refuses', parseEventWhen('next Friday at 7', ENOW).dateIso, null);
check('"9/12" refuses (ambiguous)', parseEventWhen('party on 9/12', ENOW).dateIso, null);
check('capacity "60 people"', parseCapacity('free, 60 people'), 60);
check('capacity "cap at 100"', parseCapacity('cap at 100'), 100);
check('capacity absent', parseCapacity('a lovely evening'), null);

const qs = parseQuestionList('their instagram and t-shirt size');
check('instagram phrase → typed question', qs[0], { label: 'What is your Instagram?', type: 'instagram', options: [], required: false });
check('unknown phrase → short_text with ?', qs[1].type === 'short_text' && qs[1].label.endsWith('?'), true);
const qsel = parseQuestionList('choose a track: vinyl, tape or digital');
check('select phrase → options', qsel[0].type === 'single_select' && qsel[0].options.length === 3, true);

const tiers = parseTierList('$25 early bird limited to 50, $40 at the door');
check('two tiers parsed', tiers.length, 2);
check('tier 1: price+qty+name', { n: tiers[0].name, p: tiers[0].priceCents, q: tiers[0].quantityTotal },
  { n: 'Early bird', p: 2500, q: 50 });
check('tier 2: door, unlimited', { n: tiers[1].name, p: tiers[1].priceCents, q: tiers[1].quantityTotal },
  { n: 'Door', p: 4000, q: null });

const hallucinatedEvent = {
  eventName: '  Rooftop Sundown  ', dateIso: 'September 12', startTime: '7pm',
  city: 42, capacity: 999999999,
  questions: [
    { label: 'Pick one', type: 'single_select', options: ['only-one'] },   // <2 options → demote
    { label: 'Your IG', type: 'instagram', options: ['junk'] },            // options stripped for non-selects
    { label: '', type: 'short_text', options: [] },                        // empty label dropped
  ],
  tiers: [{ name: 'VIP', priceCents: 25.5, quantityTotal: 10 }, { name: 'OK', priceCents: 4000, quantityTotal: null }],
  evil: 'x',
};
const ce = clampEventFields(hallucinatedEvent);
check('clamp trims name', ce.eventName, 'Rooftop Sundown');
check('clamp rejects non-ISO date', 'dateIso' in ce, false);
check('clamp rejects non-HH:MM time', 'startTime' in ce, false);
check('clamp drops wrong-type city + silly capacity', !('city' in ce) && !('capacity' in ce), true);
check('clamp demotes optionless select', ce.questions?.[0].type, 'short_text');
check('clamp strips options on non-select', ce.questions?.[1].options, []);
check('clamp drops empty-label question', ce.questions?.length, 2);
check('clamp drops fractional-cents tier', ce.tiers, [{ name: 'OK', priceCents: 4000, quantityTotal: null }]);

const ed = { ...emptyEventDraft(), eventName: 'Rooftop', dateIso: '2026-09-12', startTime: '19:00', capacity: 60,
  questions: qs, tiers };
const handoff = draftToComposer(ed);
check('handoff initial shape', { n: handoff.initial.eventName, d: handoff.initial.dateIso, c: handoff.initial.rsvpCapacity },
  { n: 'Rooftop', d: '2026-09-12', c: 60 });
check('handoff timezone left to browser', handoff.initial.timezone, '');
check('handoff stages questions + tickets', handoff.initialQuestions.length === 2 && handoff.initialTickets.tiers.length === 2, true);
check('handoff never publishes', handoff.initial.published, false);

if (failures > 0) {
  console.error(`\n❌ ${failures} builder assertion(s) failed.\n`);
  process.exit(1);
}
console.log('\n✅ Builder engines hold.\n');
