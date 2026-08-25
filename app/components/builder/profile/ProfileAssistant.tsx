'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  parseProfileUtterance, applyProfileCommand, commandToSyncBody, clampProfileFields,
  PROFILE_SOCIAL_KEYS, type ProfileState,
} from '@/lib/builder/profile';
import { roleLabelToSlug } from '@/lib/profile/roleTags';
import { resizeAndUploadAvatar } from '@/lib/uploadImage';
import { invalidateProfileCache } from '../../../hooks/useUserProfile';
import { normalizeToolName } from '../../../dashboard/_components/ToolPicker';
import type { ToolOption } from '../../../dashboard/_components/types';
import { BuilderShell } from '../BuilderShell';
import { ChatPane } from '../ChatPane';
import { useBuilderChat } from '../useBuilderChat';
import { llmParse } from '../llmParse';
import { PassportCanvas } from './PassportCanvas';
import { COPY, CHIP, TILES } from './script';

/* The Profile Assistant — your passport, edited by talking. Live-edit model
 * (WorldManager's shape): one command → one minimal /api/auth/sync body →
 * "✓ saved", with the real TopiaCard re-rendering beside the chat and the
 * Certified meter filling as the payoff. Owns its draft entirely; on close
 * after any save it invalidates the profile cache and reloads /profile so
 * the classic form never shows a stale snapshot. */

type Chip = { label: string; t: 'done'; accent?: boolean } | { label: string; t: 'cancel' };
const BASE_CHIPS: Chip[] = [{ label: CHIP.done, t: 'done', accent: true }];

