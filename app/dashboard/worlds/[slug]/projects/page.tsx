'use client';

import { useState } from 'react';
import { ProjectEditor } from '../../../_components/ProjectEditor';
import { ProjectItem } from '../../../_components/types';
import { ReadOnlyBanner } from '../../../_components/ReadOnlyBanner';
import ConfirmDialog from '../../../../components/ConfirmDialog';
import ProjectThumb from '../../../../components/ProjectThumb';
import { ProjectBuilder } from '../../../../components/builder/project/ProjectBuilder';
import { useWorldDashboard } from '../layout';

export default function WorldProjectsPage() {
  const { world, projects, setProjects, allTools, privyId, isBuilder } = useWorldDashboard();
  const [editingProject, setEditingProject] = useState<ProjectItem | null | 'new'>(null);
  // Bot-first: + Project opens the builder; its "Use the form instead" link
  // swaps to the classic ProjectEditor (which also stays the edit surface).
  const [building, setBuilding] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const deleteProject = async (id: string) => {
    if (!world || !isBuilder) return;
    try {
      const res = await fetch('/api/worlds/projects', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId: id, worldId: world.id, privyId }) });
      if (res.ok) setProjects(p => p.filter(x => x.id !== id));
    } catch { /* */ }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <span className="font-mono text-[11px] uppercase tracking-[2px] text-ink/40">
          Projects · {projects.length}
        </span>
        {isBuilder && !editingProject && (
          <button
            onClick={() => setBuilding(true)}
            className="font-mono text-[11px] uppercase tracking-[2px] bg-lime text-obsidian font-bold px-3 py-1.5 rounded-sm hover:opacity-90 transition cursor-pointer border-none"
          >
            + Project
          </button>
        )}
      </div>

      {!isBuilder && <ReadOnlyBanner />}

      {isBuilder && building && (
        <ProjectBuilder
          worldId={world.id}
          privyId={privyId}
          members={world.members}
          allTools={allTools}
          onExitToForm={() => { setBuilding(false); setEditingProject('new'); }}
          onClose={() => setBuilding(false)}
          onCreated={(p) => { setProjects(prev => [...prev, p]); setBuilding(false); }}
        />
      )}

      {/* Editor — builders only */}
      {isBuilder && editingProject && (
        <div className="mb-6">
          <ProjectEditor
            project={editingProject === 'new' ? null : editingProject}
            worldId={world.id}
            privyId={privyId}
            allTools={allTools}
            worldMembers={world.members}
            onSave={(p) => {
              if (editingProject === 'new') setProjects(prev => [...prev, p]);
              else setProjects(prev => prev.map(x => x.id === p.id ? p : x));
              setEditingProject(null);
            }}
            onCancel={() => setEditingProject(null)}
          />
        </div>
      )}

      {/* Card grid */}
      {projects.length > 0 && !editingProject && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map(p => {
            const pTags = ((p.tags as string[]) || []).filter(t => !t.startsWith('tool:'));
            const pTools = ((p.tags as string[]) || []).filter(t => t.startsWith('tool:')).map(t => t.replace('tool:', ''));
            return (
              <div key={p.id} className="border border-ink/[0.08] rounded-lg overflow-hidden bg-[var(--page-bg)] group relative">
                {/* Image */}
                <div className="w-full h-32 overflow-hidden">
                  <ProjectThumb imageUrl={p.imageUrl} name={p.name} initialClassName="text-[28px]" />
                </div>
                {/* Info */}
                <div className="p-3">
                  <h4 className="font-mono text-[13px] font-bold uppercase text-ink truncate mb-0.5">{p.name}</h4>
                  {p.description && <p className="font-mono text-[12px] text-ink/50 truncate mb-2">{p.description}</p>}
                  {(pTags.length > 0 || pTools.length > 0) && (
                    <div className="flex flex-wrap gap-1">
                      {pTags.map(t => <span key={t} className="font-mono text-[10px] uppercase tracking-[1px] px-1.5 py-0.5 rounded-sm border border-ink/15 text-ink/55">{t}</span>)}
                      {pTools.map(t => <span key={t} className="font-mono text-[10px] uppercase tracking-[1px] px-1.5 py-0.5 rounded-sm bg-lime text-obsidian">{t}</span>)}
                    </div>
                  )}
                  {/* Saved credits, visible right on the card — the builder's
                      confirmation that their add actually persisted. */}
                  {(p.credits?.length ?? 0) > 0 && (
                    <div className="flex items-center gap-1.5 mt-2">
                      <span className="flex items-center">
                        {p.credits!.slice(0, 5).map((c, i) => (
                          c.avatarUrl
                            /* eslint-disable-next-line @next/next/no-img-element */
                            ? <img key={c.userId} src={c.avatarUrl} alt="" className="w-5 h-5 rounded-full object-cover border border-[var(--page-bg)]" style={{ marginLeft: i ? -6 : 0 }} />
                            : <span key={c.userId} className="w-5 h-5 rounded-full flex items-center justify-center font-mono text-[8px] font-bold bg-ink/10 text-ink/60 border border-[var(--page-bg)]" style={{ marginLeft: i ? -6 : 0 }}>{(c.name || c.username || '?')[0].toUpperCase()}</span>
                        ))}
                      </span>
                      <span className="font-mono text-[10px] text-ink/40">
                        {p.credits!.length} credit{p.credits!.length > 1 ? 's' : ''}
                      </span>
                    </div>
                  )}
                </div>
                {/* Actions — builders only. Always visible on touch; hover-reveal on pointer devices. */}
                {isBuilder && (
                  <div className="absolute top-2 right-2 flex gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                    <button onClick={() => setEditingProject(p)} className="font-mono text-[10px] uppercase tracking-[1px] px-2.5 py-1 rounded-sm bg-obsidian text-bone hover:opacity-80 transition cursor-pointer border-none">Edit</button>
                    <button onClick={() => setConfirmDeleteId(p.id)} className="font-mono text-[10px] uppercase tracking-[1px] px-2.5 py-1 rounded-sm bg-orange text-obsidian hover:opacity-80 transition cursor-pointer border-none">Delete</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {projects.length === 0 && !editingProject && (
        <div className="border-2 border-dashed border-ink/15 rounded-lg py-12 text-center">
          <p className="font-mono text-[12px] text-ink/40 mb-3">No projects yet — projects are the pins on your world&apos;s globe.</p>
          {isBuilder && (
            <button
              onClick={() => setBuilding(true)}
              className="font-mono text-[11px] uppercase tracking-[2px] bg-lime text-obsidian font-bold px-4 py-2 rounded-sm hover:opacity-90 transition cursor-pointer border-none"
            >
              + Add your first project
            </button>
          )}
        </div>
      )}

      {confirmDeleteId && (
        <ConfirmDialog
          title="Delete this project?"
          body="This removes it from the world's globe. This can't be undone."
          confirmLabel="Delete"
          destructive
          onConfirm={() => { deleteProject(confirmDeleteId); setConfirmDeleteId(null); }}
          onCancel={() => setConfirmDeleteId(null)}
        />
      )}
    </div>
  );
}
