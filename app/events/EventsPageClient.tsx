'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { usePrivy } from '@privy-io/react-auth';
import PageShell from '../components/PageShell';
import { useToast } from '../components/Toast';
import { CheckIcon, StarIcon } from '../components/ui/Icons';
import EventSourceBadge from './EventSourceBadge';
import EventCover from './EventCover';
import { eventLocalDayPlus, isEventOver } from '../../lib/events/localDay';

interface EventHost {
  userId: string;
  name: string | null;
  username: string | null;
  avatarUrl: string | null;
  role: string;
}

interface EventCard {
  id: string;
  eventName: string;
  slug: string;
  date: string | null;
  dateIso: string | null;
  startTime: string | null;
  endTime: string | null;
  timezone: string | null;
  city: string | null;
  address: string | null;
  link: string | null;
  imageUrl: string | null;
  description: string | null;
  hosts: EventHost[];
  rsvpCount: number;
  interestedCount: number;
  isGoing: boolean;
  isHosting: boolean;
  isSaved: boolean;
  externalSource?: string | null;
  sharerName?: string | null;
  sharerUsername?: string | null;
  sharerAvatarUrl?: string | null;
}

type Tab = 'all' | 'upcoming' | 'thisWeek' | 'past' | 'saved' | 'mine';
type ViewMode = 'list' | 'grid';

const TABS: { id: Tab; label: string }[] = [
  { id: 'all',      label: 'All' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'thisWeek', label: 'This week' },
  { id: 'past',     label: 'Past' },
  { id: 'saved',    label: 'Saved' },
  { id: 'mine',     label: 'Mine' },
];

function formatDayChip(iso: string | null): { day: string; mon: string; year: string } {
  if (!iso) return { day: '—', mon: '', year: '' };
  try {
    const d = new Date(iso);
    return {
      day: String(d.getUTCDate()).padStart(2, '0'),
      mon: d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }).toUpperCase(),
      year: String(d.getUTCFullYear()),
    };
  } catch { return { day: '—', mon: '', year: '' }; }
}

/** Build a compact attendance string for an event card.
 * External events hide the RSVP count (we can't track it — it lives on the
 * source platform) and surface the save count instead. "saved" matches the
 * star action's own name — "interested" was a gloss nothing else used. */
function attendanceLine(ev: { rsvpCount: number; interestedCount: number; externalSource?: string | null }): string {
  const parts: string[] = [];
  if (!ev.externalSource && ev.rsvpCount > 0) parts.push(`${ev.rsvpCount} going`);
  if (ev.interestedCount > 0) parts.push(`${ev.interestedCount} saved`);
  return parts.join(' · ');
}

function externalLinkLabel(source: string | null | undefined): string {
  if (source === 'partiful') return 'RSVP on Partiful →';
  if (source === 'luma')     return 'RSVP on Luma →';
  if (source === 'posh')     return 'Tickets on Posh →';
  return 'Open event →';
}
function externalLinkShort(source: string | null | undefined): string {
  if (source === 'partiful') return 'Partiful →';
  if (source === 'luma')     return 'Luma →';
  if (source === 'posh')     return 'Posh →';
  return 'Open →';
}

function dateGroupKey(iso: string | null, isPast: boolean): string {
  if (!iso) return 'TBD';
  const d = new Date(iso);
  const now = new Date();
  const today = new Date(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const day = new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const diffMs = day.getTime() - today.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (isPast) {
    if (diffDays >= -7) return 'LAST WEEK';
    if (diffDays >= -30) return 'LAST MONTH';
    return d.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }).toUpperCase();
  }
  if (diffDays === 0) return 'TODAY';
  if (diffDays === 1) return 'TOMORROW';
  if (diffDays <= 7) return 'THIS WEEK';
  if (diffDays <= 14) return 'NEXT WEEK';
  if (diffDays <= 30) return 'THIS MONTH';
  return d.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }).toUpperCase();
}