export function ProfileAssistant({ initial, username, allTools, privyId, accessToken, onClose }: {
  initial: ProfileState;
  username: string | null;
  allTools: ToolOption[];
  privyId: string;
  accessToken?: string | null;
  /** savedAnything=true → caller should reload the page's form state. */
  onClose: (savedAnything: boolean) => void;
}) {
  const { messages, chips, setChips, typing, pushUser, pushBot, pushBotAfter } = useBuilderChat<Chip>(() => ({
    text: COPY.intro(initial.name), chips: BASE_CHIPS,
  }));
  const [state, setStateRender] = useState<ProfileState>(initial);
  const stateRef = useRef(state);
  const setState = useCallback((s: ProfileState) => { stateRef.current = s; setStateRender(s); }, []);
  const savedRef = useRef(false);
  const [showUpload, setShowUpload] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pendingBioSeed, setPendingBioSeed] = useState(false);

  const sync = useCallback(async (body: Record<string, unknown>) => {
    const res = await fetch('/api/auth/sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify({ privyId, ...body }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      throw new Error(typeof d?.error === 'string' ? d.error : 'save failed');
    }
    savedRef.current = true;
    invalidateProfileCache();
  }, [privyId, accessToken]);

  const saveAnd = useCallback((reply: string, next: ProfileState, body: Record<string, unknown>) => {
    const prev = stateRef.current;
    setState(next);
    void pushBotAfter((async () => {
      try {
        await sync(body);
        const certified = Boolean(next.avatarUrl && next.bio?.trim() && next.roleTags.length && next.path);
        const was = Boolean(prev.avatarUrl && prev.bio?.trim() && prev.roleTags.length && prev.path);
        return `${reply} ✓ saved.${certified && !was ? ` ${COPY.certified}` : ''}`;
      } catch (e) {
        setState(prev);
        return `That didn't save — ${e instanceof Error ? e.message : 'something went wrong'}. Nothing changed.`;
      }
    })());
    setChips(BASE_CHIPS);
  }, [setState, pushBotAfter, sync, setChips]);

  const handleText = useCallback((raw: string) => {
    const text = raw.trim();
    if (!text) return;
    pushUser(text);
    setShowUpload(false);

    // Tile phrases → guided moves.
    if (/^write my bio\.?$/i.test(text)) {
      setPendingBioSeed(true);
      pushBot(COPY.bioSeedPrompt);
      setChips([{ label: CHIP.cancel, t: 'cancel' }]);
      return;
    }
    if (/^add my roles\.?$/i.test(text)) {
      pushBot(`Say it like “i'm a photographer” — up to three roles.`);
      setChips(BASE_CHIPS);
      return;
    }
    if (/^link my socials\.?$/i.test(text)) {
      pushBot(`Paste any profile link — instagram, x, soundcloud, your site — and I'll file it.`);
      setChips(BASE_CHIPS);
      return;
    }

    // The bio seed: one sentence → LLM extracts bio/roles/socials/tools.
    if (pendingBioSeed) {
      setPendingBioSeed(false);
      void pushBotAfter((async () => {
        const fields = clampProfileFields(await llmParse('profile', text, privyId) ?? {});
        const cur = stateRef.current;
        const next: ProfileState = { ...cur };
        const parts: string[] = [];
        next.bio = fields.bio ?? text.slice(0, 280);
        parts.push('bio');
        if (fields.roleLabels?.length) {
          next.roleTags = [...new Set([...cur.roleTags, ...fields.roleLabels.map(roleLabelToSlug)])].slice(0, 3);
          parts.push('roles');
        }
        if (fields.socials) {
          next.socials = { ...cur.socials, ...fields.socials };
          parts.push('links');
        }
        const body: Record<string, unknown> = { bio: next.bio };
        if (parts.includes('roles')) body.roleTags = next.roleTags.join(',') || null;
        if (fields.socials) {
          for (const key of PROFILE_SOCIAL_KEYS) {
            if (fields.socials[key]) body[`social${key[0].toUpperCase()}${key.slice(1)}`] = fields.socials[key];
          }
        }
        try {
          await sync(body);
          setState(next);
          setChips(BASE_CHIPS);
          return COPY.bioSeedApplied(parts);
        } catch (e) {
          return `That didn't save — ${e instanceof Error ? e.message : 'try again'}.`;
        }
      })());
      return;
    }

    const cmd = parseProfileUtterance(text);
    const cur = stateRef.current;

    // Tools need the directory — handled here, not in the pure engine.
    if (cmd.kind === 'add_tool' || cmd.kind === 'remove_tool') {
      const match = allTools.find((t) => normalizeToolName(t.name) === normalizeToolName(cmd.name));
      if (!match) { pushBot(`I don't know “${cmd.name}” — it has to be in the tool directory.`); setChips(BASE_CHIPS); return; }
      const has = cur.toolSlugs.includes(match.slug);
      if (cmd.kind === 'add_tool' && has) { pushBot(`${match.name} is already in your kit.`); setChips(BASE_CHIPS); return; }
      if (cmd.kind === 'remove_tool' && !has) { pushBot(`${match.name} isn't in your kit.`); setChips(BASE_CHIPS); return; }
      const nextSlugs = cmd.kind === 'add_tool' ? [...cur.toolSlugs, match.slug] : cur.toolSlugs.filter((s) => s !== match.slug);
      const next = { ...cur, toolSlugs: nextSlugs };
      saveAnd(cmd.kind === 'add_tool' ? `${match.name} — in the kit.` : `${match.name} — out.`, next, { toolSlugs: nextSlugs.join(',') || null });
      return;
    }
    if (cmd.kind === 'want_avatar') {
      pushBot(COPY.avatarPrompt);
      setShowUpload(true);
      setChips([{ label: CHIP.cancel, t: 'cancel' }]);
      return;
    }
    if (cmd.kind === 'handle') {
      pushBot(COPY.handleCoach);
      setChips(BASE_CHIPS);
      return;
    }
    if (cmd.kind === 'unknown') {
      pushBot(COPY.unknown);
      setChips(BASE_CHIPS);
      return;
    }

    const result = applyProfileCommand(cur, cmd);
    if (!result.next) {
      pushBot(result.reply || COPY.unknown);
      setChips(BASE_CHIPS);
      return;
    }
    const body = commandToSyncBody(cmd, result.next);
    if (!body) { pushBot(COPY.unknown); setChips(BASE_CHIPS); return; }
    saveAnd(result.reply, result.next, body);
  }, [pendingBioSeed, privyId, allTools, pushUser, pushBot, pushBotAfter, setChips, setState, saveAnd, sync]);

  const handleChip = useCallback((chip: Chip) => {
    pushUser(chip.label);
    if (chip.t === 'done') { onClose(savedRef.current); return; }
    setPendingBioSeed(false);
    setShowUpload(false);
    setChips(BASE_CHIPS);
  }, [pushUser, setChips, onClose]);

  const upload = useCallback(async (file: File) => {
    setUploading(true);
    try {
      const url = await resizeAndUploadAvatar(file, privyId);
      const cur = stateRef.current;
      saveAnd(`New photo.`, { ...cur, avatarUrl: url }, { avatarUrl: url });
      setShowUpload(false);
    } catch (e) {
      pushBot(`That upload didn't take — ${e instanceof Error ? e.message : 'try another file'}.`);
    } finally {
      setUploading(false);
    }
  }, [privyId, saveAnd, pushBot]);

  const uploadSlot = showUpload ? (
    <div className="border border-ink/15 rounded-sm p-3 mb-2 flex items-center gap-3">
      <label className="font-mono text-[11px] uppercase tracking-[2px] text-ink/60 border border-ink/15 hover:border-ink/40 hover:text-ink px-3 py-1.5 rounded-sm transition cursor-pointer">
        {uploading ? COPY.uploading : 'Choose a photo…'}
        <input type="file" accept="image/*" className="hidden" disabled={uploading}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); }} />
      </label>
    </div>
  ) : null;

  return (
    <BuilderShell
      title="Profile Assistant"
      headerLink={{ label: 'Use the form instead', onClick: () => onClose(savedRef.current) }}
      onRequestClose={() => onClose(savedRef.current)}
      chat={
        <ChatPane
          messages={messages}
          chips={chips}
          onChip={handleChip}
          onSubmit={handleText}
          disabled={false}
          typing={typing}
          extra={uploadSlot}
          tiles={TILES}
          placeholder="bio: …  ·  i'm a photographer  ·  instagram: link"
        />
      }
      canvas={<PassportCanvas state={state} username={username} />}
    />
  );
}
