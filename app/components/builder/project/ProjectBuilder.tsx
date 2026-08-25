'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  emptyProjectDraft, matchMemberName, parseProjectUtterance, clampProjectFields, projectToPayload,
  type DraftProject, type MemberOption,
} from '@/lib/builder/project';
import { extractFirstUrl, extractQuotedName, classifyMediaUrl, normalizeUrl, parseNameRoles, splitList } from '@/lib/builder/free-text';
import { resizeAndUploadImage } from '@/lib/uploadImage';
import { normalizeToolName } from '../../../dashboard/_components/ToolPicker';
import type { ProjectItem, ToolOption } from '../../../dashboard/_components/types';
import { BuilderShell } from '../BuilderShell';
import { ChatPane } from '../ChatPane';
import { useBuilderChat } from '../useBuilderChat';
import { llmParse } from '../llmParse';
import { ProjectCanvas } from './ProjectCanvas';
import { COPY, CHIP, type Stage } from './script';

/* The Project Builder — bot-first project creation for a world. The form
 * this replaces collects 10 fields across three repeater UIs (~20 clicks);
 * the bot's biggest wins are the seed sentence (name/description/link/tags
 * in one message) and credits ("Maya did design, Jo produced" → matched
 * member rows). Editing keeps ProjectEditor; the escape link opens it. */

interface WorldMember { userId: string; role: string; userName: string | null; userUsername: string | null }

type Chip =
  | { label: string; t: 'skip' }
  | { label: string; t: 'done_tools' }
  | { label: string; t: 'tool'; name: string }
  | { label: string; t: 'member'; userId: string; name: string }
  | { label: string; t: 'skip_member' }
  | { label: string; t: 'refine_rename' }
  | { label: string; t: 'refine_desc' }
  | { label: string; t: 'refine_tags' }
  | { label: string; t: 'refine_tools' }
  | { label: string; t: 'refine_credits' }
  | { label: string; t: 'refine_link' }
  | { label: string; t: 'refine_cover' }
  | { label: string; t: 'save'; accent?: boolean }
  | { label: string; t: 'try_again' }
  | { label: string; t: 'keep_editing' }
  | { label: string; t: 'cancel' };

