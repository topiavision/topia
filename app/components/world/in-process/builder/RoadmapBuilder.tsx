'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { BuilderCommand, DraftRoadmap, TemplateId } from '@/lib/roadmap-builder/types';
import { applyCommand, draftToBatchPayload, matchMilestone, parseUtterance } from '@/lib/roadmap-builder/commands';
import { parseSeed } from '@/lib/roadmap-builder/parse';
import { TEMPLATES, instantiate, templateById } from '@/lib/roadmap-builder/templates';
import { addMonths } from '@/lib/roadmap-builder/dates';
import { EraDateField, type Precision } from '../../InProcessFields';
import { ORANGE } from '../constants';
import type { EraView, ProjectOption } from '../types';
import { COPY, CHIP, type Stage } from './script';
import { ChatPane, type ChatMessage, type Chip } from './ChatPane';
import { DraftCanvas } from './DraftCanvas';

/* The Roadmap Builder — a chat that assembles a roadmap on a live canvas.
 * No LLM behind it: chips cover every forward path and the free-text parser
 * (lib/roadmap-builder) is sugar on top. Nothing touches the network until
 * Save, which fires ONE batch call.
 *
 * The draft lives in a ref mirrored to state: the reducer runs synchronously
 * against the ref (chat handlers need the fresh draft immediately), state
 * only drives rendering. */

let msgId = 0;
const nextId = () => `bm${++msgId}`;

