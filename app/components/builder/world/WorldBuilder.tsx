'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  WORLD_CATEGORIES, matchCategory, parseWorldUtterance, clampWorldFields,
  worldToCreatePayload, emptyWorldDraft, type DraftWorld,
} from '@/lib/builder/world';
import { extractQuotedName } from '@/lib/builder/free-text';
import { resizeAndUploadImage } from '@/lib/uploadImage';
import { BuilderShell } from '../BuilderShell';
import { ChatPane } from '../ChatPane';
import { useBuilderChat } from '../useBuilderChat';
import { llmParse } from '../llmParse';
import { WorldCanvas } from './WorldCanvas';
import { COPY, CHIP, TILES, type Stage } from './script';

/* The World Builder — bot-first world creation. Five fields, one required;
 * the bot's real job is capturing category and country well, because they're
 * write-once (the update route can't touch them) and the old form never said
 * so. Hybrid brain: the seed sentence goes to the LLM when configured;
 * everything else is chips + local grammar. */

type Chip =
  | { label: string; t: 'skip' }
  | { label: string; t: 'category'; value: string }
  | { label: string; t: 'refine_rename' }
  | { label: string; t: 'refine_desc' }
  | { label: string; t: 'refine_category' }
  | { label: string; t: 'refine_country' }
  | { label: string; t: 'refine_cover' }
  | { label: string; t: 'create'; accent?: boolean }
  | { label: string; t: 'try_again' }
  | { label: string; t: 'keep_editing' }
  | { label: string; t: 'cancel' };

const categoryChips = (): Chip[] => [
  ...WORLD_CATEGORIES.map((c) => ({ label: c, t: 'category' as const, value: c })),
  { label: CHIP.skip, t: 'skip' },
];

