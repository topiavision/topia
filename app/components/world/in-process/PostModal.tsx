'use client';

import { useState } from 'react';
import { POST_KINDS } from '@/lib/processPosts';
import { btnLime, btnGhost } from '../InProcessFields';
import { ORANGE } from './constants';
import type { EraMilestoneView, LogEntry } from './types';
/* ── Post detail modal ─────────────────────────────────────────────
 * Every process-log card opens here first — links and collect pages
 * are an explicit button inside, never a surprise navigation. */
export function PostModal({ entry, milestones, canEdit, onDelete, onClose }: {
  entry: LogEntry; milestones: EraMilestoneView[]; canEdit: boolean;
  onDelete: (postId: string) => Promise<void>; onClose: () => void;
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const msIndex = entry.milestoneId ? milestones.findIndex((m) => m.id === entry.milestoneId) : -1;
  const milestone = msIndex >= 0 ? milestones[msIndex] : null;
  const minted = !!entry.mintedUrl;
  const kindLabel = entry.kind
    ? POST_KINDS.find((k) => k.id === entry.kind)?.label ?? entry.kind
    : 'In Process moment';
  const linkHost = entry.linkUrl ? (() => { try { return new URL(entry.linkUrl!).hostname.replace(/^www\./, ''); } catch { return null; } })() : null;

  const remove = async () => {
    if (!entry.postId) return;
    setDeleting(true);
    try { await onDelete(entry.postId); onClose(); } finally { setDeleting(false); }
  };

  return (
    <div className="fixed inset-0 z-[2300] flex items-end sm:items-center justify-center p-0 sm:p-4" style={{ backgroundColor: 'rgba(0,0,0,0.72)' }} onClick={onClose}>
      <div className="w-full max-w-md rounded-t-2xl sm:rounded-2xl p-5 bg-[var(--page-bg)] border border-ink/[0.1] max-h-[88lvh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <p className="font-mono text-[10px] font-bold uppercase tracking-[2px] text-ink/50">
            {entry.glyph} {kindLabel}
            {minted && <span className="ml-1.5" style={{ color: ORANGE }}>⛓ minted</span>}
          </p>
          <button onClick={onClose} aria-label="Close" className="bg-transparent border-none cursor-pointer text-[18px] leading-none p-0 text-ink/50">×</button>
        </div>
        <h4 className="font-basement font-black text-[20px] uppercase leading-tight text-ink mt-2">{entry.title}</h4>
        {entry.date && (
          <p className="font-mono text-[11px] uppercase tracking-[1px] text-ink/45 mt-1">
            {new Date(entry.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </p>
        )}
        {milestone && (
          <p className="inline-block font-mono text-[9px] font-bold uppercase tracking-[2px] px-2 py-0.5 rounded-sm mt-2 border" style={{ color: ORANGE, borderColor: ORANGE }}>
            M{String(msIndex + 1).padStart(2, '0')} · {milestone.title}
          </p>
        )}
        {entry.imageUrl && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={entry.imageUrl} alt="" className="w-full max-h-[280px] object-cover rounded-sm mt-3" />
        )}
        {entry.body && <p className="font-mono text-[13px] text-ink/70 leading-relaxed mt-3 whitespace-pre-wrap">{entry.body}</p>}

        {(entry.linkUrl || entry.mintedUrl || (canEdit && entry.postId)) && (
          <div className="flex items-center gap-3 flex-wrap mt-4 pt-3 border-t border-ink/[0.08]">
            {entry.linkUrl && (
              <a href={entry.linkUrl} target="_blank" rel="noopener noreferrer" className={`${btnLime} no-underline inline-block`}>
                Open {linkHost ?? 'link'} ↗
              </a>
            )}
            {entry.mintedUrl && (
              <a href={entry.mintedUrl} target="_blank" rel="noopener noreferrer" className={`${entry.linkUrl ? btnGhost : btnLime} no-underline inline-block`}>
                Collect on In Process ↗
              </a>
            )}
            {canEdit && entry.postId && (
              confirmingDelete
                ? <button onClick={remove} disabled={deleting} className="font-mono text-[11px] uppercase tracking-[1px] px-3 py-1.5 rounded-sm cursor-pointer border-none font-bold" style={{ backgroundColor: ORANGE, color: 'var(--bone)' }}>{deleting ? 'Deleting…' : 'Really delete?'}</button>
                : <button onClick={() => setConfirmingDelete(true)} className="font-mono text-[11px] uppercase underline cursor-pointer bg-transparent border-none" style={{ color: ORANGE }}>Delete</button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
