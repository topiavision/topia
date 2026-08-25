'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { WorldConfig } from '../worldConfig';
import { btnLime, btnGhost } from '../InProcessFields';
import Tour from '../../Tour';
import { IP_TOUR } from './tour';
import { ORANGE } from './constants';
import { Masthead } from './Masthead';
import { HowThisWorks } from './HowThisWorks';
import { EraForm } from './EraForm';
import { EraSection } from './EraSection';
import { RoadmapBuilder } from './builder/RoadmapBuilder';
import type { EraView, ProjectOption } from './types';
import { useFundingGoals } from './funding/useFundingGoals';
import { FundingReturn } from './funding/FundingReturn';
/* The IN PROCESS roadmap — Latashá's Turn-2 mockup, minus funding.
 *
 * Structure follows her model: each PROJECT carries its own roadmap (the
 * "era" — ORBIT ONE the era IS ORBIT ONE the project), drawn as a horizontal
 * node timeline: filled orange nodes for DONE, a ring on NOW with its card
 * highlighted, hollow nodes ahead. A process log of typed posts (moment /
 * thought / link / embed) runs underneath, merged with the moments synced
 * from inprocess.world.
 *
 * This component is ALSO the editor: builders add and edit everything right
 * here on the world page — no dashboard round-trip. */

