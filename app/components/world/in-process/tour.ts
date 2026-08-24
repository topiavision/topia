import type { TourStep } from '../../Tour';

// First-visit walkthrough — once per account, builders only. Steps whose
// anchor isn't on the page (empty state, no switcher) skip automatically.
export const IP_TOUR: TourStep[] = [
  { title: 'Welcome to In•Process', body: 'This is where your world builds in public. Every project tells its story as a roadmap, and every step of the process gets logged — right here. Powered by an integration with inprocess.world. Want the 30-second tour?', nextLabel: 'Show me around →', skipLabel: 'Skip — I’ll explore' },
  { target: 'tour-ip-timeline', title: 'Milestones tell the story', body: 'They move from ● done to ◉ in motion to ○ up next. Tap any milestone to open its details — the log below filters to everything that happened during it.', place: 'above' },
  { target: 'tour-ip-log', title: 'Post as you go', body: 'Drop a moment with an image, a thought, a link, or an embed. Tie each update to a milestone so the story stays connected — visitors tap a card to read it in full.', place: 'above' },
  { target: 'tour-ip-legend', title: '⛓ Publish onchain — optional', body: 'Connect In Process once in your profile and any update can also be minted — published permanently, collectible by your supporters. The ⛓ marks minted moments.', place: 'below' },
  { target: ['tour-ip-pills', 'tour-ip-add', 'tour-ip-start'], title: 'One roadmap per project', body: 'Switch between project roadmaps here, or start a new one — no project yet? You can create one as you go. That’s it. Build loud. ✦', place: 'below', nextLabel: 'Done' },
];
