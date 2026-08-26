'use client';

import { useCallback, useEffect, useState, use } from 'react';
import Link from 'next/link';
import { usePrivy } from '@privy-io/react-auth';
import Navigation from '../../../components/Navigation';
import LoadingBar from '../../../components/LoadingBar';
import LoginWall from '../../../components/LoginWall';
import { QUESTION_TYPES, SELECT_TYPES, answerToText, DEFAULT_LABELS, ROLE_TAGS } from '../../../../lib/events/questions';
import { useUserProfile } from '../../../hooks/useUserProfile';
import { PAYMENTS_ENABLED } from '../../../../lib/featureFlags';
import TicketManager from '../TicketManager';
import QrScannerOverlay from '../../../components/QrScannerOverlay';
import QRCode from 'qrcode';
import { QUEST_TYPES, QuestTypeDef, STARTER_PACK, questTypeById, describeQuestRule } from '../../../../lib/events/questTypes';

/* ── Types ─────────────────────────────────────────────────────────── */
interface EventLite {
  id: string;
  eventName: string;
  isHost: boolean;
  isCreator: boolean;
  rsvpCapacity: number | null;
  rsvpApprovalRequired: boolean;
  rsvpClosed: boolean;
}
interface Host { userId: string; role: string; name: string | null; username: string | null; email: string | null; avatarUrl: string | null; worldId: string | null; worldTitle: string | null; manager: boolean; showOnEventPage: boolean; }
interface SearchUser { id: string; name: string | null; username: string | null; avatarUrl: string | null; }
interface Question { id: string; label: string; type: string; options: string[] | null; required: boolean; sortOrder: number | null; isActive: boolean; }
interface Response { questionId: string; label: string; type: string; answer: string | string[] | boolean | null; }
// `ticket` is present only for guests who bought — the API overlays their paid
// order so a buyer with an empty profile still shows a real name and email.
interface RsvpTicket { tierName: string | null; tickets: number; spentCents: number; promoCode: string | null; purchasedAt: string; }
interface Rsvp { userId: string; name: string | null; username: string | null; avatarUrl: string | null; email: string | null; phone: string | null; firstName: string | null; lastName: string | null; ticket: RsvpTicket | null; status: string; responses: Response[] | null; createdAt: string; }
interface Invite { id: string; email: string | null; phone: string | null; status: string; sent: boolean; url: string | null; }

// Money is integer cents everywhere — format at the edge, never store floats.
function usdCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

const inputCls = 'w-full border px-3 py-2 font-mono text-[13px] rounded-lg outline-none';
const fieldStyle: React.CSSProperties = { backgroundColor: 'var(--background)', color: 'var(--foreground)', borderColor: 'var(--border-color)' };
const labelCls = 'block font-mono text-[12px] uppercase tracking-[0.12em] mb-1.5 font-bold opacity-60';
const btnPrimary = 'px-4 py-2 font-mono text-[12px] uppercase tracking-widest rounded-lg cursor-pointer border-none font-bold disabled:opacity-40';
const btnGhost = 'px-4 py-2 font-mono text-[12px] uppercase tracking-widest rounded-lg cursor-pointer border bg-transparent disabled:opacity-40';

type Tab = 'overview' | 'guests' | 'checkin' | 'quests' | 'registration' | 'tickets' | 'hosts';

