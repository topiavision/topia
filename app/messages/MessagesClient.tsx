'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePrivy } from '@privy-io/react-auth';
import Thread, { Avatar, type OtherUser } from './Thread';
import LoginWall from '../components/LoginWall';

interface InboxItem {
  conversationId: string;
  status: 'accepted' | 'pending';
  other: OtherUser;
  preview: string;
  fromMe: boolean;
  lastMessageAt: string;
  unreadCount: number;
}
interface Inbox { primary: InboxItem[]; requests: InboxItem[]; requestCount: number; unreadTotal: number; }
interface SearchUser { id: string; name: string | null; username: string | null; avatarUrl: string | null; mutual: boolean; }

// The inbox only refreshes counts/ordering while the modal is open; the open
// thread polls itself far faster (4s), and the nav badge has its own 45s poll.
// 30s here is plenty and roughly thirds the inbox request volume.
const POLL_MS = 30000;

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

interface MessagesClientProps {
  initialConversationId?: string | null;
}

export default function MessagesClient({ initialConversationId = null }: MessagesClientProps) {
  const { authenticated, user, ready } = usePrivy();
  const [inbox, setInbox] = useState<Inbox>({ primary: [], requests: [], requestCount: 0, unreadTotal: 0 });
  // First-fetch sentinel — without it the "no conversations yet" empty copy
  // flashes while the initial inbox request is still in flight.
  const [inboxLoaded, setInboxLoaded] = useState(false);
  const [tab, setTab] = useState<'primary' | 'requests'>('primary');
  const [selected, setSelected] = useState<string | null>(initialConversationId);
  const [selectedOther, setSelectedOther] = useState<OtherUser | null>(null);
  const [composing, setComposing] = useState(false);

  const fetchInbox = useCallback(() => {
    if (!authenticated || !user) return;
    fetch(`/api/messages/conversations?privyId=${encodeURIComponent(user.id)}`)
      .then((r) => r.json())
      .then((data: Inbox) => { setInbox(data); setInboxLoaded(true); })
      .catch(() => {});
  }, [authenticated, user]);

  useEffect(() => {
    fetchInbox();
    let interval = setInterval(fetchInbox, POLL_MS);
    const onVis = () => {
      clearInterval(interval);
      if (!document.hidden) { fetchInbox(); interval = setInterval(fetchInbox, POLL_MS); }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(interval); document.removeEventListener('visibilitychange', onVis); };
  }, [fetchInbox]);

  const open = useCallback((conversationId: string, other: OtherUser | null) => {
    setSelectedOther(other);
    setSelected(conversationId);
  }, []);

  const startChat = useCallback(async (u: SearchUser) => {
    if (!user) return;
    const res = await fetch('/api/messages/conversations', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ privyId: user.id, targetUserId: u.id }),
    });
    const data = await res.json();
    if (res.ok && data.conversationId) { setComposing(false); open(data.conversationId, { id: u.id, name: u.name, username: u.username, avatarUrl: u.avatarUrl }); fetchInbox(); }
  }, [user, fetchInbox, open]);

  if (ready && !authenticated) {
    return (
      <div className="flex-1 flex items-center justify-center overflow-y-auto">
        <LoginWall message="Log in to view your messages." />
      </div>
    );
  }

  const list = tab === 'primary' ? inbox.primary : inbox.requests;

  const Row = ({ item }: { item: InboxItem }) => {
    const name = item.other.name || item.other.username || 'Unknown';
    const unread = item.unreadCount > 0;
    return (
      <button
        onClick={() => open(item.conversationId, item.other)}
        className={`w-full text-left flex items-center gap-3 px-4 py-3 border-b border-ink/[0.05] cursor-pointer transition-colors ${selected === item.conversationId ? 'bg-ink/[0.06]' : 'hover:bg-ink/[0.03]'}`}
      >
        <Avatar user={item.other} size={44} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className={`font-mono text-[13px] truncate ${unread ? 'text-ink font-bold' : 'text-ink/90'}`}>{name}</span>
            <span className="font-mono text-[10px] text-ink/35 shrink-0">{timeAgo(item.lastMessageAt)}</span>
          </div>
          <div className="flex items-center justify-between gap-2 mt-0.5">
            <span className={`font-mono text-[12px] truncate ${unread ? 'text-ink/80' : 'text-ink/40'}`}>
              {item.fromMe ? 'You: ' : ''}{item.preview || '—'}
            </span>
            {unread && <span className="w-2 h-2 rounded-full bg-lime shrink-0" />}
          </div>
        </div>
      </button>
    );
  };

  return (
    <div className="flex-1 min-h-0 flex">
      {/* List pane */}
      <div className={`w-full md:w-[360px] md:shrink-0 border-r border-ink/[0.08] flex flex-col min-h-0 ${selected ? 'hidden md:flex' : 'flex'}`}>
        <div className="px-3 pt-3 pb-2 shrink-0">
          {composing ? (
            <div className="flex items-center gap-2">
              <button onClick={() => setComposing(false)} aria-label="Back" className="text-ink/50 hover:text-ink bg-transparent border-none cursor-pointer p-1 -ml-1">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
              </button>
              <span className="font-mono text-[12px] uppercase tracking-[1px] text-ink/70">New message</span>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <div className="flex gap-1">
                <button
                  onClick={() => setTab('primary')}
                  className={`font-mono text-[11px] uppercase tracking-[1px] px-3 py-1.5 rounded-sm cursor-pointer transition ${tab === 'primary' ? 'bg-lime text-obsidian font-bold' : 'text-ink/45 hover:text-ink/80 bg-transparent'}`}
                >
                  Primary{inbox.unreadTotal > 0 ? ` (${inbox.unreadTotal})` : ''}
                </button>
                <button
                  onClick={() => setTab('requests')}
                  className={`font-mono text-[11px] uppercase tracking-[1px] px-3 py-1.5 rounded-sm cursor-pointer transition ${tab === 'requests' ? 'bg-lime text-obsidian font-bold' : 'text-ink/45 hover:text-ink/80 bg-transparent'}`}
                >
                  Requests{inbox.requestCount > 0 ? ` (${inbox.requestCount})` : ''}
                </button>
              </div>
              <button onClick={() => setComposing(true)} aria-label="New message" title="New message" className="flex items-center justify-center w-8 h-8 rounded-full border border-ink/40 text-ink hover:bg-lime hover:text-obsidian hover:border-lime bg-transparent cursor-pointer transition">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
              </button>
            </div>
          )}
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto" style={{ WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain' }}>
          {composing ? (
            <ComposeSearch privyId={user?.id ?? ''} onPick={startChat} />
          ) : list.length === 0 ? (
            !inboxLoaded ? (
              <p className="font-mono text-[11px] uppercase tracking-[2px] text-ink/30 text-center mt-10 px-4">loading…</p>
            ) : tab === 'primary' ? (
              <div className="text-center mt-10 px-4">
                <p className="font-mono text-[11px] uppercase tracking-[2px] text-ink/30 m-0">no conversations yet</p>
                <p className="font-mono text-[11px] mt-3 m-0">
                  <Link href="/topians" className="text-[var(--accent-ink)] no-underline hover:underline">find someone on Topians →</Link>
                </p>
                <p className="font-mono text-[10px] text-ink/35 mt-1.5 m-0">or start one with the ✎ button above</p>
              </div>
            ) : (
              <div className="text-center mt-10 px-4">
                <p className="font-mono text-[11px] uppercase tracking-[2px] text-ink/30 m-0">no requests</p>
                <p className="font-mono text-[10px] text-ink/35 mt-2 m-0">messages from people you&apos;re not connected with land here.</p>
              </div>
            )
          ) : (
            list.map((item) => <Row key={item.conversationId} item={item} />)
          )}
        </div>
      </div>

      {/* Thread pane */}
      <div className={`flex-1 min-h-0 ${selected ? 'flex' : 'hidden md:flex'} flex-col`}>
        {selected && user ? (
          <Thread
            key={selected}
            conversationId={selected}
            privyId={user.id}
            initialOther={selectedOther}
            onBack={() => setSelected(null)}
            onActivity={fetchInbox}
          />
        ) : (
          <div className="flex-1 hidden md:flex items-center justify-center">
            <p className="font-mono text-[11px] uppercase tracking-[2px] text-ink/25">select a conversation</p>
          </div>
        )}
      </div>
    </div>
  );
}