export default function EventsPageClient({
  initialEvents,
  initialCities,
}: {
  initialEvents: EventCard[];
  initialCities: string[];
}) {
  const { authenticated, user, login } = usePrivy();
  const toast = useToast();
  const [events, setEvents] = useState<EventCard[]>(initialEvents);
  const [cities, setCities] = useState<string[]>(initialCities);
  const [selectedCity, setSelectedCity] = useState('');
  const [tab, setTab] = useState<Tab>('upcoming');
  const [search, setSearch] = useState('');
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  // Background refetch failed — the list on screen is the last one that
  // loaded. Surfaced as a dismissible notice instead of failing silently.
  const [refreshError, setRefreshError] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const searchRef = useRef<HTMLInputElement>(null);

  // Restore view preference
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = localStorage.getItem('topia.events.viewMode');
    if (saved === 'grid' || saved === 'list') setViewMode(saved);
  }, []);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem('topia.events.viewMode', viewMode);
  }, [viewMode]);

  // Single batched fetch
  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (user?.id) params.set('privyId', user.id);
      if (selectedCity) params.set('city', selectedCity);
      const res = await fetch(`/api/events/overview?${params}`);
      if (!res.ok) throw new Error(`events overview fetch failed (${res.status})`);
      const data = await res.json();
      setEvents(data.events ?? []);
      setCities(data.cities ?? []);
      setRefreshError(false);
    } catch (err) {
      console.error('events overview load failed', err);
      setRefreshError(true);
    } finally {
      setLoading(false);
    }
  }, [user?.id, selectedCity]);

  // The server already rendered the anonymous dataset — only refetch when the
  // viewer's flags matter (logged in) or a city filter kicks in.
  useEffect(() => {
    if (!user?.id && !selectedCity) return;
    reload();
  }, [reload, user?.id, selectedCity]);

  // Keyboard shortcut: "/" focuses search
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const tag = (document.activeElement?.tagName ?? '').toLowerCase();
        if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
        e.preventDefault();
        searchRef.current?.focus();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /* ── Derived list: filter by tab, search ────────────────────── */

  // End-time-aware "over" (event's own timezone, overrun buffer) — tonight's
  // event stays under "Upcoming" for its whole night instead of sliding into
  // "Past" at UTC midnight (8pm ET) or at 00:00 while it's still running.
  const weekFromNow = eventLocalDayPlus(7);

  const filtered = useMemo(() => {
    let list = events;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((e) =>
        e.eventName.toLowerCase().includes(q) ||
        (e.city ?? '').toLowerCase().includes(q) ||
        (e.description ?? '').toLowerCase().includes(q)
      );
    }
    switch (tab) {
      case 'upcoming': list = list.filter((e) => !e.dateIso || !isEventOver(e)); break;
      case 'thisWeek': list = list.filter((e) => e.dateIso && !isEventOver(e) && e.dateIso <= weekFromNow); break;
      case 'past':     list = list.filter((e) => e.dateIso && isEventOver(e)); break;
      case 'saved':    list = list.filter((e) => e.isSaved); break;
      case 'mine':     list = list.filter((e) => e.isGoing || e.isHosting); break;
      case 'all':      break;
    }
    if (tab === 'past') {
      // Most recent past first
      list = [...list].sort((a, b) => (b.dateIso ?? '').localeCompare(a.dateIso ?? ''));
    }
    return list;
  }, [events, search, tab, weekFromNow]);

  // Counts for tab labels
  const counts = useMemo(() => {
    return {
      all: events.length,
      upcoming: events.filter((e) => !e.dateIso || !isEventOver(e)).length,
      thisWeek: events.filter((e) => e.dateIso && !isEventOver(e) && e.dateIso <= weekFromNow).length,
      past: events.filter((e) => e.dateIso && isEventOver(e)).length,
      saved: events.filter((e) => e.isSaved).length,
      mine: events.filter((e) => e.isGoing || e.isHosting).length,
    };
  }, [events, weekFromNow]);

  // Date grouping
  const grouped = useMemo(() => {
    const groups: { label: string; items: EventCard[] }[] = [];
    let current: { label: string; items: EventCard[] } | null = null;
    for (const ev of filtered) {
      const label = dateGroupKey(ev.dateIso, isEventOver(ev));
      if (!current || current.label !== label) {
        current = { label, items: [] };
        groups.push(current);
      }
      current.items.push(ev);
    }
    return groups;
  }, [filtered]);

  // Featured: next upcoming events that have a cover image.
  // Grid view shows a compact scroll (6 items); list view shows a 3-up hero.
  const featured = useMemo(() => {
    const pool = events.filter((e) => e.dateIso && !isEventOver(e) && e.imageUrl);
    return viewMode === 'grid' ? pool.slice(0, 8) : pool.slice(0, 3);
  }, [events, viewMode]);

  const showFeatured = !search && !selectedCity && (tab === 'all' || tab === 'upcoming' || tab === 'thisWeek');

  /* ── Optimistic toggles ─────────────────────────────────────── */

  // RSVP now lives on the event page (the full modal + withdraw-confirm flow),
  // so the list's attendance buttons just open the event instead of toggling
  // attendance from here (which made it too easy to accidentally un-RSVP).
  function openEventById(eventId: string) {
    const ev = events.find((e) => e.id === eventId);
    if (ev) router.push(`/events/${ev.slug}`);
  }

  async function toggleSave(slug: string, saved: boolean) {
    if (!user?.id) return;
    setEvents((list) => list.map((e) => e.slug === slug
      ? { ...e, isSaved: saved, interestedCount: Math.max(0, e.interestedCount + (saved ? 1 : -1)) }
      : e
    ));
    try {
      await fetch('/api/events/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ privyId: user.id, slug, action: saved ? 'save' : 'unsave' }),
      });
    } catch (err) {
      console.error('save event failed', err);
      setEvents((list) => list.map((e) => e.slug === slug
        ? { ...e, isSaved: !saved, interestedCount: Math.max(0, e.interestedCount + (saved ? -1 : 1)) }
        : e
      ));
      toast.error("Couldn't save the event — try again.");
    }
  }

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] w-full overflow-x-hidden">
      <PageShell>
        <section className="px-4 md:px-6 py-4 md:py-6">
          <div className="max-w-[var(--content-max)] mx-auto">
            <div className="grid grid-cols-1 gap-[3px] border border-[var(--border-color)] rounded-lg overflow-hidden">

              {/* ─── ROW 1: Title bar ─── */}
              <div className="bg-[var(--accent)] relative">
                <div className="px-4 md:px-6 py-4 md:py-5 flex flex-col md:flex-row md:items-end md:justify-between gap-3">
                  <div>
                    <span className="font-mono text-[11px] uppercase tracking-[2px] text-[var(--on-accent-muted)] block">events // gatherings</span>
                    <h1 className="font-basement font-black text-[clamp(28px,5vw,64px)] uppercase leading-[0.9] text-[var(--accent-text)] mt-1">
                      EVENTS
                    </h1>
                  </div>
                  <div className="flex flex-col items-start md:items-end gap-2">
                    <span className="font-mono text-[12px] text-[var(--accent-text)]/80 leading-snug">gatherings, launches, sessions, rituals.</span>
                    <Link
                      href="/events/create"
                      className="font-mono text-[11px] uppercase tracking-[2px] px-3 py-1.5 rounded-sm hover:opacity-90 transition cursor-pointer border-none no-underline"
                      style={{ backgroundColor: 'var(--foreground)', color: 'var(--background)' }}
                    >
                      + Create event
                    </Link>
                  </div>
                </div>
              </div>

              {/* ─── ROW 2: Search + city + count ─── */}
              <div className="bg-[var(--background)] border-t border-b border-[var(--border-color)] px-4 py-3 flex flex-col md:flex-row md:items-center gap-3 md:gap-4 sticky top-0 md:top-[var(--nav-height,56px)] z-30">
                <div className="relative flex-1">
                  <input
                    ref={searchRef}
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="search events, cities…"
                    className="w-full bg-transparent border border-[var(--border-color)] focus:border-[var(--border-color)] font-mono text-[13px] text-[var(--foreground)] placeholder:text-[var(--foreground)]/25 px-3 py-1.5 pr-10 rounded-sm outline-none transition-colors"
                  />
                  {search && (
                    <button
                      onClick={() => setSearch('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 font-mono text-[14px] text-[var(--text-muted)] hover:text-[var(--foreground)] transition bg-transparent border-none cursor-pointer w-5 h-5 flex items-center justify-center"
                      aria-label="Clear"
                    >
                      ×
                    </button>
                  )}
                </div>
                <select
                  value={selectedCity}
                  onChange={(e) => setSelectedCity(e.target.value)}
                  aria-label="Filter by city"
                  className="bg-transparent border border-[var(--border-color)] focus:border-[var(--border-color)] font-mono text-[12px] uppercase tracking-[1px] text-[var(--foreground)]/70 px-3 py-1.5 rounded-sm outline-none cursor-pointer transition-colors"
                >
                  <option value="" className="bg-[var(--background)] text-[var(--foreground)]">all locations</option>
                  {cities.map((c) => (
                    <option key={c} value={c} className="bg-[var(--background)] text-[var(--foreground)]">{c}</option>
                  ))}
                </select>
                <span className="font-mono text-[11px] uppercase tracking-[2px] text-[var(--text-muted)] md:ml-auto shrink-0">
                  {filtered.length} event{filtered.length !== 1 ? 's' : ''}
                </span>
                {/* List/grid toggle */}
                <div className="flex items-center border border-[var(--border-color)] rounded-sm overflow-hidden shrink-0">
                  <button
                    onClick={() => setViewMode('grid')}
                    className={`p-1.5 transition cursor-pointer ${viewMode === 'grid' ? 'bg-[var(--foreground)] text-[var(--background)]' : 'bg-transparent text-[var(--text-muted)] hover:text-[var(--foreground)]'}`}
                    title="Gallery view"
                    aria-label="Gallery view"
                  >
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                      <rect x="1" y="1" width="5" height="5" rx="0.5" />
                      <rect x="8" y="1" width="5" height="5" rx="0.5" />
                      <rect x="1" y="8" width="5" height="5" rx="0.5" />
                      <rect x="8" y="8" width="5" height="5" rx="0.5" />
                    </svg>
                  </button>
                  <button
                    onClick={() => setViewMode('list')}
                    className={`p-1.5 transition cursor-pointer border-l border-[var(--border-color)] ${viewMode === 'list' ? 'bg-[var(--foreground)] text-[var(--background)]' : 'bg-transparent text-[var(--text-muted)] hover:text-[var(--foreground)]'}`}
                    title="List view"
                    aria-label="List view"
                  >
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <line x1="2" y1="3.5" x2="12" y2="3.5" />
                      <line x1="2" y1="7"   x2="12" y2="7" />
                      <line x1="2" y1="10.5" x2="12" y2="10.5" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* ─── ROW 3: Tabs ─── */}
              <div className="bg-[var(--background)] border-b border-[var(--border-color)] px-4 py-2 flex items-center gap-1.5 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
                {TABS.map((t) => {
                  const n = counts[t.id];
                  const active = tab === t.id;
                  return (
                    <button
                      key={t.id}
                      onClick={() => setTab(t.id)}
                      className={`inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider px-2.5 py-1 rounded-sm whitespace-nowrap transition cursor-pointer ${
                        active
                          ? 'bg-[var(--accent)] text-[var(--accent-text)] font-bold border-transparent'
                          : 'text-[var(--text-muted)] hover:text-[var(--foreground)]/80 bg-transparent border border-transparent'
                      }`}
                    >
                      {t.label}
                      {n > 0 && <span className={active ? 'text-[var(--accent-text)]/60' : 'text-[var(--text-muted)]'}>{n}</span>}
                    </button>
                  );
                })}
              </div>

              {/* Refresh-failure notice — stale-but-honest: the list below is
                  the last one that loaded, and the viewer can retry or dismiss. */}
              {refreshError && !loading && (
                <div className="bg-[var(--background)] border-b border-[var(--border-color)] px-4 py-2 flex items-center gap-3">
                  <span className="font-mono text-[11px] uppercase tracking-[2px] text-[var(--text-muted)] min-w-0">
                    couldn&rsquo;t refresh — showing the last loaded list
                  </span>
                  <button
                    onClick={() => reload()}
                    className="font-mono text-[11px] uppercase tracking-[2px] text-[var(--accent-ink)] hover:opacity-70 bg-transparent border-none cursor-pointer shrink-0"
                  >
                    retry
                  </button>
                  <button
                    onClick={() => setRefreshError(false)}
                    className="ml-auto font-mono text-[14px] text-[var(--text-muted)] hover:text-[var(--foreground)] bg-transparent border-none cursor-pointer w-5 h-5 flex items-center justify-center shrink-0"
                    aria-label="Dismiss"
                  >
                    ×
                  </button>
                </div>
              )}

              {/* ─── ROW 4: Grouped list OR grid ─── */}
              <div className="bg-[var(--background)] min-h-[400px]">
                {/* Skeletons only when there's nothing to show — background
                    refetches (login flags, city filter) keep content up. */}
                {loading && events.length === 0 ? (
                  viewMode === 'grid' ? <EventsGridSkeleton /> : <EventsListSkeleton />
                ) : grouped.length === 0 ? (
                  <EmptyState tab={tab} search={search} selectedCity={selectedCity} authenticated={authenticated} onClear={() => { setSearch(''); setSelectedCity(''); setTab('all'); }} onCreate={() => router.push('/events/create')} onLogin={login} />
                ) : viewMode === 'grid' ? (
                  grouped.map((group, gi) => (
                    <div key={group.label}>
                      <div className="sticky top-[58px] md:top-[calc(var(--nav-height,56px)+58px)] z-20 bg-[var(--background)]/95 backdrop-blur-sm px-4 py-1.5 border-y border-[var(--border-color)]">
                        <span className="font-mono text-[10px] uppercase tracking-[3px] text-[var(--text-muted)]">{group.label} · {group.items.length}</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-4">
                        {group.items.map((ev, i) => (
                          <EventGridCard
                            key={ev.id}
                            event={ev}
                            authenticated={authenticated}
                            onOpen={() => router.push(`/events/${ev.slug}`)}
                            onToggleRsvp={() => openEventById(ev.id)}
                            onToggleSave={() => toggleSave(ev.slug, !ev.isSaved)}
                            staggerIndex={gi * 8 + i}
                          />
                        ))}
                      </div>
                    </div>
                  ))
                ) : (
                  grouped.map((group, gi) => (
                    <div key={group.label}>
                      <div className="sticky top-[58px] md:top-[calc(var(--nav-height,56px)+58px)] z-20 bg-[var(--background)]/95 backdrop-blur-sm px-4 py-1.5 border-y border-[var(--border-color)]">
                        <span className="font-mono text-[10px] uppercase tracking-[3px] text-[var(--text-muted)]">{group.label} · {group.items.length}</span>
                      </div>
                      <div className="divide-y divide-bone/[0.04]">
                        {group.items.map((ev, i) => (
                          <EventRow
                            key={ev.id}
                            event={ev}
                            authenticated={authenticated}
                            onOpen={() => router.push(`/events/${ev.slug}`)}
                            onToggleRsvp={() => openEventById(ev.id)}
                            onToggleSave={() => toggleSave(ev.slug, !ev.isSaved)}
                            staggerIndex={gi * 8 + i}
                          />
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* ─── ROW 5: Featured (below the list/grid) — adapts to view mode ─── */}
              {!loading && showFeatured && featured.length > 0 && (
                <div className="border-t border-[var(--border-color)]">
                  <FeaturedRow
                    events={featured}
                    authenticated={authenticated}
                    compact={viewMode === 'grid'}
                    onOpen={(slug) => router.push(`/events/${slug}`)}
                    onToggleRsvp={(eventId) => openEventById(eventId)}
                    onToggleSave={(slug, saved) => toggleSave(slug, saved)}
                  />
                </div>
              )}
            </div>
          </div>
        </section>

      </PageShell>
    </div>
  );
}

/* ── Event row ──────────────────────────────────────────────── */

interface RowProps {
  event: EventCard;
  authenticated: boolean;
  onOpen: () => void;
  onToggleRsvp: () => void;
  onToggleSave: () => void;
  staggerIndex?: number;
}

function EventRow({ event, authenticated, onOpen, onToggleRsvp, onToggleSave, staggerIndex = 0 }: RowProps) {
  const isPast = isEventOver(event);
  const chip = formatDayChip(event.dateIso);
  const accentLeft = event.isHosting ? 'border-l-lime' : isPast ? 'border-l-orange/50' : 'border-l-bone/15';

  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 hover:bg-[var(--surface-hover)] hover:translate-x-0.5 transition-all duration-200 cursor-pointer border-l-2 ${accentLeft}`}
      style={{ opacity: 0, animation: `fadeUp 0.4s ease-out ${Math.min(staggerIndex * 30, 400)}ms forwards` }}
      onClick={onOpen}
    >
      {/* Date chip */}
      <div className="shrink-0 w-12 text-center border border-[var(--border-color)] rounded-sm py-1.5">
        <div className="font-basement text-[18px] leading-none text-[var(--foreground)]">{chip.day}</div>
        <div className="font-mono text-[9px] uppercase tracking-[2px] text-[var(--text-muted)] mt-0.5">{chip.mon}</div>
      </div>

      {/* Thumbnail */}
      {event.imageUrl ? (
        <EventCover src={event.imageUrl} lazy className="w-10 h-10 rounded-sm object-cover shrink-0" />
      ) : null}

      {/* Title + meta */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[13px] uppercase font-bold text-[var(--foreground)] truncate">{event.eventName}</span>
          {event.isHosting && (
            <span className="font-mono text-[9px] uppercase tracking-[2px] bg-[var(--accent)]/20 text-[var(--accent)] px-1 py-0.5 rounded-sm shrink-0">Hosting</span>
          )}
          {event.isGoing && !event.isHosting && (
            <span className="inline-flex items-center gap-1 font-mono text-[9px] uppercase tracking-[2px] text-green border border-green/40 px-1 py-0.5 rounded-sm shrink-0"><CheckIcon size={8} /> Going</span>
          )}
          <EventSourceBadge source={event.externalSource} size="xs" />
        </div>
        <div className="font-mono text-[10px] text-[var(--text-muted)] truncate mt-0.5">
          {event.startTime ? `${event.startTime} ` : ''}
          {event.city ? `· ${event.city}` : ''}
          {attendanceLine(event) ? ` · ${attendanceLine(event)}` : ''}
        </div>
      </div>

      {/* Host avatar(s) */}
      {event.hosts.length > 0 && (
        <div className="flex items-center -space-x-1.5 shrink-0">
          {event.hosts.slice(0, 3).map((h, i) => (
            <span
              key={h.userId}
              className="relative block w-5 h-5 rounded-full border overflow-hidden bg-[var(--surface-hover)]"
              style={{ borderColor: '#1a1a1a', zIndex: 3 - i }}
              title={h.name || h.username || ''}
            >
              {h.avatarUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={h.avatarUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="w-full h-full flex items-center justify-center font-basement text-[9px] text-[var(--text-muted)]">
                  {(h.name || h.username || '?')[0]?.toUpperCase()}
                </span>
              )}
            </span>
          ))}
        </div>
      )}

      {/* Actions (don't bubble click) */}
      <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
        {!isPast && event.externalSource ? (
          // External event: link to the source platform instead of TOPIA RSVP
          event.link && (
            <a
              href={event.link}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center font-mono text-[10px] uppercase tracking-[2px] px-2.5 py-1.5 rounded-sm border border-[var(--border-color)] text-[var(--foreground)]/60 hover:border-[var(--accent)]/50 hover:text-[var(--accent)] transition no-underline"
              title={`Opens on ${event.externalSource}`}
            >
              {externalLinkLabel(event.externalSource)}
            </a>
          )
        ) : !isPast ? (
          <button
            onClick={onToggleRsvp}
            className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[2px] px-2.5 py-1.5 rounded-sm border transition cursor-pointer bg-transparent border-[var(--border-color)] text-[var(--foreground)]/60 hover:border-[var(--accent)]/50 hover:text-[var(--accent)]"
            title="View event"
          >
            View Event
          </button>
        ) : null}
        {authenticated && (
          <button
            onClick={onToggleSave}
            className={`inline-flex items-center justify-center w-7 h-7 rounded-sm border transition cursor-pointer ${
              event.isSaved
                ? 'bg-[var(--foreground)] text-[var(--background)] border-[var(--border-color)]'
                : 'bg-transparent border-[var(--border-color)] text-[var(--text-muted)] hover:border-[var(--border-color)] hover:text-[var(--foreground)]'
            }`}
            title={event.isSaved ? 'Saved' : 'Save'}
          >
            <StarIcon size={11} filled={event.isSaved} />
          </button>
        )}
      </div>
    </div>
  );
}

/* ── Skeleton + empty state ────────────────────────────────── */

function EventsListSkeleton() {
  return (
    <div className="divide-y divide-bone/[0.04]">
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3">
          <div className="w-12 h-11 rounded-sm bg-[var(--surface-hover)] animate-pulse shrink-0" />
          <div className="w-10 h-10 rounded-sm bg-[var(--surface-hover)] animate-pulse shrink-0" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 w-48 bg-[var(--surface-hover)] rounded animate-pulse" />
            <div className="h-2.5 w-32 bg-[var(--surface-hover)] rounded animate-pulse" />
          </div>
          <div className="h-7 w-20 bg-[var(--surface-hover)] rounded-sm animate-pulse shrink-0" />
        </div>
      ))}
    </div>
  );
}

function EventsGridSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-4">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="border border-[var(--border-color)] rounded-sm overflow-hidden bg-[var(--surface-hover)]">
          <div className="aspect-[16/10] bg-[var(--surface-hover)] animate-pulse" />
          <div className="p-3 space-y-1.5">
            <div className="h-3 w-40 bg-[var(--surface-hover)] rounded animate-pulse" />
            <div className="h-2.5 w-24 bg-[var(--surface-hover)] rounded animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Featured row ──────────────────────────────────────────────── */
/* Two shapes:
   - hero: 3 large 16:10 image cards, full-bleed treatment (list view)
   - compact: horizontal scroll of ~240px cards (grid view, to not steal the show) */

interface FeaturedRowProps {
  events: EventCard[];
  authenticated: boolean;
  compact?: boolean;
  onOpen: (slug: string) => void;
  onToggleRsvp: (eventId: string, going?: boolean) => void;
  onToggleSave: (slug: string, saved: boolean) => Promise<void>;
}

function FeaturedRow({ events, authenticated, compact, onOpen, onToggleRsvp, onToggleSave }: FeaturedRowProps) {
  if (compact) return <FeaturedRowCompact events={events} authenticated={authenticated} onOpen={onOpen} onToggleRsvp={onToggleRsvp} onToggleSave={onToggleSave} />;
  return (
    <div className="bg-[var(--background)] border-b border-[var(--border-color)] p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="font-mono text-[10px] uppercase tracking-[3px] text-[var(--accent-ink)]">◉ FEATURED</span>
        <span className="font-mono text-[10px] uppercase tracking-[2px] text-[var(--text-muted)]">next up</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {events.map((ev, i) => {
          const chip = formatDayChip(ev.dateIso);
          return (
            <div
              key={ev.id}
              role="button"
              tabIndex={0}
              onClick={() => onOpen(ev.slug)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(ev.slug); } }}
              className="group relative overflow-hidden rounded-md border border-[var(--border-color)] hover:border-[var(--accent)]/50 transition-all duration-300 text-left cursor-pointer p-0 bg-transparent focus:outline-none focus:ring-2 focus:ring-lime/40"
              style={{ opacity: 0, animation: `fadeUp 0.5s ease-out ${i * 80}ms forwards` }}
            >
              {/* Cover */}
              <div className="relative aspect-[16/10] overflow-hidden bg-[var(--surface-hover)]">
                {ev.imageUrl && (
                  <EventCover
                    src={ev.imageUrl}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                )}
                {/* Gradient overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-obsidian via-obsidian/40 to-transparent" />
                {/* Date chip floating top-left */}
                <div className="absolute top-3 left-3 bg-[var(--background)]/80 backdrop-blur-sm border border-[var(--border-color)] rounded-sm px-2 py-1 text-center min-w-[44px]">
                  <div className="font-basement text-[16px] leading-none text-[var(--foreground)]">{chip.day}</div>
                  <div className="font-mono text-[8px] uppercase tracking-[2px] text-[var(--foreground)]/60 mt-0.5">{chip.mon}</div>
                </div>
                {/* Hosting/going pill */}
                {ev.isHosting && (
                  <span className="absolute top-3 right-3 font-mono text-[9px] uppercase tracking-[2px] bg-[var(--accent)] text-[var(--accent-text)] px-1.5 py-0.5 rounded-sm font-bold">Hosting</span>
                )}
                {!ev.isHosting && ev.isGoing && (
                  <span className="absolute top-3 right-3 inline-flex items-center gap-1 font-mono text-[9px] uppercase tracking-[2px] bg-green/20 text-green border border-green/40 px-1.5 py-0.5 rounded-sm"><CheckIcon size={8} /> Going</span>
                )}
                {/* Save heart top-right when not hosting/going */}
                {authenticated && !ev.isHosting && !ev.isGoing && (
                  <button
                    onClick={(e) => { e.stopPropagation(); void onToggleSave(ev.slug, !ev.isSaved); }}
                    className={`absolute top-3 right-3 w-7 h-7 rounded-full border flex items-center justify-center transition cursor-pointer ${
                      ev.isSaved ? 'bg-[var(--foreground)] text-[var(--background)] border-[var(--border-color)]' : 'bg-[var(--background)]/70 backdrop-blur-sm border-[var(--border-color)] text-[var(--foreground)]/70 hover:text-[var(--foreground)] hover:border-[var(--border-color)]'
                    }`}
                    title={ev.isSaved ? 'Saved' : 'Save'}
                  >
                    <StarIcon size={11} filled={ev.isSaved} />
                  </button>
                )}
                {/* Title overlay bottom */}
                <div className="absolute bottom-0 left-0 right-0 p-3">
                  <h2 className="font-basement font-black text-[clamp(15px,1.5vw,20px)] uppercase leading-[0.95] text-[var(--foreground)] line-clamp-2">
                    {ev.eventName}
                  </h2>
                  <div className="font-mono text-[10px] text-[var(--foreground)]/60 mt-1 truncate">
                    {ev.startTime ? `${ev.startTime} ` : ''}
                    {ev.city ? `· ${ev.city}` : ''}
                  </div>
                </div>
              </div>
              {/* Action row beneath card */}
              <div className="px-3 py-2 flex items-center justify-between gap-2 bg-[var(--surface-hover)] border-t border-[var(--border-color)]">
                <div className="flex items-center -space-x-1.5">
                  {ev.hosts.slice(0, 3).map((h, hi) => (
                    <span
                      key={h.userId}
                      className="relative block w-5 h-5 rounded-full border overflow-hidden bg-[var(--surface-hover)]"
                      style={{ borderColor: '#1a1a1a', zIndex: 3 - hi }}
                      title={h.name || h.username || ''}
                    >
                      {h.avatarUrl ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img src={h.avatarUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <span className="w-full h-full flex items-center justify-center font-basement text-[9px] text-[var(--text-muted)]">
                          {(h.name || h.username || '?')[0]?.toUpperCase()}
                        </span>
                      )}
                    </span>
                  ))}
                  <span className="font-mono text-[10px] text-[var(--text-muted)] pl-3">{attendanceLine(ev) || (ev.externalSource ? '— external' : '— no rsvps yet')}</span>
                </div>
                {ev.externalSource && ev.link ? (
                  <a
                    href={ev.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="font-mono text-[10px] uppercase tracking-[2px] px-2.5 py-1 rounded-sm border bg-transparent border-[var(--border-color)] text-[var(--foreground)]/70 hover:border-[var(--accent)]/50 hover:text-[var(--accent)] transition no-underline"
                  >
                    {externalLinkLabel(ev.externalSource)}
                  </a>
                ) : !ev.isHosting && (
                  <button
                    onClick={(e) => { e.stopPropagation(); void onToggleRsvp(ev.id, !ev.isGoing); }}
                    className="font-mono text-[10px] uppercase tracking-[2px] px-2.5 py-1 rounded-sm border transition cursor-pointer bg-transparent border-[var(--border-color)] text-[var(--foreground)]/70 hover:bg-[var(--accent)] hover:text-[var(--accent-text)] hover:border-[var(--accent)]"
                  >
                    View Event
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Featured row · compact (horizontal scroll) ─────────────────── */

function FeaturedRowCompact({
  events, authenticated, onOpen, onToggleRsvp, onToggleSave,
}: Omit<FeaturedRowProps, 'compact'>) {
  // With only a card or two, the horizontal-scroll rail leaves a big empty band
  // and a "scroll →" hint that does nothing. Lay those out as comfortably-sized
  // cards instead, and only show the scroll affordance once the rail can scroll.
  const few = events.length <= 2;
  return (
    <div className="bg-[var(--background)] border-b border-[var(--border-color)] px-4 py-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[3px] text-[var(--accent-ink)]">◉ FEATURED</span>
          <span className="font-mono text-[10px] uppercase tracking-[2px] text-[var(--text-muted)]">next up</span>
        </div>
        {!few && (
          <span className="font-mono text-[10px] uppercase tracking-[2px] text-[var(--foreground)]/20 hidden sm:inline">scroll →</span>
        )}
      </div>
      <div
        className={few ? 'flex gap-2 pb-1' : 'flex gap-2 overflow-x-auto snap-x snap-mandatory -mx-4 px-4 pb-1'}
        style={few ? undefined : { scrollbarWidth: 'thin' }}
      >
        {events.map((ev, i) => {
          const chip = formatDayChip(ev.dateIso);
          return (
            <div
              key={ev.id}
              role="button"
              tabIndex={0}
              onClick={() => onOpen(ev.slug)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(ev.slug); } }}
              className={`group relative overflow-hidden rounded-md border border-[var(--border-color)] hover:border-[var(--accent)]/50 transition-all duration-300 text-left cursor-pointer p-0 bg-transparent shrink-0 focus:outline-none focus:ring-2 focus:ring-lime/40 ${few ? 'w-[clamp(240px,30vw,340px)]' : 'snap-start w-[200px]'}`}
              style={{ opacity: 0, animation: `fadeUp 0.4s ease-out ${i * 50}ms forwards` }}
            >
              <div className="relative aspect-[4/3] overflow-hidden bg-[var(--surface-hover)]">
                {ev.imageUrl && (
                  <EventCover src={ev.imageUrl} lazy className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-obsidian/80 via-obsidian/20 to-transparent pointer-events-none" />
                {/* Date chip */}
                <div className="absolute top-1.5 left-1.5 bg-[var(--background)]/85 backdrop-blur-sm border border-[var(--border-color)] rounded-sm px-1.5 py-0.5 text-center min-w-[36px]">
                  <div className="font-basement text-[12px] leading-none text-[var(--foreground)]">{chip.day}</div>
                  <div className="font-mono text-[8px] uppercase tracking-[2px] text-[var(--foreground)]/60">{chip.mon}</div>
                </div>
                {/* Save heart */}
                {authenticated && !ev.isHosting && !ev.isGoing && (
                  <button
                    onClick={(e) => { e.stopPropagation(); void onToggleSave(ev.slug, !ev.isSaved); }}
                    className={`absolute top-1.5 right-1.5 w-6 h-6 rounded-full border flex items-center justify-center transition cursor-pointer ${
                      ev.isSaved ? 'bg-[var(--foreground)] text-[var(--background)] border-[var(--border-color)]' : 'bg-[var(--background)]/70 backdrop-blur-sm border-[var(--border-color)] text-[var(--foreground)]/70 hover:text-[var(--foreground)] hover:border-[var(--border-color)]'
                    }`}
                    title={ev.isSaved ? 'Saved' : 'Save'}
                  >
                    <StarIcon size={9} filled={ev.isSaved} />
                  </button>
                )}
                {/* Hosting / Going status pill */}
                {ev.isHosting && (
                  <span className="absolute top-1.5 right-1.5 font-mono text-[8px] uppercase tracking-[2px] bg-[var(--accent)] text-[var(--accent-text)] px-1 py-0.5 rounded-sm font-bold">Host</span>
                )}
                {!ev.isHosting && ev.isGoing && (
                  <span className="absolute top-1.5 right-1.5 inline-flex items-center gap-0.5 font-mono text-[8px] uppercase tracking-[2px] text-green border border-green/40 px-1 py-0.5 rounded-sm bg-[var(--background)]/70 backdrop-blur-sm"><CheckIcon size={7} /> Going</span>
                )}
                {/* Title overlay */}
                <div className="absolute bottom-0 left-0 right-0 p-1.5">
                  <h2 className="font-basement font-black text-[12px] uppercase leading-[0.95] text-[var(--foreground)] line-clamp-2">{ev.eventName}</h2>
                </div>
              </div>
              {/* Small footer with quick action */}
              <div className="px-2 py-1.5 flex items-center justify-between gap-1 bg-[var(--surface-hover)] border-t border-[var(--border-color)]">
                <span className="font-mono text-[9px] uppercase tracking-[2px] text-[var(--text-muted)] truncate">
                  {ev.startTime ? `${ev.startTime}` : ''}{ev.city ? ` · ${ev.city}` : ''}
                </span>
                {ev.externalSource && ev.link ? (
                  <a
                    href={ev.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="font-mono text-[9px] uppercase tracking-[2px] px-2 py-1 min-h-[24px] inline-flex items-center rounded-sm border bg-transparent border-[var(--border-color)] text-[var(--foreground)]/60 hover:border-[var(--accent)]/50 hover:text-[var(--accent)] transition no-underline shrink-0"
                  >
                    {externalLinkShort(ev.externalSource)}
                  </a>
                ) : !ev.isHosting && (
                  <button
                    onClick={(e) => { e.stopPropagation(); void onToggleRsvp(ev.id, !ev.isGoing); }}
                    className="font-mono text-[9px] uppercase tracking-[2px] rounded-sm border transition cursor-pointer shrink-0 inline-flex items-center justify-center px-2 py-1 min-h-[24px] min-w-[24px] bg-transparent border-[var(--border-color)] text-[var(--foreground)]/60 hover:bg-[var(--accent)] hover:text-[var(--accent-text)] hover:border-[var(--accent)]"
                  >
                    View
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Grid card ───────────────────────────────────────────────────── */

function EventGridCard({ event, authenticated, onOpen, onToggleRsvp, onToggleSave, staggerIndex = 0 }: RowProps) {
  const isPast = isEventOver(event);
  const chip = formatDayChip(event.dateIso);
  const accent = event.isHosting ? 'border-[var(--accent)]/40' : isPast ? 'border-orange/30' : 'border-[var(--border-color)]';

  return (
    <div
      onClick={onOpen}
      className={`group relative overflow-hidden rounded-md border ${accent} hover:border-[var(--accent)]/40 hover:translate-y-[-2px] transition-all duration-300 cursor-pointer bg-[var(--surface-hover)] flex flex-col`}
      style={{ opacity: 0, animation: `fadeUp 0.4s ease-out ${Math.min(staggerIndex * 40, 400)}ms forwards` }}
    >
      {/* Cover or fallback */}
      <div className="relative aspect-[16/10] overflow-hidden bg-[var(--surface-hover)]">
        {event.imageUrl ? (
          <EventCover
            src={event.imageUrl}
            lazy
            className={`w-full h-full object-cover transition-transform duration-500 group-hover:scale-105 ${isPast ? 'grayscale opacity-60' : ''}`}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="font-basement font-black text-[clamp(40px,8vw,80px)] leading-none text-[var(--foreground)]/10 uppercase">
              {event.eventName[0]?.toUpperCase()}
            </span>
          </div>
        )}
        {/* Subtle gradient bottom for legibility */}
        <div className="absolute inset-0 bg-gradient-to-t from-obsidian/40 to-transparent pointer-events-none" />
        {/* Date chip */}
        <div className="absolute top-2 left-2 bg-[var(--background)]/85 backdrop-blur-sm border border-[var(--border-color)] rounded-sm px-1.5 py-0.5 text-center min-w-[40px]">
          <div className="font-basement text-[14px] leading-none text-[var(--foreground)]">{chip.day}</div>
          <div className="font-mono text-[8px] uppercase tracking-[2px] text-[var(--foreground)]/60">{chip.mon}</div>
        </div>
        {/* Status indicator */}
        {event.isHosting && (
          <span className="absolute top-2 right-2 font-mono text-[8px] uppercase tracking-[2px] bg-[var(--accent)] text-[var(--accent-text)] px-1.5 py-0.5 rounded-sm font-bold">Host</span>
        )}
        {!event.isHosting && event.isGoing && (
          <span className="absolute top-2 right-2 inline-flex items-center gap-1 font-mono text-[8px] uppercase tracking-[2px] text-green border border-green/40 px-1.5 py-0.5 rounded-sm bg-[var(--background)]/70 backdrop-blur-sm"><CheckIcon size={7} /> Going</span>
        )}
      </div>

      {/* Body */}
      <div className="p-3 flex flex-col gap-2 flex-1">
        <div className="flex items-start justify-between gap-2">
          <h2 className="font-mono text-[12px] uppercase font-bold text-[var(--foreground)] leading-tight line-clamp-2 flex-1">{event.eventName}</h2>
          <EventSourceBadge source={event.externalSource} size="xs" />
        </div>
        <div className="font-mono text-[10px] text-[var(--text-muted)] truncate">
          {event.startTime ? `${event.startTime} ` : ''}
          {event.city ? `· ${event.city}` : ''}
        </div>

        <div className="flex items-center justify-between mt-auto pt-2 border-t border-[var(--border-color)]">
          <div className="flex items-center gap-1.5">
            {event.hosts.length > 0 && (
              <div className="flex items-center -space-x-1.5">
                {event.hosts.slice(0, 3).map((h, i) => (
                  <span
                    key={h.userId}
                    className="relative block w-5 h-5 rounded-full border overflow-hidden bg-[var(--surface-hover)]"
                    style={{ borderColor: '#1a1a1a', zIndex: 3 - i }}
                  >
                    {h.avatarUrl ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={h.avatarUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="w-full h-full flex items-center justify-center font-basement text-[9px] text-[var(--text-muted)]">
                        {(h.name || h.username || '?')[0]?.toUpperCase()}
                      </span>
                    )}
                  </span>
                ))}
              </div>
            )}
            {attendanceLine(event) && (
              <span className="font-mono text-[9px] uppercase tracking-[2px] text-[var(--text-muted)]">{attendanceLine(event)}</span>
            )}
          </div>
          {/* The "View" affordance always renders — logged-out visitors get
              the same visible way into internal events as everyone else.
              Only the save star is auth-gated. */}
          {(!isPast || authenticated) && (
            <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
              {!isPast && event.externalSource && event.link ? (
                <a
                  href={event.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-[9px] uppercase tracking-[2px] px-2 py-1 min-h-[24px] inline-flex items-center rounded-sm border bg-transparent border-[var(--border-color)] text-[var(--foreground)]/60 hover:border-[var(--accent)]/50 hover:text-[var(--accent)] transition no-underline"
                  title={`Opens on ${event.externalSource}`}
                >
                  {externalLinkShort(event.externalSource)}
                </a>
              ) : !isPast && (
                <button
                  onClick={onToggleRsvp}
                  className="font-mono text-[9px] uppercase tracking-[2px] rounded-sm border transition cursor-pointer inline-flex items-center justify-center px-2 py-1 min-h-[24px] min-w-[24px] bg-transparent border-[var(--border-color)] text-[var(--foreground)]/60 hover:bg-[var(--accent)] hover:text-[var(--accent-text)] hover:border-[var(--accent)]"
                  title="View event"
                >
                  View
                </button>
              )}
              {authenticated && (
                <button
                  onClick={onToggleSave}
                  className={`inline-flex items-center justify-center w-6 h-6 rounded-sm border transition cursor-pointer ${
                    event.isSaved
                      ? 'bg-[var(--foreground)] text-[var(--background)] border-[var(--border-color)]'
                      : 'bg-transparent border-[var(--border-color)] text-[var(--text-muted)] hover:border-[var(--border-color)] hover:text-[var(--foreground)]'
                  }`}
                  title={event.isSaved ? 'Saved' : 'Save'}
                >
                  <StarIcon size={10} filled={event.isSaved} />
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyState({ tab, search, selectedCity, authenticated, onClear, onCreate, onLogin }: { tab: Tab; search: string; selectedCity: string; authenticated: boolean; onClear: () => void; onCreate: () => void; onLogin: () => void }) {
  // Logged-out viewers on the account-scoped tabs: "you haven't saved anything"
  // would be a lie (we don't know), and "+ Create event" is a hidden login
  // wall. Say what the tab holds and offer the actual door.
  if (!authenticated && (tab === 'saved' || tab === 'mine')) {
    const loggedOutLabel = tab === 'saved'
      ? 'Saved events live on your account.'
      : "Your hosted and RSVP'd events show up here.";
    return (
      <div className="text-center py-16 px-4">
        <p className="font-mono text-[13px] uppercase tracking-[2px] text-[var(--text-muted)] mb-4">{loggedOutLabel}</p>
        <button
          onClick={onLogin}
          className="font-mono text-[11px] uppercase tracking-[2px] bg-lime text-obsidian font-bold px-4 py-2 rounded-sm hover:opacity-90 transition cursor-pointer border-none"
        >
          Log in or sign up →
        </button>
      </div>
    );
  }
  const label =
    tab === 'saved'    ? "You haven't saved any events yet" :
    tab === 'mine'     ? "You're not hosting or going to anything yet" :
    tab === 'thisWeek' ? "Nothing this week" :
    tab === 'past'     ? "No past events" :
    search || selectedCity ? "No events match" :
    "No events yet";
  return (
    <div className="text-center py-16 px-4">
      <p className="font-mono text-[13px] uppercase tracking-[2px] text-[var(--text-muted)] mb-4">{label}</p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        {(search || selectedCity || tab !== 'all') && (
          <button
            onClick={onClear}
            className="font-mono text-[11px] uppercase tracking-[2px] text-[var(--accent)] border border-[var(--accent)]/30 hover:bg-[var(--accent)] hover:text-[var(--accent-text)] px-3 py-1.5 rounded-sm bg-transparent cursor-pointer transition"
          >
            clear filters
          </button>
        )}
        <button
          onClick={onCreate}
          className="font-mono text-[11px] uppercase tracking-[2px] text-[var(--foreground)]/60 border border-[var(--border-color)] hover:border-[var(--border-color)] px-3 py-1.5 rounded-sm bg-transparent cursor-pointer transition"
        >
          + Create event
        </button>
      </div>
    </div>
  );
}
