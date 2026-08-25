/* The builder's conversation copy — every bot line in one place so the tone
 * stays consistent and tweaks don't mean spelunking through components.
 * Command-reply copy (the "Added X" confirmations) lives with the reducer in
 * lib/roadmap-builder/commands.ts; this file is the UI-side stage script. */

import type { DraftRoadmap } from '@/lib/roadmap-builder/types';
import { eraDateRange } from '@/lib/eraDates';

export type Stage = 'project' | 'name_project' | 'describe' | 'timeframe' | 'refine' | 'saving';

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
  saveFailed: (serverError: string | null) => serverError || `Could not save — try again?`,
  saving: `Saving your roadmap…`,
} as const;

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
  save: 'Save roadmap ✦',
  tryAgain: 'Try again',
  keepEditing: 'Keep editing',
  cancel: 'Never mind',
} as const;
