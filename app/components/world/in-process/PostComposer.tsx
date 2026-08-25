'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePrivy } from '@privy-io/react-auth';
import { POST_KINDS, type PostKind } from '@/lib/processPosts';
import { ImageField, inputCls, labelCls, btnLime, btnGhost } from '../InProcessFields';
import { ORANGE } from './constants';
import type { EraView } from './types';
/* ── Typed post composer (moment / thought / link / embed) ─────────── */
export function PostComposer({ era, privyId, canMint, initialMilestoneId = '', onClose, onChanged }: {
  era: EraView; privyId: string; canMint: boolean; initialMilestoneId?: string;
  onClose: () => void; onChanged: () => void;
}) {
  const { getAccessToken } = usePrivy();
  const blank = { kind: 'moment' as PostKind, title: '', body: '', imageUrl: '', linkUrl: '', milestoneId: initialMilestoneId, mint: false };
  const [draft, setDraft] = useState(blank);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const needsLink = draft.kind === 'link' || draft.kind === 'embed';
  const ready = needsLink ? !!draft.linkUrl.trim() : !!draft.title.trim();

  const post = async () => {
    if (!ready) return;
    setSaving(true); setError('');
    try {
      const accessToken = draft.mint ? await getAccessToken().catch(() => null) : null;
      const res = await fetch('/api/worlds/eras/posts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          privyId, accessToken, eraId: era.id,
          kind: draft.kind,
          title: draft.title.trim() || undefined,
          body: draft.body.trim() || undefined,
          imageUrl: draft.imageUrl.trim() || undefined,
          linkUrl: draft.linkUrl.trim() || undefined,
          milestoneId: draft.milestoneId || undefined,
          mintToInProcess: draft.mint,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setError(d.error || 'Could not post.'); return; }
      onChanged();
      onClose();
    } finally { setSaving(false); }
  };

  return (
    <div className="border-2 border-dashed border-ink/15 rounded-sm p-3 mt-3 space-y-2.5">
      <div className="flex gap-1.5 flex-wrap">
        {POST_KINDS.map((k) => (
          <button
            key={k.id}
            onClick={() => setDraft({ ...draft, kind: k.id })}
            className={`font-mono text-[11px] uppercase tracking-[1px] px-2.5 py-1.5 rounded-sm cursor-pointer transition ${
              draft.kind === k.id ? 'bg-lime text-obsidian font-bold border-none' : 'bg-transparent text-ink/55 border border-ink/15 hover:border-ink/40'
            }`}
          >
            {k.glyph} {k.label}
          </button>
        ))}
      </div>
      <p className="font-mono text-[10px] text-ink/35">{POST_KINDS.find((k) => k.id === draft.kind)?.hint} · posts to “{era.title}”</p>

      {draft.kind === 'moment' && (
        <>
          <ImageField value={draft.imageUrl} onChange={(url) => setDraft({ ...draft, imageUrl: url })} label="Image" />
          <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="What happened? (e.g. Mix 01 done)" className={inputCls} />
          <textarea value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} rows={2} placeholder="A few words of process (optional)" className={inputCls} />
        </>
      )}
      {draft.kind === 'thought' && (
        <>
          <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="this is the time when…" className={inputCls} />
          <textarea value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} rows={4} placeholder="Write it out" className={inputCls} />
        </>
      )}
      {(needsLink || draft.kind === 'thought') && (
        <>
          <input value={draft.linkUrl} onChange={(e) => setDraft({ ...draft, linkUrl: e.target.value })}
            placeholder={
              draft.kind === 'thought' ? 'Add a link (optional) — the venue, the reference, the thing'
              : draft.kind === 'link' ? 'Paste any link from the internet'
              : 'Paste a YouTube / SoundCloud / Spotify link'
            } className={inputCls} />
          <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="Title (optional — uses the site name)" className={inputCls} />
        </>
      )}

      {era.milestones.length > 0 && (
        <div>
          <label className={labelCls}>Ties to a milestone (optional)</label>
          <select
            value={draft.milestoneId}
            onChange={(e) => setDraft({ ...draft, milestoneId: e.target.value })}
            className={`${inputCls} appearance-none cursor-pointer`}
          >
            <option value="">Whole roadmap — no specific milestone</option>
            {era.milestones.map((m, i) => (
              <option key={m.id} value={m.id}>M{String(i + 1).padStart(2, '0')} · {m.title}</option>
            ))}
          </select>
        </div>
      )}

      {canMint ? (
        <label className="flex items-center gap-2 font-mono text-[11px] text-ink/60 cursor-pointer">
          <input type="checkbox" checked={draft.mint} onChange={(e) => setDraft({ ...draft, mint: e.target.checked })} className="cursor-pointer" />
          ⛓ Also mint on In Process <span className="text-ink/35">(permanent, onchain)</span>
        </label>
      ) : (
        <p className="font-mono text-[10px] text-ink/35">
          This posts to Topia. Want it minted onchain too? <Link href="/profile" className="underline text-ink/60">Connect In Process in your profile</Link> and a ⛓ mint option appears here.
        </p>
      )}
      {error && <p className="font-mono text-[11px]" style={{ color: ORANGE }}>{error}</p>}
      <div className="flex items-center gap-3">
        <button onClick={post} disabled={saving || !ready} className={btnLime}>
          {saving ? (draft.mint ? 'Posting + minting…' : 'Posting…') : 'Post'}
        </button>
        <button onClick={onClose} className={btnGhost}>Cancel</button>
      </div>
    </div>
  );
}