export default function ManageEventPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const { user, authenticated, ready } = usePrivy();
  const privyId = user?.id;

  const [event, setEvent] = useState<EventLite | null>(null);
  const [hosts, setHosts] = useState<Host[]>([]);
  const [loading, setLoading] = useState(true);
  const [notHost, setNotHost] = useState(false);
  const [tab, setTab] = useState<Tab>('overview');

  // Deep-link a tab via #hash (e.g. /manage#guests) so other surfaces can
  // link straight to a section.
  useEffect(() => {
    const h = window.location.hash.replace('#', '') as Tab;
    if (['overview', 'guests', 'checkin', 'quests', 'registration', 'tickets', 'hosts'].includes(h)) {
      if (h === 'tickets' && !PAYMENTS_ENABLED) return;
      setTab(h);
    }
  }, []);

  const goTo = useCallback((t: Tab) => {
    setTab(t);
    history.replaceState(null, '', `#${t}`);
  }, []);

  // Re-pull the host roster after add/update/remove (no loading flicker).
  const reloadHosts = useCallback(() => {
    if (!privyId) return;
    fetch(`/api/events?slug=${slug}&viewerPrivyId=${privyId}`)
      .then((r) => r.json())
      .then((d) => { const ev = d.events?.[0]; if (ev) setHosts(ev.hosts ?? []); })
      .catch(() => {});
  }, [slug, privyId]);

  // Load event + authorize. Waits for Privy to finish hydrating (ready +
  // authenticated + a user id) so we never check isHost against an empty viewer
  // — that race used to bounce the host out. On a confirmed non-host we show an
  // inline message rather than redirecting.
  useEffect(() => {
    if (!ready) return;
    if (!authenticated || !privyId) { setLoading(false); return; }
    let cancelled = false;
    fetch(`/api/events?slug=${slug}&viewerPrivyId=${privyId}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        const ev = d.events?.[0];
        if (!ev) { setLoading(false); return; }
        // Only managers (creator or manager co-hosts) can open the manage page.
        if (!ev.isManager) { setNotHost(true); setLoading(false); return; }
        setNotHost(false);
        setEvent({
          id: ev.id, eventName: ev.eventName, isHost: ev.isHost, isCreator: !!ev.isCreator,
          rsvpCapacity: ev.rsvpCapacity ?? null,
          rsvpApprovalRequired: !!ev.rsvpApprovalRequired,
          rsvpClosed: !!ev.rsvpClosed,
        });
        setHosts(ev.hosts ?? []);
      })
      .catch(console.error)
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [slug, privyId, ready, authenticated]);

  if (!ready || loading) {
    return <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--background)' }}><Navigation /><LoadingBar /></div>;
  }
  if (!authenticated) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center" style={{ backgroundColor: 'var(--background)' }}>
        <Navigation />
        <LoginWall message="Log in as a host to manage this event." backHref={`/events/${slug}`} backLabel="Back to event" />
      </div>
    );
  }
  if (notHost || !event) {
    // Authenticated, but either a confirmed non-manager (notHost) or the slug
    // resolved to no event at all — a bad slug is NOT a login problem.
    return (
      <div className="min-h-screen flex flex-col items-center justify-center" style={{ backgroundColor: 'var(--background)' }}>
        <Navigation />
        <p className="font-mono text-[13px] mb-4 px-6 text-center" style={{ color: 'var(--foreground)' }}>
          {notHost
            ? 'Only event managers can manage this event — ask the host to make you a manager.'
            : 'Event not found.'}
        </p>
        <Link href={notHost ? `/events/${slug}` : '/events'} className="font-mono text-[13px] underline" style={{ color: 'var(--foreground)' }}>
          {notHost ? '← Back to event' : '← Back to Events'}
        </Link>
      </div>
    );
  }

  const TABS: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'guests', label: 'Guests' },
    { id: 'checkin', label: 'Check-in' },
    { id: 'quests', label: 'Quests' },
    { id: 'registration', label: 'Registration' },
    ...(PAYMENTS_ENABLED ? [{ id: 'tickets' as Tab, label: 'Tickets' }] : []),
    { id: 'hosts', label: 'Hosts' },
  ];

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--background)' }}>
      <Navigation />
      <div className="container mx-auto px-4 sm:px-6 pt-8 sm:pt-28 pb-[var(--mobile-nav-clearance)] md:pb-16 max-w-2xl">
        <div className="flex items-center justify-between mb-6">
          <Link href={`/events/${slug}`} className="font-mono text-[12px] uppercase tracking-widest hover:opacity-60 transition" style={{ color: 'var(--foreground)' }}>← Back to event</Link>
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold uppercase tracking-tight mb-1" style={{ color: 'var(--foreground)' }}>{event.eventName}</h1>
        <p className="font-mono text-[12px] uppercase tracking-widest opacity-40 mb-6" style={{ color: 'var(--foreground)' }}>Manage event</p>

        {/* Tabs — horizontally scrollable so all five fit at 375px */}
        <div className="flex gap-1 mb-6 border-b overflow-x-auto" style={{ borderColor: 'var(--border-color)', scrollbarWidth: 'none' }}>
          {TABS.map((t) => (
            <button key={t.id} onClick={() => goTo(t.id)}
              className="px-4 py-2.5 font-mono text-[12px] uppercase tracking-widest transition-all -mb-px border-b-2 whitespace-nowrap shrink-0"
              style={tab === t.id
                ? { color: 'var(--foreground)', borderColor: 'var(--foreground)' }
                : { color: 'var(--foreground)', borderColor: 'transparent', opacity: 0.45 }}>
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'overview' && <OverviewTab event={event} slug={slug} privyId={privyId!} goTo={goTo} />}
        {tab === 'guests' && <GuestsTab eventId={event.id} eventName={event.eventName} privyId={privyId!} capacity={event.rsvpCapacity} />}
        {tab === 'checkin' && <CheckinTab eventId={event.id} privyId={privyId!} />}
        {tab === 'quests' && <QuestsTab eventId={event.id} slug={slug} privyId={privyId!} />}
        {tab === 'registration' && <RegistrationTab event={event} slug={slug} privyId={privyId!} onSettings={(s) => setEvent({ ...event, ...s })} />}
        {tab === 'tickets' && PAYMENTS_ENABLED && <TicketManager eventId={event.id} slug={slug} privyId={privyId!} />}
        {tab === 'hosts' && <HostsTab eventId={event.id} privyId={privyId!} hosts={hosts} isCreator={event.isCreator} reload={reloadHosts} />}
      </div>
    </div>
  );
}

/* ── Overview tab (stats + quick actions) ──────────────────────────── */
function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="border rounded-lg px-3 py-2.5" style={{ borderColor: 'var(--border-color)' }}>
      <p className="font-mono text-[10px] uppercase tracking-[0.12em] opacity-50 mb-0.5" style={{ color: 'var(--foreground)' }}>{label}</p>
      <p className="font-mono text-[20px] font-bold leading-none" style={{ color: 'var(--foreground)' }}>{value}</p>
      {sub && <p className="font-mono text-[10px] opacity-40 mt-1" style={{ color: 'var(--foreground)' }}>{sub}</p>}
    </div>
  );
}

function OverviewTab({ event, slug, privyId, goTo }: { event: EventLite; slug: string; privyId: string; goTo: (t: Tab) => void }) {
  const [going, setGoing] = useState<number | null>(null);
  const [pending, setPending] = useState(0);
  const [waitlisted, setWaitlisted] = useState(0);
  const [invites, setInvites] = useState<{ accepted: number; total: number } | null>(null);
  const [tickets, setTickets] = useState<{ sold: number; revenueCents: number } | null>(null);

  useEffect(() => {
    fetch(`/api/events/rsvps?eventId=${event.id}&privyId=${privyId}`)
      .then((r) => r.json())
      .then((d) => { setGoing(d.goingCount ?? 0); setPending(d.pendingCount ?? 0); setWaitlisted(d.waitlistedCount ?? 0); })
      .catch(console.error);
    fetch(`/api/events/invites?eventId=${event.id}&privyId=${privyId}`)
      .then((r) => r.json())
      .then((d) => {
        const list: Invite[] = d.invites ?? [];
        setInvites({ accepted: list.filter((i) => i.status === 'accepted').length, total: list.length });
      })
      .catch(() => {});
    if (PAYMENTS_ENABLED) {
      fetch(`/api/events/ticket-types?slug=${slug}&includeInactive=1`)
        .then((r) => r.json())
        .then((d) => {
          const tiers: { quantitySold: number; priceCents: number }[] = d.ticketTypes ?? [];
          setTickets({
            sold: tiers.reduce((n, t) => n + t.quantitySold, 0),
            revenueCents: tiers.reduce((n, t) => n + t.quantitySold * t.priceCents, 0),
          });
        })
        .catch(() => {});
    }
  }, [event.id, slug, privyId]);

  const quickLinks: { label: string; onClick?: () => void; href?: string }[] = [
    { label: 'Door check-in', onClick: () => goTo('checkin') },
    { label: 'Quests & prizes', onClick: () => goTo('quests') },
    { label: 'Invite guests', onClick: () => goTo('guests') },
    { label: 'Registration settings', onClick: () => goTo('registration') },
    ...(PAYMENTS_ENABLED ? [{ label: 'Ticket tiers', onClick: () => goTo('tickets' as Tab) }] : []),
    { label: 'Edit event details', href: `/events/${slug}/edit` },
    { label: 'View event page', href: `/events/${slug}` },
  ];

  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-6">
        <StatCard label="Going" value={going == null ? '—' : String(going)} sub={event.rsvpCapacity != null ? `of ${event.rsvpCapacity} capacity` : 'no capacity limit'} />
        <StatCard label="Requests" value={going == null ? '—' : String(pending)} sub={event.rsvpApprovalRequired ? 'approval required' : 'auto-approved'} />
        <StatCard label="Waitlist" value={going == null ? '—' : String(waitlisted)} />
        {PAYMENTS_ENABLED && tickets
          ? <StatCard label="Tickets sold" value={String(tickets.sold)} sub={`$${(tickets.revenueCents / 100).toFixed(2)} gross`} />
          : <StatCard label="Invites" value={invites == null ? '—' : `${invites.accepted}/${invites.total}`} sub="accepted" />}
      </div>

      {pending > 0 && (
        <button onClick={() => goTo('guests')}
          className="w-full flex items-center justify-between px-4 py-3 rounded-lg border mb-6 cursor-pointer bg-transparent"
          style={{ borderColor: '#FF9F1C', color: 'var(--foreground)' }}>
          <span className="font-mono text-[12px] uppercase tracking-widest font-bold">{pending} request{pending > 1 ? 's' : ''} waiting for review</span>
          <span className="font-mono text-[13px]">→</span>
        </button>
      )}

      <p className="font-mono text-[12px] uppercase tracking-[0.12em] font-bold opacity-60 mb-2" style={{ color: 'var(--foreground)' }}>Quick actions</p>
      <div className="space-y-2">
        {quickLinks.map((l) => l.href ? (
          <Link key={l.label} href={l.href}
            className="w-full flex items-center justify-between px-4 py-3 rounded-lg border hover:opacity-70 transition"
            style={{ borderColor: 'var(--border-color)', color: 'var(--foreground)' }}>
            <span className="font-mono text-[12px] uppercase tracking-widest">{l.label}</span>
            <span className="font-mono text-[13px] opacity-40">→</span>
          </Link>
        ) : (
          <button key={l.label} onClick={l.onClick}
            className="w-full flex items-center justify-between px-4 py-3 rounded-lg border hover:opacity-70 transition cursor-pointer bg-transparent"
            style={{ borderColor: 'var(--border-color)', color: 'var(--foreground)' }}>
            <span className="font-mono text-[12px] uppercase tracking-widest">{l.label}</span>
            <span className="font-mono text-[13px] opacity-40">→</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ── Quests tab (builder + completions + prizes + raffle) ──────────── */
interface Quest { id: string; title: string; description: string | null; icon: string | null; verifyMethod: string; code: string | null; rule: { kind: string; count?: number } | null; isActive: boolean; completions: number; }
interface Prize { id: string; title: string; description: string | null; kind: string; threshold: number | null; drawnAt: string | null; winnerName: string | null; winnerUsername: string | null; }

// Plain-language prize tiers — "separate the raffle thing from the other
// prizes": perks for everyone, door prizes for the first N, raffle for
// quest-finishers.
const PRIZE_KIND_OPTIONS = [
  { value: 'raffle', label: '🎲 Raffle — drawn from guests who finish every quest' },
  { value: 'everyone', label: '🍸 Everyone — every checked-in guest gets it' },
  { value: 'first_n', label: '⚡ First N — the first N guests through the door' },
];

function methodTag(q: Quest): { text: string; color: string } {
  if (q.verifyMethod === 'qr') return { text: 'QR', color: '#4F46FF' };
  if (q.verifyMethod === 'host') return { text: 'HOST', color: '#FF9F1C' };
  return { text: 'AUTO', color: '#FF5BD7' };
}

function QuestsTab({ eventId, slug, privyId }: { eventId: string; slug: string; privyId: string }) {
  const [quests, setQuests] = useState<Quest[]>([]);
  const [prizes, setPrizes] = useState<Prize[]>([]);
  const [raffleCount, setRaffleCount] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');

  // Add-quest flow: "+ Add quest" opens a type picker (plain-language cards);
  // choosing one opens a prefilled draft the host can tweak before saving.
  const [picking, setPicking] = useState(false);
  const [draft, setDraft] = useState<{ type: QuestTypeDef; title: string; desc: string; icon: string; count: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [packBusy, setPackBusy] = useState(false);

  // Host-verified grant modal (mark a quest done for a checked-in guest)
  const [grantQuest, setGrantQuest] = useState<Quest | null>(null);

  // Inline edit of a saved quest (title/desc/icon + count for counted rules)
  const [editing, setEditing] = useState<{ id: string; title: string; desc: string; icon: string; count: number; counted: boolean } | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  // QR sheet modal
  const [qrQuest, setQrQuest] = useState<Quest | null>(null);
  const [qrImg, setQrImg] = useState<string | null>(null);

  // Prizes form
  const [prizeTitle, setPrizeTitle] = useState('');
  const [prizeKind, setPrizeKind] = useState('raffle');
  const [prizeCount, setPrizeCount] = useState('30');
  const [drawing, setDrawing] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch(`/api/events/quests?eventId=${eventId}&privyId=${encodeURIComponent(privyId)}&manage=1`)
      .then((r) => r.json())
      .then((d) => { if (d.quests) setQuests(d.quests); })
      .catch(console.error)
      .finally(() => setLoaded(true));
    fetch(`/api/events/prizes?eventId=${eventId}`)
      .then((r) => r.json())
      .then((d) => { if (d.prizes) setPrizes(d.prizes); })
      .catch(() => {});
    fetch(`/api/events/quests/progress?eventId=${eventId}&privyId=${encodeURIComponent(privyId)}`)
      .then((r) => r.json())
      .then((d) => { if (d.entries) setRaffleCount(d.entries.filter((e: { inRaffle: boolean }) => e.inRaffle).length); })
      .catch(() => {});
  }, [eventId, privyId]);
  useEffect(() => { load(); }, [load]);

  const postQuest = useCallback(async (t: QuestTypeDef, title: string, desc: string, icon: string, n: number) => {
    const rule = t.verifyMethod === 'auto'
      ? (t.counted ? { kind: t.ruleKind, count: Math.max(1, n) } : { kind: t.ruleKind })
      : undefined;
    const res = await fetch('/api/events/quests', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ privyId, eventId, title: title.trim(), description: desc.trim() || undefined, icon: icon.trim() || undefined, verifyMethod: t.verifyMethod, rule }),
    });
    const d = await res.json().catch(() => ({}));
    return res.ok ? null : (d.error as string || 'Could not add quest.');
  }, [privyId, eventId]);

  const startDraft = (t: QuestTypeDef) => {
    const n = t.defaultCount ?? 1;
    setDraft({ type: t, title: t.titleFor(n), desc: t.descFor(n), icon: t.icon, count: n });
  };

  // Bumping the count keeps an untouched title in sync ("Connect with 5
  // people…" → "…6 people…") but never overwrites a host's own words.
  const setDraftCount = (n: number) => {
    setDraft((d) => {
      if (!d) return d;
      const next = Math.max(1, Math.min(99, n));
      return { ...d, count: next, title: d.title === d.type.titleFor(d.count) ? d.type.titleFor(next) : d.title };
    });
  };

  const saveDraft = async () => {
    if (!draft || !draft.title.trim()) return;
    setBusy(true); setError('');
    try {
      const err = await postQuest(draft.type, draft.title, draft.desc, draft.icon, draft.count);
      if (err) { setError(err); return; }
      setDraft(null); setPicking(false);
      load();
    } finally { setBusy(false); }
  };

  const addStarterPack = async () => {
    setPackBusy(true); setError('');
    try {
      for (const item of STARTER_PACK) {
        const t = questTypeById(item.typeId);
        if (!t) continue;
        const n = item.count ?? t.defaultCount ?? 1;
        const err = await postQuest(t, t.titleFor(n), t.descFor(n), t.icon, n);
        if (err) { setError(err); break; }
      }
      setPicking(false); setDraft(null);
      load();
    } finally { setPackBusy(false); }
  };

  const startEdit = (q: Quest) => setEditing({
    id: q.id,
    title: q.title,
    desc: q.description ?? '',
    icon: q.icon ?? '',
    count: Math.max(1, Number(q.rule?.count ?? 1)),
    counted: q.verifyMethod === 'auto' && ['connections', 'follows', 'dm'].includes(q.rule?.kind ?? ''),
  });

  const saveEdit = async () => {
    if (!editing || !editing.title.trim()) return;
    setSavingEdit(true); setError('');
    try {
      const res = await fetch('/api/events/quests', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          privyId, id: editing.id,
          title: editing.title.trim(),
          description: editing.desc.trim() || null,
          icon: editing.icon.trim() || null,
          ...(editing.counted ? { rule: { count: Math.max(1, editing.count) } } : {}),
        }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d.error || 'Could not save the quest.'); return; }
      setEditing(null);
      load();
    } finally { setSavingEdit(false); }
  };

  // Reorder by swapping locally, then persisting index → sortOrder for the
  // whole list — also normalizes legacy duplicate sortOrders in one pass.
  const move = async (q: Quest, dir: -1 | 1) => {
    const idx = quests.findIndex((x) => x.id === q.id);
    const j = idx + dir;
    if (idx < 0 || j < 0 || j >= quests.length) return;
    const next = [...quests];
    [next[idx], next[j]] = [next[j], next[idx]];
    setQuests(next);
    await Promise.all(next.map((x, i) => fetch('/api/events/quests', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ privyId, id: x.id, sortOrder: i }),
    })));
    load();
  };

  const toggleActive = async (q: Quest) => {
    await fetch('/api/events/quests', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ privyId, id: q.id, isActive: !q.isActive }),
    });
    load();
  };

  const removeQuest = async (q: Quest) => {
    await fetch(`/api/events/quests?id=${q.id}&privyId=${encodeURIComponent(privyId)}`, { method: 'DELETE' });
    load();
  };

  const showQr = async (q: Quest) => {
    if (!q.code) return;
    setQrQuest(q);
    const url = `${window.location.origin}/events/${slug}/live?quest=${q.code}`;
    setQrImg(await QRCode.toDataURL(url, { width: 720, margin: 2, color: { dark: '#1a1a1a', light: '#ffffff' } }));
  };

  const addPrize = async () => {
    if (!prizeTitle.trim()) return;
    const res = await fetch('/api/events/prizes', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        privyId, eventId, title: prizeTitle.trim(), kind: prizeKind,
        ...(prizeKind === 'first_n' ? { threshold: Math.max(1, parseInt(prizeCount, 10) || 1) } : {}),
      }),
    });
    if (res.ok) { setPrizeTitle(''); setPrizeKind('raffle'); load(); }
    else { const d = await res.json().catch(() => ({})); setError(d.error || 'Could not add prize.'); }
  };

  const removePrize = async (id: string) => {
    await fetch(`/api/events/prizes?id=${id}&privyId=${encodeURIComponent(privyId)}`, { method: 'DELETE' });
    load();
  };

  const draw = async (prize: Prize) => {
    setDrawing(prize.id); setError('');
    try {
      const res = await fetch('/api/events/raffle', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ privyId, eventId, prizeId: prize.id }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setError(d.error || 'Could not draw.'); return; }
      load();
    } finally { setDrawing(null); }
  };

  const describeRule = (q: Quest) => describeQuestRule(q.verifyMethod, q.rule);

  return (
    <div>
      <p className="font-mono text-[12px] opacity-60 mb-4" style={{ color: 'var(--foreground)' }}>
        Guests who complete <b>every</b> active quest are entered into this event's raffle.
        {raffleCount != null && <> <b>{raffleCount}</b> in the raffle so far.</>} Quests unlock once a guest is checked in.
      </p>

      {error && <p className="font-mono text-[12px] mb-3" style={{ color: '#FF5C34' }}>{error}</p>}

      {/* Quest list */}
      <div className="flex items-center justify-between mb-1.5">
        <p className="font-mono text-[12px] uppercase tracking-[0.12em] font-bold opacity-60" style={{ color: 'var(--foreground)' }}>Quests</p>
        <button onClick={() => { setPicking((p) => !p); setDraft(null); }} className={btnGhost} style={fieldStyle}>{picking || draft ? 'Cancel' : '+ Add quest'}</button>
      </div>
      {/* Legend for the colored method pills on each quest card */}
      <p className="font-mono text-[10px] opacity-45 leading-relaxed mb-3" style={{ color: 'var(--foreground)' }}>
        QR — guest scans to complete · HOST — you grant it · AUTO — completes on its own
      </p>

      {/* Starter pack — the fastest path from zero to a full first-timer journey */}
      {picking && !draft && (
        <div className="rounded-lg border p-4 mb-3" style={{ borderColor: 'var(--accent-ink, var(--foreground))' }}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-mono text-[12px] font-bold uppercase tracking-[0.12em]" style={{ color: 'var(--accent-ink, var(--foreground))' }}>✦ First-timer journey</p>
              <p className="font-mono text-[11px] opacity-60 mt-1" style={{ color: 'var(--foreground)' }}>
                Four quests that walk a brand-new Topia user from sign-up to their first DM:
                sign up → connect with 5 people → meet 3 IRL → message someone they met.
              </p>
            </div>
            <button onClick={addStarterPack} disabled={packBusy} className={`${btnPrimary} shrink-0`} style={{ backgroundColor: 'var(--foreground)', color: 'var(--background)' }}>
              {packBusy ? 'Adding…' : 'Add all 4'}
            </button>
          </div>
        </div>
      )}

      {/* Type picker — plain-language cards, one per way a quest can verify */}
      {picking && !draft && (
        <div className="rounded-lg border p-2 mb-4 space-y-1" style={{ borderColor: 'var(--border-color)' }}>
          <p className="font-mono text-[11px] uppercase tracking-[0.12em] opacity-50 px-2 pt-1.5 pb-1" style={{ color: 'var(--foreground)' }}>Or pick a quest type</p>
          {QUEST_TYPES.map((t) => (
            <button key={t.id} onClick={() => startDraft(t)}
              className="w-full flex items-start gap-3 text-left px-2.5 py-2.5 rounded-lg cursor-pointer bg-transparent border-none hover:opacity-70 transition"
              style={{ color: 'var(--foreground)' }}>
              <span className="text-[18px] w-7 text-center shrink-0">{t.icon}</span>
              <span className="flex-1 min-w-0">
                <span className="block font-mono text-[13px] font-bold">{t.name}</span>
                <span className="block font-mono text-[11px] opacity-50 mt-0.5">{t.how}</span>
              </span>
              <span className="font-mono text-[13px] opacity-40 shrink-0 mt-1">→</span>
            </button>
          ))}
        </div>
      )}

      {/* Draft — prefilled from the chosen type; everything editable */}
      {draft && (
        <div className="rounded-lg border p-4 space-y-2.5 mb-4" style={{ borderColor: 'var(--border-color)' }}>
          <div className="flex items-center justify-between">
            <p className="font-mono text-[11px] uppercase tracking-[0.12em] opacity-50" style={{ color: 'var(--foreground)' }}>{draft.type.icon} {draft.type.name}</p>
            <button onClick={() => setDraft(null)} className="font-mono text-[11px] uppercase underline cursor-pointer bg-transparent border-none opacity-60" style={{ color: 'var(--foreground)' }}>← Types</button>
          </div>
          <p className="font-mono text-[11px] opacity-50" style={{ color: 'var(--foreground)' }}>{draft.type.how}</p>
          <div className="flex gap-2">
            <input value={draft.icon} onChange={(e) => setDraft({ ...draft, icon: e.target.value })} placeholder="🎯" aria-label="Quest icon" className={`${inputCls} !w-16 text-center`} style={fieldStyle} />
            <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder={draft.type.verifyMethod === 'host' ? 'Quest title (e.g. Ask the DJ for a song)' : 'Quest title'} className={inputCls} style={fieldStyle} />
          </div>
          <input value={draft.desc} onChange={(e) => setDraft({ ...draft, desc: e.target.value })} placeholder="What guests see under the title (optional)" className={inputCls} style={fieldStyle} />
          {draft.type.counted && (
            <div className="flex items-center gap-3">
              <span className="font-mono text-[11px] uppercase tracking-[0.12em] opacity-50" style={{ color: 'var(--foreground)' }}>How many</span>
              <div className="flex items-center gap-1">
                <button onClick={() => setDraftCount(draft.count - 1)} disabled={draft.count <= 1} aria-label="Fewer" className="w-9 h-9 rounded-lg border cursor-pointer bg-transparent font-mono text-[16px] disabled:opacity-30" style={fieldStyle}>−</button>
                <span className="w-10 text-center font-mono text-[16px] font-bold" style={{ color: 'var(--foreground)' }}>{draft.count}</span>
                <button onClick={() => setDraftCount(draft.count + 1)} aria-label="More" className="w-9 h-9 rounded-lg border cursor-pointer bg-transparent font-mono text-[16px]" style={fieldStyle}>+</button>
              </div>
            </div>
          )}
          <button onClick={saveDraft} disabled={busy || !draft.title.trim()} className={btnPrimary} style={{ backgroundColor: 'var(--foreground)', color: 'var(--background)' }}>
            {busy ? 'Adding…' : 'Add quest'}
          </button>
        </div>
      )}

      {!loaded ? (
        <p className="font-mono text-[12px] opacity-40" style={{ color: 'var(--foreground)' }}>Loading quests…</p>
      ) : quests.length === 0 ? (
        <p className="font-mono text-[12px] opacity-40 mb-6" style={{ color: 'var(--foreground)' }}>No quests yet — add one to turn the event into a game.</p>
      ) : (
        <div className="space-y-2 mb-8">
          {quests.map((q, qi) => {
            const tag = methodTag(q);
            const isEditing = editing?.id === q.id;
            const linkBtn = 'font-mono text-[11px] uppercase underline cursor-pointer bg-transparent border-none';
            const arrowBtn = 'w-7 h-7 rounded border cursor-pointer bg-transparent font-mono text-[12px] leading-none disabled:opacity-25';
            return (
              <div key={q.id} className="border rounded-lg px-3 py-2.5" style={{ borderColor: 'var(--border-color)', opacity: q.isActive ? 1 : 0.5 }}>
                <div className="flex items-center gap-2.5">
                  <span className="text-[16px] w-6 text-center shrink-0">{q.icon || '✦'}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-mono text-[13px] font-bold truncate" style={{ color: 'var(--foreground)' }}>
                      {q.title}{!q.isActive && <span className="font-normal opacity-50"> · hidden</span>}
                    </p>
                    <p className="font-mono text-[11px] opacity-40" style={{ color: 'var(--foreground)' }}>
                      {describeRule(q)} · {q.completions} completed
                    </p>
                  </div>
                  <span className="font-mono text-[9px] font-bold tracking-wider px-1.5 py-0.5 rounded shrink-0" style={{ backgroundColor: tag.color, color: '#fff' }}>{tag.text}</span>
                </div>
                <div className="flex items-center gap-3 mt-2 pl-8 flex-wrap">
                  <span className="flex gap-1">
                    <button onClick={() => move(q, -1)} disabled={qi === 0} aria-label="Move up" className={arrowBtn} style={fieldStyle}>↑</button>
                    <button onClick={() => move(q, 1)} disabled={qi === quests.length - 1} aria-label="Move down" className={arrowBtn} style={fieldStyle}>↓</button>
                  </span>
                  {q.verifyMethod === 'qr' && (
                    <button onClick={() => showQr(q)} className={linkBtn} style={{ color: 'var(--foreground)' }}>QR</button>
                  )}
                  {q.verifyMethod !== 'auto' && q.isActive && (
                    <button onClick={() => setGrantQuest(q)} className={linkBtn} style={{ color: 'var(--foreground)' }}>Grant</button>
                  )}
                  <button onClick={() => (isEditing ? setEditing(null) : startEdit(q))} className={linkBtn} style={{ color: 'var(--foreground)' }}>
                    {isEditing ? 'Cancel' : 'Edit'}
                  </button>
                  <button onClick={() => toggleActive(q)} className={`${linkBtn} opacity-60`} style={{ color: 'var(--foreground)' }}>
                    {q.isActive ? 'Hide' : 'Show'}
                  </button>
                  <button onClick={() => removeQuest(q)} className={linkBtn} style={{ color: '#FF5C34' }}>Del</button>
                </div>

                {isEditing && editing && (
                  <div className="mt-3 pt-3 space-y-2" style={{ borderTop: '1px solid var(--border-color)' }}>
                    <div className="flex gap-2">
                      <input value={editing.icon} onChange={(e) => setEditing({ ...editing, icon: e.target.value })} placeholder="🎯" aria-label="Quest icon" className={`${inputCls} !w-16 text-center`} style={fieldStyle} />
                      <input value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} placeholder="Quest title" className={inputCls} style={fieldStyle} />
                    </div>
                    <input value={editing.desc} onChange={(e) => setEditing({ ...editing, desc: e.target.value })} placeholder="What guests see under the title (optional)" className={inputCls} style={fieldStyle} />
                    {editing.counted && (
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-[11px] uppercase tracking-[0.12em] opacity-50" style={{ color: 'var(--foreground)' }}>How many</span>
                        <div className="flex items-center gap-1">
                          <button onClick={() => setEditing({ ...editing, count: Math.max(1, editing.count - 1) })} disabled={editing.count <= 1} aria-label="Fewer" className="w-9 h-9 rounded-lg border cursor-pointer bg-transparent font-mono text-[16px] disabled:opacity-30" style={fieldStyle}>−</button>
                          <span className="w-10 text-center font-mono text-[16px] font-bold" style={{ color: 'var(--foreground)' }}>{editing.count}</span>
                          <button onClick={() => setEditing({ ...editing, count: Math.min(99, editing.count + 1) })} aria-label="More" className="w-9 h-9 rounded-lg border cursor-pointer bg-transparent font-mono text-[16px]" style={fieldStyle}>+</button>
                        </div>
                        <span className="font-mono text-[10px] opacity-40" style={{ color: 'var(--foreground)' }}>Guests who already completed it keep it.</span>
                      </div>
                    )}
                    <button onClick={saveEdit} disabled={savingEdit || !editing.title.trim()} className={btnPrimary} style={{ backgroundColor: 'var(--foreground)', color: 'var(--background)' }}>
                      {savingEdit ? 'Saving…' : 'Save changes'}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Prizes + raffle */}
      <p className="font-mono text-[12px] uppercase tracking-[0.12em] font-bold opacity-60 mb-3" style={{ color: 'var(--foreground)' }}>Prizes & raffle</p>
      <div className="space-y-2 mb-3">
        {prizes.length === 0 && <p className="font-mono text-[12px] opacity-40" style={{ color: 'var(--foreground)' }}>No prizes yet — add what raffle winners get.</p>}
        {prizes.map((p) => (
          <div key={p.id} className="flex items-center gap-2 border rounded-lg px-3 py-2.5" style={{ borderColor: 'var(--border-color)' }}>
            <div className="flex-1 min-w-0">
              <p className="font-mono text-[13px] font-bold truncate" style={{ color: 'var(--foreground)' }}>{p.title}</p>
              {p.kind === 'everyone' ? (
                <p className="font-mono text-[11px] opacity-40" style={{ color: 'var(--foreground)' }}>🍸 Every checked-in guest gets this</p>
              ) : p.kind === 'first_n' ? (
                <p className="font-mono text-[11px] opacity-40" style={{ color: 'var(--foreground)' }}>⚡ First {p.threshold ?? 1} checked in qualify</p>
              ) : p.drawnAt ? (
                <p className="font-mono text-[11px]" style={{ color: 'var(--accent-ink, var(--foreground))' }}>
                  🎉 Winner: {p.winnerName || p.winnerUsername || 'guest'}{p.winnerUsername ? ` (@${p.winnerUsername})` : ''}
                </p>
              ) : (
                <p className="font-mono text-[11px] opacity-40" style={{ color: 'var(--foreground)' }}>🎲 Raffle — not drawn yet</p>
              )}
            </div>
            {p.kind === 'raffle' && (
              <button onClick={() => draw(p)} disabled={drawing === p.id} className={btnGhost} style={fieldStyle}>
                {drawing === p.id ? 'Drawing…' : p.drawnAt ? 'Redraw' : '🎲 Draw'}
              </button>
            )}
            <button onClick={() => removePrize(p.id)} className="font-mono text-[11px] uppercase underline cursor-pointer bg-transparent border-none" style={{ color: '#FF5C34' }}>Del</button>
          </div>
        ))}
      </div>
      <div className="space-y-2">
        <select value={prizeKind} onChange={(e) => setPrizeKind(e.target.value)} className={`${inputCls} appearance-none cursor-pointer`} style={fieldStyle}>
          {PRIZE_KIND_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <div className="flex gap-2">
          {prizeKind === 'first_n' && (
            <input value={prizeCount} onChange={(e) => setPrizeCount(e.target.value)} inputMode="numeric" aria-label="How many guests qualify" className={`${inputCls} !w-20 text-center`} style={fieldStyle} />
          )}
          <input value={prizeTitle} onChange={(e) => setPrizeTitle(e.target.value)} placeholder={prizeKind === 'everyone' ? 'Perk (e.g. Free welcome drink)' : prizeKind === 'first_n' ? 'Door prize (e.g. Limited tee)' : 'Raffle prize (e.g. Limited stamp + tee)'} className={inputCls} style={fieldStyle} />
          <button onClick={addPrize} disabled={!prizeTitle.trim()} className={`${btnPrimary} shrink-0`} style={{ backgroundColor: 'var(--foreground)', color: 'var(--background)' }}>Add</button>
        </div>
      </div>

      {/* QR sheet modal — screenshot/print and post at the venue */}
      {qrQuest && (
        <div className="fixed inset-0 z-[2100] flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.7)' }} onClick={() => { setQrQuest(null); setQrImg(null); }}>
          <div className="w-full max-w-sm rounded-2xl p-6 text-center" style={{ backgroundColor: '#ffffff' }} onClick={(e) => e.stopPropagation()}>
            <p className="font-mono text-[11px] uppercase tracking-[0.15em] mb-1" style={{ color: '#1a1a1a', opacity: 0.5 }}>Quest code · post at the venue</p>
            <p className="font-mono text-[15px] font-bold mb-3" style={{ color: '#1a1a1a' }}>{qrQuest.icon || '✦'} {qrQuest.title}</p>
            {qrImg && <img src={qrImg} alt={`QR code for ${qrQuest.title}`} className="w-full rounded-lg" />}
            <p className="font-mono text-[12px] tracking-[0.15em] mt-2" style={{ color: '#1a1a1a' }}>{qrQuest.code}</p>
            <p className="font-mono text-[10px] mt-2" style={{ color: '#1a1a1a', opacity: 0.5 }}>Screenshot or print this. Scanning it in Event Mode completes the quest.</p>
          </div>
        </div>
      )}

      {grantQuest && (
        <GrantQuestModal
          quest={grantQuest}
          eventId={eventId}
          privyId={privyId}
          onClose={() => { setGrantQuest(null); load(); }}
        />
      )}
    </div>
  );
}

/* Grant a quest to a checked-in guest — the missing half of "host verified":
 * search the checked-in roster, tap a guest, done. Works for QR quests too
 * (phone died, code won't scan — the host is the authority). */
function GrantQuestModal({ quest, eventId, privyId, onClose }: { quest: Quest; eventId: string; privyId: string; onClose: () => void }) {
  const [guests, setGuests] = useState<CheckinGuest[]>([]);
  const [query, setQuery] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [result, setResult] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch(`/api/events/checkin?eventId=${eventId}&privyId=${encodeURIComponent(privyId)}`)
      .then((r) => r.json())
      .then((d) => { if (d.guests) setGuests((d.guests as CheckinGuest[]).filter((g) => g.checkedInAt)); })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [eventId, privyId]);

  const grant = async (g: CheckinGuest) => {
    setBusyId(g.userId);
    try {
      const res = await fetch('/api/events/quests/complete', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ privyId, eventId, questId: quest.id, guestUserId: g.userId }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) setResult((m) => ({ ...m, [g.userId]: d.error || 'Failed' }));
      else setResult((m) => ({ ...m, [g.userId]: d.already ? 'Already done' : '✓ Granted' }));
    } catch {
      setResult((m) => ({ ...m, [g.userId]: 'Failed' }));
    } finally { setBusyId(null); }
  };

  const q = query.trim().toLowerCase();
  const shown = q
    ? guests.filter((g) => (g.name ?? '').toLowerCase().includes(q) || (g.username ?? '').toLowerCase().includes(q))
    : guests;

  return (
    <div className="fixed inset-0 z-[2100] flex items-end sm:items-center justify-center p-0 sm:p-4" style={{ backgroundColor: 'rgba(0,0,0,0.7)' }} onClick={onClose}>
      <div className="w-full max-w-sm rounded-t-2xl sm:rounded-2xl p-4 flex flex-col" style={{ backgroundColor: 'var(--background)', maxHeight: '80lvh' }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 mb-1">
          <div className="min-w-0">
            <p className="font-mono text-[11px] uppercase tracking-[0.15em] opacity-50" style={{ color: 'var(--foreground)' }}>Mark quest done</p>
            <p className="font-mono text-[14px] font-bold truncate" style={{ color: 'var(--foreground)' }}>{quest.icon || '✦'} {quest.title}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="bg-transparent border-none cursor-pointer text-[18px] leading-none p-1 opacity-60" style={{ color: 'var(--foreground)' }}>×</button>
        </div>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search checked-in guests" className={`${inputCls} mb-2 text-[16px]`} style={fieldStyle} />
        <div className="overflow-y-auto flex-1 min-h-0">
          {!loaded ? (
            <p className="font-mono text-[12px] opacity-40 py-3" style={{ color: 'var(--foreground)' }}>Loading roster…</p>
          ) : shown.length === 0 ? (
            <p className="font-mono text-[12px] opacity-40 py-3" style={{ color: 'var(--foreground)' }}>
              {guests.length === 0 ? 'No one is checked in yet — quests unlock at check-in.' : 'No matches.'}
            </p>
          ) : shown.map((g) => (
            <div key={g.userId} className="flex items-center gap-3 py-2.5 border-b" style={{ borderColor: 'var(--border-color)' }}>
              {g.avatarUrl
                ? <img src={g.avatarUrl} alt="" className="w-8 h-8 rounded-full object-cover" />
                : <div className="w-8 h-8 rounded-full flex items-center justify-center font-mono text-[11px] font-bold" style={{ backgroundColor: 'var(--border-color)', color: 'var(--foreground)' }}>{(g.name || g.username || '?')[0].toUpperCase()}</div>}
              <span className="flex-1 min-w-0">
                <span className="block font-mono text-[13px] font-bold truncate" style={{ color: 'var(--foreground)' }}>{g.name || g.username || 'Guest'}</span>
                {g.username && <span className="block font-mono text-[10px] opacity-50" style={{ color: 'var(--foreground)' }}>@{g.username}</span>}
              </span>
              {result[g.userId] ? (
                <span className="font-mono text-[11px] font-bold shrink-0" style={{ color: 'var(--accent-ink, var(--foreground))' }}>{result[g.userId]}</span>
              ) : (
                <button onClick={() => grant(g)} disabled={busyId === g.userId} className={`${btnGhost} shrink-0 !py-1.5`} style={fieldStyle}>
                  {busyId === g.userId ? '…' : 'Mark done'}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Check-in tab (door roster: search + one-tap check-in) ─────────── */
interface CheckinGuest { userId: string; name: string | null; username: string | null; avatarUrl: string | null; checkedInAt: string | null; }

function CheckinTab({ eventId, privyId }: { eventId: string; privyId: string }) {
  const [guests, setGuests] = useState<CheckinGuest[]>([]);
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanStatus, setScanStatus] = useState<{ kind: 'ok' | 'warn' | 'err'; text: string } | null>(null);

  const load = useCallback(() => {
    fetch(`/api/events/checkin?eventId=${eventId}&privyId=${encodeURIComponent(privyId)}`)
      .then((r) => r.json())
      .then((d) => { if (d.guests) setGuests(d.guests); })
      .catch(console.error)
      .finally(() => setLoaded(true));
  }, [eventId, privyId]);

  // Multiple hosts may be working the door at once — refresh periodically so
  // everyone's counter stays roughly live.
  useEffect(() => {
    load();
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, [load]);

  const setCheckedIn = async (guest: CheckinGuest, on: boolean) => {
    setBusyId(guest.userId); setError('');
    // Optimistic flip; reload reconciles.
    setGuests((gs) => gs.map((g) => g.userId === guest.userId ? { ...g, checkedInAt: on ? new Date().toISOString() : null } : g));
    try {
      const res = on
        ? await fetch('/api/events/checkin', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ privyId, eventId, guestUserId: guest.userId }),
          })
        : await fetch(`/api/events/checkin?eventId=${eventId}&guestUserId=${guest.userId}&privyId=${encodeURIComponent(privyId)}`, { method: 'DELETE' });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error || 'Could not update check-in.');
      }
    } catch {
      setError('Could not update check-in.');
    } finally {
      setBusyId(null);
      load();
    }
  };

  // A scanned QR from the door camera → check the guest in by connect code.
  // The overlay stays open so the host can keep scanning the line.
  const handleScan = useCallback(async (value: string) => {
    try {
      const res = await fetch('/api/events/checkin', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ privyId, eventId, code: value }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setScanStatus({ kind: 'err', text: d.error || 'Scan failed — try again.' });
        return;
      }
      const who = d.guest?.name || d.guest?.username || 'Guest';
      if (d.already) {
        const at = d.checkedInAt ? new Date(d.checkedInAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';
        setScanStatus({ kind: 'warn', text: `⚠ ${who} already checked in${at ? ` at ${at}` : ''}` });
      } else {
        setScanStatus({ kind: 'ok', text: `✓ ${who} checked in` });
      }
      load();
    } catch {
      setScanStatus({ kind: 'err', text: 'Scan failed — try again.' });
    }
  }, [privyId, eventId, load]);

  const checkedInCount = guests.filter((g) => g.checkedInAt).length;
  const q = query.trim().toLowerCase();
  const filtered = q
    ? guests.filter((g) => (g.name ?? '').toLowerCase().includes(q) || (g.username ?? '').toLowerCase().includes(q))
    : guests;
  // Not-yet-checked-in first — that's who the door is looking for.
  const ordered = [...filtered].sort((a, b) => Number(!!a.checkedInAt) - Number(!!b.checkedInAt));

  const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <p className="font-mono text-[13px]" style={{ color: 'var(--foreground)' }}>
          <span className="text-[22px] font-bold">{checkedInCount}</span>
          <span className="opacity-60"> / {guests.length} checked in</span>
        </p>
        <button onClick={() => { setScanStatus(null); setScanning(true); }}
          className={btnPrimary} style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-text)' }}>
          ▣ Scan QR
        </button>
      </div>
      <div className="h-1.5 rounded-full mb-5 overflow-hidden" style={{ backgroundColor: 'var(--border-color)' }}>
        <div className="h-full rounded-full transition-all" style={{ width: guests.length ? `${(checkedInCount / guests.length) * 100}%` : '0%', backgroundColor: 'var(--accent)' }} />
      </div>

      {/* 16px font so iOS doesn't zoom the door search */}
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search guests…"
        className="w-full border px-3 py-2.5 font-mono text-[16px] rounded-lg outline-none mb-4"
        style={fieldStyle}
      />

      {error && <p className="font-mono text-[12px] mb-3" style={{ color: '#FF5C34' }}>{error}</p>}

      {!loaded ? (
        <p className="font-mono text-[12px] opacity-40" style={{ color: 'var(--foreground)' }}>Loading guest list…</p>
      ) : guests.length === 0 ? (
        <p className="font-mono text-[12px] opacity-40" style={{ color: 'var(--foreground)' }}>No confirmed guests yet — check-in opens once people RSVP.</p>
      ) : ordered.length === 0 ? (
        <p className="font-mono text-[12px] opacity-40" style={{ color: 'var(--foreground)' }}>No guests match “{query}”.</p>
      ) : (
        <div className="space-y-2">
          {ordered.map((g) => (
            <div key={g.userId} className="flex items-center gap-3 border rounded-lg px-3 py-2.5" style={{ borderColor: g.checkedInAt ? 'var(--accent)' : 'var(--border-color)' }}>
              {g.avatarUrl
                ? <img src={g.avatarUrl} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
                : <div className="w-8 h-8 rounded-full flex items-center justify-center font-mono text-[12px] font-bold shrink-0" style={{ backgroundColor: 'var(--surface-hover)', color: 'var(--foreground)' }}>{(g.name || g.username || '?')[0].toUpperCase()}</div>}
              <div className="flex-1 min-w-0">
                <p className="font-mono text-[13px] font-bold truncate" style={{ color: 'var(--foreground)' }}>{g.name || g.username || 'Guest'}</p>
                <p className="font-mono text-[11px] opacity-40 truncate" style={{ color: 'var(--foreground)' }}>
                  {g.checkedInAt ? `✓ checked in ${fmtTime(g.checkedInAt)}` : g.username ? `@${g.username}` : 'not checked in'}
                </p>
              </div>
              {g.checkedInAt ? (
                <button disabled={busyId === g.userId} onClick={() => setCheckedIn(g, false)}
                  className="font-mono text-[11px] uppercase tracking-widest underline cursor-pointer bg-transparent border-none opacity-50 hover:opacity-100 disabled:opacity-20"
                  style={{ color: 'var(--foreground)' }}>
                  Undo
                </button>
              ) : (
                <button disabled={busyId === g.userId} onClick={() => setCheckedIn(g, true)}
                  className="px-4 py-2 font-mono text-[11px] uppercase tracking-widest rounded-lg cursor-pointer border-none font-bold disabled:opacity-40"
                  style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-text)' }}>
                  Check in
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {scanning && (
        <QrScannerOverlay
          hint="Scan a guest's Topia code"
          status={scanStatus}
          onCode={handleScan}
          onClose={() => setScanning(false)}
        />
      )}
    </div>
  );
}

/* ── Invite guests from a past event (inside Guests) ───────────────── */
interface GuestSource { id: string; eventName: string; date: string | null; dateIso: string | null; going: number }
interface PastGuest { name: string | null; contact: string; alreadyHere: boolean; checked: boolean }

function PastGuestsPanel({ eventId, privyId, currentContacts, onInvited }: {
  eventId: string; privyId: string; currentContacts: Set<string>; onInvited: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [sources, setSources] = useState<GuestSource[] | null>(null);
  const [srcId, setSrcId] = useState('');
  const [guests, setGuests] = useState<PastGuest[] | null>(null);
  const [loadingGuests, setLoadingGuests] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  // Load the picker's event list lazily, on first expand.
  useEffect(() => {
    if (!open || sources !== null) return;
    fetch(`/api/events/guest-sources?privyId=${encodeURIComponent(privyId)}&excludeEventId=${eventId}`)
      .then((r) => r.json())
      .then((d) => setSources(d.events ?? []))
      .catch(() => setSources([]));
  }, [open, sources, privyId, eventId]);

  // Picking a source event loads ITS going list (manager-gated per event) —
  // only guests with a reachable contact, deduped, current-list flagged.
  useEffect(() => {
    if (!srcId) { setGuests(null); return; }
    let cancelled = false;
    setLoadingGuests(true); setNote('');
    fetch(`/api/events/rsvps?eventId=${srcId}&privyId=${encodeURIComponent(privyId)}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        const seen = new Set<string>();
        const list: PastGuest[] = (d.rsvps ?? [])
          .filter((r: Rsvp) => r.status === 'going' && (r.email || r.phone))
          .flatMap((r: Rsvp) => {
            const contact = (r.email || r.phone)!;
            const key = contact.toLowerCase();
            if (seen.has(key)) return [];
            seen.add(key);
            const alreadyHere = currentContacts.has(key);
            return [{ name: r.name, contact, alreadyHere, checked: !alreadyHere }];
          });
        setGuests(list);
      })
      .catch(() => { if (!cancelled) setGuests([]); })
      .finally(() => { if (!cancelled) setLoadingGuests(false); });
    return () => { cancelled = true; };
    // currentContacts is derived fresh each render; keying on srcId is enough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [srcId, privyId]);

  const pickable = guests?.filter((g) => !g.alreadyHere) ?? [];
  const picked = pickable.filter((g) => g.checked);
  const allOn = pickable.length > 0 && picked.length === pickable.length;

  const toggle = (contact: string) =>
    setGuests((gs) => (gs ?? []).map((g) => (g.contact === contact ? { ...g, checked: !g.checked } : g)));
  const toggleAll = () =>
    setGuests((gs) => (gs ?? []).map((g) => (g.alreadyHere ? g : { ...g, checked: !allOn })));

  const send = async () => {
    if (picked.length === 0) return;
    setBusy(true); setNote('');
    try {
      const res = await fetch('/api/events/invites', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ privyId, eventId, recipients: picked.map((g) => g.contact) }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setNote(d.error || 'Could not send invites.'); return; }
      const made = d.created?.length ?? 0;
      const sent = d.sentCount ?? 0;
      setNote(
        made === 0 ? 'Everyone selected was already invited.'
        : `Invited ${made}${sent < made ? ` — ${made - sent} need a shared link (see Invite guests above)` : ' by email'}.`
      );
      setGuests((gs) => (gs ?? []).map((g) => (g.checked ? { ...g, checked: false, alreadyHere: true } : g)));
      onInvited();
    } finally { setBusy(false); }
  };

  return (
    <div className="rounded-lg border p-4 mb-6" style={{ borderColor: 'var(--border-color)' }}>
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between bg-transparent border-none cursor-pointer p-0">
        <span className="font-mono text-[12px] uppercase tracking-[0.12em] font-bold opacity-60" style={{ color: 'var(--foreground)' }}>Invite guests from a past event</span>
        <span className="font-mono text-[12px] opacity-50" style={{ color: 'var(--foreground)' }}>{open ? '▾' : '▸'}</span>
      </button>

      {open && (
        <div className="mt-3">
          {sources === null ? (
            <p className="font-mono text-[11px] opacity-40" style={{ color: 'var(--foreground)' }}>Loading your events…</p>
          ) : sources.length === 0 ? (
            <p className="font-mono text-[11px] opacity-40" style={{ color: 'var(--foreground)' }}>No other events yet — host one and its guest list shows up here.</p>
          ) : (
            <select value={srcId} onChange={(e) => setSrcId(e.target.value)} className={`${inputCls} appearance-none cursor-pointer`} style={fieldStyle}>
              <option value="">Pick one of your events…</option>
              {sources.map((s) => (
                <option key={s.id} value={s.id}>{s.eventName}{s.date ? ` — ${s.date}` : ''} · {s.going} going</option>
              ))}
            </select>
          )}

          {loadingGuests && <p className="font-mono text-[11px] opacity-40 mt-2" style={{ color: 'var(--foreground)' }}>Loading guests…</p>}

          {guests !== null && !loadingGuests && (
            guests.length === 0 ? (
              <p className="font-mono text-[11px] opacity-40 mt-2" style={{ color: 'var(--foreground)' }}>No reachable guests on that list (no emails or phones).</p>
            ) : (
              <>
                <div className="flex items-center justify-between mt-3 mb-1.5">
                  <span className="font-mono text-[11px] uppercase tracking-widest opacity-50" style={{ color: 'var(--foreground)' }}>
                    {picked.length}/{pickable.length} selected
                  </span>
                  {pickable.length > 0 && (
                    <button onClick={toggleAll} className="font-mono text-[11px] uppercase underline cursor-pointer bg-transparent border-none" style={{ color: 'var(--foreground)' }}>
                      {allOn ? 'Clear all' : 'Select all'}
                    </button>
                  )}
                </div>
                <div className="max-h-56 overflow-y-auto space-y-0.5">
                  {guests.map((g) => (
                    <label key={g.contact} className={`flex items-center gap-2.5 py-1.5 text-[12px] font-mono ${g.alreadyHere ? 'opacity-35' : 'cursor-pointer'}`} style={{ color: 'var(--foreground)' }}>
                      <input type="checkbox" checked={g.checked} disabled={g.alreadyHere} onChange={() => toggle(g.contact)} className="cursor-pointer" />
                      <span className="flex-1 truncate">{g.name || g.contact}{g.name ? <span className="opacity-40"> · {g.contact}</span> : null}</span>
                      {g.alreadyHere && <span className="text-[10px] uppercase opacity-70 shrink-0">on this list</span>}
                    </label>
                  ))}
                </div>
                <div className="flex items-center gap-2 mt-3 flex-wrap">
                  <button onClick={send} disabled={busy || picked.length === 0} className={btnPrimary} style={{ backgroundColor: 'var(--foreground)', color: 'var(--background)' }}>
                    {busy ? 'Inviting…' : `Invite ${picked.length || ''}`.trim()}
                  </button>
                  {note && <span className="font-mono text-[11px] opacity-70" style={{ color: 'var(--foreground)' }}>{note}</span>}
                </div>
              </>
            )
          )}
        </div>
      )}
    </div>
  );
}

