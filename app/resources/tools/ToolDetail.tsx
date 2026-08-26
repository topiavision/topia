'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePrivy } from '@privy-io/react-auth';
import { faviconUrl } from './favicon';
import { CheckIcon, StarIcon } from '../../components/ui/Icons';
import CommentSection from '../../components/CommentSection';

export interface ToolDetailData {
  tool: {
    id: string;
    name: string;
    slug: string;
    category: string | null;
    description: string | null;
    pricing: string | null;
    url: string | null;
    featured: boolean | null;
  };
  users: { id: string; username: string | null; name: string | null; avatarUrl: string | null }[];
  worlds: { id: string; title: string; slug: string; category: string | null; imageUrl: string | null }[];
  related?: { slug: string; name: string; url: string | null; category: string | null; score: number }[];
  alternatives?: { slug: string; name: string; url: string | null; category: string | null; pricing: string | null }[];
}

interface Props {
  data: ToolDetailData;
  /** When true, render with no max-height/scroll — for the full-page route. */
  fullPage?: boolean;
  /** Optional close handler for modal usage. */
  onClose?: () => void;
  /** Optional expand-to-page handler. */
  onExpand?: () => void;
}

function parseCategories(s: string | null): string[] {
  if (!s) return [];
  return s.split(',').map((c) => c.trim()).filter(Boolean);
}

