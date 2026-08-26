import { eq, sql } from 'drizzle-orm';
import { db, users } from '@/lib/db';

/* ── Guest identity — RSVPs and tickets without a login ─────────────
 * A guest is a users row keyed by email with privyId NULL. When that
 * person later logs in with Privy using the same (Privy-verified)
 * email, /api/auth/sync adopts the row — their RSVPs, tickets and
 * stamps are already attached. Fill-blanks-only, same as the RSVP
 * route's authed resolver: guest input never clobbers profile data. */

export function isValidEmail(email: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
}

export async function resolveOrCreateGuestByEmail(hint: { email: string; name?: string; phone?: string }): Promise<string | null> {
  const email = hint.email.trim().toLowerCase();
  if (!isValidEmail(email)) return null;

  const [found] = await db
    .select({ id: users.id, name: users.name, phone: users.phone })
    .from(users)
    .where(sql`lower(${users.email}) = ${email}`);
  if (found) {
    // The email may belong to a full account — attaching the RSVP/order to
    // it is correct (they claim it by logging into that account); nothing
    // about the account is revealed to the guest.
    const patch: { name?: string; phone?: string; updatedAt?: Date } = {};
    if (hint.name?.trim() && !found.name) patch.name = hint.name.trim();
    if (hint.phone?.trim() && !found.phone) patch.phone = hint.phone.trim();
    if (Object.keys(patch).length) {
      patch.updatedAt = new Date();
      try { await db.update(users).set(patch).where(eq(users.id, found.id)); } catch { /* fill-blanks only */ }
    }
    return found.id;
  }

  try {
    const [created] = await db
      .insert(users)
      .values({ privyId: null, email, name: hint.name?.trim() || null, phone: hint.phone?.trim() || null, path: 'catalyst' })
      .returning({ id: users.id });
    return created.id;
  } catch {
    // Unique race on email — someone else created it between select and insert.
    const [again] = await db.select({ id: users.id }).from(users).where(sql`lower(${users.email}) = ${email}`);
    return again?.id ?? null;
  }
}
