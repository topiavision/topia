'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface ReactionSummary {
  emoji: string;
  count: number;
  viewerReacted: boolean;
}

interface Photo {
  id: string;
  url: string;
  isVideo: boolean;
  caption: string | null;
  uploaderId: string | null;
  uploaderName: string | null;
  uploaderUsername: string | null;
  uploaderAvatarUrl: string | null;
  uploaderIsHost?: boolean;
  reactions?: ReactionSummary[];
}

interface Props {
  slug: string;
  isHost: boolean;
  privyId?: string | null;
}

const ACCEPT = 'image/jpeg,image/png,image/gif,image/webp,video/mp4,video/quicktime,video/webm';
// Same quick-react palette as comments/guestbook (server enforces this set).
const REACTION_EMOJI = ['❤️', '🔥', '👍', '😂', '👀', '🎉'];
// Tiles in the inline square teaser (one tidy row) before "View all" opens
// the full masonry album. Last slot becomes a "+N more" cap when there's more.
const PREVIEW_COUNT = 4;

function uploaderLabel(p: Photo): string {
  return p.uploaderName || (p.uploaderUsername ? `@${p.uploaderUsername}` : 'Someone');
}

// Small round avatar — image when present, else a lettered fallback.
function Avatar({ p, size }: { p: Photo; size: number }) {
  const initial = (p.uploaderName || p.uploaderUsername || '?')[0]?.toUpperCase();
  return p.uploaderAvatarUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={p.uploaderAvatarUrl} alt="" className="rounded-full object-cover shrink-0" style={{ width: size, height: size }} />
  ) : (
    <div className="rounded-full flex items-center justify-center shrink-0" style={{ width: size, height: size, backgroundColor: 'rgba(255,255,255,0.2)' }}>
      <span className="font-mono text-white" style={{ fontSize: size * 0.5 }}>{initial}</span>
    </div>
  );
}

