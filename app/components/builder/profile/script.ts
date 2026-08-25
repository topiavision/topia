/* Profile Assistant conversation copy. */

export const COPY = {
  intro: (name: string | null) => `${name ? `Hey ${name}` : 'Hey'} ✦ Your passport, edited by talking. Everything saves as we go.`,
  bioSeedPrompt: `Tell me about yourself in a sentence or two — I'll write the bio and pull out your roles.`,
  bioSeedApplied: (parts: string[]) => `Done — ${parts.join(', ')} saved. Tweak anything by just saying it.`,
  bioSeedMiss: `Give me a bit more — a sentence about what you make and do.`,
  avatarPrompt: `Drop the new photo below.`,
  uploading: `Uploading…`,
  handleCoach: `Handles are special — change yours from the profile page's “change handle” control so availability gets checked properly.`,
  unknown: `Didn't catch that — try “bio: …”, “i'm a photographer”, “instagram: <link>”, “change my photo”, or the buttons below.`,
  certified: `That's the full passport — Certified ✦`,
} as const;

export const TILES = [
  { glyph: '✎', title: 'Write my bio', sub: 'describe yourself once — bio, roles and links get pulled out', seed: 'write my bio' },
  { glyph: '📷', title: 'Upload a photo', sub: 'your pfp, changed right here', seed: 'change my photo' },
  { glyph: '✳', title: 'Add my roles', sub: '“i\'m a photographer” — up to three', seed: 'add my roles' },
  { glyph: '@', title: 'Link my socials', sub: 'paste any profile link — it files itself', seed: 'link my socials' },
];

export const CHIP = {
  done: 'Done ✦',
  cancel: 'Never mind',
} as const;
