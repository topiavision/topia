'use client';

import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { usePrivy } from '@privy-io/react-auth';
import Navigation from '../../../components/Navigation';
import LoadingBar from '../../../components/LoadingBar';
import EventComposer, { type EventComposerInitial } from '../../_components/EventComposer';
import LoginWall from '../../../components/LoginWall';

// "9:00 PM" → "21:00" for <input type=time>
function parseTo24h(timeStr: string): string {
  const m = timeStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!m) return '';
  let h = parseInt(m[1]);
  const ampm = m[3]?.toUpperCase();
  if (ampm === 'PM' && h !== 12) h += 12;
  if (ampm === 'AM' && h === 12) h = 0;
  return `${h.toString().padStart(2, '0')}:${m[2]}`;
}

export default function EditEventPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const router = useRouter();
  const { user, authenticated, ready } = usePrivy();

  const [initial, setInitial] = useState<EventComposerInitial | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'notfound' | 'forbidden'>('loading');

  useEffect(() => {
    if (!ready) return;
    if (!authenticated || !user) return; // wait for Privy to hydrate the user
    let cancelled = false;
    fetch(`/api/events?slug=${slug}&viewerPrivyId=${user.id}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        const ev = d.events?.[0];
        if (!ev) { setState('notfound'); return; }
        if (!ev.isHost) { setState('forbidden'); router.replace(`/events/${slug}`); return; }
        setInitial({
          eventId: ev.id,
          slug: ev.slug,
          eventName: ev.eventName,
          dateIso: ev.dateIso || '',
          startTime: parseTo24h(ev.startTime || ''),
          endTime: parseTo24h(ev.endTime || ''),
          timezone: ev.timezone || '',
          city: ev.city || '',
          venue: ev.address || '',
          link: ev.link || '',
          description: ev.description || '',
          imageUrl: ev.imageUrl || '',
          worldId: (ev.hosts?.find((h: { role: string; worldId: string | null }) => h.role === 'creator')?.worldId) ?? '',
          published: !!ev.published,
          rsvpCapacity: ev.rsvpCapacity ?? null,
          rsvpApprovalRequired: !!ev.rsvpApprovalRequired,
        });
        setState('ready');
      })
      .catch(() => { if (!cancelled) setState('notfound'); });
    return () => { cancelled = true; };
  }, [slug, user, authenticated, ready, router]);

  if (!ready || (authenticated && state === 'loading')) {
    return <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--background)' }}><Navigation /><LoadingBar /></div>;
  }
  if (!authenticated) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center" style={{ backgroundColor: 'var(--background)' }}>
        <Navigation />
        <LoginWall message="Log in to edit this event." backHref={`/events/${slug}`} backLabel="Back to event" />
      </div>
    );
  }
  if (state === 'notfound') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center" style={{ backgroundColor: 'var(--background)' }}>
        <Navigation />
        <p className="font-mono text-[13px] mb-4" style={{ color: 'var(--foreground)' }}>Event not found.</p>
        <Link href="/events" className="font-mono text-[13px] underline" style={{ color: 'var(--foreground)' }}>← Back to Events</Link>
      </div>
    );
  }
  if (!initial) return <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--background)' }}><Navigation /><LoadingBar /></div>;

  return <EventComposer mode="edit" initial={initial} />;
}
