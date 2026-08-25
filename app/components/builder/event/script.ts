/* Event Builder conversation copy — every bot line in one place. */

export type Stage = 'describe' | 'when' | 'where' | 'extras' | 'tickets' | 'review';

export const COPY = {
  intro: `Let's make an event ✦ What is it? — “rooftop listening party in Brooklyn, Sept 12, 7pm, free, 60 people” is plenty.`,
  askWhen: `When is it? “Sept 12, 7pm” or “March 2, 11am-2pm”.`,
  whenMiss: `I need a calendar date — “Sept 12, 7pm”. (Weekday names and 9/12-style dates trip me up.)`,
  askWhere: `Where's it happening? City, venue, or both — “Brooklyn, The Deep End”.`,
  askExtras: `Want to cap attendance or ask guests anything when they RSVP? — “60 people, their instagram and t-shirt size” — or skip.`,
  askTickets: `Paid tickets? Say it like “$25 early bird limited to 50, $40 at the door” — or skip for a free event.`,
  reviewIntro: (name: string) => `${name} is drafted ✦ Open it in the composer to review everything and publish — nothing goes live until you hit Publish there.`,
  unknown: `Didn't catch that — try the buttons below, or rephrase.`,
  handoffNote: `Opening the composer with everything filled in…`,
} as const;

export const TILES = [
  { glyph: '🎧', title: 'Listening party', sub: '“rooftop listening party, Sept 12, 7-10pm, 60 people”', seed: 'a rooftop listening party, Sept 12, 7-10pm, 60 people' },
  { glyph: '🖼', title: 'Gallery opening', sub: '“gallery opening night, free entry, first Friday of October”', seed: 'a gallery opening night, October 2, 6-9pm, free entry' },
  { glyph: '🎟', title: 'Ticketed workshop', sub: '“$25 early bird limited to 50, $40 at the door”', seed: 'a hands-on workshop, $25 early bird limited to 50, $40 at the door' },
  { glyph: '🎤', title: 'Show / performance', sub: '“a live show at The Deep End, doors at 8”', seed: 'a live show at The Deep End, doors at 8pm' },
];

export const CHIP = {
  skip: 'Skip',
  openComposer: 'Open it in the composer ✦',
  changeWhen: 'When',
  changeWhere: 'Where',
  extras: 'Guest questions',
  tickets: 'Tickets',
  cancel: 'Never mind',
} as const;
