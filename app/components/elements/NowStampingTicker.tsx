'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

/* ── NOW STAMPING — the liveness ticker ─────────────────────────────
 * A thin marquee of real platform happenings (new worlds, moments, new
 * passports, going-counts) proving the network moves. NTS's live-bar
 * pattern + Bandcamp's human aside. Refreshes every 60s; pauses on
 * hover; honest absence — renders nothing until items exist. */

interface TickerItem { text: string; href: string; at: string | null }

const ASIDE = '(yes, this feed is live — we can’t fake this stuff)';

function relative(at: string | null): string {
  if (!at) return '';
  const mins = Math.floor((Date.now() - new Date(at).getTime()) / 60000);
  if (mins < 1) return ' · now';
  if (mins < 60) return ` · ${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return ` · ${hours}h`;
  const days = Math.floor(hours / 24);
  return days <= 14 ? ` · ${days}d` : '';
}

export function NowStampingTicker() {
  const [items, setItems] = useState<TickerItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetch('/api/activity/ticker')
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => { if (!cancelled && d?.items) setItems(d.items); })
        .catch(() => {});
    load();
    const t = setInterval(load, 60000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  if (items.length === 0) return null;

  const run = (
    <span className="inline-flex items-center">
      {items.map((item, i) => (
        <span key={`${item.href}-${i}`} className="inline-flex items-center">
          <Link href={item.href} className="no-underline text-ink/75 hover:text-ink transition-colors">
            {item.text}
            <span className="text-ink/40">{relative(item.at)}</span>
          </Link>
          <span className="mx-3" style={{ color: 'var(--orange, #FF5C34)' }}>✦</span>
        </span>
      ))}
      <span className="text-ink/40">{ASIDE}</span>
      <span className="mx-3" style={{ color: 'var(--orange, #FF5C34)' }}>✦</span>
    </span>
  );

  return (
    <div
      className="ticker-strip border-b overflow-hidden whitespace-nowrap"
      style={{
        borderColor: 'color-mix(in srgb, var(--lime) 35%, transparent)',
        backgroundColor: 'color-mix(in srgb, var(--lime) 5%, transparent)',
      }}
      aria-label="Live activity on Topia"
    >
      <div className="ticker-track font-mono text-[10.5px] tracking-wide py-2">
        <span
          className="font-bold uppercase tracking-[2px] mr-3 pl-4 sm:pl-6"
          style={{ color: 'var(--accent-ink)' }}
        >
          ● Now stamping
        </span>
        {run}
        {/* duplicate for the seamless loop */}
        {run}
      </div>
    </div>
  );
}
