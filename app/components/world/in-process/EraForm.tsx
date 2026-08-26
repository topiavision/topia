'use client';

import { useState } from 'react';
import { EraDateField, inputCls, labelCls, btnLime, btnGhost, type Precision } from '../InProcessFields';
import { ORANGE } from './constants';
import type { EraView, ProjectOption } from './types';
/* ── Era (roadmap) create/edit form ────────────────────────────────── */
export const NEW_PROJECT = '__new__';

export function EraForm({ worldId, projects, existing, privyId, onClose, onChanged }: {
  worldId: string; projects: ProjectOption[]; existing?: EraView; privyId: string;
  onClose: () => void; onChanged: () => void;
}) {
  const [draft, setDraft] = useState({
    // Roadmaps belong to projects — creating one defaults to the first
    // project, or straight into "make a new project" when there are none.
    projectId: existing ? (existing.projectId ?? '') : (projects[0]?.id ?? NEW_PROJECT),
    title: existing?.title ?? '',
    description: existing?.description ?? '',
    startDate: existing?.startDate ?? '',
    endDate: existing?.endDate ?? '',
    startPrecision: (existing?.startPrecision ?? 'month') as Precision,
    endPrecision: (existing?.endPrecision ?? 'month') as Precision,
    status: existing?.status ?? 'active',
    inProcessUrl: existing?.inProcessUrl ?? '',
  });
  const [newProjectName, setNewProjectName] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState('');

  const makingProject = draft.projectId === NEW_PROJECT;

  const pickProject = (projectId: string) => {
    const p = projects.find((x) => x.id === projectId);
    // Prefill the roadmap title with the project name until the builder types their own.
    const titleUntouched = !draft.title.trim() || projects.some((x) => x.name === draft.title) || draft.title === newProjectName;
    setDraft({ ...draft, projectId, title: titleUntouched && p ? p.name : draft.title });
  };

  const typeNewProjectName = (name: string) => {
    const titleUntouched = !draft.title.trim() || projects.some((x) => x.name === draft.title) || draft.title === newProjectName;
    setNewProjectName(name);
    if (titleUntouched) setDraft({ ...draft, title: name });
  };

  const save = async () => {
    if (!draft.title.trim() || (makingProject && !newProjectName.trim())) return;
    setSaving(true); setError('');
    try {
      // Project-first: a brand-new project is created right here, then the
      // roadmap attaches to it — no dashboard round-trip.
      let projectId: string | null = draft.projectId || null;
      if (makingProject) {
        const pRes = await fetch('/api/worlds/projects', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ privyId, worldId, name: newProjectName.trim() }),
        });
        const pData = await pRes.json().catch(() => ({}));
        if (!pRes.ok || !pData.project?.id) { setError(pData.error || 'Could not create the project.'); return; }
        projectId = pData.project.id;
      }
      const res = await fetch('/api/worlds/eras', {
        method: existing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(existing
          ? { privyId, eraId: existing.id, ...draft, projectId }
          : { privyId, worldId, ...draft, projectId }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d.error || 'Could not save.'); return; }
      onChanged();
      onClose();
    } finally { setSaving(false); }
  };

  const remove = async () => {
    if (!existing) return;
    await fetch(`/api/worlds/eras?eraId=${existing.id}&privyId=${encodeURIComponent(privyId)}`, { method: 'DELETE' });
    onChanged();
    onClose();
  };

  return (
    <div className="border-2 border-dashed border-ink/15 rounded-lg p-4 space-y-2.5">
      <p className="font-mono text-[10px] font-bold uppercase tracking-[2px] text-ink/50">
        {existing ? 'Edit roadmap' : 'Start a roadmap'}
      </p>
      <div>
        <label className={labelCls}>Which project is this the roadmap for?</label>
        <p className="font-mono text-[10px] text-ink/40 mb-1.5 -mt-0.5">
          Roadmaps belong to projects — pick one, or spin up a new project right here.
        </p>
        <select value={draft.projectId} onChange={(e) => e.target.value === NEW_PROJECT ? setDraft({ ...draft, projectId: NEW_PROJECT }) : pickProject(e.target.value)} className={`${inputCls} appearance-none cursor-pointer`}>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          <option value={NEW_PROJECT}>+ New project…</option>
          <option value="">No project — a world-wide roadmap</option>
        </select>
      </div>
      {makingProject && (
        <div className="border-l-2 pl-3" style={{ borderColor: ORANGE }}>
          <label className={labelCls}>Name the new project</label>
          <input value={newProjectName} onChange={(e) => typeNewProjectName(e.target.value)} placeholder="e.g. Debut Album, Short Film, Community Zine" className={inputCls} autoFocus={!projects.length} />
          <p className="font-mono text-[10px] text-ink/40 mt-1">
            It&apos;s created with this roadmap and appears under Projects — add images and details anytime from the project page.
          </p>
        </div>
      )}
      <div>
        <label className={labelCls}>Roadmap title</label>
        <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="ORBIT ONE" className={inputCls} />
      </div>
      <div>
        <label className={labelCls}>One-liner (optional)</label>
        <input value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="debut album era" className={inputCls} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <EraDateField label="Starts" value={draft.startDate} precision={draft.startPrecision}
          onChange={(n) => setDraft({ ...draft, startDate: n.value, startPrecision: n.precision })} />
        <EraDateField label="Ends (optional)" value={draft.endDate} precision={draft.endPrecision}
          onChange={(n) => setDraft({ ...draft, endDate: n.value, endPrecision: n.precision })} />
      </div>
      {existing && (
        <div>
          <label className={labelCls}>Status</label>
          <select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })} className={`${inputCls} appearance-none cursor-pointer`}>
            <option value="active">Active — shown on the world page</option>
            <option value="complete">Complete — shown as a past roadmap</option>
            <option value="archived">Archived — hidden from visitors</option>
          </select>
        </div>
      )}
      <div>
        <label className={labelCls}>Already on In Process? (optional)</label>
        <input value={draft.inProcessUrl} onChange={(e) => setDraft({ ...draft, inProcessUrl: e.target.value })} placeholder="https://inprocess.world/0x…" className={inputCls} />
        <p className="font-mono text-[10px] text-ink/40 mt-1">
          Paste your inprocess.world artist link and the moments you mint there show up in this process log automatically.
        </p>
      </div>
      {error && <p className="font-mono text-[11px]" style={{ color: ORANGE }}>{error}</p>}
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={save} disabled={saving || !draft.title.trim() || (makingProject && !newProjectName.trim())} className={btnLime}>
          {saving ? 'Saving…' : existing ? 'Save' : makingProject ? 'Create project + roadmap' : 'Create roadmap'}
        </button>
        <button onClick={onClose} className={btnGhost}>Cancel</button>
        {existing && (
          confirmingDelete
            ? <button onClick={remove} className="font-mono text-[11px] uppercase tracking-[1px] px-3 py-1.5 rounded-sm cursor-pointer border-none font-bold" style={{ backgroundColor: ORANGE, color: 'var(--bone)' }}>Really delete everything?</button>
            : <button onClick={() => setConfirmingDelete(true)} className="font-mono text-[11px] uppercase underline cursor-pointer bg-transparent border-none" style={{ color: ORANGE }}>Delete roadmap</button>
        )}
      </div>
    </div>
  );
}