export function WorldBuilder({ privyId, seedText, onExitToForm, onClose, variant }: {
  privyId: string;
  variant?: 'modal' | 'page';
  /** Text from an AssistantBar — processed as the first user message. */
  seedText?: string;
  /** The permanent escape hatch — swaps to the untouched classic form. */
  onExitToForm: () => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const { messages, chips, setChips, typing, pushUser, pushBot, pushBotAfter } = useBuilderChat<Chip>(
    () => ({ text: COPY.intro, chips: [] }),
  );
  const [stage, setStage] = useState<Stage>('describe');
  const [draft, setDraftState] = useState<DraftWorld | null>(null);
  const [saving, setSaving] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pendingIntent, setPendingIntent] = useState<null | 'rename' | 'desc' | 'country'>(null);

  const draftRef = useRef<DraftWorld | null>(null);
  const setDraft = useCallback((d: DraftWorld) => { draftRef.current = d; setDraftState(d); }, []);
  const asked = useRef({ category: false, country: false, image: false });

  const refineChips = useCallback((): Chip[] => [
    { label: CHIP.rename, t: 'refine_rename' },
    { label: CHIP.description, t: 'refine_desc' },
    { label: CHIP.category, t: 'refine_category' },
    { label: CHIP.country, t: 'refine_country' },
    { label: CHIP.cover, t: 'refine_cover' },
    { label: CHIP.create, t: 'create', accent: true },
  ], []);

  /* Route to the next open question; refine when everything's answered. */
  const advance = useCallback(() => {
    const d = draftRef.current ?? emptyWorldDraft();
    setShowUpload(false);
    if (!d.title) {
      setStage('name');
      pushBot(COPY.askName, 380);
      setChips([]);
      return;
    }
    if (!d.category && !asked.current.category) {
      asked.current.category = true;
      setStage('category');
      pushBot(COPY.askCategory, 380);
      setChips(categoryChips());
      return;
    }
    if (!d.country && !asked.current.country) {
      asked.current.country = true;
      setStage('country');
      pushBot(COPY.askCountry, 380);
      setChips([{ label: CHIP.skip, t: 'skip' }]);
      return;
    }
    if (!d.imageUrl && !asked.current.image) {
      asked.current.image = true;
      setStage('image');
      pushBot(COPY.askImage, 380);
      setShowUpload(true);
      setChips([{ label: CHIP.skip, t: 'skip' }]);
      return;
    }
    setStage('refine');
    pushBot(COPY.refineIntro(d.title), 420);
    setChips(refineChips());
  }, [pushBot, setChips, refineChips]);

  /* The seed: LLM-first when configured, local heuristics as the floor. */
  const seed = useCallback((text: string) => {
    void pushBotAfter((async () => {
      const d = { ...emptyWorldDraft() };
      // Local floor first, so even a dead LLM leaves us with something.
      const quoted = extractQuotedName(text);
      const words = text.trim().split(/\s+/).length;
      if (quoted) d.title = quoted.slice(0, 100);
      else if (text.trim().length <= 60 && words <= 6) d.title = text.trim().slice(0, 100);
      if (!d.title || text.trim() !== d.title) d.shortDescription = text.trim().slice(0, 300);
      d.category = matchCategory(text);

      const fields = clampWorldFields(await llmParse('world', text, privyId) ?? {});
      if (fields.title) d.title = fields.title;
      if (fields.shortDescription) d.shortDescription = fields.shortDescription;
      if (fields.category) d.category = fields.category;
      if (fields.country) d.country = fields.country;

      setDraft(d);
      // advance() pushes the next question itself; return an ack line.
      setTimeout(advance, 0);
      return d.title ? `${d.title} — I can see it already.` : `Love it.`;
    })());
  }, [privyId, pushBotAfter, setDraft, advance]);

  /* ── Save ─────────────────────────────────────────────────────────── */
  const save = useCallback(async () => {
    const d = draftRef.current;
    if (!d || !d.title.trim() || saving) return;
    setSaving(true);
    setStage('saving');
    setChips([]);
    pushBot(COPY.saving, 100);
    try {
      const res = await fetch('/api/worlds/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(worldToCreatePayload(d, privyId)),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.world?.slug) {
        router.push(`/dashboard/worlds/${data.world.slug}/in-process`);
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
  }, [saving, privyId, router, pushBot, setChips]);

  /* ── Input handling ───────────────────────────────────────────────── */
  const handleText = useCallback((raw: string) => {
    const text = raw.trim();
    if (!text || stage === 'saving') return;
    pushUser(text);

    if (stage === 'describe') { seed(text); return; }
    if (stage === 'name') {
      setDraft({ ...(draftRef.current ?? emptyWorldDraft()), title: text.slice(0, 100) });
      advance();
      return;
    }
    if (stage === 'category') {
      const cat = matchCategory(text);
      if (!cat) { pushBot(COPY.categoryMiss); setChips(categoryChips()); return; }
      setDraft({ ...(draftRef.current ?? emptyWorldDraft()), category: cat });
      advance();
      return;
    }
    if (stage === 'country') {
      setDraft({ ...(draftRef.current ?? emptyWorldDraft()), country: text.slice(0, 56) });
      advance();
      return;
    }
    if (pendingIntent) {
      const d = draftRef.current ?? emptyWorldDraft();
      if (pendingIntent === 'rename') setDraft({ ...d, title: text.slice(0, 100) });
      if (pendingIntent === 'desc') setDraft({ ...d, shortDescription: text.slice(0, 300) });
      if (pendingIntent === 'country') setDraft({ ...d, country: text.slice(0, 56) });
      setPendingIntent(null);
      pushBot(`Done.`);
      setChips(refineChips());
      return;
    }
    if (stage === 'refine' || stage === 'image') {
      const cmd = parseWorldUtterance(text);
      const d = draftRef.current ?? emptyWorldDraft();
      if (cmd.kind === 'set_title') { setDraft({ ...d, title: cmd.title }); pushBot(`Calling it “${cmd.title}”.`); }
      else if (cmd.kind === 'set_description') { setDraft({ ...d, shortDescription: cmd.text }); pushBot(`Noted.`); }
      else if (cmd.kind === 'set_category') { setDraft({ ...d, category: cmd.category }); pushBot(`${cmd.category} it is.`); }
      else if (cmd.kind === 'set_country') { setDraft({ ...d, country: cmd.country }); pushBot(`📍 ${cmd.country}.`); }
      else { pushBot(COPY.unknown); }
      if (stage === 'refine') setChips(refineChips());
      return;
    }
  }, [stage, pendingIntent, pushUser, pushBot, setChips, setDraft, seed, advance, refineChips]);

  // A seed from the AssistantBar is processed as the first user message.
  // Ref-guarded so StrictMode's double effect can't run it twice.
  const bootRef = useRef(false);
  const handleTextRef = useRef(handleText);
  handleTextRef.current = handleText;
  useEffect(() => {
    if (bootRef.current) return;
    bootRef.current = true;
    if (seedText?.trim()) {
      const t = setTimeout(() => handleTextRef.current(seedText), 250);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleChip = useCallback((chip: Chip) => {
    if (stage === 'saving') return;
    pushUser(chip.label);
    switch (chip.t) {
      case 'category':
        setDraft({ ...(draftRef.current ?? emptyWorldDraft()), category: chip.value });
        if (stage === 'refine') { pushBot(`${chip.value} it is.`); setChips(refineChips()); }
        else advance();
        break;
      case 'skip':
        advance();
        break;
      case 'refine_rename':
        setPendingIntent('rename');
        pushBot(COPY.renamePrompt);
        setChips([{ label: CHIP.cancel, t: 'cancel' }]);
        break;
      case 'refine_desc':
        setPendingIntent('desc');
        pushBot(COPY.descriptionPrompt);
        setChips([{ label: CHIP.cancel, t: 'cancel' }]);
        break;
      case 'refine_category':
        pushBot(COPY.askCategory);
        setChips(categoryChips().map((c) => (c.t === 'skip' ? { label: CHIP.cancel, t: 'cancel' as const } : c)));
        break;
      case 'refine_country':
        setPendingIntent('country');
        pushBot(COPY.countryPrompt);
        setChips([{ label: CHIP.cancel, t: 'cancel' }]);
        break;
      case 'refine_cover':
        setShowUpload(true);
        setChips([{ label: CHIP.cancel, t: 'cancel' }]);
        break;
      case 'create':
      case 'try_again':
        void save();
        break;
      case 'keep_editing':
      case 'cancel':
        setPendingIntent(null);
        setShowUpload(stage === 'image');
        setChips(stage === 'refine' ? refineChips() : chips);
        break;
    }
  }, [stage, chips, pushUser, pushBot, setChips, setDraft, advance, refineChips, save]);

  const upload = useCallback(async (file: File) => {
    setUploading(true);
    try {
      const url = await resizeAndUploadImage(file, 1024, privyId);
      setDraft({ ...(draftRef.current ?? emptyWorldDraft()), imageUrl: url });
      setShowUpload(false);
      if (stage === 'image') advance();
      else { pushBot(`Looking good.`); setChips(refineChips()); }
    } catch {
      pushBot(`That upload didn't take — try another file, or skip it.`);
    } finally {
      setUploading(false);
    }
  }, [stage, setDraft, advance, pushBot, setChips, refineChips]);

  const requestClose = useCallback(() => {
    if (saving) return;
    if (draftRef.current?.title && !window.confirm('Discard this draft?')) return;
    onClose();
  }, [saving, onClose]);

  const uploadSlot = showUpload ? (
    <div className="border border-ink/15 rounded-sm p-3 mb-2 flex items-center gap-3">
      <label className="font-mono text-[11px] uppercase tracking-[2px] text-ink/60 border border-ink/15 hover:border-ink/40 hover:text-ink px-3 py-1.5 rounded-sm transition cursor-pointer">
        {uploading ? COPY.uploading : CHIP.upload}
        <input
          type="file" accept="image/*" className="hidden" disabled={uploading}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); }}
        />
      </label>
    </div>
  ) : null;

  return (
    <BuilderShell
      title="World Builder"
      variant={variant}
      showClose={variant !== 'page'}
      headerLink={{ label: 'Use the form instead', onClick: onExitToForm }}
      onRequestClose={requestClose}
      chat={
        <ChatPane
          messages={messages}
          chips={chips}
          onChip={handleChip}
          onSubmit={handleText}
          disabled={stage === 'saving'}
          typing={typing}
          extra={uploadSlot}
          tiles={TILES}
        />
      }
      canvas={<WorldCanvas draft={draft} />}
    />
  );
}
