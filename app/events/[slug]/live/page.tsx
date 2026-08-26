'use client';

import { useCallback, useEffect, useRef, useState, use } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { usePrivy } from '@privy-io/react-auth';
import QRCode from 'qrcode';
import QrScannerOverlay from '../../../components/QrScannerOverlay';
import AddToHomeScreenSheet from '../../../components/AddToHomeScreenSheet';
import { describeQuestRule } from '../../../../lib/events/questTypes';
import { isEventToday, isEventOver } from '../../../../lib/events/localDay';
import { getConnectPath } from '../../../../lib/connect/clientCode';

// The site-wide messages UI, mounted locally so the "DM someone you met"
// quest can open a thread without leaving Event Mode (this page has no
// Navigation, which normally hosts the modal).
const MessagesModal = dynamic(() => import('../../../components/MessagesModal'), { ssr: false });
// The event-page photo album, resurfaced on the recap so the night's photos
// live next to the quest tally and the people you met. Loaded on demand —
// it's only rendered once the event is over.
const EventGallery = dynamic(() => import('../../../components/EventGallery'), { ssr: false });

/* Event Mode — the in-the-room hub for a live event. Deliberately committed
 * to a single dark look (obsidian ground, lime accents) regardless of the
 * site theme: this screen is used at night, in a crowd, at max brightness.
 * P2 ships the shell: check-in state (which will gate quests in P4), who's
 * going, host door shortcut, and the add-to-home-screen hint. Quests,
 * connections, and prizes plug into the placeholder sections in P3/P4. */

interface LiveEvent {
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
  isHost: boolean;
  isManager: boolean;
  userRsvped: boolean;
  userStatus: string | null;
}
interface Guest { name: string | null; username: string | null; avatarUrl: string | null; }
interface MyDoorState { onList: boolean; rsvpStatus: string | null; checkedIn: boolean; checkedInAt: string | null; checkinPosition: number | null; }
interface Connection { id: string; name: string | null; username: string | null; avatarUrl: string | null; connectedAt: string; }
interface QuestItem { id: string; title: string; description: string | null; icon: string | null; verifyMethod: string; rule: { kind: string; count?: number } | null; completed: boolean; progress: { current: number; target: number } | null; }
interface QuestState { quests: QuestItem[]; total: number; completedCount: number; inRaffle: boolean; }
interface PrizeItem { id: string; title: string; description: string | null; kind: string; threshold: number | null; drawnAt: string | null; winnerName: string | null; winnerUsername: string | null; }
interface BoardEntry { userId: string; name: string | null; username: string | null; avatarUrl: string | null; completedCount: number; inRaffle: boolean; }

const INK = '#f5f0e8';
const LIME = '#e4fe52';
const ORANGE = '#FF5C34';
const LINE = 'rgba(245,240,232,0.16)';
const DIM = 'rgba(245,240,232,0.55)';

const card: React.CSSProperties = { border: `1px solid ${LINE}`, borderRadius: 14, padding: '14px 16px' };
const meta: React.CSSProperties = { color: DIM, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.14em' };

// Slim labeled divider — groups the card stack into scannable sections
// (Your pass / Tonight's game / The room) so the page reads as a map,
// not a pile.
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 mt-1.5 -mb-1" aria-hidden="true">
      <span style={meta}>{children}</span>
      <span className="flex-1 h-px" style={{ backgroundColor: LINE }} />
    </div>
  );
}

