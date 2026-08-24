'use client';

import { useEffect, useState } from 'react';
import { postKindGlyph, linkThumbnail } from '@/lib/processPosts';
import { ORANGE, orangeMix } from './constants';
import { PostModal } from './PostModal';
import type { EraView, LogEntry, Moment } from './types';
/* ── Process log strip (native posts + synced moments) ─────────────── */
export function ProcessLog({ era, privyId, canEdit, onChanged, filter, onClearFilter }: {
  era: EraView; privyId: string; canEdit: boolean; onChanged: () => void;
  /** Set when a milestone is selected on the timeline — the log shows only its updates. */
  filter?: { id: string; index: number; title: string } | null;
  onClearFilter?: () => void;
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

  // A selected milestone narrows the strip to its updates.
  const shown = filter ? entries.filter((e) => e.milestoneId === filter.id) : entries;

  if (entries.length === 0 && !canEdit && !filter) return null;

  return (
    <div className="mt-5">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
        <span className="font-mono text-[10px] uppercase tracking-[2px] text-ink/40 inline-flex items-center gap-2 flex-wrap">
          Process log{!filter && era.inProcessUrl ? ' · synced with In Process' : ''}
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
        {filter ? (
          <button onClick={onClearFilter} className="font-mono text-[10px] uppercase tracking-[1px] underline cursor-pointer bg-transparent border-none text-ink/45">
            Show all ({entries.length})
          </button>
        ) : era.inProcessUrl ? (
          <a href={era.inProcessUrl} target="_blank" rel="noopener noreferrer" className="font-mono text-[10px] uppercase tracking-[1px] no-underline" style={{ color: ORANGE }}>
            Full timeline ↗
          </a>
        ) : null}
      </div>
      {shown.length === 0 ? (
        <p className="font-mono text-[11px] text-ink/35">
          {filter
            ? <>No updates tied to this milestone yet{canEdit ? ' — post one below and it files here.' : '.'}</>
            : <>Nothing logged yet — post the first update below.</>}
        </p>
      ) : (
        <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'thin' }}>
          {shown.map((e) => {
            const msIndex = e.milestoneId ? era.milestones.findIndex((m) => m.id === e.milestoneId) : -1;
            return (
              <button
                key={e.id}
                onClick={() => setViewing(e)}
                className="shrink-0 w-[132px] border border-ink/[0.08] rounded-sm overflow-hidden bg-transparent p-0 text-left cursor-pointer hover:border-ink/30 transition"
              >
                {e.imageUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={e.imageUrl} alt="" className="w-full h-[88px] object-cover block" loading="lazy" />
                ) : e.body ? (
                  <div className="w-full h-[88px] px-2 py-1.5 bg-ink/[0.03] overflow-hidden">
                    <p className="font-mono text-[9px] leading-snug text-ink/55 line-clamp-5">{e.body}</p>
                  </div>
                ) : (
                  <div className="w-full h-[88px] flex items-center justify-center bg-ink/[0.04]">
                    <span className="font-mono text-[16px] text-ink/25">{e.glyph}</span>
                  </div>
                )}
                <div className="px-2 py-1.5">
                  <p className="font-mono text-[10px] font-bold text-ink truncate">{e.glyph} {e.title}</p>
                  <p className="font-mono text-[9px] text-ink/40">
                    {e.date && new Date(e.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    {msIndex >= 0 && <span className="ml-1.5 font-bold" style={{ color: ORANGE }}>M{String(msIndex + 1).padStart(2, '0')}</span>}
                    {!!e.mintedUrl && <span className="ml-1.5" style={{ color: ORANGE }}>⛓</span>}
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
