'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePrivy } from '@privy-io/react-auth';
import dynamic from 'next/dynamic';
import { type PickedGif } from './GiphyPicker';
import { gifDisplayUrl } from '@/lib/giphy';
import ConfirmDialog from './ConfirmDialog';
import { StarIcon } from './ui/Icons';
import ReactionBar, { type ReactionSummary } from './ReactionBar';

// Giphy SDK loads on demand (only when the picker opens).
const GiphyPicker = dynamic(() => import('./GiphyPicker'), { ssr: false });

export interface CommentItem {
  id: string;
  body: string | null;
  rating?: number | null;
  imageUrl?: string | null;
  giphyId?: string | null;
  createdAt: string;
  authorId: string;
  authorName: string | null;
  authorUsername: string | null;
  authorAvatarUrl: string | null;
  isHost?: boolean;
  reactions?: ReactionSummary[];
  replies?: CommentItem[];
}

interface Props {
  endpoint: string;
  slug: string;
  kind: 'tool' | 'event';
  gateHint: string;
  title?: string;
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function CommentSection({ endpoint, slug, kind, gateHint, title }: Props) {
  const { user, authenticated } = usePrivy();
  const [items, setItems] = useState<CommentItem[]>([]);
  const [canPost, setCanPost] = useState(false);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [viewerIsHost, setViewerIsHost] = useState(false);
  const [avg, setAvg] = useState<number | null>(null);
  const [ratingCount, setRatingCount] = useState(0);
  const [loading, setLoading] = useState(true);

  // Top-level composer state
  const [body, setBody] = useState('');
  const [rating, setRating] = useState<number>(0);
  const [hoverRating, setHoverRating] = useState<number>(0);
  const [gif, setGif] = useState<PickedGif | null>(null);
  const [gifOpen, setGifOpen] = useState(false);
  const [media, setMedia] = useState<{ url: string; isVideo: boolean } | null>(null);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Per-thread reply state — keyed by parent comment id
  const [replyOpenFor, setReplyOpenFor] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState('');
  const [replyGif, setReplyGif] = useState<PickedGif | null>(null);
  const [replyGifOpen, setReplyGifOpen] = useState(false);
  const [replyMedia, setReplyMedia] = useState<{ url: string; isVideo: boolean } | null>(null);
  const [replyUploading, setReplyUploading] = useState(false);
  const [replySubmitting, setReplySubmitting] = useState(false);

  const targetType = kind === 'tool' ? 'tool_comment' : 'event_comment';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ slug });
      if (user?.id) params.set('viewerPrivyId', user.id);
      const res = await fetch(`${endpoint}?${params}`);
      const json = await res.json();
      setItems(json.comments ?? []);
      setCanPost(!!json.canPost);
      setViewerId(json.viewerId ?? null);
      setViewerIsHost(!!json.viewerIsHost);
      if (kind === 'tool') {
        setAvg(json.averageRating ?? null);
        setRatingCount(json.ratingCount ?? 0);
      }
    } catch (err) {
      console.error('comments load failed', err);
    } finally {
      setLoading(false);
    }
  }, [endpoint, slug, kind, user?.id]);

  useEffect(() => { load(); }, [load]);

  // Upload a photo or video (event comments) to blob storage and attach it.
  async function uploadMedia(file: File) {
    setError(null); setUploadingMedia(true);
    try {
      const fd = new FormData(); fd.append('file', file); fd.append('privyId', user?.id ?? '');
      const res = await fetch('/api/events/cover-upload', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok || !json.ok) { setError(json.error || 'Upload failed'); return; }
      setGif(null);
      setMedia({ url: json.url as string, isVideo: file.type.startsWith('video/') });
    } catch {
      setError('Upload failed');
    } finally { setUploadingMedia(false); }
  }

  async function submit() {
    if (!user?.id) return;
    if (!body.trim() && !gif && !media && (kind !== 'tool' || rating === 0)) {
      setError('Add something — a comment, a rating, a photo or a gif');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = { privyId: user.id, slug };
      if (body.trim()) payload.body = body.trim();
      if (kind === 'tool' && rating > 0) payload.rating = rating;
      if (kind === 'event' && media) {
        payload.imageUrl = media.url;
      } else if (kind === 'event' && gif) {
        payload.imageUrl = gif.url;
        payload.giphyId = gif.id;
      }
      const res = await fetch(endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error || 'Failed to post'); return; }
      setBody(''); setGif(null); setMedia(null); setRating(0);
      await load();
    } catch (err) {
      console.error('comment post failed', err);
      setError('Network error');
    } finally {
      setSubmitting(false);
    }
  }

  async function uploadReplyMedia(file: File) {
    setError(null); setReplyUploading(true);
    try {
      const fd = new FormData(); fd.append('file', file); fd.append('privyId', user?.id ?? '');
      const res = await fetch('/api/events/cover-upload', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok || !json.ok) { setError(json.error || 'Upload failed'); return; }
      setReplyGif(null);
      setReplyMedia({ url: json.url as string, isVideo: file.type.startsWith('video/') });
    } catch {
      setError('Upload failed');
    } finally { setReplyUploading(false); }
  }

  async function submitReply(parentId: string) {
    if (!user?.id) return;
    if (!replyBody.trim() && !replyGif && !replyMedia) return;
    setReplySubmitting(true);
    try {
      const payload: Record<string, unknown> = { privyId: user.id, slug, parentId };
      if (replyBody.trim()) payload.body = replyBody.trim();
      if (kind === 'event' && replyMedia) {
        payload.imageUrl = replyMedia.url;
      } else if (kind === 'event' && replyGif) {
        payload.imageUrl = replyGif.url;
        payload.giphyId = replyGif.id;
      }
      const res = await fetch(endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error || 'Failed to reply'); return; }
      setReplyBody(''); setReplyGif(null); setReplyMedia(null); setReplyOpenFor(null);
      await load();
    } finally {
      setReplySubmitting(false);
    }
  }

  async function handleDelete(commentId: string) {
    if (!user?.id) return;
    setConfirmDeleteId(null);
    try {
      const res = await fetch(`${endpoint}?id=${commentId}&privyId=${encodeURIComponent(user.id)}`, { method: 'DELETE' });
      if (res.ok) await load();
    } catch (err) {
      console.error('delete comment failed', err);
    }
  }

  function CommentRow({ c, isReply = false }: { c: CommentItem; isReply?: boolean }) {
    // Authors can delete their own comment; event hosts can delete any.
    const canDelete = !!viewerId && (c.authorId === viewerId || viewerIsHost);
    return (
      <div className={`flex items-start gap-3 ${isReply ? 'pl-3 border-l-2 border-ink/[0.06]' : 'border border-ink/[0.06] rounded-md p-3 bg-ink/[0.015]'}`}>
        {c.authorAvatarUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={c.authorAvatarUrl} alt="" className={`${isReply ? 'w-6 h-6' : 'w-7 h-7'} rounded-full object-cover shrink-0`} />
        ) : (
          <div className={`${isReply ? 'w-6 h-6' : 'w-7 h-7'} rounded-full bg-ink/10 flex items-center justify-center shrink-0`}>
            <span className="font-basement text-[12px] text-ink/50">{(c.authorName || c.authorUsername || '?')[0]?.toUpperCase()}</span>
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            {c.authorUsername ? (
              <Link href={`/profile/${c.authorUsername}`} className="font-mono text-[11px] text-ink font-bold no-underline hover:text-[var(--accent-ink)]">@{c.authorUsername}</Link>
            ) : (
              <span className="font-mono text-[11px] text-ink/60 font-bold">{c.authorName || 'anon'}</span>
            )}
            {c.isHost && (
              <span className="font-mono text-[8px] uppercase tracking-[2px] bg-lime text-obsidian px-1.5 py-0.5 rounded-sm font-bold leading-none">Host</span>
            )}
            {kind === 'tool' && c.rating != null && !isReply && (
              <span className="flex items-center gap-0.5 text-[var(--accent-ink)]">
                {[1, 2, 3, 4, 5].map((n) => (
                  <StarIcon key={n} size={9} filled={n <= (c.rating ?? 0)} className={n <= (c.rating ?? 0) ? 'text-[var(--accent-ink)]' : 'text-ink/15'} />
                ))}
              </span>
            )}
            <span className="font-mono text-[9px] text-ink/25 ml-auto">{timeAgo(c.createdAt)}</span>
          </div>
          {c.body && (
            <p className="font-zirkon text-[13px] text-ink/75 leading-relaxed whitespace-pre-wrap mt-1">{c.body}</p>
          )}
          {c.imageUrl && (
            <div className="mt-2">
              {/\.(mp4|mov|webm)(\?|#|$)/i.test(c.imageUrl) ? (
                <video src={c.imageUrl} className="rounded-sm border border-ink/10 max-w-[260px]" controls muted playsInline preload="metadata" />
              ) : (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={gifDisplayUrl(c.giphyId, c.imageUrl)!} alt={c.body || 'attachment'} loading="lazy" className="rounded-sm border border-ink/10 max-w-[220px]" />
              )}
              {c.giphyId && <span className="block font-mono text-[8px] uppercase tracking-[2px] text-ink/20 mt-0.5">via giphy</span>}
            </div>
          )}

          {/* Reactions */}
          <ReactionBar
            targetType={targetType}
            targetId={c.id}
            initial={c.reactions ?? []}
            size={isReply ? 'xs' : 'sm'}
          />

          {/* Reply trigger (only on top-level) */}
          {!isReply && authenticated && canPost && (
            <button
              onClick={() => {
                setReplyOpenFor(replyOpenFor === c.id ? null : c.id);
                setReplyBody('');
                setReplyGif(null);
                setReplyMedia(null);
              }}
              className="font-mono text-[10px] uppercase tracking-[2px] text-ink/40 hover:text-ink bg-transparent border-none cursor-pointer mt-1.5 px-0"
            >
              {replyOpenFor === c.id ? '× cancel' : '↪ reply'}
            </button>
          )}

          {/* Delete — author (own comment) or event host (any comment) */}
          {canDelete && (
            <button
              onClick={() => setConfirmDeleteId(c.id)}
              className="font-mono text-[10px] uppercase tracking-[2px] text-ink/30 hover:text-[#FF5C34] bg-transparent border-none cursor-pointer mt-1.5 px-0 ml-3"
              title={c.authorId === viewerId ? 'Delete your comment' : 'Delete (host)'}
            >
              🗑 delete
            </button>
          )}

          {/* Inline reply composer */}
          {!isReply && replyOpenFor === c.id && (
            <div className="mt-2 border border-ink/15 focus-within:border-[var(--accent-ink)]/40 rounded-md p-2.5 bg-ink/[0.02] transition-colors">
              <textarea
                value={replyBody}
                onChange={(e) => setReplyBody(e.target.value)}
                placeholder={`Replying to @${c.authorUsername || 'them'}…`}
                rows={2}
                maxLength={1000}
                className="w-full bg-transparent border-none outline-none font-mono text-[12px] text-ink placeholder:text-ink/25 resize-none"
              />
              {replyGif && (
                <div className="relative inline-block mt-1.5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={replyGif.previewUrl} alt={replyGif.title} className="rounded-sm border border-ink/15 max-w-[120px]" />
                  <button onClick={() => setReplyGif(null)} className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-obsidian border border-bone/20 text-bone text-[10px] cursor-pointer leading-none flex items-center justify-center" aria-label="Remove gif">×</button>
                </div>
              )}
              {replyMedia && (
                <div className="relative inline-block mt-1.5">
                  {replyMedia.isVideo ? (
                    <video src={replyMedia.url} className="rounded-sm border border-ink/15 max-w-[150px]" muted playsInline controls />
                  ) : (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={replyMedia.url} alt="upload" className="rounded-sm border border-ink/15 max-w-[150px]" />
                  )}
                  <button onClick={() => setReplyMedia(null)} className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#1a1a1a] border border-white/20 text-white text-[10px] cursor-pointer leading-none flex items-center justify-center" aria-label="Remove media">×</button>
                </div>
              )}
              <div className="flex items-center gap-1.5 mt-1.5 pt-1.5 border-t border-ink/[0.05]">
                {kind === 'event' && (
                  <>
                    <label className={`font-mono text-[9px] uppercase tracking-[2px] px-1.5 py-0.5 bg-transparent border border-ink/15 text-ink/60 hover:text-ink hover:border-[var(--accent-ink)]/40 rounded-sm transition ${replyUploading ? 'opacity-50 cursor-wait' : 'cursor-pointer'}`}>
                      {replyUploading ? '…' : '+ photo / video'}
                      <input type="file" accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/quicktime,video/webm" className="hidden" disabled={replyUploading} onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadReplyMedia(f); e.currentTarget.value = ''; }} />
                    </label>
                    <button
                      type="button"
                      onClick={() => setReplyGifOpen(true)}
                      className="font-mono text-[9px] uppercase tracking-[2px] px-1.5 py-0.5 bg-transparent border border-ink/15 text-ink/60 hover:text-ink hover:border-[var(--accent-ink)]/40 rounded-sm transition cursor-pointer"
                    >
                      + GIF
                    </button>
                  </>
                )}
                <button
                  onClick={() => submitReply(c.id)}
                  disabled={replySubmitting || replyUploading || (!replyBody.trim() && !replyGif && !replyMedia)}
                  className="ml-auto font-mono text-[10px] uppercase tracking-[2px] px-2.5 py-1 bg-lime text-obsidian rounded-sm disabled:opacity-50 hover:opacity-90 transition cursor-pointer border-none"
                >
                  {replySubmitting ? '…' : 'reply →'}
                </button>
              </div>
            </div>
          )}

          {/* Nested replies */}
          {!isReply && c.replies && c.replies.length > 0 && (
            <div className="mt-3 space-y-2.5">
              {c.replies.map((r) => (
                <CommentRow key={r.id} c={r} isReply />
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="border-t border-ink/[0.06] pt-5 mt-5">
      <div className="flex items-baseline justify-between mb-3">
        <span className="font-mono text-[11px] uppercase tracking-[2px] text-ink/50">
          {title ?? (kind === 'tool' ? 'Reviews' : 'Comments')}
          {!loading && ` · ${items.length}`}
        </span>
        {kind === 'tool' && avg != null && (
          <span className="font-mono text-[11px] text-ink/60 flex items-center gap-1">
            <StarIcon size={11} filled /> {avg.toFixed(1)}{' '}
            <span className="text-ink/30">({ratingCount})</span>
          </span>
        )}
      </div>

      {/* Top-level composer */}
      {!authenticated ? (
        <p className="font-mono text-[10px] uppercase tracking-[2px] text-ink/30 py-2">log in to leave a comment</p>
      ) : !canPost ? (
        <p className="font-mono text-[10px] uppercase tracking-[2px] text-ink/30 py-2">{gateHint}</p>
      ) : (
        <div className="border border-ink/10 hover:border-ink/20 focus-within:border-[var(--accent-ink)]/40 rounded-md p-3 mb-4 transition-colors bg-ink/[0.02]">
          {kind === 'tool' && (
            <div className="flex items-center gap-1.5 mb-2.5">
              <span className="font-mono text-[10px] uppercase tracking-[2px] text-ink/40 mr-1">rating</span>
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setRating(rating === n ? 0 : n)}
                  onMouseEnter={() => setHoverRating(n)}
                  onMouseLeave={() => setHoverRating(0)}
                  className="bg-transparent border-none cursor-pointer text-ink/30 hover:text-[var(--accent-ink)] transition p-0"
                  title={`${n} of 5`}
                >
                  <StarIcon size={16} filled={n <= (hoverRating || rating)} className={n <= (hoverRating || rating) ? 'text-[var(--accent-ink)]' : 'text-ink/25'} />
                </button>
              ))}
              {rating > 0 && (
                <button onClick={() => setRating(0)} className="font-mono text-[9px] uppercase tracking-[2px] text-ink/30 hover:text-ink bg-transparent border-none cursor-pointer ml-2">
                  clear
                </button>
              )}
            </div>
          )}

          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={kind === 'tool' ? 'share what you think — pros, cons, workflow…' : 'what are you thinking?'}
            rows={2}
            maxLength={1500}
            className="w-full bg-transparent border-none outline-none font-mono text-[13px] text-ink placeholder:text-ink/25 resize-none"
          />

          {gif && (
            <div className="relative inline-block mt-1.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={gif.previewUrl} alt={gif.title} className="rounded-sm border border-ink/15 max-w-[140px]" />
              <button onClick={() => setGif(null)} className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-obsidian border border-bone/20 text-bone text-[12px] cursor-pointer leading-none flex items-center justify-center" aria-label="Remove gif">×</button>
            </div>
          )}

          {media && (
            <div className="relative inline-block mt-1.5">
              {media.isVideo ? (
                <video src={media.url} className="rounded-sm border border-ink/15 max-w-[180px]" muted playsInline controls />
              ) : (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={media.url} alt="upload" className="rounded-sm border border-ink/15 max-w-[180px]" />
              )}
              <button onClick={() => setMedia(null)} className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-[#1a1a1a] border border-white/20 text-white text-[12px] cursor-pointer leading-none flex items-center justify-center" aria-label="Remove media">×</button>
            </div>
          )}

          <div className="flex items-center gap-2 mt-2 pt-2 border-t border-ink/[0.05]">
            {kind === 'event' && (
              <>
                <label className={`font-mono text-[10px] uppercase tracking-[2px] px-2 py-1 bg-transparent border border-ink/15 text-ink/60 hover:text-ink hover:border-[var(--accent-ink)]/40 rounded-sm transition ${uploadingMedia ? 'opacity-50 cursor-wait' : 'cursor-pointer'}`}>
                  {uploadingMedia ? 'uploading…' : '+ photo / video'}
                  <input type="file" accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/quicktime,video/webm" className="hidden" disabled={uploadingMedia} onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadMedia(f); e.currentTarget.value = ''; }} />
                </label>
                <button
                  type="button"
                  onClick={() => setGifOpen(true)}
                  className="font-mono text-[10px] uppercase tracking-[2px] px-2 py-1 bg-transparent border border-ink/15 text-ink/60 hover:text-ink hover:border-[var(--accent-ink)]/40 rounded-sm transition cursor-pointer"
                >
                  + GIF
                </button>
              </>
            )}
            <button
              onClick={submit}
              disabled={submitting || uploadingMedia}
              className="ml-auto font-mono text-[10px] uppercase tracking-[2px] px-3 py-1.5 bg-lime text-obsidian rounded-sm disabled:opacity-50 hover:opacity-90 transition cursor-pointer border-none"
            >
              {submitting ? 'posting…' : 'post →'}
            </button>
          </div>
          {error && <p className="font-mono text-[10px] uppercase tracking-[2px] text-pink/80 mt-2">{error}</p>}
        </div>
      )}

      {/* Comments list */}
      {loading ? (
        <p className="font-mono text-[11px] text-ink/30 py-4 text-center">loading…</p>
      ) : items.length === 0 ? (
        <p className="font-mono text-[11px] uppercase tracking-[2px] text-ink/25 py-4 text-center">no comments yet</p>
      ) : (
        <div className="space-y-3">
          {items.map((c) => <CommentRow key={c.id} c={c} />)}
        </div>
      )}

      <GiphyPicker open={gifOpen}     onClose={() => setGifOpen(false)}     onPick={(g) => { setGif(g); setMedia(null); }} />
      <GiphyPicker open={replyGifOpen} onClose={() => setReplyGifOpen(false)} onPick={(g) => { setReplyGif(g); setReplyMedia(null); }} />
      {confirmDeleteId && (
        <ConfirmDialog
          title="Delete this comment?"
          confirmLabel="Delete"
          destructive
          onConfirm={() => handleDelete(confirmDeleteId)}
          onCancel={() => setConfirmDeleteId(null)}
        />
      )}
    </div>
  );
}