/* ── Invite-by-email/phone panel (inside Guests) ───────────────────── */
function InvitesPanel({ eventId, privyId }: { eventId: string; privyId: string }) {
  const [invites, setInvites] = useState<Invite[]>([]);
  const [recipients, setRecipients] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [open, setOpen] = useState(true);

  const load = useCallback(() => {
    fetch(`/api/events/invites?eventId=${eventId}&privyId=${privyId}`)
      .then((r) => r.json()).then((d) => setInvites(d.invites || [])).catch(console.error);
  }, [eventId, privyId]);
  useEffect(() => { load(); }, [load]);

  const send = async () => {
    if (!recipients.trim()) return;
    setBusy(true); setNote('');
    try {
      const res = await fetch('/api/events/invites', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ privyId, eventId, recipients }),
      });
      const d = await res.json();
      if (!res.ok) { setNote(d.error || 'Failed to invite'); return; }
      setRecipients('');
      const made = d.created.length, sent = d.sentCount, unsent = made - sent;
      setNote(
        made === 0 ? 'No new invites (already invited?).'
        : sent > 0 ? `Sent ${sent}.` + (unsent ? ` ${unsent} need a shared link below.` : '')
        : `${made} invite link${made > 1 ? 's' : ''} ready to share below.`
      );
      load();
    } finally { setBusy(false); }
  };

  const copy = async (inv: Invite) => {
    if (!inv.url) return;
    try { await navigator.clipboard.writeText(inv.url); setCopiedId(inv.id); setTimeout(() => setCopiedId(null), 1500); } catch {}
  };
  const copyAll = async () => {
    const links = invites.filter((i) => i.status === 'pending' && i.url).map((i) => `${i.email || i.phone}: ${i.url}`).join('\n');
    try { await navigator.clipboard.writeText(links); setCopiedId('all'); setTimeout(() => setCopiedId(null), 1500); } catch {}
  };
  const revoke = async (id: string) => {
    await fetch(`/api/events/invites?id=${id}&privyId=${privyId}`, { method: 'DELETE' });
    load();
  };

  const pending = invites.filter((i) => i.status === 'pending');
  const accepted = invites.filter((i) => i.status === 'accepted');

  return (
    <div className="rounded-lg border p-4 mb-6" style={{ borderColor: 'var(--border-color)' }}>
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between bg-transparent border-none cursor-pointer p-0">
        <span className="font-mono text-[12px] uppercase tracking-[0.12em] font-bold opacity-60" style={{ color: 'var(--foreground)' }}>Invite guests</span>
        <span className="font-mono text-[12px] opacity-50" style={{ color: 'var(--foreground)' }}>
          {invites.length ? `${accepted.length}/${invites.length} accepted · ` : ''}{open ? '▾' : '▸'}
        </span>
      </button>

      {open && (
        <div className="mt-3">
          <textarea value={recipients} onChange={(e) => setRecipients(e.target.value)} rows={2}
            placeholder="Emails or phone numbers — comma or new line separated" className={inputCls} style={fieldStyle} />
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <button onClick={send} disabled={busy || !recipients.trim()} className={btnPrimary} style={{ backgroundColor: 'var(--foreground)', color: 'var(--background)' }}>
              {busy ? 'Inviting…' : 'Invite'}
            </button>
            {note && <span className="font-mono text-[11px] opacity-70" style={{ color: 'var(--foreground)' }}>{note}</span>}
          </div>
          <p className="font-mono text-[11px] opacity-40 mt-2" style={{ color: 'var(--foreground)' }}>
            Email invites are sent automatically. For SMS or to share another way, copy each link below and send it yourself.
          </p>

          {pending.length > 0 && (
            <div className="mt-4">
              <div className="flex items-center justify-between mb-2">
                <span className="font-mono text-[11px] uppercase tracking-widest opacity-50" style={{ color: 'var(--foreground)' }}>Invited · pending</span>
                <button onClick={copyAll} className="font-mono text-[11px] uppercase underline cursor-pointer bg-transparent border-none" style={{ color: 'var(--foreground)' }}>
                  {copiedId === 'all' ? 'Copied!' : 'Copy all links'}
                </button>
              </div>
              <div className="space-y-1.5">
                {pending.map((i) => (
                  <div key={i.id} className="flex items-center gap-2 text-[12px] font-mono" style={{ color: 'var(--foreground)' }}>
                    <span className="flex-1 truncate">
                      {i.email || i.phone}
                      <span className="opacity-40">{i.sent ? ' · sent' : ' · link not sent'}</span>
                    </span>
                    <button onClick={() => copy(i)} className="uppercase underline cursor-pointer bg-transparent border-none text-[11px]" style={{ color: 'var(--foreground)' }}>
                      {copiedId === i.id ? 'Copied!' : 'Copy link'}
                    </button>
                    <button onClick={() => revoke(i.id)} className="uppercase underline cursor-pointer bg-transparent border-none text-[11px]" style={{ color: '#FF5C34' }}>Revoke</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {accepted.length > 0 && (
            <div className="mt-4">
              <span className="font-mono text-[11px] uppercase tracking-widest opacity-50 block mb-2" style={{ color: 'var(--foreground)' }}>Accepted</span>
              <div className="space-y-1">
                {accepted.map((i) => (
                  <div key={i.id} className="text-[12px] font-mono opacity-70" style={{ color: 'var(--foreground)' }}>✓ {i.email || i.phone}</div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Guests tab ────────────────────────────────────────────────────── */
function GuestsTab({ eventId, eventName, privyId, capacity }: { eventId: string; eventName: string; privyId: string; capacity: number | null }) {
  const [rsvps, setRsvps] = useState<Rsvp[]>([]);
  const [going, setGoing] = useState(0);
  const [pending, setPending] = useState(0);
  const [waitlisted, setWaitlisted] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [decideMsg, setDecideMsg] = useState('');
  // Host action awaiting an "are you sure?" confirm (approve/decline a request,
  // or remove a guest from the list).
  const [confirmAction, setConfirmAction] = useState<{ userId: string; action: 'approve' | 'decline' | 'remove' } | null>(null);
  // Bumped when the past-guests panel sends invites, so InvitesPanel reloads.
  const [inviteReload, setInviteReload] = useState(0);

  const load = useCallback(() => {
    fetch(`/api/events/rsvps?eventId=${eventId}&privyId=${privyId}`)
      .then((r) => r.json())
      .then((d) => { setRsvps(d.rsvps ?? []); setGoing(d.goingCount ?? 0); setPending(d.pendingCount ?? 0); setWaitlisted(d.waitlistedCount ?? 0); })
      .catch(console.error);
  }, [eventId, privyId]);
  useEffect(() => { load(); }, [load]);

  const decide = async (guestUserId: string, decision: 'approve' | 'decline') => {
    setBusyId(guestUserId); setDecideMsg('');
    const who = rsvps.find((r) => r.userId === guestUserId);
    const label = who?.name || who?.username || 'Guest';
    try {
      const res = await fetch('/api/events/rsvp/decision', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ privyId, eventId, guestUserId, decision }),
      });
      if (res.ok) {
        setDecideMsg(decision === 'approve' ? `${label} approved.` : `${label} declined.`);
        load();
      } else {
        const d = await res.json().catch(() => ({}));
        setDecideMsg(d.error || 'Could not update request.');
      }
    } catch {
      setDecideMsg('Could not update request.');
    } finally { setBusyId(null); }
  };

  const remove = async (guestUserId: string) => {
    setBusyId(guestUserId); setDecideMsg('');
    const who = rsvps.find((r) => r.userId === guestUserId);
    const label = who?.name || who?.username || 'Guest';
    try {
      const res = await fetch(`/api/events/rsvps?eventId=${eventId}&guestUserId=${guestUserId}&privyId=${encodeURIComponent(privyId)}`, { method: 'DELETE' });
      if (res.ok) {
        setDecideMsg(`${label} removed.`);
        load();
      } else {
        const d = await res.json().catch(() => ({}));
        setDecideMsg(d.error || 'Could not remove guest.');
      }
    } catch {
      setDecideMsg('Could not remove guest.');
    } finally { setBusyId(null); }
  };

  const exportCsv = () => {
    const qCols = Array.from(new Set(rsvps.flatMap((r) => (r.responses ?? []).map((x) => x.label))));
    // First/last are their own columns — a door list and a mail merge both want
    // them split, and re-splitting a joined name downstream is guesswork.
    const header = [
      'First Name', 'Last Name', 'Name', 'Email', 'Phone', 'Status', 'Registered',
      'Ticket Tier', 'Tickets', 'Paid', 'Promo Code', 'Purchased',
      ...qCols,
    ];
    const rows = rsvps.map((r) => {
      const map = new Map((r.responses ?? []).map((x) => [x.label, answerToText(x.answer)]));
      // Fall back to splitting the display name for guests who registered
      // through the RSVP form (one name field) rather than buying a ticket.
      const parts = (r.name ?? '').trim().split(/\s+/).filter(Boolean);
      const first = r.firstName ?? (parts.length > 1 ? parts[0] : parts[0] ?? '');
      const last = r.lastName ?? (parts.length > 1 ? parts.slice(1).join(' ') : '');
      return [
        first, last,
        r.name ?? '', r.email ?? '', r.phone ?? '', r.status,
        new Date(r.createdAt).toISOString().slice(0, 10),
        r.ticket?.tierName ?? '',
        r.ticket ? String(r.ticket.tickets) : '',
        r.ticket ? (r.ticket.spentCents / 100).toFixed(2) : '',
        r.ticket?.promoCode ?? '',
        r.ticket ? new Date(r.ticket.purchasedAt).toISOString().slice(0, 10) : '',
        ...qCols.map((c) => map.get(c) ?? ''),
      ];
    });
    const csv = [header, ...rows].map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${eventName}-guests.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  // Ticketed-guest rollup, straight off the same rows the list renders — no
  // second fetch, and it can't drift from what the host sees below.
  const ticketHolders = rsvps.filter((r) => r.ticket != null).length;
  const grossCents = rsvps.reduce((sum, r) => sum + (r.ticket?.spentCents ?? 0), 0);
  // Guests a host can't reach or identify — the thing that started all this.
  const incompleteCount = rsvps.filter((r) => !r.name?.trim() || !r.email?.trim()).length;

  const pendingList = rsvps.filter((r) => r.status === 'pending');
  const goingList = rsvps.filter((r) => r.status === 'going');
  // Waitlist shows in join order — that's the order auto-promotion follows.
  const waitlistedList = rsvps
    .filter((r) => r.status === 'waitlisted')
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  // Contacts already on THIS event's list — the past-event picker greys
  // them out instead of re-inviting.
  const currentContacts = new Set(
    rsvps.flatMap((r) => [r.email, r.phone]).filter(Boolean).map((c) => String(c).toLowerCase()),
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="font-mono text-[13px]" style={{ color: 'var(--foreground)' }}>
          <span className="font-bold">{going}</span> going{capacity != null && ` / ${capacity}`}
          {pending > 0 && <span className="opacity-60"> · {pending} pending</span>}
          {waitlisted > 0 && <span className="opacity-60"> · {waitlisted} waitlisted</span>}
          {ticketHolders > 0 && (
            <span className="opacity-60"> · {ticketHolders} ticketed ({usdCents(grossCents)})</span>
          )}
        </p>
        {rsvps.length > 0 && <button onClick={exportCsv} className={btnGhost} style={fieldStyle}>Export CSV</button>}
      </div>

      <InvitesPanel key={inviteReload} eventId={eventId} privyId={privyId} />
      <PastGuestsPanel eventId={eventId} privyId={privyId} currentContacts={currentContacts} onInvited={() => setInviteReload((k) => k + 1)} />

      {decideMsg && (
        <p className="font-mono text-[12px] mb-3 opacity-70" style={{ color: 'var(--foreground)' }}>{decideMsg}</p>
      )}

      {incompleteCount > 0 && (
        <p
          className="font-mono text-[12px] mb-3 px-3 py-2 rounded-lg border"
          style={{ color: 'var(--foreground)', borderColor: 'var(--border-color)' }}
        >
          <span className="font-bold">{incompleteCount}</span> guest{incompleteCount > 1 ? 's are' : ' is'} missing a name or email.
          These registered before those fields were required at checkout — everyone buying from now on has to provide both.
        </p>
      )}

      {pendingList.length > 0 && (
        <div className="mb-6">
          <p className="font-mono text-[11px] uppercase tracking-widest opacity-50 mb-2" style={{ color: 'var(--foreground)' }}>Requests</p>
          <div className="space-y-2">
            {pendingList.map((r) => (
              <GuestRow key={r.userId} r={r} expanded={expanded === r.userId} onToggle={() => setExpanded(expanded === r.userId ? null : r.userId)}
                actions={
                  <span className="flex gap-2">
                    <button disabled={busyId === r.userId} onClick={() => setConfirmAction({ userId: r.userId, action: 'approve' })} className="font-mono text-[11px] uppercase underline cursor-pointer bg-transparent border-none" style={{ color: '#00b36b' }}>Approve</button>
                    <button disabled={busyId === r.userId} onClick={() => setConfirmAction({ userId: r.userId, action: 'decline' })} className="font-mono text-[11px] uppercase underline cursor-pointer bg-transparent border-none" style={{ color: '#FF5C34' }}>Decline</button>
                  </span>
                } />
            ))}
          </div>
        </div>
      )}

      {waitlistedList.length > 0 && (
        <div className="mb-6">
          <p className="font-mono text-[11px] uppercase tracking-widest opacity-50 mb-2" style={{ color: 'var(--foreground)' }}>
            Waitlist <span className="normal-case tracking-normal">— promoted in this order when spots open</span>
          </p>
          <div className="space-y-2">
            {waitlistedList.map((r, i) => (
              <GuestRow key={r.userId} r={r} expanded={expanded === r.userId} onToggle={() => setExpanded(expanded === r.userId ? null : r.userId)}
                actions={
                  <span className="flex items-center gap-2">
                    <span className="font-mono text-[10px] opacity-40" style={{ color: 'var(--foreground)' }}>#{i + 1}</span>
                    <button disabled={busyId === r.userId} onClick={() => setConfirmAction({ userId: r.userId, action: 'remove' })} className="font-mono text-[11px] uppercase underline cursor-pointer bg-transparent border-none" style={{ color: '#FF5C34' }}>Remove</button>
                  </span>
                } />
            ))}
          </div>
        </div>
      )}

      <p className="font-mono text-[11px] uppercase tracking-widest opacity-50 mb-2" style={{ color: 'var(--foreground)' }}>Going</p>
      {goingList.length === 0 ? (
        <p className="font-mono text-[12px] opacity-40" style={{ color: 'var(--foreground)' }}>No confirmed guests yet.</p>
      ) : (
        <div className="space-y-2">
          {goingList.map((r) => (
            <GuestRow key={r.userId} r={r} expanded={expanded === r.userId} onToggle={() => setExpanded(expanded === r.userId ? null : r.userId)}
              actions={
                <button disabled={busyId === r.userId} onClick={() => setConfirmAction({ userId: r.userId, action: 'remove' })} className="font-mono text-[11px] uppercase underline cursor-pointer bg-transparent border-none" style={{ color: '#FF5C34' }}>Remove</button>
              } />
          ))}
        </div>
      )}

      {/* Approve / decline / remove confirmation — guards against an accidental tap */}
      {confirmAction && (() => {
        const who = rsvps.find((r) => r.userId === confirmAction.userId);
        const label = who?.name || who?.username || 'this guest';
        const { action } = confirmAction;
        const verb = action === 'approve' ? 'Approve' : action === 'decline' ? 'Decline' : 'Remove';
        const blurb = action === 'approve'
          ? `They'll be confirmed as going and notified.`
          : action === 'decline'
            ? `Their request will be declined and they'll be notified.`
            : `They'll be removed from the guest list. You can re-invite them later.`;
        const danger = action !== 'approve';
        const color = danger ? '#FF5C34' : '#00b36b';
        return (
          <div className="fixed inset-0 z-[2100] flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.6)' }} onClick={() => !busyId && setConfirmAction(null)}>
            <div className="w-full max-w-sm rounded-2xl p-6 border text-center" style={{ backgroundColor: 'var(--background)', borderColor: 'var(--border-color)' }} onClick={(e) => e.stopPropagation()}>
              <p className="font-mono text-[15px] font-bold mb-2" style={{ color: 'var(--foreground)' }}>
                {verb} {label}?
              </p>
              <p className="font-mono text-[13px] opacity-70 mb-6" style={{ color: 'var(--foreground)' }}>
                {blurb}
              </p>
              <div className="flex gap-2">
                <button onClick={() => setConfirmAction(null)} disabled={!!busyId} className={`flex-1 ${btnPrimary}`} style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-text)' }}>Cancel</button>
                <button
                  onClick={() => { const c = confirmAction; setConfirmAction(null); if (c.action === 'remove') remove(c.userId); else decide(c.userId, c.action); }}
                  disabled={!!busyId}
                  className={`flex-1 ${btnGhost}`}
                  style={{ color, borderColor: color }}
                >
                  {verb}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

function GuestRow({ r, expanded, onToggle, actions }: { r: Rsvp; expanded: boolean; onToggle: () => void; actions?: React.ReactNode }) {
  const hasAnswers = (r.responses ?? []).length > 0;
  const hasDetail = hasAnswers || r.ticket != null;
  return (
    <div className="border rounded-lg px-3 py-2" style={{ borderColor: 'var(--border-color)' }}>
      <div className="flex items-center gap-3">
        {r.avatarUrl
          ? <img src={r.avatarUrl} alt="" className="w-7 h-7 rounded-full object-cover" />
          : <div className="w-7 h-7 rounded-full flex items-center justify-center font-mono text-[11px] font-bold" style={{ backgroundColor: 'var(--surface-hover)', color: 'var(--foreground)' }}>{(r.name || r.username || '?')[0].toUpperCase()}</div>}
        <div className="flex-1 min-w-0">
          <p className="font-mono text-[12px] font-bold truncate flex items-center gap-1.5" style={{ color: 'var(--foreground)' }}>
            <span className="truncate">{r.name || r.username || 'Guest'}</span>
            {r.ticket && (
              <span
                className="font-mono text-[9px] uppercase tracking-widest px-1.5 py-0.5 rounded shrink-0 font-bold"
                style={{ backgroundColor: 'var(--lime)', color: 'var(--obsidian)' }}
                title={`${r.ticket.tickets} × ${r.ticket.tierName ?? 'ticket'}`}
              >
                {r.ticket.tickets > 1 ? `${r.ticket.tickets} tickets` : 'Ticket'}
              </span>
            )}
          </p>
          {(r.email || r.phone) && (
            <p className="font-mono text-[11px] opacity-40 truncate" style={{ color: 'var(--foreground)' }}>
              {[r.email, r.phone].filter(Boolean).join(' · ')}
            </p>
          )}
          {/* No name at all — say so plainly instead of showing a bare phone
              number and leaving the host to guess who it is. */}
          {!r.name && !r.username && (
            <p className="font-mono text-[11px] italic opacity-40" style={{ color: 'var(--foreground)' }}>
              No name on file
            </p>
          )}
        </div>
        {actions}
        {hasDetail && (
          <button onClick={onToggle} className="font-mono text-[11px] uppercase underline cursor-pointer bg-transparent border-none opacity-60" style={{ color: 'var(--foreground)' }}>
            {expanded ? 'Hide' : r.ticket && !hasAnswers ? 'Order' : 'Details'}
          </button>
        )}
      </div>
      {expanded && (
        <div className="mt-2 pt-2 border-t space-y-1.5" style={{ borderColor: 'var(--border-color)' }}>
          {r.ticket && (
            <>
              {(r.firstName || r.lastName) && (
                <div className="font-mono text-[12px]" style={{ color: 'var(--foreground)' }}>
                  <span className="opacity-50">Ticket holder: </span>{[r.firstName, r.lastName].filter(Boolean).join(' ')}
                </div>
              )}
              <div className="font-mono text-[12px]" style={{ color: 'var(--foreground)' }}>
                <span className="opacity-50">Purchased: </span>
                {r.ticket.tickets} × {r.ticket.tierName ?? 'ticket'} · {usdCents(r.ticket.spentCents)}
                {r.ticket.promoCode && <span className="opacity-50"> · promo {r.ticket.promoCode}</span>}
                <span className="opacity-50"> · {new Date(r.ticket.purchasedAt).toLocaleDateString()}</span>
              </div>
            </>
          )}
          {(r.responses ?? []).map((x, i) => (
            <div key={i} className="font-mono text-[12px]" style={{ color: 'var(--foreground)' }}>
              <span className="opacity-50">{x.label}: </span>{answerToText(x.answer)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Registration tab (settings + question builder) ────────────────── */
function RegistrationTab({ event, slug, privyId, onSettings }: { event: EventLite; slug: string; privyId: string; onSettings: (s: Partial<EventLite>) => void }) {
  const [capacity, setCapacity] = useState(event.rsvpCapacity?.toString() ?? '');
  const [approval, setApproval] = useState(event.rsvpApprovalRequired);
  const [closed, setClosed] = useState(event.rsvpClosed);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsMsg, setSettingsMsg] = useState('');

  const [questions, setQuestions] = useState<Question[]>([]);
  const [newLabel, setNewLabel] = useState('');
  const [newType, setNewType] = useState('short_text');
  const [newOptions, setNewOptions] = useState('');
  const [newRequired, setNewRequired] = useState(false);
  const [busy, setBusy] = useState(false);

  const loadQuestions = useCallback(() => {
    fetch(`/api/events/questions?slug=${slug}&includeInactive=1`)
      .then((r) => r.json()).then((d) => setQuestions(d.questions ?? [])).catch(console.error);
  }, [slug]);
  useEffect(() => { loadQuestions(); }, [loadQuestions]);

  const saveSettings = async () => {
    setSavingSettings(true); setSettingsMsg('');
    try {
      // Normalize capacity: blank → unlimited; anything < 1 is meaningless so
      // treat it as unlimited too rather than silently locking everyone out.
      const parsed = capacity.trim() === '' ? null : Number(capacity);
      const normalizedCap = parsed != null && Number.isFinite(parsed) && parsed >= 1 ? Math.floor(parsed) : null;
      const body = { privyId, eventId: event.id, rsvpCapacity: normalizedCap, rsvpApprovalRequired: approval, rsvpClosed: closed };
      const res = await fetch('/api/events/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (res.ok) {
        const d = await res.json().catch(() => ({}));
        if (normalizedCap == null) setCapacity('');
        onSettings({ rsvpCapacity: normalizedCap, rsvpApprovalRequired: approval, rsvpClosed: closed });
        setSettingsMsg(d.warning ? `Saved ✓ — ${d.warning}` : 'Saved ✓');
      } else {
        const d = await res.json().catch(() => ({}));
        setSettingsMsg(d.error || 'Could not save settings.');
      }
    } catch {
      setSettingsMsg('Could not save settings.');
    } finally { setSavingSettings(false); }
  };

  const addQuestion = async () => {
    if (!newLabel.trim()) return;
    setBusy(true);
    try {
      const options = SELECT_TYPES.has(newType) ? newOptions.split('\n').map((s) => s.trim()).filter(Boolean) : undefined;
      const res = await fetch('/api/events/questions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ privyId, eventId: event.id, label: newLabel.trim(), type: newType, options, required: newRequired, sortOrder: questions.length }),
      });
      if (res.ok) { setNewLabel(''); setNewOptions(''); setNewRequired(false); setNewType('short_text'); loadQuestions(); }
    } finally { setBusy(false); }
  };

  const removeQuestion = async (id: string) => {
    await fetch(`/api/events/questions?id=${id}&privyId=${privyId}`, { method: 'DELETE' });
    loadQuestions();
  };

  const move = async (q: Question, dir: -1 | 1) => {
    const idx = questions.findIndex((x) => x.id === q.id);
    const swap = questions[idx + dir];
    if (!swap) return;
    await Promise.all([
      fetch('/api/events/questions', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ privyId, id: q.id, sortOrder: swap.sortOrder ?? idx + dir }) }),
      fetch('/api/events/questions', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ privyId, id: swap.id, sortOrder: q.sortOrder ?? idx }) }),
    ]);
    loadQuestions();
  };

  return (
    <div>
      {/* Settings */}
      <div className="rounded-lg border p-4 mb-8" style={{ borderColor: 'var(--border-color)' }}>
        <p className="font-mono text-[12px] uppercase tracking-[0.12em] font-bold opacity-60 mb-3" style={{ color: 'var(--foreground)' }}>Settings</p>
        <div className="mb-3">
          <label className={labelCls} style={{ color: 'var(--foreground)' }}>Capacity (blank = unlimited)</label>
          <input value={capacity} onChange={(e) => setCapacity(e.target.value)} inputMode="numeric" placeholder="∞" className={inputCls} style={fieldStyle} />
        </div>
        <label className="flex items-center gap-2 cursor-pointer mb-2 font-mono text-[13px]" style={{ color: 'var(--foreground)' }}>
          <input type="checkbox" checked={approval} onChange={(e) => setApproval(e.target.checked)} style={{ accentColor: 'var(--foreground)' }} /> Require host approval
        </label>
        <label className="flex items-center gap-2 cursor-pointer mb-4 font-mono text-[13px]" style={{ color: 'var(--foreground)' }}>
          <input type="checkbox" checked={closed} onChange={(e) => setClosed(e.target.checked)} style={{ accentColor: 'var(--foreground)' }} /> Close registration
        </label>
        <div className="flex items-center gap-3">
          <button onClick={saveSettings} disabled={savingSettings} className={btnPrimary} style={{ backgroundColor: 'var(--foreground)', color: 'var(--background)' }}>
            {savingSettings ? 'Saving…' : 'Save settings'}
          </button>
          {settingsMsg && <span className="font-mono text-[12px] opacity-70" style={{ color: 'var(--foreground)' }}>{settingsMsg}</span>}
        </div>
      </div>

      {/* Questions */}
      <p className="font-mono text-[12px] uppercase tracking-[0.12em] font-bold opacity-60 mb-3" style={{ color: 'var(--foreground)' }}>Registration questions</p>
      <div className="space-y-2 mb-4">
        {questions.length === 0 && <p className="font-mono text-[12px] opacity-40" style={{ color: 'var(--foreground)' }}>No questions yet — guests just confirm their spot.</p>}
        {questions.map((q, i) => (
          <div key={q.id} className="flex items-center gap-2 border rounded-lg px-3 py-2" style={{ borderColor: 'var(--border-color)' }}>
            <div className="flex-1 min-w-0">
              <p className="font-mono text-[13px] truncate" style={{ color: 'var(--foreground)' }}>
                {q.label}{q.required && <span style={{ color: '#FF5C34' }}> *</span>}
              </p>
              <p className="font-mono text-[11px] opacity-40" style={{ color: 'var(--foreground)' }}>
                {QUESTION_TYPES.find((t) => t.value === q.type)?.label}{q.options?.length ? ` · ${q.options.join(', ')}` : ''}
              </p>
            </div>
            <span className="flex gap-1.5 shrink-0">
              <button onClick={() => move(q, -1)} disabled={i === 0} className="font-mono text-[12px] cursor-pointer bg-transparent border-none disabled:opacity-20" style={{ color: 'var(--foreground)' }}>↑</button>
              <button onClick={() => move(q, 1)} disabled={i === questions.length - 1} className="font-mono text-[12px] cursor-pointer bg-transparent border-none disabled:opacity-20" style={{ color: 'var(--foreground)' }}>↓</button>
              <button onClick={() => removeQuestion(q.id)} className="font-mono text-[11px] uppercase underline cursor-pointer bg-transparent border-none" style={{ color: '#FF5C34' }}>Del</button>
            </span>
          </div>
        ))}
      </div>

      {/* Add question */}
      <div className="rounded-lg border p-4 space-y-2" style={{ borderColor: 'var(--border-color)' }}>
        <input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="Question (e.g. What's your dietary preference?)" className={inputCls} style={fieldStyle} />
        <div className="flex gap-2">
          <select value={newType} onChange={(e) => {
            const t = e.target.value; setNewType(t);
            const known = Object.values(DEFAULT_LABELS);
            if (DEFAULT_LABELS[t] && (!newLabel.trim() || known.includes(newLabel.trim()))) setNewLabel(DEFAULT_LABELS[t]);
            if (t === 'roles') { if (!newOptions.trim()) setNewOptions(ROLE_TAGS.join('\n')); setNewRequired(true); }
          }} className={inputCls + ' appearance-none cursor-pointer'} style={fieldStyle}>
            {QUESTION_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <label className="flex items-center gap-2 cursor-pointer font-mono text-[12px] uppercase tracking-widest shrink-0 px-2" style={{ color: 'var(--foreground)' }}>
            <input type="checkbox" checked={newRequired} onChange={(e) => setNewRequired(e.target.checked)} style={{ accentColor: 'var(--foreground)' }} /> Required
          </label>
        </div>
        {SELECT_TYPES.has(newType) && (
          <textarea value={newOptions} onChange={(e) => setNewOptions(e.target.value)} rows={3} placeholder={newType === 'roles' ? 'Role tags — one per line (guests can add their own)' : 'One option per line'} className={inputCls} style={fieldStyle} />
        )}
        <button onClick={addQuestion} disabled={busy || !newLabel.trim()} className={btnPrimary} style={{ backgroundColor: 'var(--foreground)', color: 'var(--background)' }}>
          {busy ? 'Adding…' : '+ Add question'}
        </button>
      </div>
    </div>
  );
}

/* ── Hosts tab (co-host management) ────────────────────────────────── */
// Pill toggle switch.
function Toggle({ on, onChange, disabled }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button type="button" disabled={disabled} onClick={() => onChange(!on)}
      className="relative w-11 h-6 rounded-full transition-colors shrink-0 border-none cursor-pointer disabled:opacity-50"
      style={{ backgroundColor: on ? 'var(--foreground)' : 'var(--border-color)' }} aria-pressed={on}>
      <span className="absolute top-0.5 w-5 h-5 rounded-full transition-all" style={{ backgroundColor: 'var(--background)', left: on ? '22px' : '2px' }} />
    </button>
  );
}

// Manager / Non-Manager selector row.
function AccessOption({ selected, onClick, label, desc }: { selected: boolean; onClick: () => void; label: string; desc: string }) {
  return (
    <button type="button" onClick={onClick}
      className="w-full flex items-center justify-between gap-3 px-3 py-2.5 border rounded-lg text-left cursor-pointer bg-transparent mb-2"
      style={{ borderColor: selected ? 'var(--foreground)' : 'var(--border-color)' }}>
      <div>
        <p className="font-mono text-[13px] font-bold" style={{ color: 'var(--foreground)' }}>{label}</p>
        <p className="font-mono text-[11px] opacity-50" style={{ color: 'var(--foreground)' }}>{desc}</p>
      </div>
      <span className="w-4 text-center font-bold" style={{ color: 'var(--foreground)', opacity: selected ? 1 : 0 }}>✓</span>
    </button>
  );
}

// Access-level badge shown on each host row.
function AccessBadge({ host }: { host: Host }) {
  const label = host.role === 'creator' ? 'Creator' : host.manager ? 'Manager' : 'Non-Manager';
  const color = host.role === 'creator' ? '#00b36b' : host.manager ? '#FF9F1C' : 'var(--foreground)';
  return (
    <span className="font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-md border shrink-0"
      style={{ color, borderColor: color, opacity: host.role === 'creator' || host.manager ? 1 : 0.45 }}>
      {label}
    </span>
  );
}

function HostsTab({ eventId, privyId, hosts, isCreator, reload }: { eventId: string; privyId: string; hosts: Host[]; isCreator: boolean; reload: () => void }) {
  // Presenting world ("Presented by") — set on the creator's host row.
  const { worldMemberships } = useUserProfile();
  const myWorlds = worldMemberships.map((wm) => ({ id: wm.worldId, title: wm.worldTitle }));
  const creatorHost = hosts.find((h) => h.role === 'creator');
  const [worldId, setWorldId] = useState(creatorHost?.worldId ?? '');
  const [worldMsg, setWorldMsg] = useState('');
  const [editing, setEditing] = useState<Host | null>(null);
  const [adding, setAdding] = useState(false);

  const saveWorld = async (next: string) => {
    setWorldId(next); setWorldMsg('');
    try {
      const res = await fetch('/api/events/hosts', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ privyId, eventId, worldId: next || null }),
      });
      const d = await res.json().catch(() => ({}));
      setWorldMsg(res.ok ? 'Saved ✓' : (d.error || 'Could not save'));
    } catch { setWorldMsg('Could not save'); }
  };

  return (
    <div>
      {/* Presented by — which world hosts this event (creator only) */}
      {isCreator && myWorlds.length > 0 && (
        <div className="mb-6">
          <p className="font-mono text-[12px] uppercase tracking-[0.12em] font-bold opacity-60 mb-2" style={{ color: 'var(--foreground)' }}>Presented by</p>
          <select value={worldId} onChange={(e) => saveWorld(e.target.value)} className={`${inputCls} appearance-none cursor-pointer`} style={fieldStyle}>
            <option value="">Just me (personal)</option>
            {myWorlds.map((w) => <option key={w.id} value={w.id}>{w.title}</option>)}
          </select>
          <p className="font-mono text-[11px] opacity-40 mt-1.5" style={{ color: 'var(--foreground)' }}>
            Shown as “Presented by” on the event page. {worldMsg && <span className="opacity-100">· {worldMsg}</span>}
          </p>
        </div>
      )}

      <div className="flex items-center justify-between mb-3">
        <p className="font-mono text-[12px] uppercase tracking-[0.12em] font-bold opacity-60" style={{ color: 'var(--foreground)' }}>Hosts</p>
        {isCreator && hosts.length < 6 && (
          <button onClick={() => setAdding(true)} className={btnGhost} style={fieldStyle}>+ Add Host</button>
        )}
      </div>

      <div className="space-y-2">
        {hosts.map((h) => (
          <div key={h.userId} className="flex items-center gap-3 px-3 py-2 border rounded-lg" style={{ borderColor: 'var(--border-color)' }}>
            {h.avatarUrl
              ? <img src={h.avatarUrl} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
              : <div className="w-8 h-8 rounded-full flex items-center justify-center font-mono text-[12px] font-bold shrink-0" style={{ backgroundColor: 'var(--surface-hover)', color: 'var(--foreground)' }}>{(h.name || h.username || '?')[0].toUpperCase()}</div>}
            <div className="flex-1 min-w-0">
              <p className="font-mono text-[12px] font-bold truncate" style={{ color: 'var(--foreground)' }}>
                {h.name || h.username || 'Unknown'}{h.worldTitle && <span className="font-normal opacity-50"> · {h.worldTitle}</span>}
                {!h.showOnEventPage && <span className="font-normal opacity-40"> · hidden</span>}
              </p>
              {h.email && <p className="font-mono text-[11px] opacity-40 truncate" style={{ color: 'var(--foreground)' }}>{h.email}</p>}
            </div>
            <AccessBadge host={h} />
            {isCreator && (
              <button onClick={() => setEditing(h)} title="Edit host" className="opacity-50 hover:opacity-100 transition bg-transparent border-none cursor-pointer text-[15px]" style={{ color: 'var(--foreground)' }}>✎</button>
            )}
          </div>
        ))}
      </div>

      {editing && (
        <UpdateHostModal host={editing} eventId={eventId} privyId={privyId} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />
      )}
      {adding && (
        <AddHostModal eventId={eventId} privyId={privyId} existingIds={new Set(hosts.map((h) => h.userId))} onClose={() => setAdding(false)} onAdded={() => { setAdding(false); reload(); }} />
      )}
    </div>
  );
}

// Update Host modal — show-on-page toggle + (co-hosts) access control + remove.
function UpdateHostModal({ host, eventId, privyId, onClose, onSaved }: { host: Host; eventId: string; privyId: string; onClose: () => void; onSaved: () => void }) {
  const [show, setShow] = useState(host.showOnEventPage);
  const [manager, setManager] = useState(host.manager);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const isCreatorRow = host.role === 'creator';

  const update = async () => {
    setBusy(true); setErr('');
    const res = await fetch('/api/events/hosts', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ privyId, eventId, hostUserId: host.userId, showOnEventPage: show, ...(isCreatorRow ? {} : { manager }) }),
    });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setErr(d.error || 'Could not update'); return; }
    onSaved();
  };
  const remove = async () => {
    setBusy(true); setErr('');
    const res = await fetch(`/api/events/hosts?privyId=${encodeURIComponent(privyId)}&eventId=${eventId}&hostUserId=${host.userId}`, { method: 'DELETE' });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setErr(d.error || 'Could not remove'); return; }
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-[2100] flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.6)' }} onClick={() => !busy && onClose()}>
      <div className="w-full max-w-sm rounded-2xl p-6 border" style={{ backgroundColor: 'var(--background)', borderColor: 'var(--border-color)' }} onClick={(e) => e.stopPropagation()}>
        <p className="font-mono text-[15px] font-bold mb-0.5" style={{ color: 'var(--foreground)' }}>Update Host</p>
        <p className="font-mono text-[12px] opacity-50 mb-5" style={{ color: 'var(--foreground)' }}>{host.name || host.username}{host.email ? ` (${host.email})` : ''}</p>

        <div className="flex items-center justify-between mb-5">
          <span className="font-mono text-[13px]" style={{ color: 'var(--foreground)' }}>Show on the Event Page</span>
          <Toggle on={show} onChange={setShow} disabled={busy} />
        </div>

        {!isCreatorRow && (
          <div className="mb-5">
            <p className={labelCls} style={{ color: 'var(--foreground)' }}>Access Control</p>
            <AccessOption selected={manager} onClick={() => setManager(true)} label="Manager" desc="Full manage access to the event" />
            <AccessOption selected={!manager} onClick={() => setManager(false)} label="Non-Manager" desc="No manage event access" />
          </div>
        )}

        {err && <p className="font-mono text-[12px] mb-3" style={{ color: '#FF5C34' }}>{err}</p>}

        <div className="flex gap-2">
          <button onClick={update} disabled={busy} className={`flex-1 ${btnPrimary}`} style={{ backgroundColor: 'var(--foreground)', color: 'var(--background)' }}>{busy ? '…' : 'Update'}</button>
          {!isCreatorRow && (
            <button onClick={remove} disabled={busy} className={`flex-1 ${btnGhost}`} style={{ color: '#FF5C34', borderColor: '#FF5C34' }}>Remove</button>
          )}
        </div>
      </div>
    </div>
  );
}

// Configure (Add) Host modal — search a user, set visibility + access, send invite.
function AddHostModal({ eventId, privyId, existingIds, onClose, onAdded }: { eventId: string; privyId: string; existingIds: Set<string>; onClose: () => void; onAdded: () => void }) {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<SearchUser[]>([]);
  const [selected, setSelected] = useState<SearchUser | null>(null);
  const [show, setShow] = useState(true);
  const [manager, setManager] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (selected || search.length < 2) { setResults([]); return; }
    const t = setTimeout(() => {
      fetch(`/api/events/hosts?search=${encodeURIComponent(search)}`)
        .then((r) => r.json())
        .then((d) => setResults((d.users ?? []).filter((u: SearchUser) => !existingIds.has(u.id))))
        .catch(() => {});
    }, 300);
    return () => clearTimeout(t);
  }, [search, selected, existingIds]);

  const add = async () => {
    if (!selected) return;
    setBusy(true); setMsg('');
    const res = await fetch('/api/events/hosts', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ privyId, eventId, targetUserId: selected.id, manager, showOnEventPage: show }),
    });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setMsg(d.error || 'Could not add host'); return; }
    onAdded();
  };

  return (
    <div className="fixed inset-0 z-[2100] flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.6)' }} onClick={() => !busy && onClose()}>
      <div className="w-full max-w-sm rounded-2xl p-6 border" style={{ backgroundColor: 'var(--background)', borderColor: 'var(--border-color)' }} onClick={(e) => e.stopPropagation()}>
        <p className="font-mono text-[15px] font-bold mb-5" style={{ color: 'var(--foreground)' }}>Configure Host</p>

        {!selected ? (
          <>
            <input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or username…" className={inputCls} style={fieldStyle} />
            <div className="mt-2 space-y-1 max-h-56 overflow-y-auto">
              {results.map((u) => (
                <button key={u.id} onClick={() => setSelected(u)} className="w-full flex items-center gap-3 px-2 py-2 rounded-lg hover:opacity-70 transition text-left bg-transparent border-none cursor-pointer">
                  {u.avatarUrl
                    ? <img src={u.avatarUrl} alt="" className="w-7 h-7 rounded-full object-cover" />
                    : <div className="w-7 h-7 rounded-full flex items-center justify-center font-mono text-[12px]" style={{ backgroundColor: 'var(--surface-hover)', color: 'var(--foreground)' }}>{(u.name || u.username || '?')[0].toUpperCase()}</div>}
                  <span className="font-mono text-[12px]" style={{ color: 'var(--foreground)' }}>{u.name || u.username}{u.username && <span className="opacity-40"> @{u.username}</span>}</span>
                </button>
              ))}
              {search.length >= 2 && results.length === 0 && <p className="font-mono text-[12px] opacity-40 px-2 py-2" style={{ color: 'var(--foreground)' }}>No matches.</p>}
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2.5 mb-5">
              {selected.avatarUrl
                ? <img src={selected.avatarUrl} alt="" className="w-8 h-8 rounded-full object-cover" />
                : <div className="w-8 h-8 rounded-full flex items-center justify-center font-mono text-[12px] font-bold" style={{ backgroundColor: 'var(--surface-hover)', color: 'var(--foreground)' }}>{(selected.name || selected.username || '?')[0].toUpperCase()}</div>}
              <div>
                <p className="font-mono text-[13px] font-bold" style={{ color: 'var(--foreground)' }}>{selected.name || selected.username}</p>
                {selected.username && <p className="font-mono text-[11px] opacity-40" style={{ color: 'var(--foreground)' }}>@{selected.username}</p>}
              </div>
              <button onClick={() => setSelected(null)} className="ml-auto font-mono text-[11px] uppercase underline opacity-50 hover:opacity-100 bg-transparent border-none cursor-pointer" style={{ color: 'var(--foreground)' }}>Change</button>
            </div>

            <div className="flex items-center justify-between mb-5">
              <span className="font-mono text-[13px]" style={{ color: 'var(--foreground)' }}>Show on the Event Page</span>
              <Toggle on={show} onChange={setShow} disabled={busy} />
            </div>

            <div className="mb-5">
              <p className={labelCls} style={{ color: 'var(--foreground)' }}>Access Control</p>
              <AccessOption selected={manager} onClick={() => setManager(true)} label="Manager" desc="Full manage access to the event" />
              <AccessOption selected={!manager} onClick={() => setManager(false)} label="Non-Manager" desc="No manage event access" />
            </div>

            {msg && <p className="font-mono text-[12px] mb-3" style={{ color: '#FF5C34' }}>{msg}</p>}
            <button onClick={add} disabled={busy} className={`w-full ${btnPrimary}`} style={{ backgroundColor: 'var(--foreground)', color: 'var(--background)' }}>{busy ? '…' : 'Add Host'}</button>
          </>
        )}
      </div>
    </div>
  );
}