// Photo album on the event page. Public read; hosts AND RSVP'd guests can
// contribute. A masonry teaser sits inline; "View all" opens an immersive
// full-screen album; tapping any photo opens the lightbox carousel.
export default function EventGallery({ slug, isHost, privyId }: Props) {
  const [photos, setPhotos] = useState<Photo[] | null>(null);
  const [canContribute, setCanContribute] = useState(isHost);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [viewerIsHost, setViewerIsHost] = useState(isHost);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState('');
  const [albumOpen, setAlbumOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [editingCaption, setEditingCaption] = useState(false);
  const [captionDraft, setCaptionDraft] = useState('');
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const qs = new URLSearchParams({ slug });
    if (privyId) qs.set('viewerPrivyId', privyId);
    fetch(`/api/events/gallery?${qs.toString()}`)
      .then((r) => r.json())
      .then((d) => {
        setPhotos(d.photos ?? []);
        if (typeof d.canContribute === 'boolean') setCanContribute(d.canContribute);
        if (typeof d.viewerIsHost === 'boolean') setViewerIsHost(d.viewerIsHost);
        setViewerId(d.viewerId ?? null);
      })
      .catch(() => setPhotos([]));
  }, [slug, privyId]);

  const all = photos ?? [];
  const lightbox = lightboxIndex !== null ? all[lightboxIndex] ?? null : null;

  const canDelete = (p: Photo) => viewerIsHost || (!!viewerId && p.uploaderId === viewerId);
  const canEditCaption = (p: Photo) => canDelete(p);

  // Lightbox navigation — wraps around the full album.
  const go = useCallback((delta: number) => {
    setLightboxIndex((i) => {
      if (i === null || all.length === 0) return i;
      return (i + delta + all.length) % all.length;
    });
  }, [all.length]);

  // Reset transient lightbox UI whenever the visible photo changes.
  useEffect(() => {
    setEditingCaption(false);
    setShowReactionPicker(false);
    if (lightboxIndex !== null) setCaptionDraft(all[lightboxIndex]?.caption ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lightboxIndex]);

  // Keyboard: arrows navigate the lightbox; Escape closes lightbox then album.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (lightboxIndex !== null) {
        if (editingCaption) return;
        if (e.key === 'ArrowRight') go(1);
        else if (e.key === 'ArrowLeft') go(-1);
        else if (e.key === 'Escape') setLightboxIndex(null);
      } else if (albumOpen && e.key === 'Escape') {
        setAlbumOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightboxIndex, albumOpen, editingCaption, go]);

  const triggerUpload = () => fileInput.current?.click();

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ''; // allow re-picking the same file
    if (!files.length || !privyId) return;
    setError('');
    setUploading(true);
    setProgress({ done: 0, total: files.length });
    try {
      const uploaded: { url: string; isVideo: boolean }[] = [];
      for (const file of files) {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('privyId', privyId ?? '');
        const res = await fetch('/api/events/cover-upload', { method: 'POST', body: fd });
        const json = await res.json();
        if (!res.ok || !json.ok) { setError(json.error || `Couldn't upload ${file.name}`); continue; }
        uploaded.push({ url: json.url as string, isVideo: !!json.isVideo });
        setProgress((p) => (p ? { ...p, done: p.done + 1 } : p));
      }
      if (uploaded.length) {
        const res = await fetch('/api/events/gallery', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ privyId, slug, photos: uploaded }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Failed to save photos');
        setPhotos((prev) => [...(prev ?? []), ...(json.photos ?? [])]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      setProgress(null);
    }
  };

  const remove = async (photo: Photo) => {
    if (!privyId) return;
    const prevPhotos = photos ?? [];
    const idx = prevPhotos.findIndex((p) => p.id === photo.id);
    const next = prevPhotos.filter((p) => p.id !== photo.id);
    setPhotos(next);
    if (lightboxIndex !== null) {
      if (next.length === 0) setLightboxIndex(null);
      else setLightboxIndex(Math.min(idx, next.length - 1));
    }
    try {
      const res = await fetch(`/api/events/gallery?id=${photo.id}&privyId=${encodeURIComponent(privyId)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
    } catch {
      setPhotos(prevPhotos);
      setError('Could not remove that photo');
    }
  };

  const saveCaption = async () => {
    if (!lightbox || !privyId) return;
    const next = captionDraft.trim();
    setEditingCaption(false);
    setPhotos((prev) => (prev ?? []).map((p) => (p.id === lightbox.id ? { ...p, caption: next || null } : p)));
    try {
      await fetch('/api/events/gallery', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ privyId, id: lightbox.id, caption: next }),
      });
    } catch {
      setError('Could not save caption');
    }
  };

  // Toggle an emoji reaction on a photo — optimistic, then persists via the
  // shared /api/reactions endpoint (same toggle semantics as comments).
  const toggleReaction = async (photoId: string, emoji: string) => {
    if (!privyId) return;
    setShowReactionPicker(false);
    setPhotos((prev) => (prev ?? []).map((p) => {
      if (p.id !== photoId) return p;
      const list = p.reactions ? [...p.reactions] : [];
      const idx = list.findIndex((r) => r.emoji === emoji);
      if (idx === -1) {
        list.push({ emoji, count: 1, viewerReacted: true });
      } else if (list[idx].viewerReacted) {
        const count = list[idx].count - 1;
        if (count <= 0) list.splice(idx, 1);
        else list[idx] = { ...list[idx], count, viewerReacted: false };
      } else {
        list[idx] = { ...list[idx], count: list[idx].count + 1, viewerReacted: true };
      }
      list.sort((a, b) => REACTION_EMOJI.indexOf(a.emoji) - REACTION_EMOJI.indexOf(b.emoji));
      return { ...p, reactions: list };
    }));
    try {
      await fetch('/api/reactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ privyId, targetType: 'event_photo', targetId: photoId, emoji }),
      });
    } catch {
      setError('Could not save reaction');
    }
  };

  // A single tile, shared by the inline teaser and the album overlay.
  // `square` crops to a uniform 1:1 (inline grid); otherwise the photo keeps
  // its natural proportions (masonry album). `plus` turns the tile into a
  // "+N more" cap that opens the full album.
  const Tile = ({ p, index, plus, square }: { p: Photo; index: number; plus?: number; square?: boolean }) => (
    <div
      className={`relative group overflow-hidden rounded-xl ${square ? 'aspect-square' : 'mb-2 sm:mb-2.5 break-inside-avoid'}`}
      style={{ backgroundColor: 'var(--border-color)' }}
    >
      <button
        type="button"
        onClick={() => (plus ? setAlbumOpen(true) : setLightboxIndex(index))}
        className={`block w-full p-0 border-none cursor-pointer bg-transparent align-top ${square ? 'h-full' : ''}`}
      >
        {p.isVideo ? (
          <video src={p.url} className={`w-full block transition-transform duration-500 group-hover:scale-[1.04] ${square ? 'h-full object-cover' : 'h-auto'}`} muted playsInline />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.url} alt={p.caption ?? 'Event photo'} loading="lazy" className={`w-full block transition-transform duration-500 group-hover:scale-[1.04] ${square ? 'h-full object-cover' : 'h-auto'}`} />
        )}
        {p.isVideo && !plus && (
          <span className="absolute top-2 left-2 text-white text-[11px] font-mono px-1.5 py-0.5 rounded" style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}>▶</span>
        )}
        {plus ? (
          <span className="absolute inset-0 flex flex-col items-center justify-center text-white font-mono backdrop-blur-[2px]" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
            <span className="text-[22px] font-bold leading-none">+{plus}</span>
            <span className="text-[10px] uppercase tracking-[0.15em] mt-1 opacity-80">more</span>
          </span>
        ) : (
          <span
            className="absolute inset-x-0 bottom-0 flex items-center gap-1.5 px-2 py-2 opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.8), transparent)' }}
          >
            <Avatar p={p} size={18} />
            <span className="text-white font-mono text-[10px] truncate">{uploaderLabel(p)}{p.uploaderIsHost ? ' · host' : ''}</span>
          </span>
        )}
      </button>
      {!plus && p.reactions && p.reactions.length > 0 && (
        <span
          className="absolute bottom-2 right-2 flex items-center gap-0.5 px-1.5 py-0.5 rounded-full font-mono text-[10px] text-white pointer-events-none"
          style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
        >
          {p.reactions.slice(0, 3).map((r) => <span key={r.emoji}>{r.emoji}</span>)}
          <span className="ml-0.5">{p.reactions.reduce((n, r) => n + r.count, 0)}</span>
        </span>
      )}
      {!plus && canDelete(p) && (
        <button
          type="button"
          onClick={() => remove(p)}
          aria-label="Remove photo"
          className="absolute top-2 right-2 w-6 h-6 rounded-full font-mono text-[13px] leading-none cursor-pointer border-none opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ backgroundColor: 'rgba(0,0,0,0.65)', color: '#fff' }}
        >
          ×
        </button>
      )}
    </div>
  );

  const uploadButton = (
    <button
      type="button"
      onClick={triggerUpload}
      disabled={uploading}
      className="font-mono text-[11px] uppercase tracking-[0.12em] font-bold px-3 py-1.5 rounded-lg cursor-pointer border-none disabled:opacity-40 disabled:cursor-not-allowed"
      style={{ backgroundColor: 'var(--foreground)', color: 'var(--background)' }}
    >
      {uploading
        ? progress ? `Uploading ${progress.done}/${progress.total}…` : 'Uploading…'
        : all.length ? '+ Add photos' : '+ Upload photos'}
    </button>
  );

  // Hide the section entirely for viewers who can't contribute when empty.
  if (photos === null) return null;
  if (all.length === 0 && !canContribute) return null;

  const overflow = all.length > PREVIEW_COUNT ? all.length - (PREVIEW_COUNT - 1) : 0;
  const preview = overflow > 0 ? all.slice(0, PREVIEW_COUNT - 1) : all;

  return (
    <section className="mb-10">
      <div className="flex items-center justify-between mb-3">
        <p className="font-mono text-[13px] uppercase tracking-[0.15em] font-bold" style={{ color: 'var(--text-muted)' }}>
          Album{all.length > 0 && <span className="ml-2">{all.length}</span>}
        </p>
        <div className="flex items-center gap-2">
          {all.length > 0 && (
            <button
              type="button"
              onClick={() => setAlbumOpen(true)}
              className="font-mono text-[11px] uppercase tracking-[0.12em] font-bold underline bg-transparent border-none cursor-pointer p-0 opacity-70 hover:opacity-100"
              style={{ color: 'var(--foreground)' }}
            >
              View all →
            </button>
          )}
          {canContribute && uploadButton}
        </div>
        <input ref={fileInput} type="file" accept={ACCEPT} multiple hidden onChange={onPick} />
      </div>

      {error && <p className="font-mono text-[12px] mb-3" style={{ color: '#FF5C34' }}>{error}</p>}

      {all.length === 0 ? (
        <button
          type="button"
          onClick={triggerUpload}
          className="w-full border border-dashed rounded-2xl py-12 font-mono text-[12px] uppercase tracking-[0.14em] opacity-60 cursor-pointer bg-transparent hover:opacity-90 transition-opacity"
          style={{ borderColor: 'var(--border-color)', color: 'var(--foreground)' }}
        >
          ＋ Add photos from the event
        </button>
      ) : (
        <div className="grid grid-cols-4 gap-2.5 sm:gap-3">
          {preview.map((p, i) => <Tile key={p.id} p={p} index={i} square />)}
          {overflow > 0 && <Tile key="more" p={all[PREVIEW_COUNT - 1]} index={PREVIEW_COUNT - 1} plus={overflow} square />}
        </div>
      )}

      {/* Immersive full-screen album */}
      {albumOpen && (
        <div className="fixed inset-0 z-[2150] overflow-y-auto" style={{ backgroundColor: 'var(--background)', paddingTop: 'var(--safe-top, 0px)' }}>
          <div
            className="sticky z-10 flex items-center justify-between px-4 sm:px-8 py-4 border-b backdrop-blur-md"
            style={{ top: 'var(--safe-top, 0px)', borderColor: 'var(--border-color)', backgroundColor: 'color-mix(in srgb, var(--background) 80%, transparent)' }}
          >
            <p className="font-mono text-[14px] uppercase tracking-[0.15em] font-bold" style={{ color: 'var(--foreground)' }}>
              Album <span className="ml-1" style={{ color: 'var(--text-muted)' }}>{all.length}</span>
            </p>
            <div className="flex items-center gap-3">
              {canContribute && uploadButton}
              <button
                type="button"
                onClick={() => setAlbumOpen(false)}
                aria-label="Close album"
                className="font-mono text-[22px] leading-none bg-transparent border-none cursor-pointer opacity-60 hover:opacity-100"
                style={{ color: 'var(--foreground)' }}
              >
                ×
              </button>
            </div>
          </div>
          {error && <p className="font-mono text-[12px] px-4 sm:px-8 pt-3" style={{ color: '#FF5C34' }}>{error}</p>}
          <div className="px-4 sm:px-8 py-6 max-w-6xl mx-auto">
            <div className="columns-2 sm:columns-3 lg:columns-4 gap-2 sm:gap-3">
              {all.map((p, i) => <Tile key={p.id} p={p} index={i} />)}
            </div>
          </div>
        </div>
      )}

      {/* Lightbox carousel — opens above the album */}
      {lightbox && (
        <div
          className="fixed inset-0 z-[2200] flex flex-col items-center justify-center p-4 backdrop-blur-sm"
          style={{ backgroundColor: 'rgba(0,0,0,0.92)' }}
          onClick={() => setLightboxIndex(null)}
        >
          <button onClick={() => setLightboxIndex(null)} className="absolute top-4 right-5 text-white font-mono text-[28px] bg-transparent border-none cursor-pointer z-10" aria-label="Close">×</button>
          {all.length > 1 && (
            <span className="absolute top-5 left-5 text-white/70 font-mono text-[12px] z-10">{(lightboxIndex ?? 0) + 1} / {all.length}</span>
          )}
          {all.length > 1 && (
            <>
              <button onClick={(e) => { e.stopPropagation(); go(-1); }} aria-label="Previous" className="absolute left-2 sm:left-5 top-1/2 -translate-y-1/2 text-white font-mono text-[34px] bg-transparent border-none cursor-pointer z-10 px-2 opacity-70 hover:opacity-100">‹</button>
              <button onClick={(e) => { e.stopPropagation(); go(1); }} aria-label="Next" className="absolute right-2 sm:right-5 top-1/2 -translate-y-1/2 text-white font-mono text-[34px] bg-transparent border-none cursor-pointer z-10 px-2 opacity-70 hover:opacity-100">›</button>
            </>
          )}
          <div className="flex items-center justify-center max-h-[78vh] w-full" onClick={(e) => e.stopPropagation()}>
            {lightbox.isVideo ? (
              <video key={lightbox.id} src={lightbox.url} controls autoPlay className="max-w-full max-h-[78vh] rounded-lg" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={lightbox.url} alt={lightbox.caption ?? 'Event photo'} className="max-w-full max-h-[78vh] rounded-lg object-contain" />
            )}
          </div>
          {/* Attribution + caption */}
          <div className="mt-3 w-full max-w-xl flex items-start gap-2.5" onClick={(e) => e.stopPropagation()}>
            <Avatar p={lightbox} size={28} />
            <div className="flex-1 min-w-0">
              <p className="text-white font-mono text-[12px] font-bold">
                {lightbox.uploaderUsername ? `@${lightbox.uploaderUsername}` : uploaderLabel(lightbox)}
                {lightbox.uploaderIsHost && <span className="ml-2 opacity-70 font-normal">host</span>}
              </p>
              {editingCaption ? (
                <div className="mt-1 flex items-center gap-2">
                  <input
                    autoFocus
                    value={captionDraft}
                    maxLength={280}
                    onChange={(e) => setCaptionDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') saveCaption(); if (e.key === 'Escape') setEditingCaption(false); }}
                    placeholder="Add a caption…"
                    className="flex-1 bg-transparent border-b font-mono text-[12px] py-1 outline-none text-white"
                    style={{ borderColor: 'rgba(255,255,255,0.3)' }}
                  />
                  <button onClick={saveCaption} className="font-mono text-[11px] uppercase tracking-[0.1em] text-white underline bg-transparent border-none cursor-pointer">Save</button>
                </div>
              ) : (
                <p
                  className={`mt-0.5 font-mono text-[12px] ${lightbox.caption ? 'text-white/85' : 'text-white/40'} ${canEditCaption(lightbox) ? 'cursor-pointer hover:text-white' : ''}`}
                  onClick={() => { if (canEditCaption(lightbox)) { setCaptionDraft(lightbox.caption ?? ''); setEditingCaption(true); } }}
                >
                  {lightbox.caption || (canEditCaption(lightbox) ? 'Add a caption…' : '')}
                </p>
              )}
            </div>
            {canDelete(lightbox) && (
              <button onClick={() => remove(lightbox)} className="font-mono text-[11px] uppercase tracking-[0.1em] text-white/60 hover:text-white bg-transparent border-none cursor-pointer shrink-0">Delete</button>
            )}
          </div>
          {/* Reaction bar */}
          <div className="mt-2.5 w-full max-w-xl flex items-center gap-1.5 flex-wrap relative" onClick={(e) => e.stopPropagation()}>
            {(lightbox.reactions ?? []).map((r) => (
              <button
                key={r.emoji}
                onClick={() => toggleReaction(lightbox.id, r.emoji)}
                disabled={!privyId}
                className="flex items-center gap-1 px-2 py-1 rounded-full font-mono text-[12px] border cursor-pointer disabled:cursor-default transition-colors"
                style={{
                  backgroundColor: r.viewerReacted ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.06)',
                  borderColor: r.viewerReacted ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.2)',
                  color: '#fff',
                }}
              >
                <span>{r.emoji}</span><span className="text-white/80">{r.count}</span>
              </button>
            ))}
            {privyId && (
              <button
                onClick={() => setShowReactionPicker((v) => !v)}
                aria-label="Add reaction"
                className="flex items-center justify-center w-7 h-7 rounded-full font-mono text-[16px] leading-none border cursor-pointer text-white/80 hover:text-white"
                style={{ backgroundColor: 'rgba(255,255,255,0.06)', borderColor: 'rgba(255,255,255,0.2)' }}
              >
                +
              </button>
            )}
            {showReactionPicker && privyId && (
              <div className="flex items-center gap-1 px-2 py-1 rounded-full" style={{ backgroundColor: 'rgba(255,255,255,0.12)' }}>
                {REACTION_EMOJI.map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => toggleReaction(lightbox.id, emoji)}
                    className="text-[16px] leading-none px-1 py-0.5 bg-transparent border-none cursor-pointer hover:scale-125 transition-transform"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
