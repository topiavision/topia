'use client';

import type { DraftEvent } from '@/lib/builder/event';

/* The Event Builder's live canvas — the event card assembling on the
 * drafting grid: display-type name, when/where lines, capacity pill,
 * question pills, tier rows. */

const ORANGE = 'var(--orange, #FF5C34)';
const orangeMix = (pct: number) => `color-mix(in srgb, var(--orange) ${pct}%, transparent)`;

function fmtDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase();
}
function fmt12(t: string): string {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const ap = h >= 12 ? 'PM' : 'AM';
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}${m ? `:${String(m).padStart(2, '0')}` : ''} ${ap}`;
}
const usd = (c: number) => (c === 0 ? 'Free' : `$${(c / 100).toLocaleString('en-US', { maximumFractionDigits: c % 100 === 0 ? 0 : 2 })}`);

export function EventCanvas({ draft }: { draft: DraftEvent | null }) {
  if (!draft || !draft.eventName) {
    return (
      <div className="ipb-canvas-bg flex items-center justify-center h-full min-h-[160px] p-8">
        <p className="font-mono text-[11px] uppercase tracking-[2px] text-ink/30 text-center">
          <span className="ipb-orb" style={{ color: ORANGE }}>✦</span>
          <span className="block mt-2">Your event will take shape here</span>
        </p>
      </div>
    );
  }

  return (
    <div className="ipb-canvas-bg min-h-full p-4 sm:p-8 flex items-start justify-center">
      <div className="ipb-materialize w-full max-w-sm rounded-xl border border-ink/10 overflow-hidden bg-[var(--page-bg)]/70 backdrop-blur-[1px]" style={{ boxShadow: `0 0 32px ${orangeMix(10)}` }}>
        {/* Poster band — the composer auto-generates a real cover at publish. */}
        <div className="px-4 py-6 bg-lime">
          <span className="font-mono text-[9px] font-bold uppercase tracking-[2px] text-obsidian/50 block">Topia://Event</span>
          <h3 className="font-basement font-black text-[clamp(20px,3vw,30px)] uppercase leading-[0.95] text-obsidian mt-1 break-words">
            {draft.eventName}
          </h3>
        </div>
        <div className="p-4 flex flex-col gap-2.5">
          {(draft.dateIso || draft.startTime) && (
            <p className="ipb-enter font-mono text-[12px] font-bold uppercase tracking-[1px]" style={{ color: ORANGE }}>
              {fmtDate(draft.dateIso)}{draft.startTime ? ` · ${fmt12(draft.startTime)}${draft.endTime ? ` — ${fmt12(draft.endTime)}` : ''}` : ''}
            </p>
          )}
          {(draft.city || draft.venue) && (
            <p className="ipb-enter font-mono text-[11px] uppercase tracking-[1px] text-ink/55">
              📍 {[draft.venue, draft.city].filter(Boolean).join(' · ')}
            </p>
          )}
          {draft.description && (
            <p className="ipb-enter font-mono text-[12px] text-ink/60 leading-relaxed">{draft.description}</p>
          )}
          {draft.capacity != null && (
            <span className="ipb-enter self-start font-mono text-[9px] font-bold uppercase tracking-[1px] px-2 py-0.5 rounded-full border" style={{ color: ORANGE, borderColor: orangeMix(55) }}>
              Capped at {draft.capacity}
            </span>
          )}
          {draft.questions.length > 0 && (
            <div className="ipb-enter flex flex-col gap-1 pt-2 border-t border-ink/[0.08]">
              <span className="font-mono text-[9px] uppercase tracking-[2px] text-ink/40">On RSVP, guests answer</span>
              {draft.questions.map((q, i) => (
                <span key={i} className="font-mono text-[11px] text-ink/70">· {q.label}</span>
              ))}
            </div>
          )}
          {draft.tiers.length > 0 && (
            <div className="ipb-enter flex flex-col gap-1 pt-2 border-t border-ink/[0.08]">
              <span className="font-mono text-[9px] uppercase tracking-[2px] text-ink/40">Tickets</span>
              {draft.tiers.map((t, i) => (
                <span key={i} className="flex items-baseline justify-between font-mono text-[11px] text-ink/70">
                  <span>{t.name}{t.quantityTotal ? ` · ${t.quantityTotal} available` : ''}</span>
                  <span className="font-bold text-ink">{usd(t.priceCents)}</span>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
