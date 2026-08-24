/* Money formatting for the funding UI. Deliberately local and tiny rather than
 * importing the payments module — the client has no business pulling in fee
 * math, and money is integer cents everywhere. */

/** 320000 → "$3,200". Whole dollars unless the amount has real cents. */
export function usd(cents: number): string {
  const dollars = cents / 100;
  const hasCents = cents % 100 !== 0;
  return `$${dollars.toLocaleString('en-US', {
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: hasCents ? 2 : 0,
  })}`;
}

/** Progress as a whole percent, clamped for display. Over-funding is possible
 *  (pay-what-you-want has no ceiling), so the label can exceed 100 while the
 *  bar stops at full. */
export function progressPct(raisedCents: number, goalCents: number | null): number | null {
  if (!goalCents || goalCents <= 0) return null;
  return Math.round((raisedCents / goalCents) * 100);
}
