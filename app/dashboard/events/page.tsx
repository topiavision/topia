'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePrivy } from '@privy-io/react-auth';
import { useDashboard } from '../_components/DashboardContext';
import { useToast } from '../../components/Toast';
import { LoadFailed } from '../../components/AsyncStates';

export default function DashboardEventsPage() {
  const { hostedEvents, eventsStatus, refreshEvents } = useDashboard();
  const { user } = usePrivy();
  const toast = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);

  // Soft remove / restore — flips events.published. Recoverable.
  const setPublished = async (eventId: string, published: boolean) => {
    if (!user?.id) return;
    setBusyId(eventId);
    try {
      const res = await fetch('/api/events', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ privyId: user.id, eventId, published }),
      });
      if (res.ok) refreshEvents();
      else toast.error(`Couldn't ${published ? 'restore' : 'remove'} the event — try again.`);
    } catch {
      toast.error('Network error — the event was not changed.');
    } finally {
      setBusyId(null);
    }
  };

  const live = hostedEvents.filter((e) => e.published);
  const drafts = hostedEvents.filter((e) => !e.published);

  return (
    <div>
      {/* Header band */}
      <div className="border border-ink/[0.08] rounded-lg overflow-hidden mb-6">
        <div className="bg-lime px-5 py-4 flex items-center justify-between gap-3">
          <div>
            <span className="font-mono text-[10px] uppercase tracking-[2px] text-obsidian/50 block">topia://your-events</span>
            <h1 className="font-basement font-black text-[clamp(22px,3.5vw,32px)] uppercase leading-[0.9] text-obsidian mt-0.5">
              Events.
            </h1>
          </div>
          <Link
            href="/events/create"
            className="font-mono text-[11px] uppercase tracking-[2px] bg-obsidian text-lime px-3 py-1.5 rounded-sm hover:opacity-90 transition no-underline shrink-0 font-bold"
          >
            + Event
          </Link>
        </div>
        <div className="bg-[var(--page-bg)] px-5 py-2.5 flex items-center gap-5">
          <span className="font-mono text-[11px] text-ink/50">
            <span className="text-ink font-bold">{eventsStatus === 'loaded' ? live.length : '–'}</span> live
          </span>
          <span className="font-mono text-[11px] text-ink/50">
            <span className="text-ink font-bold">{eventsStatus === 'loaded' ? drafts.length : '–'}</span> draft{eventsStatus === 'loaded' && drafts.length === 1 ? '' : 's'}
          </span>
        </div>
      </div>

      {eventsStatus === 'loading' ? (
        /* Not loaded yet — never the confident "No events yet." */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="border border-ink/[0.08] rounded-lg overflow-hidden bg-[var(--page-bg)]">
              <div className="aspect-video bg-ink/[0.04] animate-pulse" />
              <div className="p-4 space-y-2">
                <div className="h-3 w-2/3 bg-ink/[0.06] rounded animate-pulse" />
                <div className="h-2.5 w-1/3 bg-ink/[0.06] rounded animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      ) : eventsStatus === 'error' ? (
        <div className="border border-ink/[0.08] rounded-lg bg-[var(--page-bg)]">
          <LoadFailed what="your events" onRetry={refreshEvents} />
        </div>
      ) : hostedEvents.length === 0 ? (
        <div className="border border-ink/[0.08] rounded-lg bg-[var(--page-bg)] p-10 text-center">
          <p className="font-basement font-black text-[22px] uppercase text-ink leading-tight">No events yet.</p>
          <p className="font-mono text-[12px] text-ink/50 mt-2">Host something — a show, a screening, a meetup.</p>
          <Link
            href="/events/create"
            className="inline-block mt-4 font-mono text-[11px] uppercase tracking-[2px] bg-lime text-obsidian px-4 py-2 rounded-sm hover:opacity-90 transition no-underline font-bold"
          >
            + Create an event
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {hostedEvents.map((ev) => (
            <div
              key={ev.id}
              className={`border border-ink/[0.08] rounded-lg overflow-hidden bg-[var(--page-bg)] ${!ev.published ? 'opacity-80' : ''}`}
            >
              {/* Cover */}
              <Link href={`/events/${ev.slug}`} className="block aspect-video overflow-hidden bg-ink/[0.04] no-underline">
                {ev.imageUrl && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={ev.imageUrl} alt={ev.eventName} className="w-full h-full object-cover" />
                )}
              </Link>

              {/* Info */}
              <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-mono text-[13px] font-bold uppercase text-ink truncate">{ev.eventName}</h3>
                  {!ev.published && (
                    <span className="font-mono text-[9px] uppercase tracking-[1px] shrink-0 px-1.5 py-0.5 rounded-sm bg-orange text-obsidian font-bold">
                      Draft
                    </span>
                  )}
                </div>
                {(ev.date || ev.city) && (
                  <p className="font-mono text-[11px] text-ink/40 mt-0.5">
                    {[ev.date, ev.city].filter(Boolean).join(' · ')}
                  </p>
                )}
                <div className="flex items-center gap-1.5 flex-wrap mt-3">
                  <Link
                    href={`/events/${ev.slug}`}
                    className="font-mono text-[10px] uppercase tracking-[1px] text-ink/60 border border-ink/15 hover:border-ink/40 hover:text-ink px-2.5 py-1 rounded-sm transition no-underline"
                  >
                    View
                  </Link>
                  <Link
                    href={`/events/${ev.slug}/edit`}
                    className="font-mono text-[10px] uppercase tracking-[1px] text-ink/60 border border-ink/15 hover:border-ink/40 hover:text-ink px-2.5 py-1 rounded-sm transition no-underline"
                  >
                    Edit
                  </Link>
                  <Link
                    href={`/events/${ev.slug}/manage`}
                    className="font-mono text-[10px] uppercase tracking-[1px] text-ink/60 border border-ink/15 hover:border-ink/40 hover:text-ink px-2.5 py-1 rounded-sm transition no-underline"
                    title="Guest list, check-in, hosts & registration settings"
                  >
                    Manage
                  </Link>
                  {ev.published ? (
                    <button
                      onClick={() => setPublished(ev.id, false)}
                      disabled={busyId === ev.id}
                      className="font-mono text-[10px] uppercase tracking-[1px] text-orange border border-ink/15 hover:border-orange/50 px-2.5 py-1 rounded-sm transition disabled:opacity-40 cursor-pointer bg-transparent"
                      title="Unpublish — move back to draft (hidden from the public site)"
                    >
                      {busyId === ev.id ? '…' : 'Unpublish'}
                    </button>
                  ) : (
                    <button
                      onClick={() => setPublished(ev.id, true)}
                      disabled={busyId === ev.id}
                      className="font-mono text-[10px] uppercase tracking-[1px] bg-lime text-obsidian font-bold px-2.5 py-1 rounded-sm hover:opacity-90 transition disabled:opacity-40 cursor-pointer border border-lime"
                      title="Publish — make it live on the public site"
                    >
                      {busyId === ev.id ? '…' : 'Publish'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
