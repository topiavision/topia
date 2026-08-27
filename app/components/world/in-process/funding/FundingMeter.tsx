'use client';

/* The one progress-meter primitive. Every funding bar in In Process is this
 * component at a different size — the card strip, the roadmap aggregate, the
 * detail panel — so progress reads identically wherever it appears.
 *
 * Colour: lime fill, --accent-ink for the text. Orange stays the process
 * accent (milestone state, the minted marker); money is lime. The fill carries
 * no text on it, which sidesteps the lime-on-bone contrast trap that has cost
 * this repo more theme fixes than anything else.
 */

import { usd, progressPct } from './format';

type Size = 'sm' | 'md' | 'lg';

const TRACK_H: Record<Size, string> = { sm: 'h-[3px]', md: 'h-[6px]', lg: 'h-[8px]' };
const LABEL: Record<Size, string> = { sm: 'text-[10px]', md: 'text-[11px]', lg: 'text-[12px]' };

export function FundingMeter({
  raisedCents,
  goalCents,
  patronCount,
  size = 'md',
  showLabel = true,
  className = '',
}: {
  raisedCents: number;
  goalCents: number | null;
  patronCount?: number;
  size?: Size;
  showLabel?: boolean;
  className?: string;
}) {
  const pct = progressPct(raisedCents, goalCents);
  // Over-funding is possible — pay-what-you-want has no ceiling — so the label
  // may read past 100% while the bar itself stops at full.
  const fillPct = pct === null ? (raisedCents > 0 ? 100 : 0) : Math.min(pct, 100);
  const met = pct !== null && pct >= 100;

  return (
    <div className={className}>
      <div
        className={`w-full rounded-full overflow-hidden ${TRACK_H[size]}`}
        style={{ backgroundColor: 'color-mix(in srgb, var(--page-text) 14%, transparent)' }}
        role="progressbar"
        aria-valuenow={pct ?? raisedCents / 100}
        aria-valuemin={0}
        aria-valuemax={pct === null ? undefined : 100}
        aria-label={goalCents ? `${usd(raisedCents)} raised of ${usd(goalCents)}` : `${usd(raisedCents)} raised`}
      >
        <span
          className="block h-full rounded-full transition-[width] duration-500"
          style={{ width: `${fillPct}%`, backgroundColor: 'var(--lime)' }}
        />
      </div>

      {showLabel && (
        <p className={`font-mono ${LABEL[size]} mt-1.5 tabular-nums`} style={{ color: 'var(--accent-ink)' }}>
          {goalCents ? (
            <>
              <span className="font-bold">{usd(raisedCents)}</span>
              <span className="text-ink/45"> of {usd(goalCents)}</span>
              {met && <span className="font-bold"> · funded</span>}
            </>
          ) : (
            /* No target amount — show what has come in rather than a
             * meaningless percentage. */
            <><span className="font-bold">{usd(raisedCents)}</span><span className="text-ink/45"> funded</span></>
          )}
          {typeof patronCount === 'number' && patronCount > 0 && (
            <span className="text-ink/45"> · {patronCount} {patronCount === 1 ? 'patron' : 'patrons'}</span>
          )}
        </p>
      )}
    </div>
  );
}