/* ── The layer ─────────────────────────────────────────────────────── */
export default function InProcessLayer({
  eras, worldId, slug: _slug, projects, canEdit, onChanged, projectScope,
}: {
  config?: WorldConfig;
  eras: EraView[];
  worldId: string;
  slug: string;
  projects: ProjectOption[];
  canEdit: boolean;
  onChanged: () => void;
  /** When set, this renders on a project page: only that project's roadmap,
   * no project chips, and new roadmaps are created pre-linked. */
  projectScope?: string;
}) {
  const { user, getAccessToken } = usePrivy();
  /* Funding goals for this world, fetched once per mount and keyed by target.
   * A world with no goals gets one empty response and renders exactly as it
   * always has — funding is opt-in per milestone. */
  const { goals, acceptingSupport, reload: reloadGoals } = useFundingGoals(worldId);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    // Needed only to authorise goal writes; harmless when absent.
    getAccessToken().then((t) => { if (!cancelled) setAccessToken(t); }).catch(() => {});
    return () => { cancelled = true; };
  }, [getAccessToken]);
  const privyId = user?.id ?? '';
  const [creating, setCreating] = useState(false);
  const [building, setBuilding] = useState(false);
  const [canMint, setCanMint] = useState(false);

  useEffect(() => {
    if (!canEdit || !privyId) return;
    fetch(`/api/in-process/connect?privyId=${encodeURIComponent(privyId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setCanMint(!!(d?.configured && d?.connected)))
      .catch(() => {});
  }, [canEdit, privyId]);

  const scoped = projectScope ? eras.filter((e) => e.projectId === projectScope) : eras;
  const visible = scoped.filter((e) => e.status !== 'archived' || canEdit);
  const creatableProjects = projectScope ? projects.filter((p) => p.id === projectScope) : projects;

  const startCreate = useCallback(() => setCreating(true), []);

  // With several projects carrying roadmaps, the tab becomes a switcher:
  // one project's full roadmap at a time instead of an endless stack.
  // Single-roadmap worlds see no pills — nothing changes for them.
  const [pickedGroup, setPickedGroup] = useState<string | null>(null);

  // The builder saved a whole roadmap in one shot: refetch, and point the
  // switcher at the new roadmap's group so it's visible immediately even in
  // multi-project worlds.
  const handleBuilt = useCallback((era: EraView) => {
    setBuilding(false);
    setPickedGroup(era.projectId ?? '__world__');
    onChanged();
  }, [onChanged]);
  const groupOrder: string[] = [];
  const byGroup: Record<string, EraView[]> = {};
  for (const e of visible) {
    const k = e.projectId ?? '__world__';
    if (!byGroup[k]) { byGroup[k] = []; groupOrder.push(k); }
    byGroup[k].push(e);
  }
  const hasSwitcher = !projectScope && groupOrder.length > 1;
  // Default to whichever project is actively in motion.
  const defaultGroup = groupOrder.find((k) =>
    byGroup[k].some((e) => e.status === 'active' && e.milestones.some((m) => m.status === 'now'))
  ) ?? groupOrder[0];
  const currentGroup = pickedGroup && byGroup[pickedGroup] ? pickedGroup : defaultGroup;
  const shownEras = hasSwitcher ? byGroup[currentGroup] : visible;
  const groupLabel = (k: string) => (k === '__world__' ? 'This world' : byGroup[k][0].projectName ?? byGroup[k][0].title);
  const groupInMotion = (k: string) => byGroup[k].some((e) => e.status === 'active' && e.milestones.some((m) => m.status === 'now'));

  if (visible.length === 0 && !creating) {
    return (
      <div className="bg-[var(--page-bg)] p-4">
        <Masthead canEdit={canEdit} canMint={canMint} />
        <div className="flex flex-col items-center justify-center gap-3 py-12 px-4 text-center">
          <span className="font-mono text-[11px] text-ink/30 uppercase tracking-wider">No roadmap yet</span>
          {canEdit && (
            <>
              <p className="font-mono text-[11px] text-ink/40 max-w-sm">
                A roadmap tells the story of {projectScope ? 'this project' : 'a project'} in milestones — what&apos;s done,
                what&apos;s in motion, what&apos;s next. {!projectScope && 'No project yet? You can make one as you go.'}
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <button onClick={() => setBuilding(true)} className={btnLime}>✦ Build it for me</button>
                <button id="tour-ip-start" onClick={startCreate} className={btnGhost}>+ Start a roadmap</button>
              </div>
            </>
          )}
        </div>
        <HowThisWorks canEdit={canEdit} />
        <Tour tourKey="inprocess" privyId={privyId} enabled={canEdit} steps={IP_TOUR} />
        {building && (
          <RoadmapBuilder
            worldId={worldId}
            projects={creatableProjects}
            projectScope={projectScope}
            privyId={privyId}
            canFund={canEdit}
            accessToken={accessToken}
            onClose={() => setBuilding(false)}
            onCreated={handleBuilt}
          />
        )}
      </div>
    );
  }

  return (
    <div className="bg-[var(--page-bg)] p-4 flex flex-col gap-10">
      <div className="flex flex-col gap-0">
        <Masthead canEdit={canEdit} canMint={canMint} />
        {/* Backers land here from Stripe — confirm, then refresh the meters. */}
        <FundingReturn onCredited={() => reloadGoals()} />
        {hasSwitcher && (
          <div id="tour-ip-pills" className="flex flex-wrap items-center gap-1.5 pt-3.5">
            <span className="font-mono text-[9px] uppercase tracking-[2px] text-ink/35 mr-1.5">Roadmaps</span>
            {groupOrder.map((k) => {
              const active = k === currentGroup;
              return (
                <button
                  key={k}
                  onClick={() => setPickedGroup(k)}
                  aria-pressed={active}
                  className={`inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[1px] px-2.5 py-1.5 rounded-full cursor-pointer transition ${
                    active
                      ? 'bg-lime text-obsidian font-bold border-none'
                      : 'bg-transparent text-ink/55 border border-ink/15 hover:border-ink/40 hover:text-ink/80'
                  }`}
                >
                  {groupLabel(k)}
                  {groupInMotion(k) && (
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: active ? '#1a1a1a' : ORANGE }} />
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
      {creating && (
        <EraForm
          worldId={worldId}
          projects={creatableProjects}
          privyId={privyId}
          onClose={() => setCreating(false)}
          onChanged={onChanged}
        />
      )}
      {shownEras.map((era, eraIdx) => (
        <EraSection
          tourAnchor={eraIdx === 0}
          key={era.id}
          era={era}
          worldId={worldId}
          worldSlug={_slug}
          projects={projects}
          privyId={privyId}
          canEdit={canEdit}
          canMint={canMint}
          onChanged={onChanged}
          hideProjectChip={!!projectScope}
          goals={goals}
          canFund={canEdit}
          acceptingSupport={acceptingSupport}
          accessToken={accessToken}
          onGoalsChanged={reloadGoals}
        />
      ))}
      {canEdit && !creating && visible.length > 0 && !projectScope && (
        <div className="flex flex-wrap items-center gap-2 self-start">
          <button id="tour-ip-add" onClick={startCreate} className={btnGhost}>+ Roadmap for another project</button>
          <button onClick={() => setBuilding(true)} className={btnGhost} style={{ color: ORANGE }}>✦ Build one for me</button>
        </div>
      )}
      <HowThisWorks canEdit={canEdit} />
      <Tour tourKey="inprocess" privyId={privyId} enabled={canEdit} steps={IP_TOUR} />
      {building && (
        <RoadmapBuilder
          worldId={worldId}
          projects={creatableProjects}
          projectScope={projectScope}
          privyId={privyId}
          canFund={canEdit}
          accessToken={accessToken}
          onClose={() => setBuilding(false)}
          onCreated={handleBuilt}
        />
      )}
    </div>
  );
}
