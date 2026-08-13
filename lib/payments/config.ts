// Shared payment helpers. All money is integer USD cents.

// Human display, e.g. 2500 → "25.00"
export function formatUsd(cents: number): string {
  return (cents / 100).toFixed(2);
}
