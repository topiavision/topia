import { NextRequest, NextResponse } from 'next/server';
import { verifyPrivyIdentity } from '@/lib/auth/privyServer';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { ensureShortLink } from '@/lib/shortlinkStore';

// Normalize a profile string field: trim whitespace, convert empty to null.
// Returns undefined if the key was not present in the body (meaning "don't update").
function norm(body: Record<string, unknown>, key: string): string | null | undefined {
  if (!(key in body)) return undefined;        // key not sent → don't touch
  const v = body[key];
  if (typeof v !== 'string') return null;       // null / wrong type → clear
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : null;   // empty string → null
}

function ensureProtocol(url: string | null | undefined): string | null | undefined {
  if (url == null || url === undefined) return url;
  if (/^https?:\/\//i.test(url)) return url;
  return `https://${url}`;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const privyId = body.privyId;

    if (!privyId) {
      return NextResponse.json({ error: 'Missing privyId' }, { status: 400 });
    }

    /* Optional Bearer verification (conventions-to-adopt in CLAUDE.md):
     * when a token is provided AND Privy is configured, it must belong to
     * the privyId being patched — otherwise 401. Token-less calls keep the
     * legacy body-privyId path (RSVP/onboarding callers) with a loud log,
     * so nothing breaks while new callers (the Profile Assistant) opt in. */
    const authHeader = request.headers.get('authorization');
    const bearer = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (bearer) {
      const identity = await verifyPrivyIdentity(bearer);
      if (identity.configured && (!identity.ok || identity.did !== privyId)) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
      }
      if (!identity.configured) console.warn('[auth-sync] PRIVY_APP_SECRET unset — Bearer token not verified');
    } else {
      console.warn('[auth-sync] token-less profile write for', String(privyId).slice(0, 24));
    }

    const email         = body.email;
    const phone         = body.phone;
    const walletAddress = body.walletAddress;

    // Profile fields — only updated when explicitly included in request body
    const name              = norm(body, 'name');
    const username          = norm(body, 'username');
    const bio               = norm(body, 'bio');
    const avatarUrl         = norm(body, 'avatarUrl');
    const socialWebsite     = ensureProtocol(norm(body, 'socialWebsite'));
    const socialTwitter     = ensureProtocol(norm(body, 'socialTwitter'));
    const socialInstagram   = ensureProtocol(norm(body, 'socialInstagram'));
    const socialSoundcloud  = ensureProtocol(norm(body, 'socialSoundcloud'));
    const socialSpotify     = ensureProtocol(norm(body, 'socialSpotify'));
    const socialLinkedin    = ensureProtocol(norm(body, 'socialLinkedin'));
    const socialSubstack    = ensureProtocol(norm(body, 'socialSubstack'));
    const socialFarcaster   = ensureProtocol(norm(body, 'socialFarcaster'));
    const pronouns          = norm(body, 'pronouns');
    // customLinks is structured (array of {label, url}); normalize URLs
    const customLinks       = 'customLinks' in body
      ? (Array.isArray(body.customLinks) ? body.customLinks.map((l: { label: string; url: string }) => ({ ...l, url: l.url && !/^https?:\/\//i.test(l.url) ? `https://${l.url}` : l.url })) : body.customLinks)
      : undefined;
    const roleTags          = 'roleTags'  in body ? body.roleTags  : undefined;
    const toolSlugs         = 'toolSlugs' in body ? body.toolSlugs : undefined;
    // Stack headline is display copy on a shared page — cap it at 60 chars.
    const stackTitleRaw     = norm(body, 'stackTitle');
    const stackTitle        = typeof stackTitleRaw === 'string' ? stackTitleRaw.slice(0, 60) : stackTitleRaw;
    const path              = norm(body, 'path');
    // Notification preference: opt out of the daily unread-DM digest.
    const dmDigestOptOut    = 'dmDigestOptOut' in body ? !!body.dmDigestOptOut : undefined;

    // verifyProvider / unverifyProvider: atomically add/remove a provider from
    // the verifiedProviders CSV without the client needing to read-modify-write.
    const verifyProvider:   string | undefined = typeof body.verifyProvider   === 'string' ? body.verifyProvider.trim().toLowerCase()   : undefined;
    const unverifyProvider: string | undefined = typeof body.unverifyProvider === 'string' ? body.unverifyProvider.trim().toLowerCase() : undefined;

    // Fetch existing user
    const existing = await db
      .select()
      .from(users)
      .where(eq(users.privyId, privyId))
      .limit(1);

    function nextVerifiedProviders(prev: string | null): string | null {
      const set = new Set((prev ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean));
      if (verifyProvider)   set.add(verifyProvider);
      if (unverifyProvider) set.delete(unverifyProvider);
      const joined = [...set].join(',');
      return joined || null;
    }

    if (existing.length > 0) {
      const prev = existing[0];
      const updated = await db
        .update(users)
        .set({
          email:            email           ?? prev.email,
          phone:            phone           ?? prev.phone,
          walletAddress:    walletAddress   ?? prev.walletAddress,
          name:             name            !== undefined ? name            : prev.name,
          username:         username        !== undefined ? username        : prev.username,
          bio:              bio             !== undefined ? bio             : prev.bio,
          avatarUrl:        avatarUrl       !== undefined ? avatarUrl       : prev.avatarUrl,
          socialWebsite:    socialWebsite   !== undefined ? socialWebsite   : prev.socialWebsite,
          socialTwitter:    socialTwitter   !== undefined ? socialTwitter   : prev.socialTwitter,
          socialInstagram:  socialInstagram !== undefined ? socialInstagram : prev.socialInstagram,
          socialSoundcloud: socialSoundcloud !== undefined ? socialSoundcloud : prev.socialSoundcloud,
          socialSpotify:    socialSpotify   !== undefined ? socialSpotify   : prev.socialSpotify,
          socialLinkedin:   socialLinkedin  !== undefined ? socialLinkedin  : prev.socialLinkedin,
          socialSubstack:   socialSubstack  !== undefined ? socialSubstack  : prev.socialSubstack,
          socialFarcaster:  socialFarcaster !== undefined ? socialFarcaster : prev.socialFarcaster,
          pronouns:         pronouns        !== undefined ? pronouns        : prev.pronouns,
          ...(customLinks !== undefined && { customLinks }),
          ...(roleTags  !== undefined && { roleTags }),
          ...(toolSlugs !== undefined && { toolSlugs }),
          ...(stackTitle !== undefined && { stackTitle }),
          ...(dmDigestOptOut !== undefined && { dmDigestOptOut }),
          path:             path            !== undefined ? path            : prev.path,
          ...((verifyProvider || unverifyProvider) && { verifiedProviders: nextVerifiedProviders(prev.verifiedProviders) }),
          updatedAt: new Date(),
        })
        .where(eq(users.privyId, privyId))
        .returning();

      // Generate the profile short link the first time a username is set
      // (deduped, so re-saves are cheap no-ops).
      if (username !== undefined && updated[0].username) {
        try { await ensureShortLink({ path: `/profile/${updated[0].username}`, kind: 'profile', createdBy: updated[0].id }); } catch { /* ignore */ }
      }

      return NextResponse.json({ user: updated[0] });
    }

    // First-time user — insert
    const newUser = await db
      .insert(users)
      .values({
        privyId,
        email:            email           ?? null,
        phone:            phone           ?? null,
        walletAddress:    walletAddress   ?? null,
        name:             name            ?? null,
        username:         username        ?? null,
        bio:              bio             ?? null,
        avatarUrl:        avatarUrl       ?? null,
        socialWebsite:    socialWebsite   ?? null,
        socialTwitter:    socialTwitter   ?? null,
        socialInstagram:  socialInstagram ?? null,
        socialSoundcloud: socialSoundcloud ?? null,
        socialSpotify:    socialSpotify   ?? null,
        socialLinkedin:   socialLinkedin  ?? null,
        socialSubstack:   socialSubstack  ?? null,
        socialFarcaster:  socialFarcaster ?? null,
        pronouns:         pronouns        ?? null,
        customLinks:      customLinks     ?? null,
        roleTags:         roleTags        ?? null,
        toolSlugs:        toolSlugs       ?? null,
        stackTitle:       stackTitle      ?? null,
        path:             path            ?? 'catalyst', // default path for all new signups
        verifiedProviders: nextVerifiedProviders(null),
      })
      .returning();

    if (newUser[0].username) {
      try { await ensureShortLink({ path: `/profile/${newUser[0].username}`, kind: 'profile', createdBy: newUser[0].id }); } catch { /* ignore */ }
    }

    return NextResponse.json({ user: newUser[0] });
  } catch (error) {
    console.error('Auth sync error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
