'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { usePrivy } from '@privy-io/react-auth';
import { useRouter } from 'next/navigation';
import Navigation from '../../components/Navigation';
import SentientText from '../../components/ui/SentientText';
import LoadingBar from '../../components/LoadingBar';
import RsvpConfirmationModal from './RsvpConfirmationModal';
// Heavy flows — load on demand, not in the event-page bundle.
const RsvpModal = dynamic(() => import('./RsvpModal'), { ssr: false });
import WhosGoing from './WhosGoing';
const TicketPurchase = dynamic(() => import('./TicketPurchase'), { ssr: false });
import CommentSection from '../../components/CommentSection';
import EventGallery from '../../components/EventGallery';
import { PAYMENTS_ENABLED } from '../../../lib/featureFlags';
import { isEventOver } from '../../../lib/events/localDay';
import { CheckIcon, ShareIcon } from '../../components/ui/Icons';
import { shortenPath } from '../../../lib/shortlink';
const ShareModal = dynamic(() => import('../../components/ShareModal'), { ssr: false });

interface EventHost {
  userId: string;
  role: string;
  worldId: string | null;
  name: string | null;
  username: string | null;
  avatarUrl: string | null;
  worldTitle: string | null;
  worldSlug: string | null;
  worldImageUrl: string | null;
  showOnEventPage?: boolean;
}

interface EventDetail {
  id: string;
  eventName: string;
  slug: string;
  description: string | null;
  date: string | null;
  dateIso: string | null;
  startTime: string | null;
  endTime: string | null;
  timezone: string | null;
  city: string | null;
  address: string | null;
  link: string | null;
  imageUrl: string | null;
  creatorName: string | null;
  creatorUsername: string | null;
  hosts: EventHost[];
  rsvpCount: number;
  userRsvped: boolean;
  userStatus?: string | null;       // 'going' | 'pending' | 'waitlisted' | 'declined' | null
  isHost: boolean;
  isSaved: boolean;
  published?: boolean;
  externalSource?: string | null;
  rsvpCapacity?: number | null;
  rsvpApprovalRequired?: boolean;
  rsvpClosed?: boolean;
}

const markdownComponents = {
  p: ({ children, ...props }: React.HTMLAttributes<HTMLParagraphElement>) => (
    <p className="font-mono text-[13px] leading-relaxed mb-3 last:mb-0" style={{ color: 'var(--foreground)' }} {...props}>{children}</p>
  ),
  h1: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h1 className="font-mono text-[18px] font-bold mb-3 mt-6 first:mt-0" style={{ color: 'var(--foreground)' }} {...props}>{children}</h1>
  ),
  h2: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h2 className="font-mono text-[16px] font-bold mb-2 mt-5 first:mt-0" style={{ color: 'var(--foreground)' }} {...props}>{children}</h2>
  ),
  h3: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h3 className="font-mono text-[14px] font-bold mb-2 mt-4 first:mt-0" style={{ color: 'var(--foreground)' }} {...props}>{children}</h3>
  ),
  ul: ({ children, ...props }: React.HTMLAttributes<HTMLUListElement>) => (
    <ul className="font-mono text-[13px] list-disc pl-5 mb-3 space-y-1" style={{ color: 'var(--foreground)' }} {...props}>{children}</ul>
  ),
  ol: ({ children, ...props }: React.HTMLAttributes<HTMLOListElement>) => (
    <ol className="font-mono text-[13px] list-decimal pl-5 mb-3 space-y-1" style={{ color: 'var(--foreground)' }} {...props}>{children}</ol>
  ),
  li: ({ children, ...props }: React.HTMLAttributes<HTMLLIElement>) => (
    <li className="font-mono text-[13px] leading-relaxed" style={{ color: 'var(--foreground)' }} {...props}>{children}</li>
  ),
  a: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="underline hover:opacity-60 transition" style={{ color: 'var(--foreground)' }} {...props}>{children}</a>
  ),
  blockquote: ({ children, ...props }: React.HTMLAttributes<HTMLQuoteElement>) => (
    <blockquote className="border-l-2 pl-4 my-3 opacity-80" style={{ borderColor: 'var(--border-color)' }} {...props}>{children}</blockquote>
  ),
  code: ({ children, ...props }: React.HTMLAttributes<HTMLElement>) => (
    <code className="font-mono text-[12px] px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--surface-hover)' }} {...props}>{children}</code>
  ),
  strong: ({ children, ...props }: React.HTMLAttributes<HTMLElement>) => (
    <strong className="font-bold" {...props}>{children}</strong>
  ),
  em: ({ children, ...props }: React.HTMLAttributes<HTMLElement>) => (
    <em {...props}>{children}</em>
  ),
  hr: (props: React.HTMLAttributes<HTMLHRElement>) => (
    <hr className="my-6" style={{ borderColor: 'var(--border-color)' }} {...props} />
  ),
};

/* ── Timezone display helper ──────────────────────────────────── */

function formatTimezone(tz: string | null): string {
  if (!tz) return '';
  const shortNames: Record<string, string> = {
    'America/New_York': 'ET',
    'America/Chicago': 'CT',
    'America/Denver': 'MT',
    'America/Los_Angeles': 'PT',
    'America/Anchorage': 'AKT',
    'Pacific/Honolulu': 'HT',
    'Europe/London': 'GMT',
    'Europe/Paris': 'CET',
    'Europe/Berlin': 'CET',
    'Asia/Tokyo': 'JST',
    'Asia/Shanghai': 'CST',
    'Australia/Sydney': 'AEST',
  };
  return shortNames[tz] || tz.split('/').pop()?.replace(/_/g, ' ') || tz;
}

/* ── Calendar helpers ──────────────────────────────────────────── */

function parseEventDate(dateStr: string | null, timeStr: string | null): Date | null {
  if (!dateStr) return null;

  const monthMap: Record<string, number> = {
    Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
    Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
  };

  const dmy = dateStr.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (dmy) {
    const day = parseInt(dmy[1]);
    const month = monthMap[dmy[2]];
    const year = parseInt(dmy[3]);
    if (month !== undefined) {
      const d = new Date(year, month, day);
      if (timeStr) applyTime(d, timeStr);
      return d;
    }
  }

  const d = new Date(dateStr);
  if (!isNaN(d.getTime())) {
    if (timeStr) applyTime(d, timeStr);
    return d;
  }

  return null;
}

