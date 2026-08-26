'use client';

import { useState } from 'react';
import Link from 'next/link';
import { PathConfig } from './pathConfig';

interface EventHost {
  userId: string;
  name: string | null;
  username: string | null;
  avatarUrl: string | null;
}

interface EventItem {
  id: string;
  eventName: string;
  slug: string;
  date: string | null;
  city: string | null;
  imageUrl: string | null;
  startTime?: string | null;
  rsvpCount?: number;
  hosts?: EventHost[];
}

interface Props {
  config: PathConfig;
  hosted: EventItem[];
  attended: EventItem[];
}

function fmtDate(d: string | null): string {
  if (!d) return '';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return '';
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase();
}

function dayChip(d: string | null): { day: string; mon: string } {
  if (!d) return { day: '—', mon: '' };
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return { day: '—', mon: '' };
  return { day: String(dt.getDate()), mon: dt.toLocaleDateString('en-US', { month: 'short' }).toUpperCase() };
}

// Profile Events tab — events the user hosts (HOSTING) and ones they've
// RSVP'd to (ATTENDING), deduped, with a filter row so it's explicit which
// is which. Gallery view is primary; list view is the secondary toggle.
export default function EventsLayer({ config, hosted, attended }: Props) {
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [filter, setFilter] = useState<'all' | 'HOST' | 'GOING'>('all');

  const seen = new Set<string>();
  const allRows: { ev: EventItem; role: 'HOST' | 'GOING' }[] = [];
  for (const ev of hosted) { if (!seen.has(ev.id)) { seen.add(ev.id); allRows.push({ ev, role: 'HOST' }); } }
  for (const ev of attended) { if (!seen.has(ev.id)) { seen.add(ev.id); allRows.push({ ev, role: 'GOING' }); } }
  const rows = filter === 'all' ? allRows : allRows.filter((r) => r.role === filter);
  const hostCount = allRows.filter((r) => r.role === 'HOST').length;
  const goingCount = allRows.length - hostCount;

  // Accent TEXT must use --accent-ink (deep lime in light mode) — raw lime is
  // illegible on the bone page background.
  const roleBadge = (role: 'HOST' | 'GOING') =>
    `font-mono text-[8px] uppercase tracking-wider rounded-sm px-1.5 py-0.5 shrink-0 border ${role === 'HOST' ? 'text-[var(--accent-ink)] border-[var(--accent-ink)]/30' : 'text-ink/40 border-ink/[0.12]'}`;
  // What the badge says on the card — hosting it vs. attending it.
  const roleLabel = (role: 'HOST' | 'GOING') => (role === 'HOST' ? 'HOSTING' : 'ATTENDING');

  return (
    <div className="bg-[var(--page-bg)] flex flex-col h-full">
      <div className={`${config.bg} px-4 py-2.5 flex items-center justify-between`}>
        <span className={`font-mono text-[11px] uppercase tracking-wider font-bold ${config.textOn}`}>Events</span>
        <div className="flex items-center gap-2.5">
          <span className={`font-mono text-[9px] uppercase tracking-[2px] ${config.textOn} opacity-30`}>{allRows.length} events</span>
          {/* Gallery / list toggle — gallery first */}
          <div className={`flex items-center border ${config.textOn === 'text-obsidian' ? 'border-obsidian/20' : 'border-ink/20'} rounded-sm overflow-hidden`}>
            <button
              onClick={() => setView('grid')}
              className={`p-1 transition cursor-pointer ${view === 'grid' ? config.textOn === 'text-obsidian' ? 'bg-[var(--page-bg)] text-ink' : 'bg-ink text-[var(--page-bg)]' : `${config.textOn} opacity-50 hover:opacity-100`}`}
              title="Gallery view" aria-label="Gallery view"
            >
              <svg width="12" height="12" viewBox="0 0 14 14" fill="currentColor"><rect x="1" y="1" width="5" height="5" rx="0.5" /><rect x="8" y="1" width="5" height="5" rx="0.5" /><rect x="1" y="8" width="5" height="5" rx="0.5" /><rect x="8" y="8" width="5" height="5" rx="0.5" /></svg>
            </button>
            <button
              onClick={() => setView('list')}
              className={`p-1 transition cursor-pointer border-l ${config.textOn === 'text-obsidian' ? 'border-obsidian/20' : 'border-ink/20'} ${view === 'list' ? config.textOn === 'text-obsidian' ? 'bg-[var(--page-bg)] text-ink' : 'bg-ink text-[var(--page-bg)]' : `${config.textOn} opacity-50 hover:opacity-100`}`}
              title="List view" aria-label="List view"
            >
              <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5"><line x1="2" y1="3.5" x2="12" y2="3.5" /><line x1="2" y1="7" x2="12" y2="7" /><line x1="2" y1="10.5" x2="12" y2="10.5" /></svg>
            </button>
          </div>
        </div>
      </div>

      {/* Filter — makes hosting vs. attending explicit */}
      {allRows.length > 0 && (
        <div className="flex items-center gap-3 px-4 pt-2.5 pb-0.5">
          {([['all', 'ALL', allRows.length], ['HOST', 'HOSTING', hostCount], ['GOING', 'ATTENDING', goingCount]] as const)
            .filter(([key, , n]) => key === 'all' || n > 0)
            .map(([key, label, n]) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`font-mono text-[8px] uppercase tracking-[1.5px] bg-transparent border-none p-0 cursor-pointer transition ${filter === key ? 'text-ink font-bold' : 'text-ink/30 hover:text-ink/60'}`}
              >
                {label} [{n}]
              </button>
            ))}
        </div>
      )}

      <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2.5 py-12 text-center">
            <span className="font-mono text-[11px] text-ink/20 uppercase tracking-wider">No events yet</span>
            <Link href="/events" className="font-mono text-[11px] text-[var(--accent-ink)] no-underline hover:underline">
              browse what&apos;s on →
            </Link>
          </div>
        ) : view === 'grid' ? (
          /* Gallery — wide cards that fill the panel height and scroll sideways */
          <div className="flex gap-3 overflow-x-auto overflow-y-hidden p-3 h-full" style={{ scrollbarWidth: 'thin' }}>
            {rows.map(({ ev, role }) => {
              const chip = dayChip(ev.date);
              return (
                <Link key={ev.id} href={`/events/${ev.slug}`} className="group flex flex-col w-[min(320px,80vw)] shrink-0 h-full rounded-lg overflow-hidden border border-ink/[0.08] bg-[var(--page-bg)] no-underline hover:border-ink/20 transition-colors">
                  <div className="relative flex-1 min-h-0 overflow-hidden bg-ink/[0.05]">
                    {ev.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={ev.imageUrl} alt="" className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.04]" />
                    ) : (
                      <span className="absolute inset-0 flex items-center justify-center font-basement font-black text-[28px] uppercase text-ink/10">TOPIA</span>
                    )}
                    <div className="absolute top-2 left-2 bg-[var(--page-bg)]/80 backdrop-blur-sm border border-ink/20 rounded-sm px-1.5 py-0.5 text-center min-w-[30px]">
                      <div className="font-basement font-black text-[14px] leading-none text-ink">{chip.day}</div>
                      <div className="font-mono text-[7px] uppercase tracking-[1px] text-ink/60">{chip.mon}</div>
                    </div>
                  </div>
                  <div className="p-3 shrink-0">
                    <h3 className="font-mono text-[clamp(12px,2.6vw,15px)] font-bold uppercase text-ink leading-tight line-clamp-2">{ev.eventName}</h3>
                    <div className="flex items-center justify-between gap-2 mt-1.5">
                      <span className="font-mono text-[10px] text-ink/40 truncate">{ev.city || fmtDate(ev.date)}</span>
                      <span className={`${roleBadge(role)} shrink-0`}>{roleLabel(role)}</span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          /* List */
          rows.map(({ ev, role }, i) => (
            <Link key={ev.id} href={`/events/${ev.slug}`} className="flex items-center gap-3 px-4 py-3 border-b border-ink/[0.04] hover:bg-ink/[0.02] transition-colors no-underline" style={{ minHeight: '56px' }}>
              <div className="w-[40px] h-[40px] shrink-0 rounded-sm overflow-hidden bg-ink/[0.05] flex items-center justify-center">
                {ev.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={ev.imageUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="font-mono text-[9px] text-ink/20">{String(i + 1).padStart(2, '0')}</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <span className="font-mono text-[12px] uppercase font-bold text-ink block truncate">{ev.eventName}</span>
                <span className="font-mono text-[9px] text-ink/30">{[fmtDate(ev.date), ev.city].filter(Boolean).join(' · ')}</span>
              </div>
              <span className={roleBadge(role)}>{roleLabel(role)}</span>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
