/* The builder's conversation copy — every bot line in one place so the tone
 * stays consistent and tweaks don't mean spelunking through components.
 * Command-reply copy (the "Added X" confirmations) lives with the reducer in
 * lib/roadmap-builder/commands.ts; this file is the UI-side stage script. */

import type { DraftRoadmap } from '@/lib/roadmap-builder/types';
import { eraDateRange } from '@/lib/eraDates';

export type Stage = 'project' | 'name_project' | 'describe' | 'timeframe' | 'refine' | 'saving' | 'done';

export const COPY = {
  intro: `Let's build a roadmap ✦ Which project is this for?`,
  describeNew: `What are you making? Tell me about it — like “a podcast called Signal, 8 episodes, wrapping next spring.”`,
  describeExisting: (name: string) => `What kind of project is ${name}? Pick one below, or just describe it.`,
  describeWorldWide: `What's this era of the world about? Pick a shape below, or describe it.`,
  nameProject: `What's it called? (You can skip this and name it later.)`,
  timeframe: `When should it wrap? I'll space the milestones out to fit.`,
  genericSeed: `No template quite fits that, so I started you with a simple arc — reshape it however you like.`,
  firstDraft: (draft: DraftRoadmap) => {
    const range = eraDateRange({
      startDate: draft.start?.value, startPrecision: draft.start?.precision,
      endDate: draft.end?.value, endPrecision: draft.end?.precision,
    });
    return `Here's the draft — ${draft.milestones.length} milestones${range ? `, ${range}` : ''}. Tap any milestone to tweak it, tell me what to change, or save it when it feels right.`;
  },
  addPrompt: `What's the milestone? You can drop a date in too — “vinyl drop in March.”`,
  timeframePrompt: `When should it wrap? Try “by December” or “March to August.”`,
  renamePickPrompt: `Which milestone should we rename?`,
  renameTextPrompt: (title: string) => `What should “${title}” be called?`,
  markDonePrompt: `Which one is done?`,
  fundPickPrompt: `Which milestone should ask for support? Not every one needs money — pick the ones that do.`,
  fundAmountPrompt: (title: string) => `What's the goal for “${title}”? A number is enough — “$800” or “1.5k”.`,
  fundAmountRetry: `I need a dollar amount — “$800”, “1,200”, “1.5k”.`,
  editIntro: (title: string) => `Here's ${title} ✦ Tell me what to change — everything I do here saves as we go.`,
  saveFailed: (serverError: string | null) => serverError || `Could not save — try again?`,
  saving: `Saving your roadmap…`,
  savedPartialGoals: (n: number, serverError: string | null) =>
    `Roadmap saved ✓ — but ${n} funding goal${n > 1 ? 's' : ''} didn't stick${serverError ? ` (${serverError})` : ''}. You can add ${n > 1 ? 'them' : 'it'} anytime from the milestone editor on the timeline.`,
} as const;

export const CREATE_TILES = [
  { glyph: '🎙', title: 'A podcast', sub: '“a podcast called Signal, 8 episodes, wrapping next spring”', seed: 'a podcast called Signal, 8 episodes, wrapping next spring' },
  { glyph: '💿', title: 'An album', sub: '“an album, out by December”', seed: 'an album, out by December' },
  { glyph: '🎞', title: 'A film', sub: '“a documentary, premiering next fall”', seed: 'a documentary, premiering next fall' },
  { glyph: '✦', title: 'Something else', sub: 'a simple arc you reshape as you go', seed: 'something new — start me with a simple arc' },
];
export const EDIT_TILES = [
  { glyph: '✓', title: 'Mark a milestone done', sub: 'pick one, it saves instantly', seed: 'mark one done' },
  { glyph: '+', title: 'Add a milestone', sub: '“vinyl drop in March”', seed: 'add a milestone' },
  { glyph: '↔', title: 'Change the timeline', sub: '“finish by December” re-flows the dates', seed: 'change the timeline' },
  { glyph: '$', title: 'Fund a milestone', sub: 'set a goal backers can support', seed: 'fund a milestone' },
];

export const CHIP = {
  newProject: 'A new project',
  worldWide: 'No project — world-wide',
  skipName: 'Skip — name it later',
  in3Months: 'In 3 months',
  in6Months: 'In 6 months',
  inAYear: 'In a year',
  pickDate: 'Pick a date…',
  skipTimeframe: 'Skip for now',
  addMilestone: '+ Add a milestone',
  changeTimeline: 'Change the timeline',
  markDone: 'Mark one done ✓',
  rename: 'Rename it',
  fund: 'Fund a milestone $',
  save: 'Save roadmap ✦',
  doneEditing: 'Done ✦',
  finishPartial: 'Take me to it ✦',
  tryAgain: 'Try again',
  keepEditing: 'Keep editing',
  cancel: 'Never mind',
} as const;
