/* Project Builder conversation copy — every bot line in one place. */

export type Stage = 'describe' | 'name' | 'credits' | 'credit_fix' | 'tools' | 'link' | 'image' | 'refine' | 'saving';

export const COPY = {
  intro: `Let's add a project ✦ What did you make? Name, what it is, a link if there's one — one message is fine.`,
  askName: `What's it called?`,
  askCredits: `Who worked on it? Say it like “Maya did design, Jo produced” — or skip.`,
  creditFix: (name: string) => `I couldn't find “${name}” in this world — who did you mean?`,
  skipThem: `Skip them`,
  askTools: `Any tools from the directory? Type to search, tap to add.`,
  askLink: `Got a link or a video for it?`,
  linkNote: `Got it — and if you skip the cover image, I'll borrow one from that site.`,
  askImage: `Want a cover image?`,
  uploading: `Uploading…`,
  refineIntro: (name: string) => `Here's ${name} — tweak anything, or save it to the world.`,
  unknown: `Didn't catch that — I'm simpler than I look. Try the buttons below, or paste a link and I'll file it.`,
  renamePrompt: `What should it be called?`,
  descriptionPrompt: `Give me the one-liner.`,
  tagsPrompt: `What tags? Comma-separate a few.`,
  contentNote: `Want a full write-up with images? Open Edit on the project card after — the builder keeps things quick.`,
  saving: `Saving your project…`,
  saveFailed: (serverError: string | null) => serverError || `Could not save — try again?`,
} as const;

export const CHIP = {
  skip: 'Skip',
  done: 'Done',
  upload: 'Upload an image…',
  rename: 'Rename it',
  description: 'Description',
  tags: 'Tags',
  tools: 'Tools',
  credits: 'Credits',
  link: 'Link',
  cover: 'Cover',
  save: 'Save project ✦',
  tryAgain: 'Try again',
  keepEditing: 'Keep editing',
  cancel: 'Never mind',
} as const;
