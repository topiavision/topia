'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BuilderCommand, DraftRoadmap, TemplateId } from '@/lib/roadmap-builder/types';
import { applyCommand, draftToBatchPayload, matchMilestone, parseUtterance, parseDollars } from '@/lib/roadmap-builder/commands';
import { parseSeed } from '@/lib/roadmap-builder/parse';
import { TEMPLATES, instantiate, templateById } from '@/lib/roadmap-builder/templates';
import { addMonths } from '@/lib/roadmap-builder/dates';
import { draftFromEra, diffToPatches, idForKey } from '@/lib/roadmap-builder/edit';
import { BuilderShell } from '../../../builder/BuilderShell';
import { ChatPane } from '../../../builder/ChatPane';
import { useBuilderChat } from '../../../builder/useBuilderChat';
import { EraDateField, type Precision } from '../../InProcessFields';
import type { EraMilestoneView, EraView, ProjectOption } from '../types';
import type { GoalMap } from '../funding/types';
import { COPY, CHIP, type Stage } from './script';
import type { Chip } from './chips';
import { DraftCanvas } from './DraftCanvas';

/* The Roadmap Builder — a chat that assembles a roadmap on a live canvas.
 * Chrome (portal/scroll-lock/layouts) comes from the shared BuilderShell;
 * this file owns the conversation. No LLM behind it: chips cover every
 * forward path and the free-text parser (lib/roadmap-builder) is sugar.
 * Nothing touches the network until Save, which fires ONE batch call.
 *
 * The draft lives in a ref mirrored to state: the reducer runs synchronously
 * against the ref (chat handlers need the fresh draft immediately), state
 * only drives rendering. */