export default function ToolDetail({ data, fullPage, onClose, onExpand }: Props) {
  const { tool, users, worlds, related = [], alternatives = [] } = data;
  const { authenticated, user, ready, login } = usePrivy();
  const [saved, setSaved] = useState(false);
  const [using, setUsing] = useState(false);
  const [savePending, setSavePending] = useState(false);
  const [usePending, setUsePending] = useState(false);
  const favicon = faviconUrl(tool.url, 128);
  const categories = parseCategories(tool.category);

  // Initial saved/using state
  useEffect(() => {
    if (!authenticated || !user?.id) return;
    fetch(`/api/tools/save?privyId=${encodeURIComponent(user.id)}`)
      .then((r) => r.json())
      .then(({ savedToolSlugs, toolSlugs }) => {
        setSaved(Array.isArray(savedToolSlugs) && savedToolSlugs.includes(tool.slug));
        setUsing(Array.isArray(toolSlugs) && toolSlugs.includes(tool.slug));
      })
      .catch(console.error);
  }, [authenticated, user?.id, tool.slug]);

  async function toggle(target: 'saved' | 'using') {
    // Logged-out tap = open the login modal (the buttons stay visible so the
    // action doesn't vanish for signed-out visitors).
    if (!authenticated || !user?.id) { if (ready) login(); return; }
    const isUsing = target === 'using';
    const currentlyOn = isUsing ? using : saved;
    if (isUsing ? usePending : savePending) return;
    if (isUsing) setUsePending(true); else setSavePending(true);
    if (isUsing) setUsing(!currentlyOn); else setSaved(!currentlyOn); // optimistic
    try {
      const res = await fetch('/api/tools/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          privyId: user.id,
          slug: tool.slug,
          action: currentlyOn ? 'unsave' : 'save',
          target,
        }),
      });
      const json = await res.json();
      if (isUsing) setUsing(Boolean(json?.enabled));
      else setSaved(Boolean(json?.enabled));
    } catch (err) {
      console.error(`${target} toggle failed`, err);
      if (isUsing) setUsing(currentlyOn); else setSaved(currentlyOn); // revert
    } finally {
      if (isUsing) setUsePending(false); else setSavePending(false);
    }
  }

  return (
    <div className={`bg-[var(--page-bg)] text-ink ${fullPage ? '' : 'rounded-lg border border-ink/[0.08] overflow-hidden'}`}>
      {/* Top accent strip */}
      <div className="bg-lime px-4 py-2 flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-[2px] text-obsidian/60">topia://tools</span>
        <div className="flex items-center gap-3">
          {onExpand && (
            <button
              onClick={onExpand}
              className="font-mono text-[10px] uppercase tracking-[2px] text-obsidian/70 hover:text-obsidian transition bg-transparent border-none cursor-pointer"
              title="Open in full page"
            >
              ⛶ expand
            </button>
          )}
          {onClose && (
            <button
              onClick={onClose}
              className="font-mono text-[14px] text-obsidian/70 hover:text-obsidian transition bg-transparent border-none cursor-pointer leading-none w-5 h-5 flex items-center justify-center"
              title="Close"
              aria-label="Close"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* Header: favicon + name + categories + save */}
      <div className="px-5 md:px-7 py-5 md:py-6 border-b border-ink/[0.06] flex items-start gap-4 md:gap-5">
        <div className="shrink-0 w-12 h-12 md:w-16 md:h-16 rounded-md border border-ink/15 overflow-hidden flex items-center justify-center bg-ink/[0.04]">
          {favicon ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={favicon} alt="" width={64} height={64} loading="lazy" className="w-full h-full object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          ) : (
            <span className="font-basement text-2xl text-ink/30">{tool.name[0]?.toUpperCase()}</span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="font-basement font-black text-[clamp(22px,3vw,32px)] uppercase leading-[0.95] text-ink">{tool.name}</h1>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            {tool.pricing && (
              <span className="font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 border border-ink/15 text-ink/60 rounded-sm">
                {tool.pricing}
              </span>
            )}
            {categories.map((cat) => (
              <span
                key={cat}
                className="font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 border border-[var(--accent-ink)]/30 text-[var(--accent-ink)]/80 rounded-sm"
              >
                {cat}
              </span>
            ))}
          </div>
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          {/* Visible logged-out too — a tap routes through toggle(), which
              opens the login modal for signed-out visitors. */}
              <button
                onClick={() => toggle('using')}
                disabled={usePending}
                className={`inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[2px] px-3 py-1.5 rounded-sm border transition cursor-pointer ${
                  using
                    ? 'bg-ink text-[var(--page-bg)] border-ink'
                    : 'bg-transparent border-ink/30 text-ink/70 hover:border-ink/70 hover:text-ink'
                }`}
                title={using ? "I use this — click to remove from my profile" : 'Add to my toolkit (shows on my profile)'}
              >
                {usePending ? '…' : using ? (<><CheckIcon size={10} /> in my kit</>) : '+ I use this'}
              </button>
              <button
                onClick={() => toggle('saved')}
                disabled={savePending}
                className={`inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[2px] px-3 py-1.5 rounded-sm border transition cursor-pointer ${
                  saved
                    ? 'bg-lime border-lime text-obsidian'
                    : 'bg-transparent border-ink/30 text-ink/70 hover:border-ink/70 hover:text-ink'
                }`}
                title={saved ? 'Saved — click to remove' : 'Save to your dashboard'}
              >
                {savePending ? '…' : saved ? (<><StarIcon size={10} filled /> saved</>) : (<><StarIcon size={10} filled={false} /> save</>)}
              </button>
        </div>
      </div>

      {/* Body */}
      <div className={`px-5 md:px-7 py-5 md:py-6 grid grid-cols-1 md:grid-cols-3 gap-x-8 gap-y-6 ${fullPage ? '' : 'max-h-[60vh] overflow-y-auto'}`}>
        {/* Left: description + visit */}
        <div className="md:col-span-2 min-w-0">
          <span className="font-mono text-[10px] uppercase tracking-[2px] text-ink/30 block mb-2">about</span>
          {tool.description ? (
            <p className="font-zirkon text-[14px] text-ink/80 leading-relaxed">{tool.description}</p>
          ) : (
            <p className="font-mono text-[11px] uppercase tracking-wider text-ink/25">no description yet</p>
          )}

          {tool.url && (
            <div className="mt-5">
              <a
                href={tool.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 font-mono text-[12px] uppercase tracking-[2px] text-obsidian bg-lime hover:opacity-90 px-4 py-2 rounded-sm no-underline transition"
              >
                visit site →
              </a>
            </div>
          )}
        </div>

        {/* Right: stats */}
        <div className="min-w-0">
          <span className="font-mono text-[10px] uppercase tracking-[2px] text-ink/30 block mb-2">usage</span>
          <div className="grid grid-cols-2 gap-3">
            <div className="border border-ink/10 rounded-sm p-3">
              <div className="font-mono text-[22px] text-ink leading-none font-bold">{users.length}</div>
              <div className="font-mono text-[10px] uppercase tracking-[2px] text-ink/30 mt-1">creators</div>
            </div>
            <div className="border border-ink/10 rounded-sm p-3">
              <div className="font-mono text-[22px] text-ink leading-none font-bold">{worlds.length}</div>
              <div className="font-mono text-[10px] uppercase tracking-[2px] text-ink/30 mt-1">worlds</div>
            </div>
          </div>
        </div>

        {/* Users */}
        <div className="md:col-span-3">
          <span className="font-mono text-[10px] uppercase tracking-[2px] text-ink/30 block mb-3">creators using {tool.name}</span>
          {users.length === 0 ? (
            <p className="font-mono text-[11px] uppercase tracking-wider text-ink/25">no one yet — be the first</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {users.slice(0, 24).map((u) => (
                u.username ? (
                  <Link
                    key={u.id}
                    href={`/profile/${u.username}`}
                    className="flex items-center gap-2 border border-ink/10 hover:border-ink/40 px-2.5 py-1.5 rounded-sm transition no-underline"
                  >
                    <span className="w-6 h-6 rounded-full overflow-hidden bg-ink/5 shrink-0 flex items-center justify-center">
                      {u.avatarUrl ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img src={u.avatarUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <span className="font-basement text-[10px] text-ink/50">{(u.name || u.username || '?')[0]?.toUpperCase()}</span>
                      )}
                    </span>
                    <span className="font-mono text-[11px] text-ink/70">@{u.username}</span>
                  </Link>
                ) : null
              ))}
              {users.length > 24 && (
                <span className="font-mono text-[11px] uppercase tracking-wider text-ink/30 self-center">+{users.length - 24} more</span>
              )}
            </div>
          )}
        </div>

        {/* Worlds */}
        <div className="md:col-span-3">
          <span className="font-mono text-[10px] uppercase tracking-[2px] text-ink/30 block mb-3">worlds using {tool.name}</span>
          {worlds.length === 0 ? (
            <p className="font-mono text-[11px] uppercase tracking-wider text-ink/25">no worlds use this tool yet</p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {worlds.slice(0, 9).map((w) => (
                <Link
                  key={w.id}
                  href={`/worlds/${w.slug}`}
                  className="flex items-center gap-3 border border-ink/10 hover:border-ink/40 px-3 py-2 rounded-sm transition no-underline"
                >
                  {w.imageUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={w.imageUrl} alt="" className="w-10 h-10 rounded-sm object-cover shrink-0" />
                  ) : (
                    <span className="w-10 h-10 rounded-sm bg-ink/[0.04] shrink-0" />
                  )}
                  <div className="min-w-0">
                    <div className="font-mono text-[12px] uppercase font-bold text-ink truncate">{w.title}</div>
                    {w.category && <div className="font-mono text-[10px] text-ink/30 truncate">{w.category}</div>}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Reviews + comments — only kit-owners can post */}
        <div className="md:col-span-3">
          <CommentSection
            endpoint="/api/tools/comments"
            slug={tool.slug}
            kind="tool"
            title="Reviews"
            gateHint={`Add ${tool.name} to your kit on the "I use this" button above to leave a review.`}
          />
        </div>

        {/* Related tools (co-occurrence) */}
        {related.length > 0 && (
          <div className="md:col-span-3">
            <span className="font-mono text-[10px] uppercase tracking-[2px] text-ink/30 block mb-3">
              creators using {tool.name} also use
            </span>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {related.map((r) => {
                const rFavicon = faviconUrl(r.url, 64);
                return (
                  <Link
                    key={r.slug}
                    href={`/resources/tools/${r.slug}`}
                    className="flex items-center gap-3 border border-ink/10 hover:border-[var(--accent-ink)]/40 px-3 py-2 rounded-sm transition no-underline"
                  >
                    <span className="w-8 h-8 shrink-0 rounded-sm border border-ink/10 bg-ink/[0.04] overflow-hidden flex items-center justify-center">
                      {rFavicon ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img src={rFavicon} alt="" className="w-full h-full object-contain" />
                      ) : (
                        <span className="font-basement text-sm text-ink/30">{r.name[0]?.toUpperCase()}</span>
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="font-mono text-[12px] uppercase font-bold text-ink truncate">{r.name}</div>
                      <div className="font-mono text-[10px] text-ink/30 truncate">{r.score} shared creator{r.score !== 1 ? 's' : ''}</div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* Alternatives — same category, complements the usage-based list */}
        {alternatives.length > 0 && (
          <div className="md:col-span-3">
            <span className="font-mono text-[10px] uppercase tracking-[2px] text-ink/30 block mb-3">
              alternatives to {tool.name}
            </span>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {alternatives.map((a) => {
                const aFavicon = faviconUrl(a.url, 64);
                return (
                  <Link
                    key={a.slug}
                    href={`/resources/tools/${a.slug}`}
                    className="flex items-center gap-3 border border-ink/10 hover:border-[var(--accent-ink)]/40 px-3 py-2 rounded-sm transition no-underline"
                  >
                    <span className="w-8 h-8 shrink-0 rounded-sm border border-ink/10 bg-ink/[0.04] overflow-hidden flex items-center justify-center">
                      {aFavicon ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img src={aFavicon} alt="" width={32} height={32} loading="lazy" className="w-full h-full object-contain" />
                      ) : (
                        <span className="font-basement text-sm text-ink/30">{a.name[0]?.toUpperCase()}</span>
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="font-mono text-[12px] uppercase font-bold text-ink truncate">{a.name}</div>
                      <div className="font-mono text-[10px] text-ink/30 truncate">{a.pricing || a.category || ''}</div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