export function RoadmapBuilder({ worldId, projects, projectScope, privyId, onClose, onCreated }: {
  worldId: string;
  projects: ProjectOption[];
  projectScope?: string;
  privyId: string;
  onClose: () => void;
  onCreated: (era: EraView) => void;
}) {
  const [mounted, setMounted] = useState(false);
  // The opening turn is computed in state initializers (not an effect) so
  // StrictMode's double-run in dev can't duplicate the intro message.
  const opening = useRef<{ stage: Stage; text: string; chips: Chip[] } | null>(null);
  if (!opening.current) {
    const scoped = projectScope ? projects.find((p) => p.id === projectScope) ?? null : null;
    if (scoped) {
      opening.current = { stage: 'describe', text: COPY.describeExisting(scoped.name), chips: TEMPLATES.map((t) => ({ label: t.chipLabel, t: 'template' as const, id: t.id })) };
    } else if (projects.length === 0) {
      opening.current = { stage: 'describe', text: COPY.describeNew, chips: TEMPLATES.map((t) => ({ label: t.chipLabel, t: 'template' as const, id: t.id })) };
    } else {
      opening.current = {
        stage: 'project', text: COPY.intro,
        chips: [
          ...projects.slice(0, 6).map((p) => ({ label: p.name, t: 'project' as const, id: p.id, name: p.name })),
          { label: CHIP.newProject, t: 'new_project' as const },
          { label: CHIP.worldWide, t: 'world_wide' as const },
        ],
      };
    }
  }
  const [messages, setMessages] = useState<ChatMessage[]>(() => [{ id: nextId(), role: 'bot', text: opening.current!.text }]);
  const [chips, setChips] = useState<Chip[]>(() => opening.current!.chips);
  const [stage, setStage] = useState<Stage>(() => opening.current!.stage);
  const [draft, setDraftState] = useState<DraftRoadmap | null>(null);
  const [saving, setSaving] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [pendingIntent, setPendingIntent] = useState<null | { type: 'add' } | { type: 'rename'; index: number }>(null);

  const draftRef = useRef<DraftRoadmap | null>(null);
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
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const scopedProject = projectScope ? projects.find((p) => p.id === projectScope) ?? null : null;

  /* ── Chat helpers ─────────────────────────────────────────────────── */
  const pushUser = useCallback((text: string) => {
    setMessages((m) => [...m, { id: nextId(), role: 'user', text }]);
  }, []);
  // Bot lines land on a small stagger so turns read as conversation.
  const pushBot = useCallback((text: string, delay = 260) => {
    const t = setTimeout(() => setMessages((m) => [...m, { id: nextId(), role: 'bot', text }]), delay);
    timers.current.push(t);
  }, []);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const templateChips = useMemo<Chip[]>(
    () => TEMPLATES.map((t) => ({ label: t.chipLabel, t: 'template' as const, id: t.id })),
    [],
  );
  const refineChips = useCallback((): Chip[] => [
    { label: CHIP.addMilestone, t: 'add' },
    { label: CHIP.changeTimeline, t: 'timeline' },
    { label: CHIP.markDone, t: 'mark_done' },
    { label: CHIP.rename, t: 'rename' },
    { label: CHIP.save, t: 'save', accent: true },
  ], []);

  /* ── Portal mount gate (SSR-safe) ─────────────────────────────────── */
  useEffect(() => { setMounted(true); }, []);

  /* ── Body scroll lock (iOS-proof, same recipe as MessagesModal) ───── */
  useEffect(() => {
    const scrollY = window.scrollY;
    const { style } = document.body;
    const prev = { position: style.position, top: style.top, width: style.width, overflow: style.overflow };
    const prevHtmlOverflow = document.documentElement.style.overflow;
    style.position = 'fixed';
    style.top = `-${scrollY}px`;
    style.width = '100%';
    style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    return () => {
      style.position = prev.position;
      style.top = prev.top;
      style.width = prev.width;
      style.overflow = prev.overflow;
      document.documentElement.style.overflow = prevHtmlOverflow;
      window.scrollTo(0, scrollY);
    };
  }, []);

  /* ── Draft plumbing ───────────────────────────────────────────────── */

  // Every command flows through here: reducer against the ref + bot reply.
  const dispatch = useCallback((cmd: BuilderCommand, opts?: { silent?: boolean }) => {
    const prev = draftRef.current;
    if (!prev) return;
    const result = applyCommand(prev, cmd, new Date());
    setDraft(result.draft);
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
  }, [setDraft, pushBot, refineChips]);

  const enterRefine = useCallback((withIntro: boolean) => {
    setStage('refine');
    if (withIntro && draftRef.current) pushBot(COPY.firstDraft(draftRef.current), 420);
    setChips(refineChips());
  }, [pushBot, refineChips]);

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
  }, [pushBot, enterRefine]);

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
        onCreated(data.era as EraView);
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
  }, [saving, worldId, privyId, onCreated, pushBot]);

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
        if (d) setDraft({ ...d, project: d.project.mode === 'new' ? { mode: 'new', name: d.title } : d.project });
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
      case 'pick_ms':
        if (chip.rename) {
          setPendingIntent({ type: 'rename', index: chip.index });
          pushBot(COPY.renameTextPrompt(draftRef.current?.milestones[chip.index]?.title ?? ''));
          setChips([{ label: CHIP.cancel, t: 'cancel' }]);
        } else if (chip.cmd) {
          dispatch(chip.cmd);
        }
        break;
      case 'save':
      case 'try_again':
        void save();
        break;
      case 'keep_editing':
      case 'cancel':
        setPendingIntent(null);
        setChips(refineChips());
        break;
    }
  }, [stage, pushUser, pushBot, templateChips, seedDraft, dispatch, advanceFromSeed, enterRefine, refineChips, save, setDraft]);

  // Silent edits from the canvas tap-editor — same reducer, no chat noise.
  const handleCanvasCommand = useCallback((cmd: BuilderCommand) => {
    dispatch(cmd, { silent: true });
  }, [dispatch]);

  const requestClose = useCallback(() => {
    if (saving) return;
    if (draftRef.current && !window.confirm('Discard this draft?')) return;
    onClose();
  }, [saving, onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') requestClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [requestClose]);

  if (!mounted) return null;

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

  const header = (
    <div className="flex items-center justify-between px-4 py-3 border-b border-ink/10 shrink-0">
      <span className="font-mono text-[10px] font-bold uppercase tracking-[3px]" style={{ color: ORANGE }}>✦ Roadmap Builder</span>
      <button onClick={requestClose} aria-label="Close" className="font-mono text-[16px] leading-none text-ink/50 hover:text-ink cursor-pointer bg-transparent border-none px-1">×</button>
    </div>
  );

  const chat = (
    <ChatPane
      messages={messages}
      chips={chips}
      onChip={handleChip}
      onSubmit={handleText}
      disabled={stage === 'saving'}
      extra={datePicker}
    />
  );
  const canvas = (
    <DraftCanvas
      draft={draft}
      selectedKey={selectedKey}
      onSelect={setSelectedKey}
      onCommand={handleCanvasCommand}
    />
  );

  const content = (
    <>
      {/* Backdrop — lvh so a late keyboard frame never reveals the page. */}
      <div className="fixed inset-0 z-[2300] bg-black/70" style={{ height: '100lvh' }} onClick={requestClose} />
      {/* Mobile: full-bleed takeover. Plain flex column — the browser handles
       * the keyboard (CLAUDE.md rule 3); inputs are 16px so iOS won't zoom. */}
      <div className="sm:hidden fixed inset-0 z-[2301] flex flex-col bg-[var(--page-bg)]" style={{ height: '100dvh', paddingTop: 'var(--safe-top, 0px)' }}>
        {header}
        <div className="shrink-0 max-h-[42%] overflow-y-auto border-b border-ink/10" style={{ WebkitOverflowScrolling: 'touch' }}>
          {canvas}
        </div>
        <div className="flex-1 min-h-0 flex flex-col">{chat}</div>
      </div>
      {/* Desktop: centered two-pane card — chat left, canvas right. */}
      <div className="hidden sm:flex fixed inset-0 z-[2301] items-center justify-center p-6 pointer-events-none">
        <div className="pointer-events-auto w-full max-w-5xl h-[min(720px,88lvh)] grid grid-cols-[minmax(320px,1fr)_1.2fr] bg-[var(--page-bg)] border border-ink/10 rounded-2xl overflow-hidden shadow-2xl">
          <div className="flex flex-col min-h-0 border-r border-ink/10">
            {header}
            <div className="flex-1 min-h-0 flex flex-col">{chat}</div>
          </div>
          <div className="overflow-y-auto min-h-0">{canvas}</div>
        </div>
      </div>
    </>
  );

  return createPortal(content, document.body);
}