export function RoadmapBuilder({ worldId, projects, projectScope, privyId, canFund, accessToken, onClose, onCreated, existing, goals, seedText, onEdited }: {
  worldId: string;
  projects: ProjectOption[];
  projectScope?: string;
  privyId: string;
  /** Show funding affordances (same bar as MilestoneModal — the server
   * enforces the real grant either way). */
  canFund?: boolean;
  /** Privy access token — goal writes are bearer-verified. */
  accessToken?: string | null;
  onClose: () => void;
  onCreated: (era: EraView) => void;
  /** EDIT MODE: a persisted era to manage live — every command saves
   * immediately via the partial-patch APIs. Create-mode staging is skipped. */
  existing?: EraView;
  goals?: GoalMap;
  /** Text from an AssistantBar — processed as the first user message. */
  seedText?: string;
  /** Called after any successful live edit so the page can refetch. */
  onEdited?: () => void;
}) {
  const editing = Boolean(existing);
  const scopedProject = projectScope ? projects.find((p) => p.id === projectScope) ?? null : null;

  const templateChips = useMemo<Chip[]>(
    () => TEMPLATES.map((t) => ({ label: t.chipLabel, t: 'template' as const, id: t.id })),
    [],
  );

  const { messages, chips, setChips, typing, pushUser, pushBot, pushBotAfter } = useBuilderChat<Chip>(() => {
    if (existing) return { text: COPY.editIntro(existing.title), chips: [] };
    if (scopedProject) return { text: COPY.describeExisting(scopedProject.name), chips: templateChips };
    if (projects.length === 0) return { text: COPY.describeNew, chips: templateChips };
    return {
      text: COPY.intro,
      chips: [
        ...projects.slice(0, 6).map((p) => ({ label: p.name, t: 'project' as const, id: p.id, name: p.name })),
        { label: CHIP.newProject, t: 'new_project' as const },
        { label: CHIP.worldWide, t: 'world_wide' as const },
      ],
    };
  });

  const [stage, setStage] = useState<Stage>(() =>
    existing ? 'refine' : (scopedProject || projects.length === 0) ? 'describe' : 'project');
  const [draft, setDraftState] = useState<DraftRoadmap | null>(() =>
    existing
      ? draftFromEra(existing, goals && new Map([...goals.entries()].map(([k, g]) => [k, { goalCents: g.goalCents, blurb: g.blurb }])))
      : null);
  const [saving, setSaving] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [pendingIntent, setPendingIntent] = useState<null | { type: 'add' } | { type: 'rename'; index: number } | { type: 'goal'; index: number }>(null);

  const draftRef = useRef<DraftRoadmap | null>(draft);
  const setDraft = useCallback((d: DraftRoadmap | null) => {
    draftRef.current = d;
    setDraftState(d);
  }, []);
  // The pre-seed project choice — only matters once, when the seed builds the
  // draft. Zero-project worlds start committed to "new project".
  const projectChoice = useRef<DraftRoadmap['project'] | null>(
    !projectScope && projects.length === 0 ? { mode: 'new', name: '' } : null,
  );
  // Whether the seed still needs a timeframe question.
  const needTimeframe = useRef(true);
  // Stashed after a save whose funding goals partially failed, so the
  // "take me to it" chip can still land the user on their new roadmap.
  const createdEra = useRef<EraView | null>(null);

  const refineChips = useCallback((): Chip[] => [
    { label: CHIP.addMilestone, t: 'add' },
    { label: CHIP.changeTimeline, t: 'timeline' },
    { label: CHIP.markDone, t: 'mark_done' },
    { label: CHIP.rename, t: 'rename' },
    ...(canFund ? [{ label: CHIP.fund, t: 'fund' as const }] : []),
    editing
      ? { label: CHIP.doneEditing, t: 'done_edit' as const, accent: true }
      : { label: CHIP.save, t: 'save' as const, accent: true },
  ], [canFund, editing]);

  /* ── Draft plumbing ───────────────────────────────────────────────── */

  /* EDIT MODE: turn a successful reducer step into immediate API writes.
   * The canvas is optimistic; any failed patch rolls the draft back so it
   * never lies about what's saved. */
  const runLivePatches = useCallback(async (prev: DraftRoadmap, next: DraftRoadmap, cmd: BuilderCommand) => {
    if (!existing) return;
    const patches = diffToPatches(prev, next);
    for (const p of patches) {
      let res: Response;
      if (p.kind === 'era-put') {
        res = await fetch('/api/worlds/eras', {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ privyId, eraId: existing.id, ...p.body }),
        });
      } else if (p.kind === 'ms-put') {
        res = await fetch('/api/worlds/eras/milestones', {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ privyId, milestoneId: p.milestoneId, ...p.body }),
        });
      } else if (p.kind === 'ms-post') {
        res = await fetch('/api/worlds/eras/milestones', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ privyId, eraId: existing.id, ...p.body }),
        });
        if (res.ok) {
          const data = await res.json().catch(() => null);
          const newId = data?.milestone?.id;
          if (newId) {
            // Reconcile the client key with the real row id for later edits.
            const cur = draftRef.current;
            if (cur) {
              setDraft({
                ...cur,
                milestones: cur.milestones.map((m) => (m.key === p.clientKey ? { ...m, key: `ex-${newId}` } : m)),
              });
            }
          }
          continue;
        }
      } else {
        res = await fetch(`/api/worlds/eras/milestones?milestoneId=${encodeURIComponent(p.milestoneId)}&privyId=${encodeURIComponent(privyId)}`, { method: 'DELETE' });
      }
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(typeof d?.error === 'string' ? d.error : 'save failed');
      }
    }
    // Funding rides separately (the diff ignores goal fields) — same
    // bearer-verified call the MilestoneModal makes.
    if (cmd.kind === 'set_goal') {
      const m = matchMilestone(cmd.ref, next.milestones);
      const target = m.ok ? next.milestones[m.index] : null;
      const milestoneId = target ? idForKey(target.key) : null;
      if (milestoneId) {
        const gRes = await fetch('/api/funding/goals', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          },
          body: JSON.stringify({
            privyId, targetType: 'milestone', targetId: milestoneId,
            goalCents: cmd.cents, blurb: (target?.goalBlurb ?? '').trim() || null,
          }),
        });
        if (!gRes.ok) {
          const d = await gRes.json().catch(() => ({}));
          throw new Error(typeof d?.error === 'string' ? d.error : 'the funding goal could not be saved');
        }
      }
    }
    onEdited?.();
  }, [existing, privyId, accessToken, setDraft, onEdited]);

  // Every command flows through here: reducer against the ref + bot reply.
  // In edit mode a successful step also persists immediately.
  const dispatch = useCallback((cmd: BuilderCommand, opts?: { silent?: boolean }) => {
    const prev = draftRef.current;
    if (!prev) return;
    const result = applyCommand(prev, cmd, new Date());
    setDraft(result.draft);

    if (editing && result.ok) {
      void pushBotAfter((async () => {
        try {
          await runLivePatches(prev, result.draft, cmd);
          return `${result.reply} ✓ saved.`;
        } catch (e) {
          setDraft(prev); // roll the canvas back — it must never lie
          return `That didn't save — ${e instanceof Error ? e.message : 'something went wrong'}. Nothing changed.`;
        }
      })());
      if (!opts?.silent) setChips(refineChips());
      return;
    }

    if (opts?.silent) return;
    pushBot(result.reply);
    // A ref that missed or was ambiguous: offer the candidates (or the full
    // list) as chips so the miss is never a dead end.
    if (!result.ok && 'ref' in cmd) {
      const m = matchMilestone(cmd.ref, prev.milestones);
      if (!m.ok) {
        const pool = m.candidates.length > 0 ? m.candidates : prev.milestones.map((_, i) => i);
        setChips([
          ...pool.slice(0, 6).map((i) => ({
            label: prev.milestones[i].title, t: 'pick_ms' as const, index: i,
            cmd: { ...cmd, ref: { index: i } } as BuilderCommand,
          })),
          { label: CHIP.cancel, t: 'cancel' as const },
        ]);
        return;
      }
    }
    setChips(refineChips());
  }, [editing, setDraft, pushBot, pushBotAfter, setChips, refineChips, runLivePatches]);

  const enterRefine = useCallback((withIntro: boolean) => {
    setStage('refine');
    if (withIntro && draftRef.current) pushBot(COPY.firstDraft(draftRef.current), 420);
    setChips(refineChips());
  }, [pushBot, setChips, refineChips]);

  // After the draft exists, route to whichever question is still open.
  const advanceFromSeed = useCallback(() => {
    const d = draftRef.current;
    if (!d) return;
    if (d.project.mode === 'new' && !d.project.name) {
      setStage('name_project');
      pushBot(COPY.nameProject, 380);
      setChips([{ label: CHIP.skipName, t: 'skip_name' }]);
    } else if (needTimeframe.current) {
      setStage('timeframe');
      pushBot(COPY.timeframe, 380);
      setChips([
        { label: CHIP.in3Months, t: 'months', n: 3 },
        { label: CHIP.in6Months, t: 'months', n: 6 },
        { label: CHIP.inAYear, t: 'months', n: 12 },
        { label: CHIP.pickDate, t: 'pick_date' },
        { label: CHIP.skipTimeframe, t: 'skip_timeframe' },
      ]);
    } else {
      enterRefine(true);
    }
  }, [pushBot, setChips, enterRefine]);

  const seedDraft = useCallback((templateId: TemplateId, opts: {
    projectName: string | null; quantity: number | null;
    end: DraftRoadmap['end']; fromFreeText: boolean;
  }) => {
    const now = new Date();
    const base: DraftRoadmap['project'] = scopedProject
      ? { mode: 'existing', id: scopedProject.id, name: scopedProject.name }
      : (projectChoice.current ?? { mode: 'new', name: opts.projectName ?? '' });
    // A name extracted from the seed fills a still-unnamed new project.
    const project = base.mode === 'new' && !base.name && opts.projectName
      ? { mode: 'new' as const, name: opts.projectName }
      : base;
    const titleSource = project.mode === 'none' ? opts.projectName : (project.mode === 'new' ? project.name || opts.projectName : project.name);
    const d = instantiate(templateById(templateId), {
      projectName: titleSource || null,
      quantity: opts.quantity,
      end: opts.end,
      now,
    });
    d.project = project;
    needTimeframe.current = !opts.end;
    setDraft(d);
    if (templateId === 'generic' && opts.fromFreeText) pushBot(COPY.genericSeed, 200);
    advanceFromSeed();
  }, [scopedProject, setDraft, pushBot, advanceFromSeed]);

  /* ── Save ─────────────────────────────────────────────────────────── */
  const save = useCallback(async () => {
    const d = draftRef.current;
    if (!d || saving) return;
    setSaving(true);
    setStage('saving');
    setChips([]);
    pushBot(COPY.saving, 100);
    try {
      const res = await fetch('/api/worlds/eras/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draftToBatchPayload(d, worldId, privyId)),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.era) {
        const era = data.era as EraView;

        /* Funding goals ride AFTER the roadmap exists — same shape as
         * MilestoneModal: bearer-verified, best-effort, and a failed goal
         * never un-saves the roadmap. Draft milestones map onto created rows
         * by sortOrder (the batch route inserts them in draft order). */
        const funded = d.milestones
          .map((m, i) => ({ m, i }))
          .filter(({ m }) => m.goalCents != null || (m.goalBlurb ?? '').trim() !== '');
        let failures = 0;
        let firstError: string | null = null;
        if (canFund && funded.length > 0) {
          const bySort = new Map(era.milestones.map((row) => {
            const sort = (row as EraMilestoneView & { sortOrder?: number }).sortOrder;
            return [sort ?? -1, row.id] as const;
          }));
          for (const { m, i } of funded) {
            const milestoneId = bySort.get(i);
            if (!milestoneId) { failures++; continue; }
            try {
              const gRes = await fetch('/api/funding/goals', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
                },
                body: JSON.stringify({
                  privyId,
                  targetType: 'milestone',
                  targetId: milestoneId,
                  goalCents: m.goalCents,
                  blurb: (m.goalBlurb ?? '').trim() || null,
                }),
              });
              if (!gRes.ok) {
                failures++;
                if (!firstError) {
                  const gd = await gRes.json().catch(() => ({}));
                  firstError = typeof gd?.error === 'string' ? gd.error : null;
                }
              }
            } catch { failures++; }
          }
        }

        if (failures > 0) {
          // The roadmap is real; only some goals aren't. Say so and let the
          // user land on it rather than pretending the save failed.
          createdEra.current = era;
          setSaving(false);
          setStage('done');
          pushBot(COPY.savedPartialGoals(failures, firstError), 200);
          setChips([{ label: CHIP.finishPartial, t: 'finish_partial' }]);
          return;
        }
        onCreated(era);
        return;
      }
      setSaving(false);
      setStage('refine');
      pushBot(COPY.saveFailed(typeof data?.error === 'string' ? data.error : null), 200);
      setChips([{ label: CHIP.tryAgain, t: 'try_again' }, { label: CHIP.keepEditing, t: 'keep_editing' }]);
    } catch {
      setSaving(false);
      setStage('refine');
      pushBot(COPY.saveFailed(null), 200);
      setChips([{ label: CHIP.tryAgain, t: 'try_again' }, { label: CHIP.keepEditing, t: 'keep_editing' }]);
    }
  }, [saving, worldId, privyId, canFund, accessToken, onCreated, pushBot, setChips]);

  /* ── Input handling ───────────────────────────────────────────────── */
  const handleText = useCallback((raw: string) => {
    const text = raw.trim();
    if (!text || stage === 'saving') return;
    pushUser(text);
    setShowDatePicker(false);

    if (stage === 'project' || stage === 'describe') {
      // Typing at the project question reads as a description — assume a new
      // project and seed straight from the text.
      if (stage === 'project') projectChoice.current = { mode: 'new', name: '' };
      const seed = parseSeed(text, new Date());
      seedDraft(seed.templateId, { projectName: seed.projectName, quantity: seed.quantity, end: seed.end, fromFreeText: true });
      return;
    }
    if (stage === 'name_project') {
      const name = text.slice(0, 80);
      const d = draftRef.current;
      if (d) setDraft({ ...d, title: name, project: d.project.mode === 'new' ? { mode: 'new', name } : d.project });
      advanceFromSeed();
      return;
    }
    if (pendingIntent?.type === 'add') {
      setPendingIntent(null);
      dispatch(parseUtterance(`add ${text}`, new Date()));
      return;
    }
    if (pendingIntent?.type === 'rename') {
      const idx = pendingIntent.index;
      setPendingIntent(null);
      dispatch({ kind: 'rename_milestone', ref: { index: idx }, title: text });
      return;
    }
    if (pendingIntent?.type === 'goal') {
      const cents = parseDollars(text);
      if (cents === null) {
        pushBot(COPY.fundAmountRetry);
        return; // keep the intent — they'll try another amount
      }
      setPendingIntent(null);
      dispatch({ kind: 'set_goal', ref: { index: pendingIntent.index }, cents });
      return;
    }
    const cmd = parseUtterance(text, new Date());
    if (stage === 'timeframe') {
      if (cmd.kind === 'set_timeframe') {
        dispatch(cmd, { silent: true });
        enterRefine(true);
      } else {
        pushBot(COPY.timeframePrompt);
      }
      return;
    }
    dispatch(cmd);
  }, [stage, pendingIntent, pushUser, pushBot, seedDraft, dispatch, advanceFromSeed, enterRefine, setDraft]);

  const handleTextRef = useRef(handleText);
  handleTextRef.current = handleText;

  const handleChip = useCallback((chip: Chip) => {
    if (stage === 'saving') return;
    pushUser(chip.label);
    setShowDatePicker(false);
    switch (chip.t) {
      case 'project':
        projectChoice.current = { mode: 'existing', id: chip.id, name: chip.name };
        setStage('describe');
        pushBot(COPY.describeExisting(chip.name));
        setChips(templateChips);
        break;
      case 'new_project':
        projectChoice.current = { mode: 'new', name: '' };
        setStage('describe');
        pushBot(COPY.describeNew);
        setChips(templateChips);
        break;
      case 'world_wide':
        projectChoice.current = { mode: 'none' };
        setStage('describe');
        pushBot(COPY.describeWorldWide);
        setChips(templateChips);
        break;
      case 'template':
        seedDraft(chip.id, { projectName: null, quantity: null, end: null, fromFreeText: false });
        break;
      case 'skip_name': {
        // Project borrows the era title so nothing ships unnamed.
        const d = draftRef.current;
        if (d) setDraft({ ...d, project: d.project.mode === 'new' ? { mode: 'new' as const, name: d.title } : d.project });
        advanceFromSeed();
        break;
      }
      case 'months': {
        const now = new Date();
        const r = addMonths(now.getFullYear(), now.getMonth() + 1, chip.n);
        dispatch({ kind: 'set_timeframe', start: null, end: { value: `${r.y}-${String(r.m).padStart(2, '0')}-01`, precision: 'month' } }, { silent: true });
        enterRefine(true);
        break;
      }
      case 'pick_date':
        setShowDatePicker(true);
        break;
      case 'skip_timeframe':
        enterRefine(true);
        break;
      case 'add':
        setPendingIntent({ type: 'add' });
        pushBot(COPY.addPrompt);
        setChips([{ label: CHIP.cancel, t: 'cancel' }]);
        break;
      case 'timeline':
        pushBot(COPY.timeframePrompt);
        setChips([{ label: CHIP.cancel, t: 'cancel' }]);
        break;
      case 'mark_done':
        pushBot(COPY.markDonePrompt);
        setChips([
          ...(draftRef.current?.milestones ?? []).slice(0, 8).map((m, i) => ({
            label: m.title, t: 'pick_ms' as const, index: i,
            cmd: { kind: 'set_status', ref: { index: i }, status: 'done' } as BuilderCommand,
          })),
          { label: CHIP.cancel, t: 'cancel' },
        ]);
        break;
      case 'rename':
        pushBot(COPY.renamePickPrompt);
        setChips([
          ...(draftRef.current?.milestones ?? []).slice(0, 8).map((m, i) => ({
            label: m.title, t: 'pick_ms' as const, index: i, rename: true,
          })),
          { label: CHIP.cancel, t: 'cancel' },
        ]);
        break;
      case 'fund':
        pushBot(COPY.fundPickPrompt);
        setChips([
          ...(draftRef.current?.milestones ?? []).slice(0, 8).map((m, i) => ({
            label: m.goalCents != null ? `${m.title} ·$` : m.title,
            t: 'pick_ms' as const, index: i, goal: true,
          })),
          { label: CHIP.cancel, t: 'cancel' },
        ]);
        break;
      case 'pick_ms':
        if (chip.rename) {
          setPendingIntent({ type: 'rename', index: chip.index });
          pushBot(COPY.renameTextPrompt(draftRef.current?.milestones[chip.index]?.title ?? ''));
          setChips([{ label: CHIP.cancel, t: 'cancel' }]);
        } else if (chip.goal) {
          setPendingIntent({ type: 'goal', index: chip.index });
          pushBot(COPY.fundAmountPrompt(draftRef.current?.milestones[chip.index]?.title ?? ''));
          setChips([{ label: CHIP.cancel, t: 'cancel' }]);
        } else if (chip.cmd) {
          dispatch(chip.cmd);
        }
        break;
      case 'save':
      case 'try_again':
        void save();
        break;
      case 'done_edit':
        onEdited?.();
        onClose();
        break;
      case 'finish_partial':
        if (createdEra.current) onCreated(createdEra.current);
        break;
      case 'keep_editing':
      case 'cancel':
        setPendingIntent(null);
        setChips(refineChips());
        break;
    }
  }, [stage, pushUser, pushBot, setChips, templateChips, seedDraft, dispatch, advanceFromSeed, enterRefine, refineChips, save, setDraft, onCreated]);

  /* Edit mode opens straight into refine chips; a seed from the
   * AssistantBar is processed as the first user message. Ref-guarded so
   * StrictMode's double effect can't run it twice. */
  const bootRef = useRef(false);
  useEffect(() => {
    if (bootRef.current) return;
    bootRef.current = true;
    if (editing) setChips(refineChips());
    if (seedText?.trim()) {
      // Let the intro land first, then process the seed like typed input.
      const t = setTimeout(() => handleTextRef.current(seedText), 250);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Silent edits from the canvas tap-editor — same reducer, no chat noise.
  const handleCanvasCommand = useCallback((cmd: BuilderCommand) => {
    dispatch(cmd, { silent: true });
  }, [dispatch]);

  const requestClose = useCallback(() => {
    if (saving) return;
    // Edit mode saves as it goes — closing is always safe.
    if (editing) { onEdited?.(); onClose(); return; }
    // Past the partial-goals notice the roadmap is already real — closing
    // means "take me to it", never "discard".
    if (createdEra.current) { onCreated(createdEra.current); return; }
    if (draftRef.current && !window.confirm('Discard this draft?')) return;
    onClose();
  }, [saving, editing, onClose, onCreated, onEdited]);

  const datePicker = showDatePicker ? (
    <div className="border border-ink/15 rounded-sm p-3 mb-2 bg-[var(--page-bg)]">
      <EraDateField
        label="Wraps"
        value={draft?.end?.value ?? ''}
        precision={(draft?.end?.precision ?? 'month') as Precision}
        onChange={({ value, precision }) => {
          if (!value) return;
          setShowDatePicker(false);
          dispatch({ kind: 'set_timeframe', start: null, end: { value, precision } }, { silent: true });
          if (stage === 'timeframe') enterRefine(true);
          else setChips(refineChips());
        }}
      />
    </div>
  ) : null;

  return (
    <BuilderShell
      title={editing ? 'Roadmap Assistant' : 'Roadmap Builder'}
      onRequestClose={requestClose}
      chat={
        <ChatPane
          messages={messages}
          chips={chips}
          onChip={handleChip}
          onSubmit={handleText}
          disabled={stage === 'saving' || stage === 'done'}
          typing={typing}
          extra={datePicker}
        />
      }
      canvas={
        <DraftCanvas
          draft={draft}
          selectedKey={selectedKey}
          onSelect={setSelectedKey}
          onCommand={handleCanvasCommand}
          canFund={canFund}
        />
      }
    />
  );
}
