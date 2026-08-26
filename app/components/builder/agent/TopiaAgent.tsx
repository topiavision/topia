'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { parseAgentUtterance, clampAgentFields, type AgentIntent } from '@/lib/builder/agent';
import { BuilderShell } from '../BuilderShell';
import { ChatPane } from '../ChatPane';
import { useBuilderChat } from '../useBuilderChat';
import { llmParse } from '../llmParse';
import { ROLE_TAGS } from '@/lib/profile/roleTags';
import { AgentCanvas, ENTITY_BROWSE, type AgentView, type ResultItem } from './AgentCanvas';

/* The Topia Agent — /assistant. One prompt for everything: discovery and
 * help are answered HERE (result/capability cards in the preview pane);
 * create/manage intents route to the bot-first surfaces, carrying the typed
 * seed via sessionStorage ('topia:assistant-seed', consumed once). */

export const ASSISTANT_SEED_KEY = 'topia:assistant-seed';

const TILES = [
  { glyph: '✦', title: 'Creators to follow', sub: '“show me photographers” — by role, from the community', seed: 'show me photographers' },
  { glyph: '⚒', title: 'Find your tools', sub: '“what tools do people use for video?”', seed: 'what tools do people use for video' },
  { glyph: '◷', title: 'Make something', sub: '“host a listening party next month”', seed: 'host a listening party next month' },
  { glyph: '?', title: 'Show me around', sub: 'everything you can do on Topia', seed: 'what can I do' },
];

type Chip = { label: string; t: 'cap'; seed: string };
const CAP_CHIPS: Chip[] = [
  { label: 'Creators', t: 'cap', seed: 'show me creators' },
  { label: 'Tools', t: 'cap', seed: 'find tools' },
  { label: 'Events', t: 'cap', seed: 'show me events' },
  { label: 'Help', t: 'cap', seed: 'what can I do' },
];

const ROUTES: Record<'event' | 'world' | 'project' | 'roadmap' | 'profile', { href: string; title: string; blurb: string; carrySeed: boolean }> = {
  event: { href: '/events/create', title: 'Event Builder', blurb: 'describing your event to the builder…', carrySeed: true },
  world: { href: '/dashboard/create-world', title: 'World Builder', blurb: 'bringing your world to the builder…', carrySeed: true },
  project: { href: '/dashboard/worlds', title: 'Projects', blurb: 'pick the world, then + Project — the builder takes it from there', carrySeed: false },
  roadmap: { href: '/dashboard/worlds', title: 'In Process', blurb: 'pick the world, then its In Process tab — the roadmap assistant is there', carrySeed: false },
  profile: { href: '/profile?assistant=1', title: 'Profile Assistant', blurb: 'opening your passport…', carrySeed: false },
};