// The journey tracker — always visible, always answering "where am I and
// what's next?" in one glance: RSVP → Check in → Play.
function Stepper({ current }: { current: 1 | 2 | 3 }) {
  const steps = ['RSVP', 'Check in', 'Play'];
  return (
    <div className="flex items-center" aria-label={`Step ${current} of 3: ${steps[current - 1]}`}>
      {steps.map((label, i) => {
        const n = i + 1;
        const done = n < current;
        const active = n === current;
        return (
          <div key={label} className={`flex items-center ${i > 0 ? 'flex-1' : ''}`}>
            {i > 0 && (
              <span className="flex-1 h-px mx-2" style={{ backgroundColor: done || active ? LIME : LINE }} />
            )}
            <span className="flex items-center gap-1.5">
              <span className="relative flex w-[22px] h-[22px] shrink-0">
                {active && <span className="live-ping absolute inline-flex h-full w-full rounded-full" style={{ backgroundColor: 'rgba(228,254,82,0.5)' }} />}
                <span
                  className="relative w-[22px] h-[22px] rounded-full flex items-center justify-center font-mono text-[10px] font-bold"
                  style={done
                    ? { backgroundColor: LIME, color: '#1a1a1a' }
                    : active
                    ? { border: `1.5px solid ${LIME}`, color: LIME }
                    : { border: `1px solid ${LINE}`, color: DIM }}
                >
                  {done ? '✓' : n}
                </span>
              </span>
              <span className="font-mono text-[9px] font-bold uppercase tracking-[0.12em]" style={{ color: done || active ? LIME : DIM }}>
                {label}
              </span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

// Shared event-day helpers: device-local with the late-night grace, so the
// LIVE badge doesn't die at midnight while the party is still going — but
// does turn off once the event has genuinely ended (endTime + buffer).
const isLiveNow = (ev: LiveEvent | null) =>
  !!ev && isEventToday(ev.dateIso) && !isEventOver(ev);

export default function EventLivePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const { user, authenticated, ready, login } = usePrivy();
  const privyId = user?.id;

  const [event, setEvent] = useState<LiveEvent | null>(null);
  const [guests, setGuests] = useState<Guest[]>([]);
  const [guestCount, setGuestCount] = useState(0);
  const [me, setMe] = useState<MyDoorState | null>(null);
  const [loading, setLoading] = useState(true);
  const [installDismissed, setInstallDismissed] = useState(true);
  const [standalone, setStandalone] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [scanStatus, setScanStatus] = useState<{ kind: 'ok' | 'warn' | 'err'; text: string } | null>(null);
  const [people, setPeople] = useState<Connection[]>([]);
  const [questState, setQuestState] = useState<QuestState | null>(null);
  const [prizes, setPrizes] = useState<PrizeItem[]>([]);
  const [checkedInCount, setCheckedInCount] = useState(0);
  const [board, setBoard] = useState<BoardEntry[]>([]);
  const [questScanOpen, setQuestScanOpen] = useState(false);
  const [questScanStatus, setQuestScanStatus] = useState<{ kind: 'ok' | 'warn' | 'err'; text: string } | null>(null);
  const [questToast, setQuestToast] = useState<string | null>(null);
  const [introDismissed, setIntroDismissed] = useState(true);
  const [dmConversation, setDmConversation] = useState<string | null>(null);
  const [dmBusyId, setDmBusyId] = useState<string | null>(null);

  // Scroll targets so quest action buttons can point at the section where
  // that quest actually happens.
  const qrCardRef = useRef<HTMLDivElement | null>(null);
  const peopleRef = useRef<HTMLDivElement | null>(null);
  const goingRef = useRef<HTMLDivElement | null>(null);
  const scrollTo = (ref: React.RefObject<HTMLDivElement | null>) =>
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  // Once the event has genuinely ended, this page becomes the recap: the
  // night's final quest tally, the winners, and everyone you met stay
  // reachable — only the "do this now" machinery (RSVP, door pass, scans,
  // install prompts, live polling) stands down.
  const over = isEventOver(event);

  // The viewer's personal connect QR — a host scans it at the door to check
  // them in; other guests scan it to connect. Cached-first (the code is
  // permanent) so the pass renders instantly after the first visit ever.
  useEffect(() => {
    if (!authenticated || !privyId) return;
    getConnectPath(privyId)
      .then(async (path) => {
        if (!path) return;
        const dataUrl = await QRCode.toDataURL(`${window.location.origin}${path}`, {
          width: 480,
          margin: 1,
          color: { dark: '#1a1a1a', light: '#ffffff' },
        });
        setQrDataUrl(dataUrl);
      })
      .catch(() => {});
  }, [authenticated, privyId]);

  useEffect(() => {
    setInstallDismissed(localStorage.getItem('topia:install-hint') === 'dismissed');
    setIntroDismissed(localStorage.getItem('topia:quest-intro') === 'done');
    setStandalone(window.matchMedia('(display-mode: standalone)').matches);
  }, []);

  // Event Mode's own add-to-home-screen moment: this is the screen people
  // keep reopening all night, so the full explainer sheet auto-opens once
  // ever (separate key from the global nav's) for signed-in browser-tab
  // visitors, and the lime banner below re-opens it on demand.
  const [installSheetOpen, setInstallSheetOpen] = useState(false);
  useEffect(() => {
    if (!authenticated || standalone || over) return;
    try { if (localStorage.getItem('topia:a2hs-event-seen')) return; } catch { return; }
    const t = setTimeout(() => setInstallSheetOpen(true), 1800);
    return () => clearTimeout(t);
  }, [authenticated, standalone, over]);
  const closeInstallSheet = useCallback(() => {
    setInstallSheetOpen(false);
    try { localStorage.setItem('topia:a2hs-event-seen', '1'); } catch { /* private mode */ }
  }, []);

  useEffect(() => {
    if (!ready) return;
    const qs = privyId ? `&viewerPrivyId=${encodeURIComponent(privyId)}` : '';
    fetch(`/api/events?slug=${slug}${qs}`)
      .then((r) => r.json())
      .then((d) => {
        const ev = d.events?.[0];
        if (ev) {
          setEvent(ev);
          fetch(`/api/events/guests?eventId=${ev.id}`)
            .then((r) => r.json())
            .then((g) => { setGuests(g.guests ?? []); setGuestCount(g.count ?? 0); })
            .catch(() => {});
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [slug, privyId, ready]);

  // The viewer's door state — refreshed periodically so the moment a host
  // checks them in, the screen flips without a manual reload.
  const loadMe = useCallback(() => {
    if (!privyId || !event?.id) return;
    fetch(`/api/events/checkin/me?eventId=${event.id}&privyId=${encodeURIComponent(privyId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setMe(d); })
      .catch(() => {});
  }, [privyId, event?.id]);

  useEffect(() => {
    loadMe();
    if (over) return; // recap view — nothing at the door left to poll for
    const t = setInterval(loadMe, 15000);
    return () => clearInterval(t);
  }, [loadMe, over]);

  // People met at this event (via QR connects).
  const loadPeople = useCallback(() => {
    if (!privyId || !event?.id) return;
    fetch(`/api/connect?privyId=${encodeURIComponent(privyId)}&eventId=${event.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.connections) setPeople(d.connections); })
      .catch(() => {});
  }, [privyId, event?.id]);
  useEffect(() => { loadPeople(); }, [loadPeople]);

  // Quests: my state, prizes, and the progress board.
  const loadQuests = useCallback(() => {
    if (!event?.id) return;
    if (privyId) {
      fetch(`/api/events/quests?eventId=${event.id}&privyId=${encodeURIComponent(privyId)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => { if (d?.quests) setQuestState(d); })
        .catch(() => {});
      fetch(`/api/events/quests/progress?eventId=${event.id}&privyId=${encodeURIComponent(privyId)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => { if (d?.entries) setBoard(d.entries); })
        .catch(() => {});
    }
    fetch(`/api/events/prizes?eventId=${event.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.prizes) setPrizes(d.prizes);
        if (typeof d?.checkedInCount === 'number') setCheckedInCount(d.checkedInCount);
      })
      .catch(() => {});
  }, [event?.id, privyId]);
  // Poll alongside the door state: auto quests (connections, follows, DMs)
  // complete server-side, so the checklist ticks itself without a reload.
  useEffect(() => {
    loadQuests();
    if (over) return; // final tally is final — no need to keep polling
    const t = setInterval(loadQuests, 20000);
    return () => clearInterval(t);
  }, [loadQuests, over]);

  // Start (or reopen) a DM with someone met tonight — powers the "DM someone
  // you met" quest without leaving Event Mode.
  const messagePerson = useCallback(async (targetUserId: string) => {
    if (!privyId) return;
    setDmBusyId(targetUserId);
    try {
      const res = await fetch('/api/messages/conversations', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ privyId, targetUserId }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.conversationId) setDmConversation(d.conversationId);
    } catch {
      // best-effort; the row's button just re-enables
    } finally { setDmBusyId(null); }
  }, [privyId]);

  const completeQuestCode = useCallback(async (value: string): Promise<{ kind: 'ok' | 'warn' | 'err'; text: string }> => {
    if (!privyId || !event?.id) return { kind: 'err', text: 'Log in first.' };
    try {
      const res = await fetch('/api/events/quests/complete', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ privyId, eventId: event.id, code: value }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) return { kind: 'err', text: d.error || 'Scan failed — try again.' };
      loadQuests();
      const title = d.quest?.title ?? 'Quest';
      if (d.already) return { kind: 'warn', text: `Already completed: ${title}` };
      if (d.progress?.inRaffle) return { kind: 'ok', text: `✦ ${title} complete — that's ALL of them. You're in the raffle! 🎉` };
      return { kind: 'ok', text: `✦ ${title} complete (${d.progress?.completedCount}/${d.progress?.total})` };
    } catch {
      return { kind: 'err', text: 'Scan failed — try again.' };
    }
  }, [privyId, event?.id, loadQuests]);

  const handleQuestScan = useCallback(async (value: string) => {
    setQuestScanStatus(await completeQuestCode(value));
  }, [completeQuestCode]);

  // A printed quest QR encodes /events/<slug>/live?quest=<code> — when the
  // page opens with that param (plain camera app scan), redeem it directly.
  useEffect(() => {
    if (!privyId || !event?.id || !me?.checkedIn) return;
    const param = new URLSearchParams(window.location.search).get('quest');
    if (!param) return;
    history.replaceState(null, '', window.location.pathname);
    completeQuestCode(`?quest=${param}`).then((s) => setQuestToast(s.text));
  }, [privyId, event?.id, me?.checkedIn, completeQuestCode]);

  // A scanned Topia code → instant mutual connection with event context.
  const handleConnectScan = useCallback(async (value: string) => {
    if (!privyId || !event?.id) return;
    try {
      const res = await fetch('/api/connect', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ privyId, code: value, eventId: event.id }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setScanStatus({ kind: 'err', text: d.error || 'Scan failed — try again.' });
        return;
      }
      const who = d.target?.name || d.target?.username || 'them';
      setScanStatus(d.already
        ? { kind: 'warn', text: `Already connected with ${who}` }
        : { kind: 'ok', text: `✦ Connected with ${who}` });
      loadPeople();
      loadQuests(); // connection-counting quests tick immediately
    } catch {
      setScanStatus({ kind: 'err', text: 'Scan failed — try again.' });
    }
  }, [privyId, event?.id, loadPeople, loadQuests]);

  const live = isLiveNow(event);
  const nextQuest = questState?.quests.find((q) => !q.completed) ?? null;
  // Where the viewer stands on the RSVP → Check in → Play journey. Hosts
  // skip the RSVP beat — their next move is the door, same as the on-list.
  const doorStep: 1 | 2 | 3 =
    !authenticated ? 1
    : me?.checkedIn ? 3
    : (me?.onList || event?.isHost || event?.isManager) ? 2
    : 1;

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#1a1a1a', color: INK }}>
      {/* Top safe-area comes from the global body padding; only the bottom
          (home indicator) needs handling here. */}
      <div
        className="mx-auto max-w-md px-5 pt-5 flex flex-col gap-4"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 56px)' }}
      >

        <div className="flex items-center justify-between">
          <Link href={`/events/${slug}`} className="font-mono text-[11px] uppercase tracking-widest no-underline" style={{ color: DIM }}>
            ← Event page
          </Link>
          {live ? (
            <span className="flex items-center gap-1.5 font-mono text-[10px] font-bold tracking-widest px-2.5 py-1 rounded-full" style={{ backgroundColor: ORANGE, color: '#fff' }}>
              <span className="relative flex w-1.5 h-1.5">
                <span className="live-ping absolute inline-flex h-full w-full rounded-full" style={{ backgroundColor: '#fff' }} />
                <span className="relative inline-flex rounded-full w-1.5 h-1.5" style={{ backgroundColor: '#fff' }} />
              </span>
              LIVE
            </span>
          ) : over ? (
            <span className="font-mono text-[10px] font-bold tracking-widest px-2.5 py-1 rounded-full" style={{ border: `1px solid ${LINE}`, color: DIM }}>
              WRAPPED
            </span>
          ) : null}
        </div>

        {loading || !ready ? (
          <p className="font-mono text-[12px]" style={{ color: DIM }}>Loading event…</p>
        ) : !event ? (
          <p className="font-mono text-[12px]" style={{ color: DIM }}>Event not found.</p>
        ) : (
          <>
            <div className="live-enter" style={{ '--d': '0ms' } as React.CSSProperties}>
              <p style={meta}>Event mode</p>
              {/* .heading-display's -4px tracking is tuned for hero sizes —
                  at this scale it mashes glyphs together, so override it. */}
              <h1
                className="heading-display uppercase mt-1"
                style={{
                  color: INK,
                  fontSize: 'clamp(24px, 8vw, 34px)',
                  lineHeight: 1.04,
                  letterSpacing: '-0.02em',
                  textWrap: 'balance',
                }}
              >
                {event.eventName}
              </h1>
              <p className="font-mono text-[11px] uppercase tracking-widest mt-2" style={{ color: DIM }}>
                {[event.date, event.startTime, event.city].filter(Boolean).join(' · ')}
              </p>
            </div>

            {/* Journey tracker — the same three beats every guest moves
                through tonight, so "where am I?" is answered before the
                door card even loads. Retired once the night is wrapped. */}
            {!over && (
              <div className="live-enter" style={{ ...card, paddingTop: 12, paddingBottom: 12, '--d': '90ms' } as React.CSSProperties}>
                <Stepper current={doorStep} />
              </div>
            )}

            {/* Door state — the hero card. Always answers ONE question:
                "what do I do right now?" — log in, RSVP, get checked in,
                or go play. After the event it flips to the recap intro:
                the night is over, but what happened is preserved below. */}
            <div className="live-enter" style={{ '--d': '160ms' } as React.CSSProperties}>
            {over ? (
              authenticated ? (
                <div style={{ ...card, borderColor: LINE }}>
                  <p style={meta}>✦ That's a wrap</p>
                  <p className="text-[13px] mt-1.5" style={{ color: INK }}>
                    {event.eventName} has ended — but the night is saved right here: the photos, your quest run, the winners, and everyone you met.
                  </p>
                  {questState && questState.total > 0 && (
                    <p className="font-mono text-[11px] font-bold mt-1.5" style={{ color: LIME }}>
                      {questState.completedCount}/{questState.total} quests completed{questState.inRaffle ? ' — you made the raffle' : ''}
                    </p>
                  )}
                  {people.length > 0 && (
                    <button
                      onClick={() => scrollTo(peopleRef)}
                      className="w-full font-mono text-[12px] font-bold uppercase tracking-widest px-4 py-3 rounded-full cursor-pointer border-none mt-3"
                      style={{ backgroundColor: LIME, color: '#1a1a1a' }}
                    >
                      Follow up with the {people.length === 1 ? 'person' : `${people.length} people`} you met ↓
                    </button>
                  )}
                </div>
              ) : (
                <div style={card}>
                  <p style={meta}>This event has ended</p>
                  <p className="text-[13px] mt-1.5" style={{ color: INK }}>
                    Event Mode is where guests played the night&apos;s quests and met each other. If you were there, log in to see your recap.
                  </p>
                  <button
                    onClick={login}
                    className="w-full font-mono text-[12px] font-bold uppercase tracking-widest px-4 py-3 rounded-full cursor-pointer border-none mt-3"
                    style={{ backgroundColor: LIME, color: '#1a1a1a' }}
                  >
                    Log in →
                  </button>
                </div>
              )
            ) : !authenticated ? (
              <div style={{ ...card, borderColor: LIME }}>
                <p style={{ ...meta, color: LIME }}>Step 1 · Log in & RSVP</p>
                <p className="text-[13px] mt-1.5" style={{ color: INK }}>
                  Everything tonight — your entry pass, quests, meeting people — hangs off your Topia account. New? Signing up takes a minute.
                </p>
                <button
                  onClick={login}
                  className="w-full font-mono text-[12px] font-bold uppercase tracking-widest px-4 py-3 rounded-full cursor-pointer border-none mt-3 takeover-cta"
                  style={{ backgroundColor: LIME, color: '#1a1a1a' }}
                >
                  Log in or sign up →
                </button>
              </div>
            ) : !me ? (
              <div style={card}>
                <p style={meta}>Checking your pass…</p>
              </div>
            ) : me.checkedIn ? (
              <div style={{ ...card, borderColor: LIME, backgroundColor: 'rgba(228,254,82,0.08)' }}>
                <p style={{ ...meta, color: LIME }}>✓ You're in — go play</p>
                <p className="text-[13px] mt-1.5" style={{ color: INK }}>
                  Checked in since {me.checkedInAt ? new Date(me.checkedInAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'just now'}
                  {questState && questState.total > 0 ? ' — every quest is unlocked.' : " — you're all set."}
                </p>
                {nextQuest && (
                  <p className="font-mono text-[11px] font-bold mt-1.5" style={{ color: LIME }}>
                    Up next: {nextQuest.icon ? `${nextQuest.icon} ` : ''}{nextQuest.title} ↓
                  </p>
                )}
              </div>
            ) : me.onList ? (
              <div style={{ ...card, borderColor: ORANGE }}>
                <p style={{ ...meta, color: ORANGE }}>Step 2 · Check in at the door</p>
                <p className="text-[13px] mt-1.5" style={{ color: INK }}>
                  You're on the list. Show your Topia code to a host at the door — check-in unlocks the in-person quests{prizes.length > 0 ? ' and tonight’s prizes' : ''}.
                </p>
                <button
                  onClick={() => scrollTo(qrCardRef)}
                  className="w-full font-mono text-[12px] font-bold uppercase tracking-widest px-4 py-3 rounded-full cursor-pointer border-none mt-3"
                  style={{ backgroundColor: LIME, color: '#1a1a1a' }}
                >
                  Show my pass ↓
                </button>
              </div>
            ) : me.rsvpStatus === 'pending' ? (
              <div style={{ ...card, borderColor: ORANGE }}>
                <p style={{ ...meta, color: ORANGE }}>Request sent — waiting on the host</p>
                <p className="text-[13px] mt-1.5" style={{ color: INK }}>
                  The host reviews requests before confirming. The moment you're approved, this screen flips to your entry pass — check back or watch your email.
                </p>
              </div>
            ) : me.rsvpStatus === 'waitlisted' ? (
              <div style={{ ...card, borderColor: ORANGE }}>
                <p style={{ ...meta, color: ORANGE }}>You're on the waitlist</p>
                <p className="text-[13px] mt-1.5" style={{ color: INK }}>
                  The event is at capacity right now. Spots are promoted in join order — if one opens, you're in automatically and this screen becomes your entry pass.
                </p>
              </div>
            ) : (event.isHost || event.isManager) ? (
              <div style={{ ...card, borderColor: LIME }}>
                <p style={{ ...meta, color: LIME }}>You're hosting tonight</p>
                <p className="text-[13px] mt-1.5" style={{ color: INK }}>
                  Get checked in at the door like everyone else to play along, or jump straight into the host tools below.
                </p>
              </div>
            ) : (
              <div style={{ ...card, borderColor: ORANGE, backgroundColor: 'rgba(255,92,52,0.06)' }}>
                <p style={{ ...meta, color: ORANGE }}>Step 1 · RSVP — you're not on the list yet</p>
                <p className="text-[13px] mt-1.5" style={{ color: INK }}>
                  {guestCount > 0 ? `${guestCount} ${guestCount === 1 ? 'person is' : 'people are'} already going. ` : ''}
                  RSVP takes about a minute, then you land right back here with your entry pass.
                </p>
                <Link
                  href={`/events/${slug}?rsvp=1&from=live`}
                  className="block text-center font-mono text-[12px] font-bold uppercase tracking-widest px-4 py-3 rounded-full no-underline mt-3 takeover-cta"
                  style={{ backgroundColor: LIME, color: '#1a1a1a' }}
                >
                  RSVP now →
                </Link>
                <p className="font-mono text-[10px] uppercase tracking-widest mt-2.5 text-center" style={{ color: DIM }}>
                  Just browsing? Tonight's quests, prizes &amp; the room are below ↓
                </p>
              </div>
            )}
            </div>

            {/* Host tools — pinned high; a manager is usually working the
                door, not playing the game */}
            {event.isManager && (
              <div style={{ ...card, borderColor: LIME, paddingTop: 6, paddingBottom: 6 }}>
                <Link href={`/events/${slug}/manage#checkin`} className="no-underline flex items-center justify-between py-2.5">
                  <span className="font-mono text-[11px] uppercase tracking-widest font-bold" style={{ color: LIME }}>Working the door? Check-in</span>
                  <span style={{ color: LIME }}>→</span>
                </Link>
                <div style={{ height: 1, backgroundColor: LINE }} />
                <Link href={`/events/${slug}/manage#quests`} className="no-underline flex items-center justify-between py-2.5">
                  <span className="font-mono text-[11px] uppercase tracking-widest font-bold" style={{ color: LIME }}>Quests, prizes & raffle</span>
                  <span style={{ color: LIME }}>→</span>
                </Link>
              </div>
            )}

            {/* The album — the night's photos, resurfaced on the recap where
                the memories live. Guests who were on the list can keep adding
                shots (the gallery API decides who can contribute). Event Mode
                is hard-committed dark, so locally re-point the theme vars the
                site-themed gallery component reads. */}
            {over && (
              <div
                className="-mb-6"
                style={{
                  '--background': '#1a1a1a',
                  '--foreground': INK,
                  '--border-color': LINE,
                  '--text-muted': DIM,
                  '--surface-hover': 'rgba(245,240,232,0.08)',
                } as React.CSSProperties}
              >
                {/* Renders its own "Album · N" header, and nothing at all when
                    there are no photos and the viewer can't contribute. */}
                <EventGallery slug={slug} isHost={!!(event.isHost || event.isManager)} privyId={privyId ?? null} />
              </div>
            )}

            {/* Personal QR — the door scans it to check you in; other guests
                scan it to connect with you. No door and no room to work once
                the night is wrapped. */}
            {authenticated && qrDataUrl && !over && (
              <>
                <SectionLabel>Your pass</SectionLabel>
                <div ref={qrCardRef} style={card}>
                  <div className="flex items-center justify-between">
                    <p style={meta}>Your Topia code</p>
                    <button
                      onClick={() => { setScanStatus(null); setScanOpen(true); }}
                      className="font-mono text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full cursor-pointer border-none"
                      style={{ backgroundColor: LIME, color: '#1a1a1a' }}
                    >
                      ◎ Scan to connect
                    </button>
                  </div>
                  <div className="flex items-center gap-4 mt-2.5">
                    <img src={qrDataUrl} alt="Your Topia QR code" className="rounded-lg" style={{ width: 132, height: 132, backgroundColor: '#fff' }} />
                    <p className="text-[12px] flex-1" style={{ color: DIM }}>
                      {me?.checkedIn
                        ? 'Trade scans with people you meet — an instant mutual connection, recorded from tonight.'
                        : 'Show this at the door to get checked in — then trade scans with people you meet to connect.'}
                    </p>
                  </div>
                </div>
              </>
            )}

            {/* Quests — the checklist for tonight. Actionable: every open
                quest carries the button (or pointer) that gets it done. */}
            {((questState?.total ?? 0) > 0 || prizes.length > 0) && (
              <SectionLabel>Tonight's game</SectionLabel>
            )}
            {questToast && (
              <div style={{ ...card, borderColor: LIME, backgroundColor: 'rgba(228,254,82,0.08)' }}>
                <p className="text-[13px] font-bold" style={{ color: LIME }}>{questToast}</p>
              </div>
            )}
            {authenticated && questState && questState.total > 0 && (
              <div style={questState.inRaffle ? { ...card, borderColor: LIME } : card}>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <p style={meta}>Quests · {questState.completedCount}/{questState.total}</p>
                    {introDismissed && !questState.inRaffle && (
                      <button
                        onClick={() => setIntroDismissed(false)}
                        aria-label="How quests work"
                        title="How quests work"
                        className="w-5 h-5 rounded-full flex items-center justify-center font-mono text-[10px] font-bold cursor-pointer bg-transparent p-0"
                        style={{ border: `1px solid ${LINE}`, color: DIM }}
                      >
                        ?
                      </button>
                    )}
                  </span>
                  {me?.checkedIn && !over && questState.quests.some((q) => q.verifyMethod === 'qr' && !q.completed) && (
                    <button
                      onClick={() => { setQuestScanStatus(null); setQuestScanOpen(true); }}
                      className="font-mono text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full cursor-pointer border-none"
                      style={{ backgroundColor: LIME, color: '#1a1a1a' }}
                    >
                      ✦ Scan quest code
                    </button>
                  )}
                </div>
                <div className="h-1.5 rounded-full mt-2.5 mb-1 overflow-hidden" style={{ backgroundColor: 'rgba(245,240,232,0.12)' }}>
                  <div className="h-full rounded-full transition-all" style={{ width: `${(questState.completedCount / questState.total) * 100}%`, backgroundColor: LIME }} />
                </div>
                {questState.inRaffle ? (
                  <p className="font-mono text-[11px] font-bold mt-1.5" style={{ color: LIME }}>🎉 All quests complete — you{over ? ' were' : "'re"} in the raffle</p>
                ) : over ? (
                  <p className="font-mono text-[11px] mt-1.5" style={{ color: DIM }}>
                    Final tally — thanks for playing
                  </p>
                ) : (
                  <p className="font-mono text-[11px] mt-1.5" style={{ color: DIM }}>
                    Finish all {questState.total} to enter the raffle{me?.checkedIn ? '' : ' — check-in unlocks the in-person ones'}
                  </p>
                )}

                {/* One-time explainer for people on their first quest run */}
                {!introDismissed && !questState.inRaffle && !over && (
                  <div className="rounded-xl px-3 py-2.5 mt-3" style={{ border: `1px dashed rgba(228,254,82,0.4)`, backgroundColor: 'rgba(228,254,82,0.04)' }}>
                    <p style={{ ...meta, color: LIME }}>First time? Here's the game</p>
                    <div className="mt-1.5 flex flex-col gap-1">
                      <p className="text-[12px]" style={{ color: INK }}>1 · Some quests complete on their own as you use Topia — you may have progress already.</p>
                      <p className="text-[12px]" style={{ color: INK }}>2 · The in-person ones happen right here: scan, meet, message.</p>
                      <p className="text-[12px]" style={{ color: INK }}>3 · Finish the whole list and you're in the raffle for tonight's prizes.</p>
                    </div>
                    <button
                      onClick={() => { setIntroDismissed(true); localStorage.setItem('topia:quest-intro', 'done'); }}
                      className="font-mono text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full cursor-pointer border-none mt-2"
                      style={{ backgroundColor: LIME, color: '#1a1a1a' }}
                    >
                      Got it
                    </button>
                  </div>
                )}

                <div className="mt-3 flex flex-col gap-2">
                  {questState.quests.map((q, i) => {
                    // Only QR + host quests hard-require check-in (the server
                    // enforces it); auto quests tick on their own so a new
                    // user sees momentum before they even reach the door.
                    const locked = !q.completed && !me?.checkedIn && (q.verifyMethod === 'qr' || q.verifyMethod === 'host');
                    const pct = q.progress ? Math.min(100, (q.progress.current / q.progress.target) * 100) : 0;
                    const kind = q.rule?.kind;
                    const actionBtn = 'font-mono text-[10px] font-bold uppercase tracking-widest px-3 py-2 rounded-full cursor-pointer';
                    return (
                      <div key={q.id} className="rounded-xl px-3 py-3"
                        style={{ border: `1px solid ${q.completed ? LIME : LINE}`, backgroundColor: q.completed ? 'rgba(228,254,82,0.05)' : 'transparent', opacity: locked ? 0.6 : 1 }}>
                        <div className="flex items-start gap-2.5">
                          <span className="w-6 h-6 rounded-full flex items-center justify-center font-mono text-[11px] font-bold shrink-0 mt-0.5"
                            style={q.completed ? { backgroundColor: LIME, color: '#1a1a1a' } : { border: `1px solid ${LINE}`, color: DIM }}>
                            {q.completed ? '✓' : i + 1}
                          </span>
                          <span className="flex-1 min-w-0">
                            <span className="block text-[13px] font-bold" style={{ color: INK }}>{q.icon ? `${q.icon} ` : ''}{q.title}</span>
                            {q.description && <span className="block text-[11px] mt-0.5" style={{ color: DIM }}>{q.description}</span>}
                            {!q.completed && (
                              <span className="block font-mono text-[9px] uppercase tracking-widest mt-1" style={{ color: DIM }}>
                                {over ? 'Not completed' : locked ? '🔒 Unlocks at check-in' : describeQuestRule(q.verifyMethod, q.rule)}
                              </span>
                            )}
                          </span>
                        </div>
                        {!q.completed && q.progress && (
                          <div className="flex items-center gap-2 mt-2" style={{ marginLeft: 34 }}>
                            <div className="h-1.5 rounded-full flex-1 overflow-hidden" style={{ backgroundColor: 'rgba(245,240,232,0.12)' }}>
                              <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: LIME }} />
                            </div>
                            <span className="font-mono text-[10px] font-bold shrink-0" style={{ color: q.progress.current > 0 ? LIME : DIM }}>
                              {Math.min(q.progress.current, q.progress.target)}/{q.progress.target}
                            </span>
                          </div>
                        )}
                        {!q.completed && !locked && !over && (
                          <div className="mt-2 flex" style={{ marginLeft: 34 }}>
                            {q.verifyMethod === 'qr' ? (
                              <button onClick={() => { setQuestScanStatus(null); setQuestScanOpen(true); }} className={`${actionBtn} border-none`} style={{ backgroundColor: LIME, color: '#1a1a1a' }}>
                                ◉ Scan the code
                              </button>
                            ) : kind === 'connections' ? (
                              <button onClick={() => { setScanStatus(null); setScanOpen(true); }} className={`${actionBtn} border-none`} style={{ backgroundColor: LIME, color: '#1a1a1a' }}>
                                ◎ Scan someone's code
                              </button>
                            ) : kind === 'follows' ? (
                              <button onClick={() => scrollTo(goingRef)} className={actionBtn} style={{ backgroundColor: 'transparent', color: INK, border: `1px solid ${LINE}` }}>
                                Find people here ↓
                              </button>
                            ) : kind === 'dm' && people.length > 0 ? (
                              <button onClick={() => scrollTo(peopleRef)} className={actionBtn} style={{ backgroundColor: 'transparent', color: INK, border: `1px solid ${LINE}` }}>
                                Message someone you met ↓
                              </button>
                            ) : kind === 'dm' ? (
                              <button onClick={() => { setScanStatus(null); setScanOpen(true); }} className={actionBtn} style={{ backgroundColor: 'transparent', color: INK, border: `1px solid ${LINE}` }}>
                                Meet someone first — scan their code
                              </button>
                            ) : kind === 'checkin' && !me?.checkedIn ? (
                              <button onClick={() => scrollTo(qrCardRef)} className={actionBtn} style={{ backgroundColor: 'transparent', color: INK, border: `1px solid ${LINE}` }}>
                                Show my code ↑
                              </button>
                            ) : null}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Prizes — three tiers, each telling the viewer exactly where
                THEY stand: perks for everyone checked in, door prizes for the
                first N through, and the quest raffle. */}
            {prizes.length > 0 && (
              <div style={{ ...card, borderColor: 'rgba(228,254,82,0.35)' }}>
                <p style={{ ...meta, color: LIME }}>Prizes</p>
                <div className="mt-2 flex flex-col gap-2.5">
                  {prizes.map((p) => {
                    const pos = me?.checkinPosition ?? null;
                    let status: { text: string; on: boolean } | null = null;
                    if (p.kind === 'everyone') {
                      status = me?.checkedIn
                        ? { text: "✓ Yours — you're checked in", on: true }
                        : { text: 'Every checked-in guest gets this', on: false };
                    } else if (p.kind === 'first_n') {
                      const cap = Math.max(1, p.threshold ?? 1);
                      if (pos && pos <= cap) status = { text: `✓ You're #${pos} of the first ${cap} — you qualify`, on: true };
                      else if (pos) status = { text: `First ${cap} only — you were #${pos}`, on: false };
                      else {
                        const left = Math.max(0, cap - checkedInCount);
                        status = left > 0
                          ? { text: `First ${cap} through the door — ${left} spot${left === 1 ? '' : 's'} left`, on: false }
                          : { text: `First ${cap} through the door — all claimed`, on: false };
                      }
                    } else if (p.drawnAt) {
                      status = { text: `Winner: ${p.winnerName || p.winnerUsername || 'drawn'}${p.winnerUsername ? ` (@${p.winnerUsername})` : ''}`, on: true };
                    } else {
                      status = { text: '🎲 Raffle — finish every quest to be in the draw', on: false };
                    }
                    return (
                      <div key={p.id}>
                        <p className="text-[13px] font-bold" style={{ color: INK }}>
                          {p.kind === 'everyone' ? '🍸' : p.kind === 'first_n' ? '⚡' : '✶'} {p.title}
                        </p>
                        {p.description && <p className="text-[11px]" style={{ color: DIM }}>{p.description}</p>}
                        <p className="font-mono text-[11px] mt-0.5" style={{ color: status.on ? LIME : DIM }}>{status.text}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Progress board */}
            {authenticated && board.length > 0 && questState && questState.total > 0 && (
              <div style={card}>
                <p style={meta}>Progress board</p>
                <div className="mt-2 flex flex-col">
                  {board.slice(0, 8).map((b) => (
                    <div key={b.userId} className="flex items-center gap-3 py-2" style={{ borderBottom: `1px solid ${LINE}` }}>
                      {b.avatarUrl
                        ? <img src={b.avatarUrl} alt="" className="w-7 h-7 rounded-full object-cover" />
                        : <div className="w-7 h-7 rounded-full flex items-center justify-center font-mono text-[10px] font-bold" style={{ backgroundColor: '#333', color: INK }}>{(b.name || b.username || '?')[0].toUpperCase()}</div>}
                      <span className="flex-1 text-[13px] truncate" style={{ color: INK }}>{b.name || b.username || 'Guest'}</span>
                      <span className="font-mono text-[11px]" style={{ color: b.inRaffle ? LIME : DIM }}>
                        {b.completedCount}/{questState.total}{b.inRaffle ? ' · in raffle' : ''}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <SectionLabel>The room</SectionLabel>

            {/* People you met at this event */}
            {authenticated && (people.length > 0 || me?.checkedIn) && (
              <div ref={peopleRef} style={card}>
                <p style={meta}>People you met {people.length > 0 ? `· ${people.length}` : ''}</p>
                {people.length === 0 ? (
                  <p className="text-[12px] mt-1.5" style={{ color: DIM }}>
                    {over ? 'No connections were recorded at this event.' : "No one yet — trade a scan with someone you meet and they'll show up here."}
                  </p>
                ) : (
                  <div className="mt-2 flex flex-col gap-0.5">
                    {people.slice(0, 12).map((p) => (
                      <div key={p.id} className="flex items-center gap-3 py-2" style={{ borderBottom: `1px solid ${LINE}` }}>
                        {(() => {
                          const inner = (
                            <>
                              {p.avatarUrl
                                ? <img src={p.avatarUrl} alt="" className="w-8 h-8 rounded-full object-cover" />
                                : <div className="w-8 h-8 rounded-full flex items-center justify-center font-mono text-[11px] font-bold" style={{ backgroundColor: '#333', color: INK }}>{(p.name || p.username || '?')[0].toUpperCase()}</div>}
                              <span className="flex-1 min-w-0">
                                <span className="block text-[13px] font-bold truncate" style={{ color: INK }}>{p.name || p.username}</span>
                                {p.username && <span className="block font-mono text-[10px]" style={{ color: DIM }}>@{p.username}</span>}
                              </span>
                            </>
                          );
                          // No username → no profile page; render a plain row
                          // instead of a link to nowhere.
                          return p.username ? (
                            <Link href={`/profile/${p.username}`} className="flex items-center gap-3 flex-1 min-w-0 no-underline">{inner}</Link>
                          ) : (
                            <span className="flex items-center gap-3 flex-1 min-w-0">{inner}</span>
                          );
                        })()}
                        <button
                          onClick={() => messagePerson(p.id)}
                          disabled={dmBusyId === p.id}
                          className="font-mono text-[10px] font-bold uppercase tracking-widest px-3 py-2 rounded-full cursor-pointer shrink-0 disabled:opacity-50"
                          style={{ backgroundColor: 'transparent', color: LIME, border: '1px solid rgba(228,254,82,0.4)' }}
                        >
                          {dmBusyId === p.id ? '…' : '💬 DM'}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Who's here — expands into a browsable list when a "connect on
                Topia" quest is live, so "find people" has somewhere to land */}
            <div ref={goingRef} style={card}>
              <p style={meta}>{guestCount} going</p>
              {guests.length > 0 && (
                <div className="flex items-center mt-2.5">
                  {guests.slice(0, 8).map((g, i) => (
                    g.avatarUrl
                      ? <img key={i} src={g.avatarUrl} alt={g.username ?? ''} className="w-8 h-8 rounded-full object-cover border" style={{ marginLeft: i ? -8 : 0, borderColor: '#1a1a1a' }} />
                      : <div key={i} className="w-8 h-8 rounded-full flex items-center justify-center font-mono text-[11px] font-bold border" style={{ marginLeft: i ? -8 : 0, backgroundColor: '#333', color: INK, borderColor: '#1a1a1a' }}>{(g.name || g.username || '?')[0].toUpperCase()}</div>
                  ))}
                  {guestCount > 8 && <span className="font-mono text-[11px] ml-2" style={{ color: DIM }}>+{guestCount - 8}</span>}
                </div>
              )}
              {authenticated && !over && questState?.quests.some((q) => q.rule?.kind === 'follows') && guests.some((g) => g.username) && (
                <>
                  <div className="mt-3 flex flex-col gap-0.5">
                    {guests.filter((g) => g.username).slice(0, 12).map((g, i) => (
                      <Link key={i} href={`/profile/${g.username}`} className="flex items-center gap-3 py-2 no-underline" style={{ borderBottom: `1px solid ${LINE}` }}>
                        {g.avatarUrl
                          ? <img src={g.avatarUrl} alt="" className="w-8 h-8 rounded-full object-cover" />
                          : <div className="w-8 h-8 rounded-full flex items-center justify-center font-mono text-[11px] font-bold" style={{ backgroundColor: '#333', color: INK }}>{(g.name || g.username || '?')[0].toUpperCase()}</div>}
                        <span className="flex-1 min-w-0">
                          <span className="block text-[13px] font-bold truncate" style={{ color: INK }}>{g.name || g.username}</span>
                          <span className="block font-mono text-[10px]" style={{ color: DIM }}>@{g.username}</span>
                        </span>
                        <span className="font-mono text-[10px] uppercase tracking-widest" style={{ color: LIME }}>View →</span>
                      </Link>
                    ))}
                  </div>
                  <p className="font-mono text-[10px] mt-2" style={{ color: DIM }}>Tap someone to see their profile and connect — sent requests count toward your quest.</p>
                </>
              )}
            </div>

            {/* Add-to-home-screen — a standout lime banner that opens the
                full how-to sheet; hidden once installed or dismissed, and
                pointless after the night is wrapped */}
            {!standalone && !installDismissed && !over && (
              <div className="rounded-2xl px-4 py-3.5" style={{ backgroundColor: LIME }}>
                <div className="flex items-start justify-between gap-3">
                  <button
                    onClick={() => setInstallSheetOpen(true)}
                    className="text-left bg-transparent border-none cursor-pointer p-0 flex-1 min-w-0"
                  >
                    <p className="font-mono text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: '#1a1a1a' }}>
                      ＋ Put Event Mode on your Home Screen
                    </p>
                    <p className="text-[12px] mt-1" style={{ color: 'rgba(26,26,26,0.75)' }}>
                      One tap back to your pass and quests all night — takes ten seconds. <u>Show me how</u>
                    </p>
                  </button>
                  <button
                    onClick={() => { setInstallDismissed(true); localStorage.setItem('topia:install-hint', 'dismissed'); }}
                    className="bg-transparent border-none cursor-pointer text-[16px] leading-none p-0 shrink-0"
                    style={{ color: 'rgba(26,26,26,0.6)' }}
                    aria-label="Dismiss"
                  >
                    ×
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {scanOpen && (
        <QrScannerOverlay
          hint="Scan a Topia code to connect"
          status={scanStatus}
          onCode={handleConnectScan}
          onClose={() => setScanOpen(false)}
        />
      )}
      {questScanOpen && (
        <QrScannerOverlay
          hint="Scan a quest code"
          status={questScanStatus}
          onCode={handleQuestScan}
          onClose={() => setQuestScanOpen(false)}
        />
      )}
      {dmConversation && (
        <MessagesModal
          initialConversationId={dmConversation}
          onClose={() => { setDmConversation(null); loadQuests(); }}
        />
      )}
      <AddToHomeScreenSheet
        open={installSheetOpen}
        onClose={closeInstallSheet}
        variant="event"
        eventName={event?.eventName ?? null}
      />
    </div>
  );
}
