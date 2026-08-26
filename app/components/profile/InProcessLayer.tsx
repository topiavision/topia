'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePrivy } from '@privy-io/react-auth';
import { eraDateRange } from '../../../lib/eraDates';

/* Passport "LIFE // IN PROCESS" tab — Latashá's mockup 2b, minus funding:
 * one vertical roadmap interleaving the eras of worlds this person builds
 * (auto, from world_eras) with personal LIFE chapters they author here.
 * "witness" status keeps her language: not seeking anything — just witness it. */

export interface LifeChapterView { id: string; title: string; subtitle: string | null; dateLabel: string | null; status: string; sortOrder: number | null; }
export interface WorldEraEntry { eraId: string; title: string; description: string | null; startDate: string | null; endDate: string | null; startPrecision: string | null; endPrecision: string | null; startLabel: string | null; endLabel: string | null; status: string; worldTitle: string; worldSlug: string; milestoneCount: number; nowCount: number; doneCount: number; }

const ORANGE = 'var(--orange, #FF5C34)';

const CHAPTER_STATUSES = [
  { value: 'in_motion', label: '● In motion' },
  { value: 'planned', label: 'Planned' },
  { value: 'complete', label: 'Complete ✓' },
  { value: 'witness', label: 'Just witness it' },
];

function chapterStatusLabel(status: string): { text: string; on: boolean } {
  switch (status) {
    case 'in_motion': return { text: '● IN MOTION', on: true };
    case 'complete': return { text: 'COMPLETE ✓', on: false };
    case 'witness': return { text: 'JUST WITNESS IT', on: false };
    default: return { text: 'PLANNED', on: false };
  }
}

const inputCls = 'w-full border border-ink/15 bg-transparent px-3 py-2 font-mono text-[13px] rounded-sm outline-none text-ink placeholder:text-ink/30 focus:border-ink/40';

