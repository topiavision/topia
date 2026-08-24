import { pgTable, text, timestamp, uuid, jsonb, boolean, integer, index, uniqueIndex, date } from 'drizzle-orm/pg-core';

// Users table - auth via Privy (email, phone, Google, Coinbase wallet)
export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  privyId: text('privy_id').unique(), // Privy DID e.g. did:privy:xxxxxx
  email: text('email').unique(),      // nullable: users may auth via phone/wallet
  phone: text('phone').unique(),
  walletAddress: text('wallet_address').unique(),
  name: text('name'),
  username: text('username').unique(),
  bio: text('bio'),
  avatarUrl: text('avatar_url'),
  socialWebsite: text('social_website'),
  socialTwitter: text('social_twitter'),
  socialInstagram: text('social_instagram'),
  socialSoundcloud: text('social_soundcloud'),
  socialSpotify: text('social_spotify'),
  socialLinkedin: text('social_linkedin'),
  socialSubstack: text('social_substack'),
  socialFarcaster: text('social_farcaster'),
  role: text('role').default('user'), // 'user', 'artist', 'admin'
  roleTags: text('role_tags'),        // Comma-separated creative roles e.g. 'music,dj,visual-artist'
  toolSlugs: text('tool_slugs'),      // Comma-separated tool slugs from tools table (tools I USE)
  stackTitle: text('stack_title'),    // Custom headline for /stacks/[username] e.g. "my video-art stack" (≤60 chars, enforced at the sync route)
  savedToolSlugs: text('saved_tool_slugs'), // Comma-separated tool slugs user has bookmarked
  savedEventSlugs: text('saved_event_slugs'), // Comma-separated event slugs user has bookmarked
  path: text('path'),                 // 'worldbuilder' | 'catalyst' | 'anchor' — null until onboarding
  verifiedProviders: text('verified_providers'), // CSV of OAuth-verified social providers e.g. 'twitter,linkedin'
  pronouns: text('pronouns'),         // Optional free-text e.g. 'she/her', 'they/them'
  customLinks: jsonb('custom_links'), // Array of {label, url} pairs for arbitrary user links
  published: boolean('published').notNull().default(true), // admin can hide a profile from Discover
  profileNudgeSentAt: timestamp('profile_nudge_sent_at'), // one-per-user "finish your passport" email ledger (lib/notify/profileNudge.ts)
  dmDigestOptOut: boolean('dm_digest_opt_out').notNull().default(false), // user turned off the daily unread-DM email (profile → Notifications, or the email's unsubscribe link)
  toursSeen: jsonb('tours_seen').notNull().default([]), // first-run walkthroughs completed/skipped: array of tour keys ('inprocess' | 'world-hq' | 'profile')
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Creators - people/studios who build worlds
export const creators = pgTable('creators', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  description: text('description'),
  imageUrl: text('image_url'),
  websiteUrl: text('website_url'),
  country: text('country'), // e.g. 'US', 'SE', 'DE'
  userId: uuid('user_id').references(() => users.id), // Optional link to a user profile
  published: boolean('published').default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// World members - links users to worlds with roles
export const worldMembers = pgTable('world_members', {
  id: uuid('id').defaultRandom().primaryKey(),
  worldId: uuid('world_id').references(() => worlds.id, { onDelete: 'cascade' }).notNull(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  role: text('role').notNull(), // 'world_builder' | 'collaborator'
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  index('world_members_world_id_idx').on(t.worldId),
  index('world_members_user_id_idx').on(t.userId),
]);

// Worlds - artist-created spaces/projects
export const worlds = pgTable('worlds', {
  id: uuid('id').defaultRandom().primaryKey(),
  title: text('title').notNull(),
  shortDescription: text('short_description'),
  description: text('description'),
  slug: text('slug').notNull().unique(),
  artistId: uuid('artist_id').references(() => users.id),
  creatorId: uuid('creator_id').references(() => creators.id),
  category: text('category'), // e.g. 'Art', 'Music', 'Film'
  imageUrl: text('image_url'),
  headerImageUrl: text('header_image_url'),
  websiteUrl: text('website_url'),
  country: text('country'), // e.g. 'US', 'SE'
  tools: text('tools'), // Comma-separated tools
  collaborators: text('collaborators'), // Comma-separated names
  socialLinks: jsonb('social_links'), // {website: '', twitter: '', instagram: '', etc}
  content: jsonb('content'), // Flexible content structure
  dateAdded: text('date_added'), // Display date e.g. "Feb 01, 2026"
  displayOrder: integer('display_order').default(0),
  published: boolean('published').default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Catalysts - people/organizations in the network
export const catalysts = pgTable('catalysts', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  description: text('description'),
  imageUrl: text('image_url'),
  websiteUrl: text('website_url'),
  socialLinks: jsonb('social_links'), // {instagram: '', twitter: '', etc}
  published: boolean('published').default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Events
export const events = pgTable('events', {
  id: uuid('id').defaultRandom().primaryKey(),
  eventName: text('event_name').notNull(),
  slug: text('slug').notNull().unique(),
  description: text('description'), // Markdown description
  date: text('date'), // Stored as text from CSV (e.g., "18-Jul-2025")
  dateIso: text('date_iso'), // ISO format "2025-07-18" for chronological sorting
  startTime: text('start_time'), // e.g., "9:00 PM"
  endTime: text('end_time'), // e.g., "11:00 PM"
  timezone: text('timezone'), // e.g., "America/Los_Angeles"
  city: text('city'),
  address: text('address'), // Full street address
  link: text('link'),
  imageUrl: text('image_url'),
  createdBy: uuid('created_by').references(() => users.id),
  published: boolean('published').default(true),
  // Set when the event was imported from an external platform via /api/events/import.
  // Values: 'partiful' | 'luma' | 'eventbrite' | 'other' (manual creates leave it null)
  externalSource: text('external_source'),
  // ── RSVP / registration settings (Luma-style) ──
  rsvpCapacity: integer('rsvp_capacity'),                       // null = unlimited
  rsvpApprovalRequired: boolean('rsvp_approval_required').notNull().default(false),
  rsvpClosed: boolean('rsvp_closed').notNull().default(false),  // host closed registration
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Grants
export const grants = pgTable('grants', {
  id: uuid('id').defaultRandom().primaryKey(),
  grantName: text('grant_name').notNull(),
  slug: text('slug').notNull().unique(),
  shortDescription: text('short_description'),
  amountMin: integer('amount_min'),
  amountMax: integer('amount_max'),
  currency: text('currency').default('USD'),
  tags: text('tags'), // Comma-separated tags
  eligibility: text('eligibility'),
  deadlineType: text('deadline_type'), // 'Fixed', 'Rolling', etc.
  deadlineDate: text('deadline_date'), // Date string from CSV
  link: text('link'),
  region: text('region'),
  category: text('category'),
  frequency: text('frequency'), // 'Annual', 'One-time', etc.
  orgName: text('org_name'),
  status: text('status'), // 'Open', 'Closed', etc.
  notes: text('notes'),
  source: text('source'),
  published: boolean('published').default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Tools
export const tools = pgTable('tools', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  category: text('category'),
  description: text('description'),
  pricing: text('pricing'), // 'Free', 'Paid', 'Freemium', etc.
  url: text('url'),
  featured: boolean('featured').default(false),
  priority: integer('priority'),
  easeOfUse: text('ease_of_use'),
  submittedBy: uuid('submitted_by').references(() => users.id),
  published: boolean('published').default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Follows - user-to-user follow relationships
export const follows = pgTable('follows', {
  id: uuid('id').defaultRandom().primaryKey(),
  followerId: uuid('follower_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  followingId: uuid('following_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  index('follows_follower_id_idx').on(t.followerId),
  index('follows_following_id_idx').on(t.followingId),
]);

// World follows - users following a world as fans (distinct from membership).
// Powers the follow button on world pages; followers get notified when
// builders post announcements.
export const worldFollows = pgTable('world_follows', {
  id: uuid('id').defaultRandom().primaryKey(),
  worldId: uuid('world_id').references(() => worlds.id, { onDelete: 'cascade' }).notNull(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  index('world_follows_world_id_idx').on(t.worldId),
  index('world_follows_user_id_idx').on(t.userId),
  uniqueIndex('world_follows_world_user_uniq').on(t.worldId, t.userId),
]);

// Notifications - in-app notifications (e.g. follow events)
export const notifications = pgTable('notifications', {
  id: uuid('id').defaultRandom().primaryKey(),
  recipientId: uuid('recipient_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  actorId: uuid('actor_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  type: text('type').notNull(), // 'follow', 'world_member_added'
  metadata: jsonb('metadata'), // e.g. { worldId, worldTitle, worldSlug, role }
  read: boolean('read').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  // Bell badge + list query: recipient's notifications, newest first.
  index('notifications_recipient_id_created_at_idx').on(t.recipientId, t.createdAt),
]);

// World invitations - pending invites for world membership. Two shapes:
//  - platform user: inviteeId set (accepted via notifications, as before)
//  - "ghost" collaborator not on Topia yet: inviteeId null + email/name/token.
//    Their NAME shows on the world immediately as a pending credit; the email
//    carries a claim link (/invite/world/<token>); accepting resolves-or-
//    creates the user, sets inviteeId, and adds the membership.
export const worldInvitations = pgTable('world_invitations', {
  id: uuid('id').defaultRandom().primaryKey(),
  worldId: uuid('world_id').references(() => worlds.id, { onDelete: 'cascade' }).notNull(),
  inviterId: uuid('inviter_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  inviteeId: uuid('invitee_id').references(() => users.id, { onDelete: 'cascade' }), // null for email ghosts until claimed
  email: text('email'),                                  // ghost invites only
  name: text('name'),                                    // display credit before claim
  token: text('token').unique(),                         // claim-link token (ghosts only)
  role: text('role').notNull(), // 'world_builder' | 'collaborator'
  status: text('status').default('pending').notNull(), // 'pending' | 'accepted' | 'declined'
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  index('world_invitations_world_id_idx').on(t.worldId),
  index('world_invitations_invitee_id_idx').on(t.inviteeId),
]);

// Event hosts - links users to events with roles
export const eventHosts = pgTable('event_hosts', {
  id: uuid('id').defaultRandom().primaryKey(),
  eventId: uuid('event_id').references(() => events.id, { onDelete: 'cascade' }).notNull(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  role: text('role').notNull(), // 'creator' | 'co_host'
  worldId: uuid('world_id').references(() => worlds.id), // optional: hosting as a World
  // Luma-style host settings:
  manager: boolean('manager').notNull().default(true),          // false = host shown but no /manage access
  showOnEventPage: boolean('show_on_event_page').notNull().default(true), // public "Hosted by" visibility
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  index('event_hosts_event_id_idx').on(t.eventId),
  index('event_hosts_user_id_idx').on(t.userId),
]);

// Event co-host invitations
export const eventHostInvitations = pgTable('event_host_invitations', {
  id: uuid('id').defaultRandom().primaryKey(),
  eventId: uuid('event_id').references(() => events.id, { onDelete: 'cascade' }).notNull(),
  inviterId: uuid('inviter_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  inviteeId: uuid('invitee_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  status: text('status').default('pending').notNull(), // 'pending' | 'accepted' | 'declined'
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Event RSVPs
export const eventRsvps = pgTable('event_rsvps', {
  id: uuid('id').defaultRandom().primaryKey(),
  eventId: uuid('event_id').references(() => events.id, { onDelete: 'cascade' }).notNull(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  // 'going' (confirmed) | 'pending' (awaiting host approval) | 'declined'
  // | 'waitlisted' (event at capacity — auto-promoted oldest-first when a
  //   spot opens; see lib/events/waitlist.ts)
  status: text('status').default('going').notNull(),
  // Snapshot of answers to the event's custom questions at RSVP time:
  // [{ questionId, label, type, answer }]. Snapshotting keeps history stable
  // even if the host later edits/removes questions.
  responses: jsonb('responses'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  index('event_rsvps_event_id_idx').on(t.eventId),
  index('event_rsvps_user_id_idx').on(t.userId),
]);

// Guest invitations by email / phone (Luma-style). A host invites people who
// may not be on the platform yet; each invite carries a unique token used in a
// shareable link (/events/[slug]?invite=token). The invitee verifies with Privy
// and RSVPs, which flips the invite to 'accepted'. Delivery (email/SMS) is
// pluggable — if no provider is configured we just surface the link for the
// host to share manually.
export const eventInvites = pgTable('event_invites', {
  id: uuid('id').defaultRandom().primaryKey(),
  eventId: uuid('event_id').references(() => events.id, { onDelete: 'cascade' }).notNull(),
  email: text('email'),                                  // one of email/phone is set
  phone: text('phone'),
  invitedBy: uuid('invited_by').references(() => users.id),
  token: text('token').notNull().unique(),               // shareable-link token
  status: text('status').notNull().default('pending'),   // 'pending' | 'accepted' | 'revoked'
  acceptedByUserId: uuid('accepted_by_user_id').references(() => users.id),
  sent: boolean('sent').notNull().default(false),        // true once auto-delivered
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Custom RSVP questions per event (Luma-style registration form). Hosts define
// them; answers are captured into eventRsvps.responses at registration time.
export const eventQuestions = pgTable('event_questions', {
  id: uuid('id').defaultRandom().primaryKey(),
  eventId: uuid('event_id').references(() => events.id, { onDelete: 'cascade' }).notNull(),
  label: text('label').notNull(),
  // 'short_text' | 'long_text' | 'single_select' | 'multi_select' | 'checkbox'
  type: text('type').notNull().default('short_text'),
  options: jsonb('options'),                              // string[] for select types
  required: boolean('required').notNull().default(false),
  sortOrder: integer('sort_order').default(0),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  index('event_questions_event_id_idx').on(t.eventId),
]);

// Event reminder ledger — one row per (event, kind) once that reminder batch
// has been sent, so the cron (/api/cron/event-reminders) is idempotent no
// matter how often it fires. kind: '24h' | '2h'.
export const eventReminders = pgTable('event_reminders', {
  id: uuid('id').defaultRandom().primaryKey(),
  eventId: uuid('event_id').references(() => events.id, { onDelete: 'cascade' }).notNull(),
  kind: text('kind').notNull(),
  recipients: integer('recipients').default(0),   // how many guests were emailed
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  index('event_reminders_event_id_idx').on(t.eventId),
  uniqueIndex('event_reminders_event_kind_uniq').on(t.eventId, t.kind),
]);

// Door check-in ledger — one row per guest per event, written when a manager
// marks the guest checked in from the manage console's Check-in tab (search
// the roster, tap to check in; no attendee-side QR pass). Source of truth for
// "was in the room" for BOTH free (RSVP) and paid (ticketed) guests; paid
// check-ins also stamp tickets.checkedInAt so ticket reporting stays coherent.
// Checking in is what unlocks quest participation for the guest.
export const eventCheckins = pgTable('event_checkins', {
  id: uuid('id').defaultRandom().primaryKey(),
  eventId: uuid('event_id').references(() => events.id, { onDelete: 'cascade' }).notNull(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  checkedInBy: uuid('checked_in_by').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  index('event_checkins_event_id_idx').on(t.eventId),
  index('event_checkins_user_id_idx').on(t.userId),
  uniqueIndex('event_checkins_event_user_uniq').on(t.eventId, t.userId),
]);

// Personal connect codes — one stable, unguessable token per user, encoded
// into their QR (topia.vision/connect/<code>). Scanned by a host in the
// Check-in tab it checks the guest in; scanned by another guest (P3) it
// creates a mutual connection. Lazy-minted on first request; lives in its
// own table (not a users column) so the hot users table stays untouched.
// updatedAt tracks regeneration (revoking a leaked code).
export const userConnectCodes = pgTable('user_connect_codes', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull().unique(),
  code: text('code').notNull().unique(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Attendee-to-attendee connections made by scanning Topia codes — the "met
// at" ledger. The pair is stored sorted (userAId < userBId lexicographically)
// so one row represents the pair per event; eventId is where they met (null =
// scanned outside any event). The social edge itself is the mutual follow the
// connect creates (which unlocks DMs + the orbit stamp); these rows add the
// who/where/when context for People screens and mutual-event surfaces.
// Uniqueness is an expression index in the apply script:
// (user_a_id, user_b_id, COALESCE(event_id, zero-uuid)).
export const eventConnections = pgTable('event_connections', {
  id: uuid('id').defaultRandom().primaryKey(),
  eventId: uuid('event_id').references(() => events.id, { onDelete: 'set null' }),
  userAId: uuid('user_a_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  userBId: uuid('user_b_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  index('event_connections_event_id_idx').on(t.eventId),
  index('event_connections_user_a_idx').on(t.userAId),
  index('event_connections_user_b_idx').on(t.userBId),
]);

/* ════════════════════════════════════════════════════════════════════
 * EVENT QUESTS — the live-layer game. No points: completing ALL of an
 * event's active quests makes the guest prize-eligible and enters them
 * into that event's raffle. Check-in (event_checkins) gates participation.
 * ════════════════════════════════════════════════════════════════════ */

// Host-authored quests. verifyMethod:
//   'qr'   — guest scans a printed code at the venue (quest `code`, minted
//            server-side, encoded as /events/<slug>/live?quest=<code>)
//   'host' — a host verifies in person (grants from the manage console)
//   'auto' — evaluated server-side from `rule` jsonb, e.g.
//            {kind:'connections', count:3} or {kind:'checkin'} — new rule
//            kinds need no schema change. Auto completions are materialized
//            into event_quest_completions when observed (lazy), so raffle,
//            progress, and stamps all read one table.
export const eventQuests = pgTable('event_quests', {
  id: uuid('id').defaultRandom().primaryKey(),
  eventId: uuid('event_id').references(() => events.id, { onDelete: 'cascade' }).notNull(),
  title: text('title').notNull(),
  description: text('description'),
  icon: text('icon'),                                     // emoji shown in lists
  verifyMethod: text('verify_method').notNull().default('qr'), // 'qr' | 'host' | 'auto'
  code: text('code').unique(),                            // set for 'qr' quests
  rule: jsonb('rule'),                                    // set for 'auto' quests
  isActive: boolean('is_active').notNull().default(true),
  sortOrder: integer('sort_order').default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  index('event_quests_event_id_idx').on(t.eventId),
]);

// One row per guest per completed quest. verifiedBy: the host who granted
// it ('host' method) — null for self-scanned 'qr' and materialized 'auto'.
export const eventQuestCompletions = pgTable('event_quest_completions', {
  id: uuid('id').defaultRandom().primaryKey(),
  questId: uuid('quest_id').references(() => eventQuests.id, { onDelete: 'cascade' }).notNull(),
  eventId: uuid('event_id').references(() => events.id, { onDelete: 'cascade' }).notNull(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  verifiedBy: uuid('verified_by').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  index('event_quest_completions_quest_id_idx').on(t.questId),
  index('event_quest_completions_event_id_idx').on(t.eventId),
  index('event_quest_completions_user_id_idx').on(t.userId),
  uniqueIndex('event_quest_completions_quest_user_uniq').on(t.questId, t.userId),
]);

// Prizes shown in Event Mode, in three tiers ("separate the raffle thing
// from the other prizes"):
//   kind 'raffle'   — drawn from guests who completed every active quest;
//                     the host draws per prize, redrawing overwrites.
//   kind 'everyone' — every checked-in guest gets it (e.g. a free drink).
//   kind 'first_n'  — the first `threshold` guests through the door
//                     (check-in order) qualify.
export const eventPrizes = pgTable('event_prizes', {
  id: uuid('id').defaultRandom().primaryKey(),
  eventId: uuid('event_id').references(() => events.id, { onDelete: 'cascade' }).notNull(),
  title: text('title').notNull(),
  description: text('description'),
  imageUrl: text('image_url'),
  kind: text('kind').notNull().default('raffle'), // 'raffle' | 'everyone' | 'first_n'
  threshold: integer('threshold'),                // first_n: how many earliest check-ins qualify
  sortOrder: integer('sort_order').default(0),
  raffleWinnerUserId: uuid('raffle_winner_user_id').references(() => users.id),
  drawnAt: timestamp('drawn_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  index('event_prizes_event_id_idx').on(t.eventId),
]);

// TOPIA TV content
export const tvContent = pgTable('tv_content', {
  id: uuid('id').defaultRandom().primaryKey(),
  title: text('title').notNull(),
  slug: text('slug').notNull().unique(),
  description: text('description'),
  artistId: uuid('artist_id').references(() => users.id),
  videoUrl: text('video_url'),
  thumbnailUrl: text('thumbnail_url'),
  duration: text('duration'),
  published: boolean('published').default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

/* ════════════════════════════════════════════════════════════════════
 * IN PROCESS — build-in-public roadmaps (Latashá's mockup, Turn 2)
 *
 * A world can run an ERA ("ORBIT ONE — debut album era") made of ordered
 * MILESTONES with statuses; a passport can carry personal LIFE CHAPTERS
 * that interleave with world eras on the profile's In Process tab.
 * Funding fields (goal/raised cents) exist on milestones for the future
 * milestone-funding phase but are NOT surfaced anywhere in the UI yet.
 * Date fields are display labels ("MAR 2026", "JUL–OCT 2026") like
 * events' text dates — this is editorial storytelling, not scheduling.
 * ──────────────────────────────────────────────────────────────────── */
export const worldEras = pgTable('world_eras', {
  id: uuid('id').defaultRandom().primaryKey(),
  worldId: uuid('world_id').references(() => worlds.id, { onDelete: 'cascade' }).notNull(),
  // The roadmap belongs to a PROJECT ("each project has its own roadmap") —
  // ORBIT ONE the era is ORBIT ONE the project. Null = a legacy world-wide
  // roadmap from before this linkage existed.
  projectId: uuid('project_id').references(() => worldProjects.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),           // "ORBIT ONE"
  description: text('description'),         // "debut album era"
  // Real dates with chooseable precision: exact day ("MAR 3, 2026"),
  // month+year ("MAR 2026"), or year only ("2026"). Dates are stored
  // normalized (month → 1st, year → Jan 1) and the precision drives the
  // rendering (lib/eraDates.ts). Legacy free-text labels below remain a
  // read fallback for rows created before the date columns existed.
  startDate: date('start_date'),
  endDate: date('end_date'),
  startPrecision: text('start_precision'), // 'day' | 'month' | 'year' (null = month)
  endPrecision: text('end_precision'),
  startLabel: text('start_label'),           // legacy display label
  endLabel: text('end_label'),               // legacy display label
  status: text('status').notNull().default('active'), // 'active' | 'complete' | 'archived'
  // Link to the era's home on In Process (inprocess.fun) — the source of
  // the build-in-public process log.
  inProcessUrl: text('in_process_url'),
  sortOrder: integer('sort_order').default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  index('world_eras_world_id_idx').on(t.worldId),
]);

export const eraMilestones = pgTable('era_milestones', {
  id: uuid('id').defaultRandom().primaryKey(),
  eraId: uuid('era_id').references(() => worldEras.id, { onDelete: 'cascade' }).notNull(),
  title: text('title').notNull(),           // "Album Production"
  description: text('description'),
  // Real dates with precision, same as eras ("MAR 2026 — JUN 2026",
  // "MAR 3, 2026", "2026"). dateLabel below is the legacy free-text fallback.
  startDate: date('start_date'),
  endDate: date('end_date'),
  startPrecision: text('start_precision'), // 'day' | 'month' | 'year' (null = month)
  endPrecision: text('end_precision'),
  dateLabel: text('date_label'),             // legacy "MAR–JUN 2026"
  status: text('status').notNull().default('upcoming'), // 'done' | 'now' | 'upcoming' | 'paused'
  imageUrl: text('image_url'),
  // Future funding phase — never rendered yet. Integer cents per house rule.
  goalCents: integer('goal_cents'),
  raisedCents: integer('raised_cents'),
  sortOrder: integer('sort_order').default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  index('era_milestones_era_id_idx').on(t.eraId),
]);

// A user's connected In Process (inprocess.world) account: their artist
// wallet address + an artist API key minted through their "Sign in with
// In•Process" OTP flow. The key can post moments AS the artist, so it is
// stored AES-256-GCM encrypted (lib/inProcessAccount.ts) and never leaves
// the server. One connection per user.
export const inProcessAccounts = pgTable('in_process_accounts', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull().unique(),
  artistAddress: text('artist_address').notNull(),   // their In Process identity (0x…)
  apiKeyEncrypted: text('api_key_encrypted').notNull(), // iv:tag:ciphertext, base64 parts
  keyName: text('key_name'),                          // the name we minted the key under
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Native process-log posts on an era — build-in-public updates (image +
// words) that live on Topia. Posting is Topia-first: syncing the same post
// to In Process (minting it onchain) is optional per post; when it happens,
// minted_url records the collect link.
// Post kinds mirror In Process's create flow (the era is the "collection"):
//   moment  — media-first (an image + a few words)
//   thought — just words
//   link    — any URL from the internet
//   embed   — a player URL (YouTube/SoundCloud/etc.); stored as a URL, never
//             raw HTML — embed code is an XSS grenade.
export const eraProcessPosts = pgTable('era_process_posts', {
  id: uuid('id').defaultRandom().primaryKey(),
  eraId: uuid('era_id').references(() => worldEras.id, { onDelete: 'cascade' }).notNull(),
  milestoneId: uuid('milestone_id').references(() => eraMilestones.id, { onDelete: 'set null' }), // optional: ties the update to a timeline node
  authorUserId: uuid('author_user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  kind: text('kind').notNull().default('moment'), // 'moment' | 'thought' | 'link' | 'embed'
  title: text('title').notNull(),
  body: text('body'),
  imageUrl: text('image_url'),
  linkUrl: text('link_url'),       // link/embed target
  mintedUrl: text('minted_url'),   // In Process collect URL when the post was also minted
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  index('era_process_posts_era_id_idx').on(t.eraId),
  index('era_process_posts_milestone_id_idx').on(t.milestoneId),
]);

// Personal roadmap entries on the passport ("Move the studio to LA",
// "Rest era — 6 weeks offline"). status 'witness' = the mockup's
// "not seeking funds · just witness it".
export const lifeChapters = pgTable('life_chapters', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  title: text('title').notNull(),
  subtitle: text('subtitle'),
  dateLabel: text('date_label'),             // "AUG '26", "FALL '26"
  status: text('status').notNull().default('planned'), // 'in_motion' | 'planned' | 'complete' | 'witness'
  sortOrder: integer('sort_order').default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  index('life_chapters_user_id_idx').on(t.userId),
]);

// World projects - items that appear as labels on a world's globe
export const worldProjects = pgTable('world_projects', {
  id: uuid('id').defaultRandom().primaryKey(),
  worldId: uuid('world_id').references(() => worlds.id, { onDelete: 'cascade' }).notNull(),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  description: text('description'),       // Short description shown on card
  content: text('content'),               // Long-form markdown content
  imageUrl: text('image_url'),            // Cover/hero image
  videoUrl: text('video_url'),            // Video embed URL (YouTube, Vimeo, etc.)
  url: text('url'),                       // External project link
  links: jsonb('links'),                  // Array of {label, url} pairs
  tags: jsonb('tags'),                    // Array of string tags
  sortOrder: integer('sort_order').default(0),
  published: boolean('published').default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  index('world_projects_world_id_idx').on(t.worldId),
]);

// Project credits — who made a project, with a free-text role ("recordist",
// "mastering"). One row per person per project; multiple roles go in the one
// role string. Shown on the project page, linking to the person's passport.
export const projectMembers = pgTable('project_members', {
  id: uuid('id').defaultRandom().primaryKey(),
  projectId: uuid('project_id').references(() => worldProjects.id, { onDelete: 'cascade' }).notNull(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  role: text('role'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  index('project_members_project_id_idx').on(t.projectId),
  index('project_members_user_id_idx').on(t.userId),
  uniqueIndex('project_members_project_user_uniq').on(t.projectId, t.userId),
]);

// World announcements — short builder-posted updates shown in a world's
// Overview activity feed alongside auto-logged project/member/event activity.
export const worldAnnouncements = pgTable('world_announcements', {
  id: uuid('id').defaultRandom().primaryKey(),
  worldId: uuid('world_id').references(() => worlds.id, { onDelete: 'cascade' }).notNull(),
  authorId: uuid('author_id').references(() => users.id).notNull(),
  body: text('body').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  index('world_announcements_world_id_idx').on(t.worldId),
]);

/* ────────────────────────────────────────────────────────────────────
 * Guestbook entries — drawings, text messages, gifs left on a user's
 * public profile. Visibility is always public; the *write* permission
 * is gated by follow relationship (enforced at the API layer):
 *   - drawing → mutual follow only
 *   - message / gif → at least one-way follow
 * ──────────────────────────────────────────────────────────────────── */
export const guestbookEntries = pgTable('guestbook_entries', {
  id: uuid('id').defaultRandom().primaryKey(),
  profileUserId: uuid('profile_user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  authorUserId:  uuid('author_user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  kind: text('kind').notNull(),                 // 'drawing' | 'message' | 'gif' | 'reply'
  body: text('body'),                           // text content / caption
  imageUrl: text('image_url'),                  // drawing PNG OR gif URL (Vercel Blob or Giphy CDN)
  giphyId: text('giphy_id'),                    // for Giphy attribution
  // Optional parent for one-level-deep text replies. Guestbook replies are
  // limited: text-only, no further nesting. Null for top-level entries.
  parentId: uuid('parent_id'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  // Profile guestbook render: a profile's entries, newest first.
  index('guestbook_entries_profile_user_id_created_at_idx').on(t.profileUserId, t.createdAt),
]);

/* Tool comments + optional 1–5 rating. Only users who have the tool in
 * their kit (users.tool_slugs contains tool.slug) can post — enforced at
 * the API layer. Public read. Replies live in the same table via parentId. */
export const toolComments = pgTable('tool_comments', {
  id: uuid('id').defaultRandom().primaryKey(),
  toolId: uuid('tool_id').references(() => tools.id, { onDelete: 'cascade' }).notNull(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  body: text('body'),
  rating: integer('rating'),                    // nullable 1..5; replies don't carry ratings
  parentId: uuid('parent_id'),                  // top-level when null
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  index('tool_comments_tool_id_idx').on(t.toolId),
]);

/* Event comments + optional gif. Only users who RSVP'd or have the event
 * slug in savedEventSlugs (interested) can post — enforced at the API.
 * Replies live in the same table via parentId. */
export const eventComments = pgTable('event_comments', {
  id: uuid('id').defaultRandom().primaryKey(),
  eventId: uuid('event_id').references(() => events.id, { onDelete: 'cascade' }).notNull(),
  userId:  uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  body: text('body'),
  imageUrl: text('image_url'),                  // gif URL
  giphyId: text('giphy_id'),
  parentId: uuid('parent_id'),                  // top-level when null
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  index('event_comments_event_id_idx').on(t.eventId),
]);

/* Event photo album — hosts upload images/clips that render in a gallery
 * on the event page. Public to read; only hosts add/remove (enforced at
 * the API). sortOrder lets hosts arrange the album. */
export const eventGalleryPhotos = pgTable('event_gallery_photos', {
  id: uuid('id').defaultRandom().primaryKey(),
  eventId: uuid('event_id').references(() => events.id, { onDelete: 'cascade' }).notNull(),
  url: text('url').notNull(),                    // Vercel Blob URL
  isVideo: boolean('is_video').notNull().default(false),
  caption: text('caption'),
  uploadedBy: uuid('uploaded_by').references(() => users.id),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  index('event_gallery_photos_event_id_idx').on(t.eventId),
]);

/* ────────────────────────────────────────────────────────────────────
 * Polymorphic emoji reactions on guestbook entries + comments.
 *
 * One row per (target, user, emoji) — toggling the same emoji on the
 * same target by the same user deletes the row. Aggregation happens at
 * read time (cheap; counts shown live).
 *
 *   targetType ∈ 'guestbook' | 'tool_comment' | 'event_comment'
 *
 * `target_id` is *not* a FK because it refers to different tables
 * depending on `target_type`. Cascade cleanup of orphans is handled
 * lazily when the parent row is deleted (a separate sweep, not via FK).
 * ──────────────────────────────────────────────────────────────────── */
export const reactions = pgTable('reactions', {
  id: uuid('id').defaultRandom().primaryKey(),
  targetType: text('target_type').notNull(),   // 'guestbook' | 'tool_comment' | 'event_comment'
  targetId:   uuid('target_id').notNull(),
  userId:     uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  emoji:      text('emoji').notNull(),         // unicode character, e.g. '❤️', '🔥'
  createdAt:  timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  // Aggregating reactions for a target at read time.
  index('reactions_target_idx').on(t.targetType, t.targetId),
]);

/* ────────────────────────────────────────────────────────────────────
 * Topia TV episodes — videos that play on /tv. Stored as URLs pointing
 * at Vercel Blob (videos themselves) plus optional poster/thumbnail
 * URLs. Categories drive the colored accent in the TV guide.
 *
 * For multi-part episodes (e.g. "Ep 001 Part I" + "Part II") we store
 * each part as its own row, grouped by `seriesSlug`. Sort order within
 * a series uses `episodeNumber` + `partNumber`.
 * ──────────────────────────────────────────────────────────────────── */
export const tvEpisodes = pgTable('tv_episodes', {
  id: uuid('id').defaultRandom().primaryKey(),
  slug: text('slug').notNull().unique(),
  title: text('title').notNull(),
  description: text('description'),
  category: text('category').notNull(),          // 'Featured' | 'Live' | 'Series' | 'Replays'
  seriesSlug: text('series_slug'),               // groups multi-episode runs
  seriesTitle: text('series_title'),             // human-readable series name
  episodeNumber: integer('episode_number'),
  partNumber: integer('part_number'),
  videoUrl: text('video_url').notNull(),         // Vercel Blob URL
  thumbnailUrl: text('thumbnail_url'),           // poster image; nullable → fall back to a default gif
  durationSeconds: integer('duration_seconds'),
  guestName: text('guest_name'),                 // optional guest tag, e.g. "C.Y Lee"
  publishedAt: timestamp('published_at').defaultNow(),
  published: boolean('published').default(true),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

/* ════════════════════════════════════════════════════════════════════
 * TICKETED EVENTS — paid admission
 *
 * Payments run through Stripe Checkout (cards, Apple/Google Pay, Link).
 * Earlier rails (Square, USDC-on-Base) are retired; their columns remain on
 * ticket_orders so historical rows stay readable.
 *
 * Money is stored in integer minor units (USD cents) everywhere to avoid
 * float rounding. Free events simply have no ticket types — RSVP stays the
 * path for those. An event is "ticketed" iff it has ≥1 active ticket type.
 * ════════════════════════════════════════════════════════════════════ */

// Ticket tiers for an event, e.g. "General Admission", "VIP". Host-managed.
export const eventTicketTypes = pgTable('event_ticket_types', {
  id: uuid('id').defaultRandom().primaryKey(),
  eventId: uuid('event_id').references(() => events.id, { onDelete: 'cascade' }).notNull(),
  name: text('name').notNull(),                          // 'General Admission' | 'VIP'
  description: text('description'),
  priceCents: integer('price_cents').notNull().default(0), // USD cents; 0 = free tier
  currency: text('currency').notNull().default('USD'),
  quantityTotal: integer('quantity_total'),             // null = unlimited supply
  quantitySold: integer('quantity_sold').notNull().default(0),
  maxPerOrder: integer('max_per_order').default(10),
  isActive: boolean('is_active').notNull().default(true),
  // Sale window (both optional). Before salesStartAt the tier shows as
  // "on sale <date>" but can't be bought; after salesEndAt it stays visible,
  // crossed out as "sale ended". null = no bound. isActive stays the master
  // hide-entirely switch.
  salesStartAt: timestamp('sales_start_at'),
  salesEndAt: timestamp('sales_end_at'),
  sortOrder: integer('sort_order').default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  index('event_ticket_types_event_id_idx').on(t.eventId),
]);

// A purchase. One row per checkout attempt; tickets are issued only once
// status flips to 'paid'. Pricing is snapshotted at purchase time so later
// tier edits never rewrite history.
export const ticketOrders = pgTable('ticket_orders', {
  id: uuid('id').defaultRandom().primaryKey(),
  eventId: uuid('event_id').references(() => events.id, { onDelete: 'cascade' }).notNull(),
  ticketTypeId: uuid('ticket_type_id').references(() => eventTicketTypes.id).notNull(),
  buyerId: uuid('buyer_id').references(() => users.id).notNull(),
  quantity: integer('quantity').notNull().default(1),
  unitPriceCents: integer('unit_price_cents').notNull(), // snapshot of tier price
  amountCents: integer('amount_cents').notNull(),        // unitPriceCents * quantity
  currency: text('currency').notNull().default('USD'),
  rail: text('rail').notNull(),                          // 'stripe' (legacy rows: 'square' | 'crypto')
  status: text('status').notNull().default('pending'),   // 'pending'|'paid'|'failed'|'refunded'|'cancelled'
  // ── Buyer identity (sales record, NOT the passport profile) ──
  // Captured on the Topia checkout screen before the Stripe redirect, so a
  // buyer who logged in with SMS-only still has a name and a reachable email
  // on the order. Deliberately separate from users.name/users.email: a ticket
  // is a transaction, and the host's door list must not depend on how complete
  // someone's profile happens to be. The webhook back-fills any of these left
  // blank from Stripe's own customer_details.
  buyerFirstName: text('buyer_first_name'),
  buyerLastName: text('buyer_last_name'),
  buyerEmail: text('buyer_email'),
  // ── Promo code (snapshot at purchase; amountCents is already discounted) ──
  promoCodeId: uuid('promo_code_id').references(() => eventPromoCodes.id),
  promoCode: text('promo_code'),                         // the literal code used, for receipts/reports
  discountCents: integer('discount_cents').notNull().default(0),
  // ── Stripe ──
  stripeCheckoutSessionId: text('stripe_checkout_session_id'),
  stripePaymentIntentId: text('stripe_payment_intent_id'),
  // ── Legacy rails (Square / USDC-on-Base) — kept for historical orders ──
  squarePaymentId: text('square_payment_id'),
  squareOrderId: text('square_order_id'),
  txHash: text('tx_hash'),
  chainId: integer('chain_id'),
  payerWalletAddress: text('payer_wallet_address'),
  recipientWalletAddress: text('recipient_wallet_address'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Host-managed discount codes, e.g. EARLYBIRD (20% off) or FRIENDS10 ($10 off).
// Scoped to one event; optionally restricted to a single tier. `code` is stored
// uppercase and matched case-insensitively. Redemptions count paid orders only
// (incremented inside fulfillOrder's transaction, so it never double-counts).
export const eventPromoCodes = pgTable('event_promo_codes', {
  id: uuid('id').defaultRandom().primaryKey(),
  eventId: uuid('event_id').references(() => events.id, { onDelete: 'cascade' }).notNull(),
  ticketTypeId: uuid('ticket_type_id').references(() => eventTicketTypes.id, { onDelete: 'cascade' }), // null = any tier
  code: text('code').notNull(),                          // stored UPPERCASE
  discountType: text('discount_type').notNull(),         // 'percent' | 'fixed'
  discountValue: integer('discount_value').notNull(),    // percent: 1–100 · fixed: USD cents off the order
  maxRedemptions: integer('max_redemptions'),            // null = unlimited
  redemptionCount: integer('redemption_count').notNull().default(0),
  startsAt: timestamp('starts_at'),                      // null = active immediately
  expiresAt: timestamp('expires_at'),                    // null = never expires
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  index('event_promo_codes_event_id_idx').on(t.eventId),
  uniqueIndex('event_promo_codes_event_code_idx').on(t.eventId, t.code),
]);

// Individual issued admissions — one row per seat. Created when an order is
// paid. `code` is the unique value encoded into a QR for door check-in.
export const tickets = pgTable('tickets', {
  id: uuid('id').defaultRandom().primaryKey(),
  orderId: uuid('order_id').references(() => ticketOrders.id, { onDelete: 'cascade' }).notNull(),
  eventId: uuid('event_id').references(() => events.id, { onDelete: 'cascade' }).notNull(),
  ticketTypeId: uuid('ticket_type_id').references(() => eventTicketTypes.id).notNull(),
  ownerId: uuid('owner_id').references(() => users.id).notNull(),
  code: text('code').notNull().unique(),                 // scannable check-in code
  status: text('status').notNull().default('valid'),     // 'valid'|'checked_in'|'refunded'|'void'
  checkedInAt: timestamp('checked_in_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Short links — maps a compact code to an internal path so shareable URLs can
// be tiny (topia.vision/s/<code>). Deduped by targetPath (unique) so a given
// page always resolves to the same code. `clicks` is a best-effort tally
// bumped on each redirect.
export const shortLinks = pgTable('short_links', {
  id: uuid('id').defaultRandom().primaryKey(),
  code: text('code').notNull().unique(),               // base62 slug in the /s/ URL
  targetPath: text('target_path').notNull().unique(),  // internal path, e.g. /events/foo
  kind: text('kind'),                                  // 'event' | 'profile' | 'world' | null
  createdBy: uuid('created_by').references(() => users.id),
  clicks: integer('clicks').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Newsletter / waitlist sign-ups captured from the marketing site (home page
// dispatch widget, /waitlist). Deduped by email. `userId` attributes a signup
// to a profile when the email matches an existing user — set best-effort at
// signup time; the admin view also re-matches live by email so profiles created
// after the signup still attribute.
export const newsletterSignups = pgTable('newsletter_signups', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: text('email').notNull().unique(),             // lowercased on write
  name: text('name'),                                  // first name (or full name from /waitlist)
  source: text('source'),                              // 'home-newsletter' | 'waitlist' | null
  roles: text('roles'),                                // CSV of roles when supplied (/waitlist)
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

/* ════════════════════════════════════════════════════════════════════
 * DIRECT MESSAGES (Instagram-style)
 *
 * 1:1 conversations split into Primary vs Requests at the membership level:
 *   - mutual follow (a "connection")  → both members 'accepted' → Primary
 *   - non-mutual first message        → recipient member 'pending' → Requests
 *     until they accept (sender is always 'accepted').
 * Delivery is poll-based (no realtime infra). Group threads can come later by
 * allowing >2 members + a null dmKey.
 * ──────────────────────────────────────────────────────────────────── */
export const conversations = pgTable('conversations', {
  id: uuid('id').defaultRandom().primaryKey(),
  // Deterministic key for a 1:1 pair — sorted "minUserId:maxUserId" — so a pair
  // can only ever have one conversation. Null for (future) group threads.
  dmKey: text('dm_key').unique(),
  lastMessageAt: timestamp('last_message_at').defaultNow().notNull(), // sorts the inbox
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const conversationMembers = pgTable('conversation_members', {
  id: uuid('id').defaultRandom().primaryKey(),
  conversationId: uuid('conversation_id').references(() => conversations.id, { onDelete: 'cascade' }).notNull(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  status: text('status').notNull().default('accepted'), // 'accepted' (Primary) | 'pending' (Requests)
  lastReadAt: timestamp('last_read_at'),                 // null = never opened; drives unread counts
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  // Inbox: "my conversations" (polled). Also the unread-badge count.
  index('conversation_members_user_id_idx').on(t.userId),
  // Loading the members of a conversation (the "other" person).
  index('conversation_members_conversation_id_idx').on(t.conversationId),
]);

export const messages = pgTable('messages', {
  id: uuid('id').defaultRandom().primaryKey(),
  conversationId: uuid('conversation_id').references(() => conversations.id, { onDelete: 'cascade' }).notNull(),
  senderId: uuid('sender_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  body: text('body'),                                    // text content (nullable for media-only)
  imageUrl: text('image_url'),                           // uploaded image OR gif URL
  giphyId: text('giphy_id'),                             // Giphy attribution when the image is a gif
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  // Thread load (polled every few seconds): a conversation's messages in order.
  index('messages_conversation_id_created_at_idx').on(t.conversationId, t.createdAt),
]);

/* ── Creator payouts (Stripe Connect Express) ──────────────────────────
 * One connected account per PERSON, not per world or per event: a Stripe
 * Express account is a KYC'd legal entity with a bank account and a tax ID,
 * so a creator onboards once and every world they admin and every event they
 * host pays out through it.
 *
 * Who gets paid is resolved at earning time (see resolvePayee in
 * lib/payments/connect.ts), never stored here: anything a world owns pays
 * that world's admin; a personal event pays its creator-host; a life goal
 * pays the user themselves.
 *
 * The Stripe account is the durable record — these columns are a cache of its
 * status, refreshed by the account.updated webhook and by a live retrieve on
 * the dashboard read. */
export const creatorPayoutAccounts = pgTable('creator_payout_accounts', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull().unique(),
  stripeAccountId: text('stripe_account_id').notNull().unique(),   // acct_…
  country: text('country').notNull().default('US'),
  currency: text('currency').notNull().default('USD'),
  // Mirrors of the Stripe Account object. chargesEnabled + transfersActive
  // together gate selling; payoutsEnabled only drives a "finish verification
  // to get paid" banner — money can accrue in the connected balance while
  // verification finishes, and blocking on it would strand creators.
  chargesEnabled: boolean('charges_enabled').notNull().default(false),
  payoutsEnabled: boolean('payouts_enabled').notNull().default(false),
  transfersActive: boolean('transfers_active').notNull().default(false),
  detailsSubmitted: boolean('details_submitted').notNull().default(false),
  // 'pending' | 'restricted' | 'active' | 'disabled' | 'deauthorized'
  onboardingStatus: text('onboarding_status').notNull().default('pending'),
  requirementsDue: jsonb('requirements_due'),   // requirements.currently_due snapshot
  disabledReason: text('disabled_reason'),      // requirements.disabled_reason
  lastSyncedAt: timestamp('last_synced_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  index('creator_payout_accounts_stripe_account_id_idx').on(t.stripeAccountId),
]);

/* ── Funding goals ─────────────────────────────────────────────────────
 * One table for every fundable thing, rather than a goal_cents column on
 * each. Goals attach to a MILESTONE, a whole PROJECT, or a LIFE CHAPTER
 * (housing, a studio move — things with no project at all), and the meeting
 * that scoped this asked for all three plus a cumulative per-creator view.
 *
 * Polymorphic on purpose: the project bar and the milestone bars become the
 * same component reading the same table, the consolidated profile view is one
 * query instead of a union across three schemas, and there is one checkout
 * route and one ledger regardless of what is being funded.
 *
 * Cost of that choice: target_id cannot carry a real FK, so orphan cleanup is
 * app-side and titleSnapshot exists so a receipt stays readable after the
 * target is deleted. Worth it at three target types and rising. */
export const fundingGoals = pgTable('funding_goals', {
  id: uuid('id').defaultRandom().primaryKey(),
  // 'milestone' | 'project' | 'life_chapter'
  targetType: text('target_type').notNull(),
  targetId: uuid('target_id').notNull(),
  /* The payee at the time the goal was created. A CONVENIENCE for the
   * cumulative profile view — the authoritative payee is resolved fresh at
   * contribution time (resolvePayee) and snapshotted onto the contribution,
   * because world ownership can transfer. */
  ownerUserId: uuid('owner_user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  // Null for life goals, which belong to a person rather than a world.
  worldId: uuid('world_id').references(() => worlds.id, { onDelete: 'cascade' }),
  titleSnapshot: text('title_snapshot'),
  // Null = open-ended support with no target. Distinct from 0.
  goalCents: integer('goal_cents'),
  // Caches derived from paid contributions; the ledger is authoritative.
  // Only ever mutated by SQL expression inside the crediting transaction.
  raisedCents: integer('raised_cents').notNull().default(0),
  patronCount: integer('patron_count').notNull().default(0),
  blurb: text('blurb'),                                  // "what support pays for"
  status: text('status').notNull().default('open'),      // 'open' | 'closed'
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  // One goal per thing.
  uniqueIndex('funding_goals_target_uniq').on(t.targetType, t.targetId),
  // The cumulative profile view: every goal a creator owns.
  index('funding_goals_owner_user_id_idx').on(t.ownerUserId),
  index('funding_goals_world_id_idx').on(t.worldId),
]);

/* ── Contributions ─────────────────────────────────────────────────────
 * The money ledger, and the authoritative record of what a goal raised.
 * funding_goals.raised_cents is a cache derived from the paid rows here.
 *
 * Parent FKs are SET NULL rather than CASCADE: worlds hard-delete in this
 * codebase and cascade through projects, eras and milestones, and a financial
 * record must outlive the thing it funded. The snapshot columns keep a receipt
 * readable after the parent is gone. */
export const contributions = pgTable('contributions', {
  id: uuid('id').defaultRandom().primaryKey(),
  fundingGoalId: uuid('funding_goal_id').references(() => fundingGoals.id, { onDelete: 'set null' }),
  // Snapshots — survive deletion of the goal and its target.
  targetType: text('target_type'),
  targetId: uuid('target_id'),
  worldId: uuid('world_id').references(() => worlds.id, { onDelete: 'set null' }),
  goalTitleSnapshot: text('goal_title_snapshot'),
  /* WHO earned this, resolved at charge time and never re-derived. The inputs
   * are mutable (a host can change "Host as world" from a dropdown; world
   * ownership can transfer), so without this snapshot, editing a dropdown
   * would retroactively change who owns money that already moved. */
  payoutUserId: uuid('payout_user_id').references(() => users.id, { onDelete: 'set null' }),
  payoutAccountId: text('payout_account_id'),            // acct_… at charge time
  // Backer. Nullable user id — supporting does not require an account.
  // backerEmail is a RECEIPT DESTINATION ONLY and never resolves or patches a
  // users row, or guest checkout would become a profile-write primitive.
  backerId: uuid('backer_id').references(() => users.id, { onDelete: 'set null' }),
  backerName: text('backer_name'),
  backerEmail: text('backer_email'),
  anonymous: boolean('anonymous').notNull().default(false),
  message: text('message'),                              // plain text, never markdown
  // Money. amountCents is what the supporter chose, what credits the meter,
  // and what the creator receives — fees are added on top of it.
  amountCents: integer('amount_cents').notNull(),
  platformFeeCents: integer('platform_fee_cents').notNull().default(0),
  processingFeeCents: integer('processing_fee_cents').notNull().default(0),
  totalChargedCents: integer('total_charged_cents').notNull().default(0),
  // Cumulative, because Stripe's charge.amount_refunded is cumulative and
  // partial refunds must be distinguishable from replayed events.
  refundedCents: integer('refunded_cents').notNull().default(0),
  currency: text('currency').notNull().default('USD'),
  // 'pending' | 'paid' | 'failed' | 'cancelled' | 'refunded' | 'disputed'
  status: text('status').notNull().default('pending'),
  // Which payment rail carried this. Kept explicit so a rail change does not
  // require rewriting history — the ledger predates the rail decision.
  rail: text('rail').notNull().default('stripe'),
  stripeCheckoutSessionId: text('stripe_checkout_session_id'),
  stripePaymentIntentId: text('stripe_payment_intent_id'),
  stripeChargeId: text('stripe_charge_id'),
  paidAt: timestamp('paid_at'),
  refundedAt: timestamp('refunded_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  index('contributions_funding_goal_id_idx').on(t.fundingGoalId),
  index('contributions_payout_user_id_idx').on(t.payoutUserId),
  index('contributions_backer_id_idx').on(t.backerId),
  index('contributions_world_id_created_at_idx').on(t.worldId, t.createdAt),
  // The hard idempotency floor: one contribution per Checkout Session,
  // enforced by the database rather than by care.
  uniqueIndex('contributions_session_uniq').on(t.stripeCheckoutSessionId),
]);

/* ── Per-user feature access ───────────────────────────────────────────
 * Phased rollout, granted from the admin dashboard. The product plan calls
 * for shipping funding to a limited cohort first (legal review, then the
 * Restless Egg accelerator group) before general availability, and the same
 * pattern is expected for minting and other later phases — hence a general
 * (user, feature) table rather than a boolean column per feature.
 *
 * Semantics live in lib/featureAccess.ts: the NEXT_PUBLIC_* env flag means
 * GENERALLY AVAILABLE, and a row here means "this person, ahead of that". */
export const userFeatureFlags = pgTable('user_feature_flags', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  feature: text('feature').notNull(),                    // e.g. 'funding'
  enabled: boolean('enabled').notNull().default(true),
  // Who granted it, for an audit trail — this gates money features.
  grantedBy: uuid('granted_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  uniqueIndex('user_feature_flags_user_feature_uniq').on(t.userId, t.feature),
  index('user_feature_flags_feature_idx').on(t.feature),
]);