function applyTime(date: Date, timeStr: string) {
  const match = timeStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (match) {
    let hours = parseInt(match[1]);
    const minutes = parseInt(match[2]);
    const ampm = match[3]?.toUpperCase();
    if (ampm === 'PM' && hours !== 12) hours += 12;
    if (ampm === 'AM' && hours === 12) hours = 0;
    date.setHours(hours, minutes, 0, 0);
  }
}

function formatDateICal(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}T${pad(date.getHours())}${pad(date.getMinutes())}00`;
}

function generateICalFile(event: EventDetail): string {
  const start = parseEventDate(event.date, event.startTime);
  const end = parseEventDate(event.date, event.endTime);

  const dtStart = start ? formatDateICal(start) : '';
  const dtEnd = end ? formatDateICal(end) : (start ? formatDateICal(new Date(start.getTime() + 2 * 60 * 60 * 1000)) : '');

  const location = event.address || event.city || '';
  const description = event.description?.replace(/\n/g, '\\n') || '';

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//TOPIA//Events//EN',
    'BEGIN:VEVENT',
    dtStart ? `DTSTART:${dtStart}` : '',
    dtEnd ? `DTEND:${dtEnd}` : '',
    `SUMMARY:${event.eventName}`,
    location ? `LOCATION:${location}` : '',
    description ? `DESCRIPTION:${description}` : '',
    event.link ? `URL:${event.link}` : '',
    `UID:${event.id}@topia.events`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean).join('\r\n');
}

function getGoogleCalendarUrl(event: EventDetail): string {
  const start = parseEventDate(event.date, event.startTime);
  const end = parseEventDate(event.date, event.endTime);

  const dtStart = start ? formatDateICal(start) : '';
  const dtEnd = end ? formatDateICal(end) : (start ? formatDateICal(new Date(start.getTime() + 2 * 60 * 60 * 1000)) : '');
  const location = event.address || event.city || '';

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.eventName,
    dates: `${dtStart}/${dtEnd}`,
    details: event.description || '',
    location,
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

// Render cover videos for data:video/* and remote .mp4/.mov/.webm; else <img>.
function isVideoUrl(url: string): boolean {
  return url.startsWith('data:video/') || /\.(mp4|mov|webm)(\?|#|$)/i.test(url);
}

/* ── Main Client Component ────────────────────────────────────── */

export default function EventDetailClient({ slug }: { slug: string }) {
  const { user: privyUser, authenticated, ready, login } = usePrivy();
  const router = useRouter();
  const [event, setEvent] = useState<EventDetail | null>(null);
  // Ticket-gating: when every active tier is paid, checkout is the only way in
  // (the free RSVP button hides; buying auto-RSVPs the buyer as 'going').
  const [ticketGated, setTicketGated] = useState(false);
  const [loading, setLoading] = useState(true);
  // Error vs not-found: a failed fetch must not render "Event not found."
  // (the event may exist fine — the network/server just hiccuped).
  const [loadError, setLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [rsvpLoading, setRsvpLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shortUrl, setShortUrl] = useState<string | null>(null);
  const [showRsvpModal, setShowRsvpModal] = useState(false);
  const [rsvpFormOpen, setRsvpFormOpen] = useState(false);
  const [pendingNotice, setPendingNotice] = useState(false);
  // Which viewer the loaded `event` reflects (null = anonymous). Used to avoid
  // acting on stale RSVP status during the login → refetch race.
  const [statusViewer, setStatusViewer] = useState<string | null>(null);
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);

  const privyEmail =
    privyUser?.email?.address ?? privyUser?.google?.email ?? null;
  const PENDING_KEY = 'topia_pending_rsvp';
  const INVITE_KEY = 'topia_invite_token';

  // Capture an ?invite=token link and persist it (survives the Privy login /
  // onboarding bounce) so it rides along with the RSVP and marks the invite
  // accepted. Cleared once the RSVP completes.
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  // One-shot notice handed off by the composer (e.g. some staged questions
  // failed to save). Read + clear once on mount.
  const [composerNotice, setComposerNotice] = useState<string | null>(null);
  useEffect(() => {
    try {
      const n = sessionStorage.getItem('eventComposerNotice');
      if (n) { setComposerNotice(n); sessionStorage.removeItem('eventComposerNotice'); }
    } catch {}
  }, []);
  // Deep link from Event Mode / the live takeover: ?rsvp=1 lands the visitor
  // straight in the registration flow (via login first if needed) instead of
  // making them find the RSVP button again. Consumed once, then stripped.
  const [rsvpIntent, setRsvpIntent] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const sp = new URLSearchParams(window.location.search);
    if (!sp.get('rsvp')) return;
    // Arrived from Event Mode (or the live takeover) — after the RSVP lands,
    // send them back there instead of the event-page celebration, closing the
    // "RSVP, then come right back" loop. Session-stored so it survives a
    // login redirect mid-flow.
    if (sp.get('from') === 'live') {
      try { sessionStorage.setItem('topia_rsvp_return', slug); } catch {}
    }
    sp.delete('rsvp');
    sp.delete('from');
    const qs = sp.toString();
    history.replaceState(null, '', window.location.pathname + (qs ? `?${qs}` : ''));
    setRsvpIntent(true);
  }, [slug]);
  useEffect(() => {
    // Signed-out + rsvp intent → open Privy login now; the pending-RSVP key
    // resumes the flow after they're in (same path as tapping the button).
    if (!rsvpIntent || !ready || authenticated || !event || event.rsvpClosed) return;
    setRsvpIntent(false);
    try { sessionStorage.setItem(PENDING_KEY, slug); } catch {}
    login();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rsvpIntent, ready, authenticated, event]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const fromUrl = new URLSearchParams(window.location.search).get('invite');
    if (fromUrl) {
      try { sessionStorage.setItem(INVITE_KEY, `${slug}:${fromUrl}`); } catch {}
      setInviteToken(fromUrl);
    } else {
      try {
        const stored = sessionStorage.getItem(INVITE_KEY);
        if (stored?.startsWith(`${slug}:`)) setInviteToken(stored.slice(slug.length + 1));
      } catch {}
    }
  }, [slug]);

  useEffect(() => {
    const viewerParam = privyUser?.id ? `&viewerPrivyId=${privyUser.id}` : '';
    fetch(`/api/events?slug=${slug}${viewerParam}`)
      .then(r => {
        if (!r.ok) throw new Error(`event fetch failed (${r.status})`);
        return r.json();
      })
      .then(data => {
        setLoadError(false);
        if (data.events?.length > 0) {
          setEvent(data.events[0]);
        }
        // Mark that the loaded status now reflects this viewer (or anonymous).
        setStatusViewer(privyUser?.id ?? null);
      })
      .catch((err) => {
        console.error('[event] load failed', err);
        setLoadError(true);
      })
      .finally(() => setLoading(false));
  }, [slug, privyUser?.id, loadAttempt]);

  const downloadICal = () => {
    if (!event) return;
    const ical = generateICalFile(event);
    const blob = new Blob([ical], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${event.slug}.ics`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // RSVP entry point. No login required (the owner's call): visitors go
  // straight to the registration form as guests — full name + email identify
  // them, and the success step offers the account claim. Logged-in users get
  // the full passport flow as before.
  const handleRsvp = async () => {
    if (!event) return;
    if (event.userRsvped) {
      // Withdrawing gives up your spot — never do it on a single tap. Ask first.
      setConfirmWithdraw(true);
      return;
    }
    // Open the registration modal (handles custom questions + confirm).
    setRsvpFormOpen(true);
  };

  // Actually withdraw the RSVP / request — only reached after the confirm dialog.
  const doWithdraw = async () => {
    if (!event || !privyUser?.id) return;
    setRsvpLoading(true);
    try {
      await fetch('/api/events/rsvp', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ privyId: privyUser.id, eventId: event.id }),
      });
      setEvent({
        ...event,
        userRsvped: false,
        userStatus: null,
        rsvpCount: event.userStatus === 'going' ? event.rsvpCount - 1 : event.rsvpCount,
      });
    } catch (err) {
      console.error('RSVP error:', err);
    } finally {
      setRsvpLoading(false);
      setConfirmWithdraw(false);
    }
  };

  // Submit succeeded — update event state but keep the form open on its success
  // step (step 3: get tickets · share · done).
  const handleRsvpRegistered = (status: string, alreadyRegistered = false) => {
    try { sessionStorage.removeItem(INVITE_KEY); } catch {}
    setInviteToken(null);
    if (!event) return;
    setEvent({
      ...event,
      userRsvped: true,
      userStatus: status,
      // Don't re-count an RSVP that already existed (idempotent re-submit).
      rsvpCount: !alreadyRegistered && status === 'going' ? event.rsvpCount + 1 : event.rsvpCount,
    });
  };

  // "Done" tapped on the success step — close the form and, for confirmed
  // "going", reveal the card celebration. Guests who came from Event Mode
  // go straight back there instead (it shows the right state for any status).
  const handleRsvpFinish = (status: string) => {
    setRsvpFormOpen(false);
    let returnToLive = false;
    try {
      returnToLive = sessionStorage.getItem('topia_rsvp_return') === slug;
      if (returnToLive) sessionStorage.removeItem('topia_rsvp_return');
    } catch {}
    if (returnToLive) { router.push(`/events/${slug}/live`); return; }
    if (status === 'going') setShowRsvpModal(true);
    else setPendingNotice(true);
  };

  // Resume a pending RSVP intent after the visitor logs in, or open the
  // registration modal automatically when arriving via an invite link.
  useEffect(() => {
    if (!event || !privyUser?.id || event.userRsvped || event.isHost || event.rsvpClosed) return;
    // Wait until `event` has been refetched for THIS viewer — otherwise we'd act
    // on the stale anonymous status and open the form for someone already in.
    if (statusViewer !== privyUser.id) return;
    let intent: string | null = null;
    try { intent = sessionStorage.getItem(PENDING_KEY); } catch {}
    if (intent === slug || inviteToken || rsvpIntent) {
      try { sessionStorage.removeItem(PENDING_KEY); } catch {}
      setRsvpIntent(false);
      setRsvpFormOpen(true);
    }
  }, [event, privyUser?.id, slug, inviteToken, statusViewer, rsvpIntent]);

  // "Save" — toggles the event slug in users.savedEventSlugs CSV so the user
  // can bookmark it (shows under the "Saved" tab on /events). Commenting is
  // gated on RSVP, not on saving.
  const handleSaveToggle = async () => {
    if (!event || !privyUser?.id) { login(); return; }
    const next = !event.isSaved;
    setEvent({ ...event, isSaved: next }); // optimistic
    setSaveLoading(true);
    try {
      const res = await fetch('/api/events/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ privyId: privyUser.id, slug: event.slug, action: next ? 'save' : 'unsave' }),
      });
      if (!res.ok) throw new Error('save failed');
    } catch (err) {
      console.error('save error:', err);
      setEvent({ ...event, isSaved: !next }); // revert
    } finally {
      setSaveLoading(false);
    }
  };

  // Pre-resolve the short link once the event loads so handleShare can fire the
  // native share sheet synchronously (iOS invalidates the gesture after a fetch).
  useEffect(() => {
    if (!event) return;
    let alive = true;
    shortenPath(window.location.pathname, 'event', privyUser?.id).then((u) => {
      if (alive) setShortUrl(u);
    });
    return () => { alive = false; };
  }, [event, privyUser?.id]);

  // Share — opens our custom share sheet (copy link + Email/X/WhatsApp/FB +
  // Instagram Story). The short link is prefetched into shortUrl above.
  const handleShare = () => setShareOpen(true);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--page-bg)' }}>
        <Navigation />
        <LoadingBar />
      </div>
    );
  }

  // Fetch failed and we have nothing to show — honest error with a retry,
  // never "Event not found." (which implies the event doesn't exist).
  if (loadError && !event) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center" style={{ backgroundColor: 'var(--page-bg)' }}>
        <Navigation />
        <p className="font-mono text-[13px] mb-1" style={{ color: 'var(--foreground)' }}>Couldn&rsquo;t load this event.</p>
        <button
          onClick={() => { setLoadError(false); setLoading(true); setLoadAttempt((n) => n + 1); }}
          className="mt-3 font-mono text-[11px] uppercase tracking-[2px] text-[var(--accent-ink)] border border-[var(--accent-ink)]/40 hover:opacity-70 px-3 py-1.5 rounded-sm bg-transparent cursor-pointer transition"
        >
          retry
        </button>
        <Link href="/events" className="mt-4 font-mono text-[13px] underline" style={{ color: 'var(--foreground)' }}>← Back to Events</Link>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center" style={{ backgroundColor: 'var(--page-bg)' }}>
        <Navigation />
        <p className="font-mono text-[13px] mb-4" style={{ color: 'var(--foreground)' }}>Event not found.</p>
        <Link href="/events" className="font-mono text-[13px] underline" style={{ color: 'var(--foreground)' }}>← Back to Events</Link>
      </div>
    );
  }

  const location = event.address || event.city || '';
  const hasCalendarData = !!event.date;
  const tzLabel = formatTimezone(event.timezone);
  // End-time aware, in the event's own timezone — a UTC date comparison here
  // once declared a live event "ended" at 8pm ET and hid Event Mode (quests).
  const isPast = isEventOver(event);

  // Luma-style mini calendar tile values, derived from the ISO date.
  const evDate = event.dateIso ? new Date(event.dateIso + 'T00:00:00') : null;
  const calMonth = evDate ? evDate.toLocaleString('en-US', { month: 'short' }).toUpperCase() : '';
  const calDay = evDate ? String(evDate.getDate()) : '';
  const dateHeadline = evDate ? evDate.toLocaleString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) : (event.date || '');
  const mapsHref = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([event.address, event.city].filter(Boolean).join(', '))}`;
  // Presenting world (Luma "Presented by") — first host that belongs to a world.
  const world = event.hosts.find((h) => h.worldSlug && h.worldTitle) || null;
  // Hosts hidden via the manage page's "Show on the Event Page" toggle drop out.
  const visibleHosts = event.hosts.filter((h) => h.showOnEventPage !== false);

  return (
    <div className="min-h-screen relative" style={{ backgroundColor: 'var(--page-bg)' }}>
      {/* Background treatment — mirrors the worlds/events pages (PageShell):
          halftone grid dots + film grain layered ABOVE the content (so the
          texture washes the whole page identically), plus the glitching
          "sentient" whispers. */}
      <div
        className="fixed inset-0 pointer-events-none z-[5] opacity-[0.06] mix-blend-multiply"
        style={{ backgroundImage: 'radial-gradient(circle, rgba(0,0,0,0.8) 1px, transparent 1px)', backgroundSize: '4px 4px' }}
      />
      <div
        className="fixed inset-0 pointer-events-none z-[4] opacity-[0.05]"
        style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='5' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`, backgroundSize: '200px' }}
      />
      <SentientText />

      <Navigation />

      <ShareModal
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        url={shortUrl ?? (typeof window !== 'undefined' ? window.location.href.split('?')[0] : '')}
        title={event.eventName}
        text={`${event.eventName}${event.city ? ` · ${event.city}` : ''} — on TOPIA`}
        storyImageUrl={`/events/${slug}/story`}
        storyFilename={`${slug}-story.png`}
      />

      <div className="relative z-10 pt-6 md:pt-24 pb-16">
        {/* Luma-style two-column layout — sticky cover on the left, all the
            event details + registration card on the right. */}
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <div className="lg:grid lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)] lg:gap-10 lg:items-start">

          {/* LEFT — sticky cover + presenting world + hosts (Luma-style) */}
          <div className="lg:sticky lg:top-24 mb-8 lg:mb-0">
            <div className="w-full rounded-2xl overflow-hidden border" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--surface-hover)' }}>
              {event.imageUrl ? (
                isVideoUrl(event.imageUrl) ? (
                  // Full poster at its natural aspect ratio — fills the box, no crop.
                  <video src={event.imageUrl} className="w-full h-auto block" autoPlay loop muted playsInline preload="metadata" />
                ) : (
                  /* Sized square (uploads are 1200x1200) so the layout below
                     doesn't shift while the poster loads; h-auto corrects any
                     non-square externals on decode. next/image (priority — this
                     is the LCP element) for https non-GIFs; raw img for
                     data:/GIF sources it can't proxy. */
                  event.imageUrl.startsWith('https://') && !/\.gif(\?|#|$)/i.test(event.imageUrl) ? (
                    <Image src={event.imageUrl} alt={event.eventName} width={1200} height={1200} priority sizes="(max-width: 1024px) 100vw, 50vw" className="w-full h-auto block" />
                  ) : (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={event.imageUrl} alt={event.eventName} width={1200} height={1200} fetchPriority="high" className="w-full h-auto block" />
                  )
                )
              ) : (
                <div className="w-full flex items-center justify-center" style={{ aspectRatio: '4 / 5' }}>
                  <span className="font-black uppercase leading-none" style={{ fontSize: 'clamp(48px,10vw,120px)', color: 'var(--foreground)', opacity: 0.12 }}>
                    {event.eventName[0]?.toUpperCase()}
                  </span>
                </div>
              )}
            </div>

            {/* Presented by — the host's world */}
            {world && (
              <div className="mt-6">
                <p className="font-mono text-[10px] uppercase tracking-[2px] mb-2.5" style={{ color: 'var(--text-muted)' }}>Presented by</p>
                <Link href={`/worlds/${world.worldSlug}`} className="flex items-center gap-2.5 group no-underline">
                  {world.worldImageUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={world.worldImageUrl} alt="" className="w-8 h-8 rounded-lg object-cover border" style={{ borderColor: 'var(--border-color)' }} />
                  ) : (
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center font-mono text-[12px] font-bold border" style={{ backgroundColor: 'var(--surface-hover)', color: 'var(--foreground)', borderColor: 'var(--border-color)' }}>
                      {world.worldTitle![0].toUpperCase()}
                    </div>
                  )}
                  <span className="font-mono text-[13px] font-bold group-hover:opacity-70 transition" style={{ color: 'var(--foreground)' }}>{world.worldTitle}</span>
                </Link>
              </div>
            )}

            {/* Hosted by — host list (hosts toggled off in manage are hidden) */}
            {visibleHosts.length > 0 && (
              <div className="mt-6 pt-6 border-t" style={{ borderColor: 'var(--border-color)' }}>
                <p className="font-mono text-[10px] uppercase tracking-[2px] mb-3" style={{ color: 'var(--text-muted)' }}>Hosted by</p>
                <div className="space-y-3">
                  {visibleHosts.map((host) => {
                    const inner = (
                      <>
                        {host.avatarUrl ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img src={host.avatarUrl} alt="" className="w-8 h-8 rounded-full object-cover" />
                        ) : (
                          <div className="w-8 h-8 rounded-full flex items-center justify-center font-mono text-[12px] font-bold" style={{ backgroundColor: 'var(--surface-hover)', color: 'var(--foreground)' }}>
                            {(host.name || host.username || '?')[0].toUpperCase()}
                          </div>
                        )}
                        <span className="font-mono text-[13px] group-hover:opacity-70 transition" style={{ color: 'var(--foreground)' }}>
                          {host.name || host.username || 'Host'}
                          {host.role === 'creator' && <span style={{ color: 'var(--text-muted)' }}> · Creator</span>}
                        </span>
                      </>
                    );
                    // Hosts without a username have no profile page — render a
                    // plain row, not a dead href="#" link.
                    return host.username ? (
                      <Link key={host.userId} href={`/profile/${host.username}`} className="flex items-center gap-2.5 group no-underline">
                        {inner}
                      </Link>
                    ) : (
                      <div key={host.userId} className="flex items-center gap-2.5">
                        {inner}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Who's going — Luma-style avatar stack + guest list (gated to RSVPs) */}
            <WhosGoing eventId={event.id} goingCount={event.rsvpCount} canView={event.isHost || event.userRsvped} />
          </div>

          {/* RIGHT — details */}
          <div className="min-w-0">

          {/* Title */}
          <h1 className="text-3xl sm:text-4xl font-bold uppercase tracking-tight mb-3" style={{ color: 'var(--foreground)' }}>
            {event.eventName}
          </h1>

          {/* Status pills — color pops that mirror the quick-view card.
              Hosting (lime) · Going (green) · Past (orange) · Draft (orange). */}
          {(event.isHost || event.userStatus === 'going' || event.userRsvped || isPast || (event.isHost && event.published === false)) && (
            <div className="flex flex-wrap items-center gap-2 mb-5">
              {event.isHost && event.published === false && (
                <span className="inline-block px-3 py-1 rounded-full font-mono text-[11px] uppercase tracking-widest font-bold" style={{ backgroundColor: '#FF5C34', color: '#0a0a0a' }}>
                  Draft
                </span>
              )}
              {event.isHost && (
                <span className="inline-block px-3 py-1 rounded-full font-mono text-[11px] uppercase tracking-widest font-bold" style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-text)' }}>
                  Hosting
                </span>
              )}
              {!event.isHost && (event.userStatus === 'going' || (event.userRsvped && event.userStatus !== 'pending' && event.userStatus !== 'waitlisted')) && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full font-mono text-[11px] uppercase tracking-widest font-bold" style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-text)' }}>
                  <CheckIcon size={9} strokeWidth={2} /> Going
                </span>
              )}
              {!event.isHost && event.userStatus === 'waitlisted' && (
                <span className="inline-block px-3 py-1 rounded-full font-mono text-[11px] uppercase tracking-widest font-bold" style={{ backgroundColor: '#FF5C34', color: '#0a0a0a' }}>
                  Waitlisted
                </span>
              )}
              {/* Event Mode — the in-the-room hub (check-in state, quests).
                  After the event it stays reachable as the recap: the final
                  quest tally, winners, and everyone you met. */}
              {(event.isHost || event.userStatus === 'going' || (event.userRsvped && event.userStatus !== 'pending' && event.userStatus !== 'waitlisted')) && (
                <Link href={`/events/${event.slug}/live`} className="inline-block px-3 py-1 rounded-full font-mono text-[11px] uppercase tracking-widest font-bold border no-underline hover:opacity-70 transition" style={{ color: 'var(--accent-ink)', borderColor: 'var(--accent-ink)' }}>
                  {isPast ? '○ Event Recap' : '● Event Mode'}
                </Link>
              )}
              {isPast && (
                <span className="inline-block px-3 py-1 rounded-full font-mono text-[11px] uppercase tracking-widest font-bold" style={{ backgroundColor: '#FF5C34', color: '#0a0a0a' }}>
                  Past Event
                </span>
              )}
            </div>
          )}

          {!isPast && !event.isHost && event.userStatus !== 'going' && !event.userRsvped && <div className="mb-2" />}

          {/* Meta tiles — Luma-style date + location with leading icon tiles */}
          <div className="space-y-3.5 mb-7">
            {/* Date & time — mini calendar tile (or clock tile when no date) */}
            {(event.date || event.startTime) && (
              <div className="flex items-center gap-3.5">
                {evDate ? (
                  <div className="shrink-0 w-12 rounded-lg overflow-hidden border text-center" style={{ borderColor: 'var(--border-color)' }}>
                    <div className="font-mono text-[9px] uppercase tracking-[1px] py-0.5 font-bold" style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-text)' }}>
                      {calMonth}
                    </div>
                    <div className="font-bold text-[18px] leading-none py-1.5" style={{ color: 'var(--foreground)' }}>
                      {calDay}
                    </div>
                  </div>
                ) : (
                  <div className="shrink-0 w-12 h-12 rounded-lg border flex items-center justify-center" style={{ borderColor: 'var(--border-color)' }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent-ink)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" />
                    </svg>
                  </div>
                )}
                <div className="min-w-0">
                  <p className="font-mono text-[14px] font-bold" style={{ color: 'var(--foreground)' }}>{dateHeadline || 'Date to be announced'}</p>
                  {event.startTime && (
                    <p className="font-mono text-[13px] opacity-60" style={{ color: 'var(--foreground)' }}>
                      {event.startTime}{event.endTime && ` – ${event.endTime}`}{tzLabel && ` ${tzLabel}`}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Location — icon tile that links out to Google Maps */}
            {location && (
              <a
                href={mapsHref}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3.5 group no-underline"
                title="Open in Google Maps"
              >
                <div className="shrink-0 w-12 h-12 rounded-lg border flex items-center justify-center" style={{ borderColor: 'var(--border-color)' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent-ink)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <p className="font-mono text-[14px] font-bold group-hover:opacity-70 transition truncate" style={{ color: 'var(--foreground)' }}>
                    {event.address || event.city}
                  </p>
                  <p className="font-mono text-[12px]" style={{ color: 'var(--accent-ink)' }}>
                    {event.address && event.city ? `${event.city} · ` : ''}View on Google Maps ↗
                  </p>
                </div>
              </a>
            )}
            {/* Ticket link is intentionally hidden here — it surfaces in the
                RSVP confirmation ("Get Tickets") after someone registers. */}
          </div>

          {/* Share + Add to Calendar — Share is always available; calendar
              links show only when the event has a date. */}
          <div className="rounded-2xl border mb-7 overflow-hidden" style={{ borderColor: 'var(--border-color)' }}>
            <div className="px-5 py-3 border-b" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--surface-hover)' }}>
              <span className="font-mono text-[11px] uppercase tracking-[2px] font-bold opacity-70" style={{ color: 'var(--foreground)' }}>
                {event.isHost ? 'You’re hosting' : isPast ? 'Registration closed' : 'Registration'}
              </span>
            </div>
            <div className="p-5">
              {event.isHost ? (
                <p className="font-mono text-[13px] opacity-60 mb-3" style={{ color: 'var(--foreground)' }}>You’re hosting this event. RSVP yourself, or manage registration &amp; guests below.</p>
              ) : isPast ? (
                <p className="font-mono text-[13px] opacity-60 mb-3" style={{ color: 'var(--foreground)' }}>This event has ended.</p>
              ) : (event.externalSource && event.link) ? (
                <p className="font-mono text-[13px] opacity-60 mb-3" style={{ color: 'var(--foreground)' }}>RSVPs for this event are handled on {event.externalSource}.</p>
              ) : (
                <p className="font-mono text-[13px] opacity-60 mb-3" style={{ color: 'var(--foreground)' }}>
                  {(event.userStatus === 'going' || (event.userRsvped && event.userStatus !== 'pending' && event.userStatus !== 'waitlisted')) ? 'You’re in! See you there.'
                    : event.userStatus === 'pending' ? 'Your request is awaiting the host’s approval.'
                    : event.userStatus === 'waitlisted' ? 'You’re on the waitlist — we’ll move you in automatically when a spot opens.'
                    : ticketGated ? 'Grab a ticket below to join — your ticket is your registration.'
                    : event.rsvpApprovalRequired ? 'Approval required — request to join below.'
                    : 'Welcome! To join the event, please register below.'}
                </p>
              )}

              {/* Paid tickets — hidden behind PAYMENTS_ENABLED. Hosts see the
                  tier list too (so they can verify + test-purchase their own
                  event); their free host-RSVP path below stays available. */}
              {PAYMENTS_ENABLED && !isPast && (
                <TicketPurchase
                  eventId={event.id}
                  slug={event.slug}
                  onTiersLoaded={({ count, allPaid }) => setTicketGated(count > 0 && allPaid)}
                  onPurchased={() =>
                    setEvent((prev) => (prev ? { ...prev, userRsvped: true, userStatus: 'going' } : prev))
                  }
                />
              )}

              {/* Host can RSVP themselves (mark attendance / withdraw) */}
              {event.isHost && !isPast && (() => {
                const hostGoing = event.userStatus === 'going' || (!event.userStatus && event.userRsvped);
                const hostPending = event.userStatus === 'pending';
                return (
                  <button
                    onClick={handleRsvp}
                    disabled={rsvpLoading}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 mb-2 font-mono text-[12px] uppercase tracking-widest transition rounded-lg cursor-pointer text-center font-bold hover:opacity-90"
                    style={hostGoing
                      ? { backgroundColor: 'var(--accent)', color: 'var(--accent-text)', border: 'none', opacity: rsvpLoading ? 0.5 : 1 }
                      : { backgroundColor: 'transparent', color: 'var(--foreground)', border: '1px solid var(--border-color)', opacity: rsvpLoading ? 0.5 : 1 }}
                  >
                    {rsvpLoading ? '...' : hostGoing ? (<><CheckIcon size={11} strokeWidth={2} /> You’re going</>) : hostPending ? 'Request sent' : 'RSVP as host'}
                  </button>
                );
              })()}

              {/* Host actions — edit, manage & share, in-card */}
              {event.isHost && (
                <div className="flex flex-wrap gap-2">
                  <Link href={`/events/${event.slug}/edit`} className="flex-1 min-w-[100px] inline-flex items-center justify-center px-4 py-3 font-mono text-[11px] uppercase tracking-widest border hover:opacity-70 transition rounded-lg text-center no-underline" style={{ color: 'var(--foreground)', borderColor: 'var(--foreground)' }}>Edit Event</Link>
                  <Link href={`/events/${event.slug}/manage`} className="flex-1 min-w-[100px] inline-flex items-center justify-center px-4 py-3 font-mono text-[11px] uppercase tracking-widest border hover:opacity-70 transition rounded-lg text-center no-underline" style={{ color: 'var(--foreground)', borderColor: 'var(--border-color)', opacity: 0.75 }}>Manage</Link>
                  <button onClick={handleShare} className="flex-1 min-w-[100px] inline-flex items-center justify-center gap-1.5 px-4 py-3 font-mono text-[11px] uppercase tracking-widest border hover:opacity-70 transition rounded-lg cursor-pointer" style={{ color: 'var(--foreground)', borderColor: 'var(--border-color)' }}><ShareIcon size={12} />Share</button>
                </div>
              )}

          {/* Native RSVP — only shown for non-external events. External
              events render the platform-specific CTA further down instead. */}
          {!isPast && !event.isHost && !(event.externalSource && event.link) && (() => {
            // Capacity math — only meaningful when a cap is set. A guest who's
            // already going/pending/waitlisted is never blocked by a full house.
            // A full event isn't a dead end anymore: the button becomes "Join
            // waitlist" (auto-promoted oldest-first when a spot opens).
            const isGoing = event.userStatus === 'going' || (!event.userStatus && event.userRsvped);
            const isPending = event.userStatus === 'pending';
            const isWaitlisted = event.userStatus === 'waitlisted';
            // Ticket-gated events: checkout is the only path in for guests who
            // aren't registered yet (buying auto-RSVPs them). Guests who are
            // already going/pending/waitlisted keep their status button.
            if (ticketGated && !isGoing && !isPending && !isWaitlisted) {
              return (
                <button
                  onClick={handleShare}
                  className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-3 font-mono text-[11px] uppercase tracking-widest border hover:opacity-70 transition rounded-lg cursor-pointer"
                  style={{ color: 'var(--foreground)', borderColor: 'var(--border-color)' }}
                >
                  <ShareIcon size={12} />
                  Share
                </button>
              );
            }
            const cap = event.rsvpCapacity ?? null;
            const spotsLeft = cap != null ? Math.max(0, cap - event.rsvpCount) : null;
            const isFull = spotsLeft === 0 && !isGoing && !isPending && !isWaitlisted;
            const blocked = event.rsvpClosed && !isGoing && !isPending && !isWaitlisted;
            // Site-wide lime accent for the RSVP / Going actions; muted only
            // when the action is secondary (pending / waitlist states / closed).
            const btnStyle: React.CSSProperties = (isPending || isWaitlisted || event.rsvpClosed || isFull) && !isGoing
              ? { backgroundColor: 'var(--surface-hover)', color: 'var(--foreground)' }
              : { backgroundColor: 'var(--accent)', color: 'var(--accent-text)' };
            return (
            <div>
              <div className="flex gap-2">
              <button
                onClick={handleRsvp}
                disabled={rsvpLoading || blocked}
                className="flex-[3] inline-flex items-center justify-center gap-2 px-4 py-3 font-mono text-[12px] uppercase tracking-widest transition rounded-lg cursor-pointer text-center font-bold border-none disabled:cursor-not-allowed hover:opacity-90"
                style={{ ...btnStyle, opacity: rsvpLoading ? 0.5 : 1 }}
              >
                {rsvpLoading ? '...'
                  : isGoing ? (<><CheckIcon size={11} strokeWidth={2} /> Going</>)
                  : isPending ? 'Request sent'
                  : isWaitlisted ? 'On the waitlist'
                  : event.rsvpClosed ? 'Registration closed'
                  : isFull ? 'Join waitlist'
                  : event.rsvpApprovalRequired ? 'Request to join'
                  : 'RSVP'}
              </button>
              <button
                onClick={handleShare}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-3 font-mono text-[11px] uppercase tracking-widest border hover:opacity-70 transition rounded-lg cursor-pointer"
                style={{ color: 'var(--foreground)', borderColor: 'var(--border-color)' }}
                title="Share"
              >
                <ShareIcon size={12} />
                Share
              </button>
              </div>
              {isPending && (
                <p className="font-mono text-[11px] mt-1.5 text-center" style={{ color: 'var(--text-muted)' }}>
                  Awaiting host approval — tap to withdraw.
                </p>
              )}
              {isWaitlisted && (
                <p className="font-mono text-[11px] mt-1.5 text-center" style={{ color: 'var(--text-muted)' }}>
                  You&apos;ll be moved in automatically when a spot opens — tap to leave the waitlist.
                </p>
              )}
              {/* Capacity hint — only when a cap is set and the guest hasn't
                  already locked a spot. */}
              {cap != null && !isGoing && !isPending && !isWaitlisted && !event.rsvpClosed && (
                <p className="font-mono text-[11px] mt-1.5 text-center" style={{ color: 'var(--text-muted)' }}>
                  {isFull ? 'At capacity — waitlist spots are promoted in join order.'
                    : spotsLeft === 1 ? '1 spot left.'
                    : `${spotsLeft} spots left.`}
                </p>
              )}
            </div>
            );
          })()}
          {/* Save \u2014 non-host, non-past; bookmarks under the "Saved" tab. */}
          {/* External-event RSVP CTA (replaces the local RSVP for imports
              from Partiful/Luma/Posh) \u2014 still pairs with the Save \u2605. */}
          {!isPast && !event.isHost && event.externalSource && event.link && (
            <div className="mt-3 flex gap-2">
              <a
                href={event.link}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-[3] inline-flex items-center justify-center font-mono text-[12px] uppercase tracking-widest px-4 py-3 rounded-lg cursor-pointer text-center font-bold no-underline transition hover:opacity-90"
                style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-text)' }}
              >
                {event.externalSource === 'partiful' ? 'RSVP on Partiful \u2192'
                : event.externalSource === 'luma'    ? 'RSVP on Luma \u2192'
                : event.externalSource === 'posh'    ? 'Tickets on Posh \u2192'
                : 'Open event \u2192'}
              </a>
              <button
                onClick={handleShare}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-3 font-mono text-[11px] uppercase tracking-widest rounded-lg cursor-pointer transition border hover:opacity-70"
                style={{ color: 'var(--foreground)', borderColor: 'var(--border-color)' }}
                title="Share"
              >
                <ShareIcon size={12} />
                Share
              </button>
            </div>
          )}

              {/* Add to calendar (+ Share for past events, which have no action row) */}
              <div className="flex flex-wrap gap-2 mt-3">
                {isPast && (
                  <button
                    onClick={handleShare}
                    className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2.5 font-mono text-[11px] uppercase tracking-widest border hover:opacity-70 transition rounded-lg cursor-pointer text-center"
                    style={{ color: 'var(--foreground)', borderColor: 'var(--border-color)' }}
                  >
                    <ShareIcon size={12} />
                    Share
                  </button>
                )}
                {hasCalendarData && (
                  <>
                    <button
                      onClick={downloadICal}
                      className="flex-1 px-3 py-2.5 font-mono text-[11px] uppercase tracking-widest border hover:opacity-70 transition rounded-lg cursor-pointer text-center"
                      style={{ color: 'var(--foreground)', borderColor: 'var(--border-color)' }}
                    >
                      + iCal
                    </button>
                    <a
                      href={getGoogleCalendarUrl(event)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 px-3 py-2.5 font-mono text-[11px] uppercase tracking-widest border hover:opacity-70 transition rounded-lg text-center"
                      style={{ color: 'var(--foreground)', borderColor: 'var(--border-color)' }}
                    >
                      + Google
                    </a>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* One-shot composer hand-off notice (e.g. some questions failed to save) */}
          {composerNotice && event.isHost && (
            <div className="mb-6 flex items-start gap-3 px-4 py-3 rounded-lg border font-mono text-[12px]" style={{ borderColor: '#FF5C3455', backgroundColor: '#FF5C3414', color: 'var(--foreground)' }}>
              <span className="flex-1">{composerNotice}</span>
              <button onClick={() => setComposerNotice(null)} className="bg-transparent border-none cursor-pointer opacity-60 hover:opacity-100" style={{ color: 'var(--foreground)' }} aria-label="Dismiss">×</button>
            </div>
          )}

          {/* Divider */}
          {event.description && (
            <div className="border-t mb-8" style={{ borderColor: 'var(--border-color)' }} />
          )}

          {/* Description */}
          {event.description && (
            <section className="mb-10">
              <p className="font-mono text-[13px] uppercase tracking-[0.15em] font-bold mb-3" style={{ color: 'var(--text-muted)' }}>
                About
              </p>
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                {event.description}
              </ReactMarkdown>
            </section>
          )}

          {/* Photo album — hosts upload; everyone views */}
          <EventGallery slug={event.slug} isHost={event.isHost} privyId={privyUser?.id ?? null} />

          {/* Comments — hosts + RSVP'd guests can post */}
          <CommentSection
            endpoint="/api/events/comments"
            slug={event.slug}
            kind="event"
            title="The chat"
            gateHint="RSVP above to join the chat. (Hosts can always comment.)"
          />

          </div>{/* right column */}
          </div>{/* two-column grid */}
        </div>{/* container */}
      </div>

      {/* Registration modal — custom questions + confirm */}
      {rsvpFormOpen && event && (
        <RsvpModal
          eventId={event.id}
          slug={event.slug}
          eventName={event.eventName}
          privyId={privyUser?.id ?? ''}
          guest={!privyUser?.id}
          email={privyEmail}
          inviteToken={inviteToken}
          approvalRequired={!!event.rsvpApprovalRequired}
          ticketLink={event.link}
          onClose={() => setRsvpFormOpen(false)}
          onRegistered={handleRsvpRegistered}
          onDone={handleRsvpFinish}
        />
      )}

      {/* Card celebration — shown after "Done" on the success step (going only) */}
      {showRsvpModal && event && (
        <RsvpConfirmationModal
          eventName={event.eventName}
          onClose={() => setShowRsvpModal(false)}
        />
      )}

      {/* Pending-approval confirmation */}
      {pendingNotice && event && (
        <div className="fixed inset-0 z-[2100] flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}>
          <div className="w-full max-w-sm rounded-2xl p-6 border text-center" style={{ backgroundColor: 'var(--background)', borderColor: 'var(--border-color)' }}>
            <p className="font-mono text-[15px] font-bold mb-2" style={{ color: 'var(--foreground)' }}>
              {event.userStatus === 'waitlisted' ? 'You’re on the waitlist ✓' : 'Request sent ✓'}
            </p>
            <p className="font-mono text-[13px] opacity-70 mb-6" style={{ color: 'var(--foreground)' }}>
              {event.userStatus === 'waitlisted'
                ? `${event.eventName} is at capacity right now. If a spot opens you'll be moved in automatically and notified.`
                : `The host reviews requests for ${event.eventName}. You'll be notified once you're approved.`}
            </p>
            <button onClick={() => setPendingNotice(false)} className="w-full px-4 py-3 font-mono text-[12px] uppercase tracking-widest rounded-lg cursor-pointer border-none font-bold" style={{ backgroundColor: 'var(--foreground)', color: 'var(--background)' }}>
              Got it
            </button>
          </div>
        </div>
      )}

      {/* Withdraw confirmation — guards against accidentally giving up a spot */}
      {confirmWithdraw && event && (
        <div className="fixed inset-0 z-[2100] flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.6)' }} onClick={() => !rsvpLoading && setConfirmWithdraw(false)}>
          <div className="w-full max-w-sm rounded-2xl p-6 border text-center" style={{ backgroundColor: 'var(--background)', borderColor: 'var(--border-color)' }} onClick={(e) => e.stopPropagation()}>
            <p className="font-mono text-[15px] font-bold mb-2" style={{ color: 'var(--foreground)' }}>
              {event.userStatus === 'pending' ? 'Withdraw your request?'
                : event.userStatus === 'waitlisted' ? 'Leave the waitlist?'
                : 'Remove your RSVP?'}
            </p>
            <p className="font-mono text-[13px] opacity-70 mb-6" style={{ color: 'var(--foreground)' }}>
              {event.userStatus === 'pending'
                ? `You'll lose your place in the approval queue for ${event.eventName}.`
                : event.userStatus === 'waitlisted'
                ? `You'll lose your place in line for ${event.eventName}. Rejoining puts you at the back of the waitlist.`
                : `You'll give up your spot for ${event.eventName}${event.rsvpCapacity != null ? ' and may not get it back if it fills up' : ''}. You can always RSVP again.`}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmWithdraw(false)}
                disabled={rsvpLoading}
                className="flex-1 px-4 py-3 font-mono text-[12px] uppercase tracking-widest rounded-lg cursor-pointer border font-bold disabled:opacity-50"
                style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-text)', borderColor: 'transparent' }}
              >
                Keep my RSVP
              </button>
              <button
                onClick={doWithdraw}
                disabled={rsvpLoading}
                className="flex-1 px-4 py-3 font-mono text-[12px] uppercase tracking-widest rounded-lg cursor-pointer border font-bold disabled:opacity-50"
                style={{ backgroundColor: 'transparent', color: '#FF5C34', borderColor: '#FF5C34' }}
              >
                {rsvpLoading ? '...' : event.userStatus === 'pending' ? 'Withdraw' : 'Remove RSVP'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
