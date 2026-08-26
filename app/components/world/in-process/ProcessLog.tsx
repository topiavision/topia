'use client';

import { useEffect, useState } from 'react';
import { postKindGlyph, linkThumbnail } from '@/lib/processPosts';
import { ORANGE, orangeMix } from './constants';
import { PostModal } from './PostModal';
import type { EraView, LogEntry, Moment } from './types';
/* ── The log — the body of the page now, not a strip at the bottom.
 * Native posts + synced In Process moments, reverse-chron, as real
 * cards in a feed grid. Media leads where it exists; text posts get
 * room to breathe; every card names its milestone. ────────────────── */
export function ProcessLog({ era, privyId, canEdit, onChanged, filter, onClearFilter, onCompose }: {
  era: EraView; privyId: string; canEdit: boolean; onChanged: () => void;
  /** Set when a milestone is selected on the rail — the log shows only its updates. */
  filter?: { id: string; index: number; title: string } | null;
  onClearFilter?: () => void;
  /** Owner affordance: opens the composer (rendered by the caller). */
  onCompose?: () => void;
}) {
  const [moments, setMoments] = useState<Moment[]>([]);
  const [viewing, setViewing] = useState<LogEntry | null>(null);

  useEffect(() => {
    if (!era.inProcessUrl) return;
    let cancelled = false;
    fetch(`/api/in-process/timeline?artist=${encodeURIComponent(era.inProcessUrl)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled) setMoments(d?.moments ?? []); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [era.inProcessUrl]);

  const mintedUrls = new Set(era.posts.map((p) => p.mintedUrl).filter(Boolean));
  const entries: LogEntry[] = [
    ...era.posts.map((p) => ({
      id: `p-${p.id}`, postId: p.id, kind: p.kind as string | null, title: p.title,
      imageUrl: p.imageUrl ?? linkThumbnail(p.linkUrl),
      body: p.body,
      date: p.createdAt as string | null, linkUrl: p.linkUrl, mintedUrl: p.mintedUrl,
      milestoneId: p.milestoneId ?? null,
      glyph: postKindGlyph(p.kind),
    })),
    ...moments
      .filter((m) => !m.collectUrl || !mintedUrls.has(m.collectUrl))
      .map((m) => ({
        id: `m-${m.id}`, postId: null as string | null, kind: null as string | null, title: m.name || 'Moment',
        imageUrl: m.imageUrl, body: null as string | null,
        date: m.createdAt, linkUrl: null as string | null, mintedUrl: m.collectUrl,
        milestoneId: null as string | null,
        glyph: m.mime?.startsWith('audio') ? '♫' : '✦',
      })),
  ]
    .sort((a, b) => new Date(b.date ?? 0).getTime() - new Date(a.date ?? 0).getTime())
    .slice(0, 14);

  const removePost = async (postId: string) => {
    await fetch(`/api/worlds/eras/posts?postId=${postId}&privyId=${encodeURIComponent(privyId)}`, { method: 'DELETE' });
    onChanged();
  };

  // A selected milestone narrows the feed to its updates.
  const shown = filter ? entries.filter((e) => e.milestoneId === filter.id) : entries;

  if (entries.length === 0 && !canEdit && !filter) return null;

  return (
    <div>
      <div className="flex items-center justify-between gap-3 flex-wrap mb-2.5">
        <span className="font-mono text-[10px] font-bold uppercase tracking-[2px] text-ink/50 inline-flex items-center gap-2 flex-wrap">
          The log{!filter && era.inProcessUrl ? ' · synced with In Process' : ''}
          {filter && (
            <button
              onClick={onClearFilter}
              className="inline-flex items-center gap-1.5 font-mono text-[9px] font-bold uppercase tracking-[2px] px-2 py-0.5 rounded-sm cursor-pointer border bg-transparent hover:opacity-75 transition-opacity"
              style={{ color: ORANGE, borderColor: orangeMix(55) }}
              title="Show all updates"
            >
              M{String(filter.index + 1).padStart(2, '0')} · {filter.title} ✕
            </button>
          )}
        </span>
        <span className="inline-flex items-center gap-3">
          {filter ? (
            <button onClick={onClearFilter} className="font-mono text-[10px] uppercase tracking-[1px] underline cursor-pointer bg-transparent border-none text-ink/45">
              Show all ({entries.length})
            </button>
          ) : era.inProcessUrl ? (
            <a href={era.inProcessUrl} target="_blank" rel="noopener noreferrer" className="font-mono text-[10px] uppercase tracking-[1px] no-underline" style={{ color: ORANGE }}>
              Full timeline ↗
            </a>
          ) : null}
          {onCompose && (
            <button
              onClick={onCompose}
              className="font-mono text-[10px] uppercase tracking-[1px] px-3 py-1.5 rounded-sm cursor-pointer border border-ink/20 bg-transparent text-ink/60 hover:border-ink/45 hover:text-ink transition"
            >
              + Post an update
            </button>
          )}
        </span>
      </div>

      {shown.length === 0 ? (
        <p className="font-mono text-[11px] text-ink/35">
          {filter
            ? <>No updates tied to this milestone yet{canEdit ? ' — post one and it files here.' : '.'}</>
            : <>Nothing logged yet{canEdit ? ' — post the first update.' : '.'}</>}
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          {shown.map((e) => {
            const msIndex = e.milestoneId ? era.milestones.findIndex((m) => m.id === e.milestoneId) : -1;
            return (
              <button
                key={e.id}
                onClick={() => setViewing(e)}
                className="border border-ink/[0.1] rounded-lg overflow-hidden bg-transparent p-0 text-left cursor-pointer hover:border-ink/35 hover:-translate-y-0.5 transition-all flex flex-col"
              >
                {e.imageUrl && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={e.imageUrl} alt="" className="w-full h-[140px] object-cover block" loading="lazy" />
                )}
                <div className="px-3.5 py-3 flex flex-col gap-1.5 flex-grow">
                  <p className="font-mono text-[12.5px] font-bold text-ink leading-snug">{e.glyph} {e.title}</p>
                  {e.body && !e.imageUrl && (
                    <p className="font-mono text-[11px] text-ink/55 leading-relaxed line-clamp-4">{e.body}</p>
                  )}
                  {e.body && e.imageUrl && (
                    <p className="font-mono text-[11px] text-ink/55 leading-relaxed line-clamp-2">{e.body}</p>
                  )}
                  <p className="font-mono text-[9.5px] text-ink/40 mt-auto pt-1">
                    {e.date && new Date(e.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    {e.postId === null && <span className="ml-1.5">· via In Process</span>}
                    {msIndex >= 0 && <span className="ml-1.5 font-bold" style={{ color: ORANGE }}>M{String(msIndex + 1).padStart(2, '0')}</span>}
                    {!!e.mintedUrl && <span className="ml-1.5" style={{ color: ORANGE }}>⛓ collectible</span>}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {viewing && (
        <PostModal
          entry={viewing}
          milestones={era.milestones}
          canEdit={canEdit}
          onDelete={removePost}
          onClose={() => setViewing(null)}
        />
      )}
    </div>
  );
}