export function ProjectBuilder({ worldId, privyId, members, allTools, seedText, onExitToForm, onClose, onCreated }: {
  worldId: string;
  privyId: string;
  /** Text from an AssistantBar — processed as the first user message. */
  seedText?: string;
  members: WorldMember[];
  allTools: ToolOption[];
  onExitToForm: () => void;
  onClose: () => void;
  onCreated: (project: ProjectItem) => void;
}) {
  const memberOptions = useMemo<MemberOption[]>(
    () => members.map((m) => ({ userId: m.userId, name: m.userName, username: m.userUsername })),
    [members],
  );

  const { messages, chips, setChips, typing, pushUser, pushBot, pushBotAfter } = useBuilderChat<Chip>(
    () => ({ text: COPY.intro, chips: [] }),
  );
  const [stage, setStage] = useState<Stage>('describe');
  const [draft, setDraftState] = useState<DraftProject | null>(null);
  const [saving, setSaving] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pendingIntent, setPendingIntent] = useState<null | 'rename' | 'desc' | 'tags' | 'link'>(null);

  const draftRef = useRef<DraftProject | null>(null);
  const setDraft = useCallback((d: DraftProject) => { draftRef.current = d; setDraftState(d); }, []);
  const asked = useRef({ credits: false, tools: false, link: false, image: false });
  // Credit mentions that didn't match a member — resolved one at a time.
  const fixQueue = useRef<{ name: string; role: string | null }[]>([]);
  const toolSearch = useRef('');

  const displayName = useCallback((userId: string) => {
    const m = memberOptions.find((x) => x.userId === userId);
    return m?.name || m?.username || 'someone';
  }, [memberOptions]);

  const refineChips = useCallback((): Chip[] => [
    { label: CHIP.rename, t: 'refine_rename' },
    { label: CHIP.description, t: 'refine_desc' },
    { label: CHIP.tags, t: 'refine_tags' },
    ...(allTools.length > 0 ? [{ label: CHIP.tools, t: 'refine_tools' as const }] : []),
    ...(memberOptions.length > 1 ? [{ label: CHIP.credits, t: 'refine_credits' as const }] : []),
    { label: CHIP.link, t: 'refine_link' },
    { label: CHIP.cover, t: 'refine_cover' },
    { label: CHIP.save, t: 'save', accent: true },
  ], [allTools.length, memberOptions.length]);

  const memberChips = useCallback((): Chip[] => {
    const credited = new Set((draftRef.current?.credits ?? []).map((c) => c.userId));
    return [
      ...memberOptions.filter((m) => !credited.has(m.userId)).slice(0, 8).map((m) => ({
        label: m.name || m.username || '—', t: 'member' as const, userId: m.userId, name: m.name || m.username || '—',
      })),
      { label: COPY.skipThem, t: 'skip_member' as const },
    ];
  }, [memberOptions]);

  const toolChips = useCallback((search: string): Chip[] => {
    const selected = new Set((draftRef.current?.tools ?? []).map(normalizeToolName));
    const q = normalizeToolName(search);
    const pool = q ? allTools.filter((t) => normalizeToolName(t.name).includes(q)) : allTools;
    return [
      ...pool.slice(0, 8).map((t) => ({
        label: `${selected.has(normalizeToolName(t.name)) ? '✓ ' : ''}${t.name}`,
        t: 'tool' as const, name: t.name,
      })),
      { label: CHIP.done, t: 'done_tools' as const },
    ];
  }, [allTools]);

  /* Apply matched/unmatched credit mentions; queue the misses. */
  const absorbCredits = useCallback((mentions: { name: string; role: string | null }[]) => {
    const d = { ...(draftRef.current ?? emptyProjectDraft()) };
    for (const mention of mentions) {
      const match = matchMemberName(mention.name, memberOptions);
      if (match.ok && !d.credits.some((c) => c.userId === match.userId)) {
        d.credits = [...d.credits, { userId: match.userId, name: displayName(match.userId), role: mention.role }];
      } else if (!match.ok) {
        fixQueue.current.push(mention);
      }
    }
    setDraft(d);
  }, [memberOptions, displayName, setDraft]);

  /* Route to the next open question; refine when everything's answered. */
  const advance = useCallback(() => {
    const d = draftRef.current ?? emptyProjectDraft();
    setShowUpload(false);
    if (!d.name) {
      setStage('name');
      pushBot(COPY.askName, 380);
      setChips([]);
      return;
    }
    if (fixQueue.current.length > 0) {
      const current = fixQueue.current[0];
      setStage('credit_fix');
      pushBot(COPY.creditFix(current.name), 380);
      setChips(memberChips());
      return;
    }
    if (memberOptions.length > 1 && d.credits.length === 0 && !asked.current.credits) {
      asked.current.credits = true;
      setStage('credits');
      pushBot(COPY.askCredits, 380);
      setChips([{ label: CHIP.skip, t: 'skip' }]);
      return;
    }
    if (allTools.length > 0 && d.tools.length === 0 && !asked.current.tools) {
      asked.current.tools = true;
      toolSearch.current = '';
      setStage('tools');
      pushBot(COPY.askTools, 380);
      setChips([{ label: CHIP.skip, t: 'skip' }]);
      return;
    }
    if (!d.url && !d.videoUrl && !asked.current.link) {
      asked.current.link = true;
      setStage('link');
      pushBot(COPY.askLink, 380);
      setChips([{ label: CHIP.skip, t: 'skip' }]);
      return;
    }
    if (!d.imageUrl && !asked.current.image) {
      asked.current.image = true;
      setStage('image');
      pushBot(d.url ? `${COPY.askImage} If you skip it, I'll borrow one from your site.` : COPY.askImage, 380);
      setShowUpload(true);
      setChips([{ label: CHIP.skip, t: 'skip' }]);
      return;
    }
    setStage('refine');
    pushBot(COPY.refineIntro(d.name), 420);
    setChips(refineChips());
  }, [memberOptions.length, allTools.length, pushBot, setChips, memberChips, refineChips]);

  /* The seed: local floor + LLM merge, then route onward. */
  const seed = useCallback((text: string) => {
    void pushBotAfter((async () => {
      const d = { ...emptyProjectDraft() };
      const urlHit = extractFirstUrl(text);
      let rest = text;
      if (urlHit) {
        rest = urlHit.rest;
        if (classifyMediaUrl(urlHit.url) === 'video') d.videoUrl = urlHit.url;
        else d.url = urlHit.url;
      }
      const quoted = extractQuotedName(rest);
      if (quoted) d.name = quoted.slice(0, 100);
      else if (rest.trim().length <= 60 && rest.trim().split(/\s+/).length <= 6) d.name = rest.trim().slice(0, 100);
      if (rest.trim() && rest.trim() !== d.name) d.description = rest.trim().slice(0, 300);

      const fields = clampProjectFields(await llmParse('project', text, privyId) ?? {});
      if (fields.name) d.name = fields.name;
      if (fields.description) d.description = fields.description;
      if (fields.url && !d.url) d.url = fields.url;
      if (fields.videoUrl && !d.videoUrl) d.videoUrl = fields.videoUrl;
      if (fields.tags) d.tags = fields.tags;
      if (fields.tools) {
        // Only directory tools survive — unmatched names are dropped.
        const byNorm = new Map(allTools.map((t) => [normalizeToolName(t.name), t.name]));
        d.tools = [...new Set(fields.tools.map((t) => byNorm.get(normalizeToolName(t))).filter((t): t is string => Boolean(t)))];
      }
      setDraft(d);
      if (fields.credits?.length) absorbCredits(fields.credits);
      setTimeout(advance, 0);
      return d.name ? `${d.name} — nice.` : `Got it.`;
    })());
  }, [privyId, allTools, pushBotAfter, setDraft, absorbCredits, advance]);

  /* ── Save ─────────────────────────────────────────────────────────── */
  const save = useCallback(async () => {
    const d = draftRef.current;
    if (!d || !d.name.trim() || saving) return;
    setSaving(true);
    setStage('saving');
    setChips([]);
    pushBot(COPY.saving, 100);
    try {
      const res = await fetch('/api/worlds/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(projectToPayload(d, worldId, privyId)),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.project) {
        onCreated(data.project as ProjectItem);
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
  }, [saving, worldId, privyId, onCreated, pushBot, setChips]);

  /* ── Input handling ───────────────────────────────────────────────── */
  const handleText = useCallback((raw: string) => {
    const text = raw.trim();
    if (!text || stage === 'saving') return;
    pushUser(text);

    if (stage === 'describe') { seed(text); return; }
    if (stage === 'name') {
      setDraft({ ...(draftRef.current ?? emptyProjectDraft()), name: text.slice(0, 100) });
      advance();
      return;
    }
    if (stage === 'credits') {
      void pushBotAfter((async () => {
        let mentions = parseNameRoles(text);
        if (mentions.length === 0) {
          const fields = clampProjectFields(await llmParse('project', `Credits: ${text}`, privyId) ?? {});
          mentions = fields.credits ?? [];
        }
        if (mentions.length === 0) {
          setChips([{ label: CHIP.skip, t: 'skip' }]);
          return `Tell me like “Maya did design, Jo produced” — or skip it.`;
        }
        absorbCredits(mentions);
        setTimeout(advance, 0);
        const added = (draftRef.current?.credits ?? []).length;
        return added > 0 ? `Credited ${added} ${added === 1 ? 'person' : 'people'}.` : `Let me check those names…`;
      })());
      return;
    }
    if (stage === 'tools') {
      toolSearch.current = text;
      setChips(toolChips(text));
      return;
    }
    if (stage === 'link' || pendingIntent === 'link') {
      const url = normalizeUrl(text);
      if (!url) { pushBot(`That doesn't look like a link — try again, or skip it.`); return; }
      const d = { ...(draftRef.current ?? emptyProjectDraft()) };
      if (classifyMediaUrl(url) === 'video') d.videoUrl = url; else d.url = url;
      setDraft(d);
      if (pendingIntent === 'link') { setPendingIntent(null); pushBot(`Filed.`); setChips(refineChips()); }
      else { if (d.url) pushBot(COPY.linkNote, 200); advance(); }
      return;
    }
    if (pendingIntent) {
      const d = { ...(draftRef.current ?? emptyProjectDraft()) };
      if (pendingIntent === 'rename') { d.name = text.slice(0, 100); pushBot(`Calling it “${d.name}”.`); }
      if (pendingIntent === 'desc') { d.description = text.slice(0, 300); pushBot(`Noted.`); }
      if (pendingIntent === 'tags') { d.tags = [...new Set([...d.tags, ...splitList(text)])].slice(0, 8); pushBot(`Tagged.`); }
      setDraft(d);
      setPendingIntent(null);
      setChips(refineChips());
      return;
    }
    if (stage === 'refine' || stage === 'image') {
      const cmd = parseProjectUtterance(text);
      const d = { ...(draftRef.current ?? emptyProjectDraft()) };
      if (cmd.kind === 'set_name') { setDraft({ ...d, name: cmd.name }); pushBot(`Calling it “${cmd.name}”.`); }
      else if (cmd.kind === 'set_description') { setDraft({ ...d, description: cmd.text }); pushBot(`Noted.`); }
      else if (cmd.kind === 'add_tag') { setDraft({ ...d, tags: [...new Set([...d.tags, ...splitList(cmd.tag)])].slice(0, 8) }); pushBot(`Tagged.`); }
      else if (cmd.kind === 'remove_tag') {
        setDraft({ ...d, tags: d.tags.filter((t) => t.toLowerCase() !== cmd.tag.toLowerCase()) });
        pushBot(`Dropped it.`);
      } else if (cmd.kind === 'set_url') {
        if (cmd.media === 'video') setDraft({ ...d, videoUrl: cmd.url }); else setDraft({ ...d, url: cmd.url });
        pushBot(`Filed the link.`);
      } else { pushBot(COPY.unknown); }
      if (stage === 'refine') setChips(refineChips());
      return;
    }
  }, [stage, pendingIntent, privyId, pushUser, pushBot, pushBotAfter, setChips, setDraft, seed, advance, absorbCredits, toolChips, refineChips]);

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
      case 'skip':
        advance();
        break;
      case 'member': {
        const current = fixQueue.current.shift();
        const d = { ...(draftRef.current ?? emptyProjectDraft()) };
        if (current && !d.credits.some((c) => c.userId === chip.userId)) {
          d.credits = [...d.credits, { userId: chip.userId, name: chip.name, role: current.role }];
          setDraft(d);
        }
        advance();
        break;
      }
      case 'skip_member':
        fixQueue.current.shift();
        advance();
        break;
      case 'tool': {
        const d = { ...(draftRef.current ?? emptyProjectDraft()) };
        const norm = normalizeToolName(chip.name);
        d.tools = d.tools.some((t) => normalizeToolName(t) === norm)
          ? d.tools.filter((t) => normalizeToolName(t) !== norm)
          : [...d.tools, chip.name];
        setDraft(d);
        setChips(toolChips(toolSearch.current));
        break;
      }
      case 'done_tools':
        if (stage === 'tools') advance();
        else setChips(refineChips());
        break;
      case 'refine_rename':
        setPendingIntent('rename'); pushBot(COPY.renamePrompt); setChips([{ label: CHIP.cancel, t: 'cancel' }]);
        break;
      case 'refine_desc':
        setPendingIntent('desc'); pushBot(COPY.descriptionPrompt); setChips([{ label: CHIP.cancel, t: 'cancel' }]);
        break;
      case 'refine_tags':
        setPendingIntent('tags'); pushBot(COPY.tagsPrompt); setChips([{ label: CHIP.cancel, t: 'cancel' }]);
        break;
      case 'refine_tools':
        toolSearch.current = '';
        pushBot(COPY.askTools);
        setChips(toolChips(''));
        break;
      case 'refine_credits':
        setStage('credits');
        pushBot(COPY.askCredits);
        setChips([{ label: CHIP.cancel, t: 'cancel' }]);
        break;
      case 'refine_link':
        setPendingIntent('link'); pushBot(COPY.askLink); setChips([{ label: CHIP.cancel, t: 'cancel' }]);
        break;
      case 'refine_cover':
        setShowUpload(true); setChips([{ label: CHIP.cancel, t: 'cancel' }]);
        break;
      case 'save':
      case 'try_again':
        void save();
        break;
      case 'keep_editing':
      case 'cancel':
        setPendingIntent(null);
        setShowUpload(false);
        setStage('refine');
        setChips(refineChips());
        break;
    }
  }, [stage, pushUser, pushBot, setChips, setDraft, advance, toolChips, refineChips, save]);

  const upload = useCallback(async (file: File) => {
    setUploading(true);
    try {
      const url = await resizeAndUploadImage(file, 1280, privyId);
      setDraft({ ...(draftRef.current ?? emptyProjectDraft()), imageUrl: url });
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
    if (draftRef.current?.name && !window.confirm('Discard this draft?')) return;
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
      title="Project Builder"
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
          placeholder={stage === 'tools' ? 'Search tools…' : undefined}
        />
      }
      canvas={<ProjectCanvas draft={draft} />}
    />
  );
}