// Handle/name search to start a new chat. Non-mutual picks become a request.
function ComposeSearch({ privyId, onPick }: { privyId: string; onPick: (user: SearchUser) => void }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SearchUser[]>([]);
  const [loading, setLoading] = useState(false);

  const term = q.trim().replace(/^@+/, ''); // people type "@handle"

  useEffect(() => {
    if (term.length < 2) { setResults([]); setLoading(false); return; }
    setLoading(true);
    const t = setTimeout(() => {
      fetch(`/api/messages/search?privyId=${encodeURIComponent(privyId)}&q=${encodeURIComponent(term)}`)
        .then((r) => r.json())
        .then((d) => setResults(d.users ?? []))
        .catch(() => {})
        .finally(() => setLoading(false));
    }, 200);
    return () => clearTimeout(t);
  }, [term, privyId]);

  return (
    <div className="flex flex-col">
      <div className="px-3 pb-2 pt-1">
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="search a handle or name…"
          className="w-full bg-transparent border border-ink/15 focus:border-ink/40 font-mono text-[13px] text-ink placeholder:text-ink/25 px-3 py-2 rounded-sm outline-none transition-colors"
        />
        <p className="font-mono text-[10px] leading-snug text-ink/35 mt-2">
          If you aren&apos;t connected with each other, your message is sent as a <span className="text-ink/55">request</span>.
        </p>
      </div>
      {term.length < 2 ? null : loading && results.length === 0 ? (
        <p className="font-mono text-[11px] uppercase tracking-[2px] text-ink/30 text-center mt-8">searching…</p>
      ) : results.length === 0 ? (
        <p className="font-mono text-[11px] uppercase tracking-[2px] text-ink/30 text-center mt-8">no people found</p>
      ) : (
        results.map((u) => (
          <button key={u.id} onClick={() => onPick(u)} className="w-full text-left flex items-center gap-3 px-4 py-2.5 hover:bg-ink/[0.03] cursor-pointer transition-colors">
            <Avatar user={u} size={38} />
            <div className="flex-1 min-w-0">
              <div className="font-mono text-[13px] text-ink truncate leading-tight">{u.name || u.username}</div>
              {u.username && <div className="font-mono text-[11px] text-ink/40 truncate leading-tight mt-0.5">@{u.username}</div>}
            </div>
            <span className={`font-mono text-[9px] uppercase tracking-[1px] px-1.5 py-0.5 rounded-sm shrink-0 ${u.mutual ? 'bg-lime/20 text-lime' : 'border border-ink/15 text-ink/40'}`}>
              {u.mutual ? 'Connection' : 'Request'}
            </span>
          </button>
        ))
      )}
    </div>
  );
}