export function TopiaAgent({ privyId, onExit }: {
  privyId: string;
  /** Set when the agent runs as the global takeover — × closes the overlay
   * instead of navigating, and a routing handoff closes it behind itself. */
  onExit?: () => void;
}) {
  const router = useRouter();
  const { messages, chips, setChips, typing, pushUser, pushBot, pushBotAfter } = useBuilderChat<Chip>(() => ({
    text: `Topia's assistant ✦ Ask for anything — people, tools, events — or tell me what to make.`,
    chips: [],
  }));
  const [canvas, setCanvas] = useState<AgentView>({ view: 'capabilities' });

  const runDiscovery = useCallback(async (entity: Extract<AgentIntent, { kind: 'discover' }>) => {
    const params = new URLSearchParams();
    if (entity.query) params.set('q', entity.query);
    if (entity.role) params.set('role', entity.role);
    if (!entity.query && !entity.role) params.set('q', entity.entity);
    const res = await fetch(`/api/search?${params.toString()}`);
    const data = await res.json().catch(() => null);
    const items: ResultItem[] = data?.[entity.entity] ?? [];

    // Empty results get REAL doors, not apologies: what exists in the
    // directory right now, tappable, plus the browse-everything link.
    let suggestions: { label: string; seed: string }[] | undefined;
    if (items.length === 0) {
      if (entity.entity === 'tools') {
        const cats = await fetch('/api/tools')
          .then((r) => (r.ok ? r.json() : null))
          .then((d) => {
            // Categories are stored CSV per tool ("Music, Production") —
            // split to atomic chips, case-insensitive dedupe, legacy-tolerant.
            const seen = new Map<string, string>();
            for (const tool of d?.tools ?? []) {
              for (const piece of String(tool.category ?? '').split(',')) {
                const c = piece.trim();
                if (c && !seen.has(c.toLowerCase())) seen.set(c.toLowerCase(), c);
              }
            }
            return [...seen.values()].slice(0, 8);
          })
          .catch(() => [] as string[]);
        suggestions = cats.map((c) => ({ label: c, seed: `show me ${c} tools` }));
      } else if (entity.entity === 'people') {
        suggestions = ROLE_TAGS.slice(0, 6).map((r) => ({ label: r.label, seed: `show me ${r.label.toLowerCase()}s` }));
      }
    }

    setCanvas({ view: 'results', entity: entity.entity, query: entity.role ?? entity.query, items, suggestions });
    setChips(CAP_CHIPS);
    return items.length === 0
      ? (suggestions && suggestions.length > 0
        ? `Nothing for that yet — but here's what the directory does have. Tap a category in the pane, or browse everything.`
        : `Nothing for that yet — ${ENTITY_BROWSE[entity.entity].label.toLowerCase()} is in the pane.`)
      : `Found ${items.length} — they're in the pane${items.length > 1 ? ', tap any to open' : ''}.`;
  }, [setChips]);

  const act = useCallback((intent: AgentIntent, raw: string) => {
    switch (intent.kind) {
      case 'discover':
        void pushBotAfter(runDiscovery(intent));
        return;
      case 'create':
      case 'manage': {
        const route = ROUTES[intent.kind === 'manage' ? 'profile' : intent.what];
        setCanvas({ view: 'routing', title: route.title, blurb: route.blurb });
        pushBot(route.carrySeed ? `On it — opening the ${route.title} with what you just said.` : `That lives one hop away — ${route.blurb}`);
        if (route.carrySeed && intent.seed) {
          try { sessionStorage.setItem(ASSISTANT_SEED_KEY, intent.seed); } catch { /* best-effort */ }
        }
        setTimeout(() => { router.push(route.href); onExit?.(); }, 1100);
        return;
      }
      case 'help':
        setCanvas({ view: 'capabilities' });
        pushBot(`Here's the map — every card opens the real thing. Or just describe what you want to make.`);
        setChips(CAP_CHIPS);
        return;
      default:
        // Local grammar missed — let the LLM take a swing before coaching.
        void pushBotAfter((async () => {
          const fields = await llmParse('agent', raw, privyId);
          const upgraded = fields ? clampAgentFields(fields) : null;
          if (upgraded && upgraded.kind !== 'unknown') {
            // Recurse exactly once — clamp guarantees a concrete intent.
            setTimeout(() => act(upgraded, raw), 0);
            return `Got it.`;
          }
          setCanvas({ view: 'capabilities' });
          setChips(CAP_CHIPS);
          return `Not sure yet — I can find people, tools, worlds, events and grants, or start anything on the cards. Try “show me producers” or “host a listening party”.`;
        })());
    }
  }, [pushBot, pushBotAfter, runDiscovery, router, privyId, setChips, onExit]);

  const handleText = useCallback((raw: string) => {
    const text = raw.trim();
    if (!text) return;
    pushUser(text);
    act(parseAgentUtterance(text), text);
  }, [pushUser, act]);

  const handleChip = useCallback((chip: Chip) => {
    pushUser(chip.label);
    act(parseAgentUtterance(chip.seed), chip.seed);
  }, [pushUser, act]);

  return (
    <BuilderShell
      title="Topia Assistant"
      variant={onExit ? 'modal' : 'page'}
      onRequestClose={() => {
        if (onExit) { onExit(); return; }
        // Landed on /assistant directly — × means "take me back".
        if (window.history.length > 1) window.history.back();
        else router.push('/home');
      }}
      chat={
        <ChatPane
          messages={messages}
          chips={chips}
          onChip={handleChip}
          onSubmit={handleText}
          disabled={false}
          typing={typing}
          tiles={TILES}
          placeholder="show me photographers · what tools for video · host a party…"
        />
      }
      canvas={<AgentCanvas state={canvas} onSuggest={(seed) => { pushUser(seed); act(parseAgentUtterance(seed), seed); }} />}
    />
  );
}
