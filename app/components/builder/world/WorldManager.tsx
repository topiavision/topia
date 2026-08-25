'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { parseWorldManageUtterance, type DraftWorld } from '@/lib/builder/world';
import { resizeAndUploadImage } from '@/lib/uploadImage';
import { normalizeToolName } from '../../../dashboard/_components/ToolPicker';
import type { ToolOption, SocialLinks } from '../../../dashboard/_components/types';
import { BuilderShell } from '../BuilderShell';
import { ChatPane } from '../ChatPane';
import { useBuilderChat } from '../useBuilderChat';
import { WorldCanvas } from './WorldCanvas';

/* The World Manager — the HQ assistant bar's bot. LIVE edits over the
 * update whitelist (tagline, description, tools, socials, cover/header):
 * every command PUTs immediately and answers "✓ saved". Asked to rename or
 * recategorize, it says honestly that those are permanent. Project intent
 * hands off to the Project Builder; roadmap intent deep-links to the In
 * Process tab rather than nesting builders. */

interface ManagedWorld {
  id: string;
  slug: string;
  title: string;
  shortDescription: string | null;
  description: string | null;
  imageUrl: string | null;
  headerImageUrl: string | null;
  tools: string | null;          // comma-joined display names
  socialLinks: SocialLinks | null;
}

type Chip =
  | { label: string; t: 'suggest'; seed: string }
  | { label: string; t: 'upload_cover' }
  | { label: string; t: 'done'; accent?: boolean }
  | { label: string; t: 'cancel' };

const BASE_CHIPS: Chip[] = [
  { label: 'Tagline', t: 'suggest', seed: 'tagline: ' },
  { label: 'Add a tool', t: 'suggest', seed: 'add the tool ' },
  { label: 'Cover image', t: 'upload_cover' },
  { label: 'Done ✦', t: 'done', accent: true },
];

