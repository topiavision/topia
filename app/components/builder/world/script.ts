/* World Builder conversation copy — every bot line in one place. */

export type Stage = 'describe' | 'name' | 'category' | 'country' | 'image' | 'refine' | 'saving';

export const COPY = {
  intro: `Let's make you a world ✦ What's it called, and what's it about? A line or two is plenty.`,
  askName: `And what should I call it?`,
  askCategory: `What kind of world is it?`,
  categoryMiss: `Pick the closest one — you can't change this later, so I want it right.`,
  askCountry: `Where's it based? A country is enough. (This one's permanent — category too.)`,
  askImage: `Want a cover image? You can add one from the dashboard later too.`,
  uploading: `Uploading…`,
  refineIntro: (title: string) => `Here's ${title} — tweak anything, or bring it to life.`,
  unknown: `Didn't catch that — I'm simpler than I look. Try the buttons below: rename it, set the category or country, or create it.`,
  renamePrompt: `What should it be called?`,
  descriptionPrompt: `Give me the one-liner.`,
  countryPrompt: `Where's it based?`,
  saving: `Building your world…`,
  saveFailed: (serverError: string | null) => serverError || `Could not create the world — try again?`,
} as const;

export const TILES = [
  { glyph: '📓', title: 'A zine collective', sub: '“a monthly poetry zine collective called Night Garden”', seed: 'a monthly poetry zine collective called Night Garden' },
  { glyph: '🎛', title: 'A music label', sub: '“an independent label for ambient music, based in LA”', seed: 'an independent music label called Low End, based in Los Angeles' },
  { glyph: '🎞', title: 'A film club', sub: '“a documentary screening club, monthly at the co-op”', seed: 'a documentary film screening club called Reel Talk' },
  { glyph: '🫂', title: 'A community', sub: '“a community for late-night makers and their projects”', seed: 'a community for late-night makers called After Hours' },
];

export const CHIP = {
  skip: 'Skip',
  upload: 'Upload an image…',
  rename: 'Rename it',
  description: 'Description',
  category: 'Category',
  country: 'Country',
  cover: 'Cover image',
  create: 'Create world ✦',
  tryAgain: 'Try again',
  keepEditing: 'Keep editing',
  cancel: 'Never mind',
} as const;