function ChapterForm({ privyId, existing, nextIndex, onDone }: {
  privyId: string; existing?: LifeChapterView; nextIndex?: number; onDone: () => void;
}) {
  const [draft, setDraft] = useState({
    title: existing?.title ?? '',
    subtitle: existing?.subtitle ?? '',
    dateLabel: existing?.dateLabel ?? '',
    status: existing?.status ?? 'planned',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    if (!draft.title.trim()) return;
    setSaving(true); setError('');
    try {
      const res = await fetch('/api/profile/chapters', {
        method: existing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(existing
          ? { privyId, chapterId: existing.id, ...draft }
          : { privyId, ...draft, sortOrder: nextIndex ?? 0 }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d.error || 'Could not save.'); return; }
      onDone();
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-2">
      {error && <p className="font-mono text-[11px]" style={{ color: '#FF5C34' }}>{error}</p>}
      <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="Chapter (e.g. Move the studio to LA)" className={inputCls} />
      <input value={draft.subtitle} onChange={(e) => setDraft({ ...draft, subtitle: e.target.value })} placeholder="One line of context (optional)" className={inputCls} />
      <div className="grid grid-cols-2 gap-2">
        <input value={draft.dateLabel} onChange={(e) => setDraft({ ...draft, dateLabel: e.target.value })} placeholder="AUG '26" className={inputCls} />
        <select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })} className={`${inputCls} appearance-none cursor-pointer`}>
          {CHAPTER_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </div>
      <button onClick={save} disabled={saving || !draft.title.trim()} className="font-mono text-[11px] uppercase tracking-[2px] bg-lime text-obsidian font-bold px-3 py-1.5 rounded-sm hover:opacity-90 transition cursor-pointer border-none disabled:opacity-40">
        {saving ? 'Saving…' : existing ? 'Save chapter' : 'Add chapter'}
      </button>
    </div>
  );
}

export default function InProcessLayer({
  chapters, worldEras, isOwnProfile, onChanged,
}: {
  chapters: LifeChapterView[];
  worldEras: WorldEraEntry[];
  isOwnProfile: boolean;
  onChanged: () => void;
}) {
  const { user } = usePrivy();
  const privyId = user?.id ?? '';
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const isEmpty = chapters.length === 0 && worldEras.length === 0;

  const remove = async (id: string) => {
    await fetch(`/api/profile/chapters?chapterId=${id}&privyId=${encodeURIComponent(privyId)}`, { method: 'DELETE' });
    onChanged();
  };

  const move = async (c: LifeChapterView, dir: -1 | 1) => {
    const idx = chapters.findIndex((x) => x.id === c.id);
    const j = idx + dir;
    if (idx < 0 || j < 0 || j >= chapters.length) return;
    const next = [...chapters];
    [next[idx], next[j]] = [next[j], next[idx]];
    await Promise.all(next.map((x, i) => fetch('/api/profile/chapters', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ privyId, chapterId: x.id, sortOrder: i }),
    })));
    onChanged();
  };

  if (isEmpty && !isOwnProfile) {
    return (
      <div className="bg-[var(--page-bg)] flex items-center justify-center py-14">
        <span className="font-mono text-[11px] text-ink/30 uppercase tracking-wider">Nothing in process yet</span>
      </div>
    );
  }

  return (
    <div className="bg-[var(--page-bg)] p-4">
      <div className="flex items-baseline justify-between gap-3 mb-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[2px] text-ink/40">Life // In Process</p>
          <p className="font-mono text-[10px] text-ink/35 mt-1">Build-in-public, but for a life: chapters this creator sets, plus the roadmaps of every world they build.</p>
          <p className="font-mono text-[11px] text-ink/50 mt-0.5">
            {worldEras.length > 0 && `${worldEras.length} world era${worldEras.length === 1 ? '' : 's'}`}
            {worldEras.length > 0 && chapters.length > 0 && ' · '}
            {chapters.length > 0 && `${chapters.length} life chapter${chapters.length === 1 ? '' : 's'}`}
            {isEmpty && 'What are you building?'}
          </p>
        </div>
        {isOwnProfile && (
          <button
            onClick={() => { setAdding((a) => !a); setEditingId(null); }}
            className="font-mono text-[10px] uppercase tracking-wider text-ink/50 hover:text-ink/70 transition-colors border border-ink/[0.12] rounded-sm px-2.5 py-1 cursor-pointer bg-transparent shrink-0"
          >
            {adding ? 'Cancel' : '+ Life chapter'}
          </button>
        )}
      </div>

      {adding && (
        <div className="border-2 border-dashed border-ink/15 rounded-sm p-3 mb-4">
          <ChapterForm privyId={privyId} nextIndex={chapters.length} onDone={() => { setAdding(false); onChanged(); }} />
        </div>
      )}

      {/* Vertical roadmap: world eras first (the public builds), then life
          chapters in the owner's order. */}
      <div className="flex flex-col">
        {worldEras.map((e) => {
          const inMotion = e.status === 'active' && e.nowCount > 0;
          return (
            <div key={e.eraId} className="flex gap-4 py-4 border-b border-ink/[0.06]">
              <div className="w-[74px] shrink-0 text-right">
                <p className="font-mono text-[10px] uppercase tracking-[1px] text-ink/45 leading-snug">
                  {eraDateRange(e) || '—'}
                </p>
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-mono text-[9px] font-bold uppercase tracking-[2px] text-ink/40">
                  WORLD · {e.worldTitle}
                  <span className="ml-2" style={{ color: inMotion ? ORANGE : undefined }}>
                    {inMotion ? '● IN MOTION' : e.status === 'complete' ? 'COMPLETE ✓' : ''}
                  </span>
                </p>
                <p className="font-mono text-[14px] font-bold text-ink mt-1">{e.title}{e.description ? ` — ${e.description}` : ''}</p>
                <Link href={`/worlds/${e.worldSlug}#inprocess`} className="font-mono text-[10px] uppercase tracking-[1px] no-underline mt-1 inline-block text-ink/50 hover:text-ink transition">
                  {e.doneCount}/{e.milestoneCount} milestones →
                </Link>
              </div>
            </div>
          );
        })}

        {chapters.map((c, i) => {
          const meta = chapterStatusLabel(c.status);
          return (
            <div key={c.id} className="flex gap-4 py-4 border-b border-ink/[0.06]">
              <div className="w-[74px] shrink-0 text-right">
                <p className="font-mono text-[10px] uppercase tracking-[1px] text-ink/45">{c.dateLabel || '—'}</p>
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-mono text-[9px] font-bold uppercase tracking-[2px] text-ink/40">
                  LIFE <span className="ml-2" style={{ color: meta.on ? ORANGE : undefined }}>{meta.text}</span>
                </p>
                <p className="font-mono text-[14px] font-bold text-ink mt-1">{c.title}</p>
                {c.subtitle && <p className="font-mono text-[11px] text-ink/50 mt-0.5">{c.subtitle}</p>}
                {editingId === c.id && (
                  <div className="mt-3">
                    <ChapterForm privyId={privyId} existing={c} onDone={() => { setEditingId(null); onChanged(); }} />
                  </div>
                )}
              </div>
              {isOwnProfile && editingId !== c.id && (
                <span className="flex items-start gap-1.5 shrink-0">
                  <button onClick={() => move(c, -1)} disabled={i === 0} aria-label="Move up" className="w-6 h-6 rounded-sm border border-ink/15 cursor-pointer bg-transparent font-mono text-[11px] text-ink disabled:opacity-25">↑</button>
                  <button onClick={() => move(c, 1)} disabled={i === chapters.length - 1} aria-label="Move down" className="w-6 h-6 rounded-sm border border-ink/15 cursor-pointer bg-transparent font-mono text-[11px] text-ink disabled:opacity-25">↓</button>
                  <button onClick={() => { setEditingId(c.id); setAdding(false); }} className="font-mono text-[10px] uppercase underline cursor-pointer bg-transparent border-none text-ink/60">Edit</button>
                  <button onClick={() => remove(c.id)} className="font-mono text-[10px] uppercase underline cursor-pointer bg-transparent border-none" style={{ color: '#FF5C34' }}>Del</button>
                </span>
              )}
            </div>
          );
        })}
      </div>

      {isEmpty && isOwnProfile && !adding && (
        <p className="font-mono text-[11px] text-ink/35 mt-2">
          Add a life chapter above — or start an era from one of your world dashboards.
        </p>
      )}
    </div>
  );
}