export function WorldManager({ world, allTools, privyId, seedText, onFieldSaved, onLaunchProject, onClose }: {
  world: ManagedWorld;
  allTools: ToolOption[];
  privyId: string;
  seedText?: string;
  /** Sync the dashboard's own state (e.g. setImageUrl) after a live save. */
  onFieldSaved?: (field: string, value: unknown) => void;
  onLaunchProject: (seed: string) => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const { messages, chips, setChips, typing, pushUser, pushBot, pushBotAfter } = useBuilderChat<Chip>(() => ({
    text: `${world.title} ✦ Tell me what to change — everything saves as we go.`,
    chips: BASE_CHIPS,
  }));
  const [live, setLive] = useState<ManagedWorld>(world);
  const liveRef = useRef(live);
  const setLiveBoth = useCallback((w: ManagedWorld) => { liveRef.current = w; setLive(w); }, []);
  const [showUpload, setShowUpload] = useState(false);
  const [uploading, setUploading] = useState(false);

  /** One field → PUT → sync; throws with the server's message on failure. */
  const putField = useCallback(async (field: keyof ManagedWorld, value: unknown) => {
    const res = await fetch('/api/worlds/update', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ worldId: world.id, privyId, [field]: value }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      throw new Error(typeof d?.error === 'string' ? d.error : 'save failed');
    }
    setLiveBoth({ ...liveRef.current, [field]: value });
    onFieldSaved?.(field, value);
  }, [world.id, privyId, setLiveBoth, onFieldSaved]);

  const saveAnd = useCallback((reply: string, job: () => Promise<void>) => {
    void pushBotAfter((async () => {
      try {
        await job();
        return `${reply} ✓ saved.`;
      } catch (e) {
        return `That didn't save — ${e instanceof Error ? e.message : 'something went wrong'}. Nothing changed.`;
      }
    })());
    setChips(BASE_CHIPS);
  }, [pushBotAfter, setChips]);

  const handleText = useCallback((raw: string) => {
    const text = raw.trim();
    if (!text) return;
    pushUser(text);
    setShowUpload(false);
    const cmd = parseWorldManageUtterance(text);
    const cur = liveRef.current;

    switch (cmd.kind) {
      case 'set_tagline':
        saveAnd(`Tagline updated.`, () => putField('shortDescription', cmd.text));
        break;
      case 'set_long_description':
        saveAnd(`Story updated.`, () => putField('description', cmd.text));
        break;
      case 'add_tool': {
        // Match against the directory so the chip links on the world page;
        // unmatched names still save (free-text tools are a legacy reality).
        const match = allTools.find((t) => normalizeToolName(t.name) === normalizeToolName(cmd.name));
        const name = match?.name ?? cmd.name;
        const list = (cur.tools ?? '').split(',').map((t) => t.trim()).filter(Boolean);
        if (list.some((t) => normalizeToolName(t) === normalizeToolName(name))) {
          pushBot(`${name} is already on the list.`);
          setChips(BASE_CHIPS);
          break;
        }
        const next = [...list, name].join(', ');
        saveAnd(
          match ? `Added ${name}.` : `Added ${name} — heads up, it's not in the tool directory so it won't link.`,
          () => putField('tools', next),
        );
        break;
      }
      case 'remove_tool': {
        const list = (cur.tools ?? '').split(',').map((t) => t.trim()).filter(Boolean);
        const next = list.filter((t) => normalizeToolName(t) !== normalizeToolName(cmd.name));
        if (next.length === list.length) {
          pushBot(`I don't see “${cmd.name}” in the tools list.`);
          setChips(BASE_CHIPS);
          break;
        }
        // '' not null — the update route treats null as "leave untouched",
        // so null could never clear the final tool (verified live).
        saveAnd(`Removed it.`, () => putField('tools', next.join(', ')));
        break;
      }
      case 'set_social': {
        const links: SocialLinks = { ...(cur.socialLinks ?? {}), [cmd.key]: cmd.url };
        saveAnd(`${cmd.key === 'website' ? 'Website' : cmd.key} linked.`, () => putField('socialLinks', links));
        break;
      }
      case 'want_upload':
        pushBot(`Drop the new image below — cover or header.`);
        setShowUpload(true);
        setChips([{ label: 'Never mind', t: 'cancel' }]);
        break;
      case 'immutable':
        pushBot(
          cmd.field === 'title'
            ? `World names are permanent right now — that one I can't touch.`
            : `The ${cmd.field} is set when a world is born and can't change yet — that one I can't touch.`,
        );
        setChips(BASE_CHIPS);
        break;
      case 'handoff_project':
        onLaunchProject(cmd.seed);
        break;
      case 'handoff_roadmap':
        pushBot(`Roadmaps live on the In Process tab — taking you there.`);
        setTimeout(() => router.push(`/dashboard/worlds/${world.slug}/in-process`), 900);
        break;
      default:
        pushBot(`Didn't catch that — I'm simpler than I look. Try “tagline: …”, “add the tool Figma”, “instagram: <link>”, or the buttons below.`);
        setChips(BASE_CHIPS);
    }
  }, [pushUser, pushBot, setChips, saveAnd, putField, allTools, onLaunchProject, router, world.slug]);

  // AssistantBar seed → first user message (StrictMode-safe).
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
    pushUser(chip.label);
    switch (chip.t) {
      case 'suggest':
        pushBot(chip.seed.endsWith(' ') ? `Go ahead — finish the sentence.` : chip.seed);
        setShowUpload(false);
        setChips([{ label: 'Never mind', t: 'cancel' }]);
        break;
      case 'upload_cover':
        setShowUpload(true);
        setChips([{ label: 'Never mind', t: 'cancel' }]);
        break;
      case 'done':
        onClose();
        break;
      case 'cancel':
        setShowUpload(false);
        setChips(BASE_CHIPS);
        break;
    }
  }, [pushUser, pushBot, setChips, onClose]);

  const upload = useCallback(async (file: File, field: 'imageUrl' | 'headerImageUrl') => {
    setUploading(true);
    try {
      const url = await resizeAndUploadImage(file, field === 'headerImageUrl' ? 1600 : 1024, privyId);
      await putField(field, url);
      setShowUpload(false);
      pushBot(`${field === 'headerImageUrl' ? 'Header' : 'Cover'} swapped ✓ saved.`);
      setChips(BASE_CHIPS);
    } catch (e) {
      pushBot(`That upload didn't take — ${e instanceof Error ? e.message : 'try another file'}.`);
    } finally {
      setUploading(false);
    }
  }, [privyId, putField, pushBot, setChips]);

  const uploadSlot = showUpload ? (
    <div className="border border-ink/15 rounded-sm p-3 mb-2 flex items-center gap-3 flex-wrap">
      {(['imageUrl', 'headerImageUrl'] as const).map((field) => (
        <label key={field} className="font-mono text-[11px] uppercase tracking-[2px] text-ink/60 border border-ink/15 hover:border-ink/40 hover:text-ink px-3 py-1.5 rounded-sm transition cursor-pointer">
          {uploading ? 'Uploading…' : field === 'imageUrl' ? 'Cover…' : 'Header…'}
          <input
            type="file" accept="image/*" className="hidden" disabled={uploading}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f, field); }}
          />
        </label>
      ))}
    </div>
  ) : null;

  const canvasDraft: DraftWorld = {
    title: live.title,
    shortDescription: live.shortDescription,
    category: null,
    country: null,
    imageUrl: live.imageUrl,
  };

  return (
    <BuilderShell
      title="World Assistant"
      headerLink={{ label: 'Open the details form', onClick: () => router.push(`/dashboard/worlds/${world.slug}/details`) }}
      onRequestClose={onClose}
      chat={
        <ChatPane
          messages={messages}
          chips={chips}
          onChip={handleChip}
          onSubmit={handleText}
          disabled={false}
          typing={typing}
          extra={uploadSlot}
          placeholder="tagline: …  ·  add the tool Figma  ·  instagram: link"
        />
      }
      canvas={<WorldCanvas draft={canvasDraft} />}
    />
  );
}
