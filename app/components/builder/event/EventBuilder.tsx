'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  emptyEventDraft, parseEventWhen, parseCapacity, parseQuestionList, parseTierList,
  clampEventFields, draftToComposer, type DraftEvent,
} from '@/lib/builder/event';
import { extractFirstUrl, extractQuotedName } from '@/lib/builder/free-text';
import { PAYMENTS_ENABLED } from '@/lib/featureFlags';
import { BuilderShell } from '../BuilderShell';
import { ChatPane } from '../ChatPane';
import { useBuilderChat } from '../useBuilderChat';
import { llmParse } from '../llmParse';
import { EventCanvas } from './EventCanvas';
import { COPY, CHIP, TILES, type Stage } from './script';

/* The Event Builder — conversational front porch for the ONE EventComposer.
 * It collects, the composer publishes: on handoff the page renders the
 * composer prefilled (initial + staged questions + staged tickets) and the
 * host reviews and hits Publish, exactly like the import-from-link flow.
 * The bot never POSTs an event. */

type Chip =
  | { label: string; t: 'skip' }
  | { label: string; t: 'review_when' }
  | { label: string; t: 'review_where' }
  | { label: string; t: 'review_extras' }
  | { label: string; t: 'review_tickets' }
  | { label: string; t: 'open_composer'; accent?: boolean }
  | { label: string; t: 'cancel' };

export function EventBuilder({ privyId, seedText, onHandoff, onClose, variant, showBack }: {
  privyId: string;
  seedText?: string;
  variant?: 'modal' | 'page';
  /** Page variant: render the × as a real way back (history back / /events). */
  showBack?: boolean;
  /** The page takes over from here: render EventComposer with these props. */
  onHandoff: (composerProps: ReturnType<typeof draftToComposer>) => void;
  onClose: () => void;
}) {
  const { messages, chips, setChips, typing, pushUser, pushBot, pushBotAfter } = useBuilderChat<Chip>(
    () => ({ text: COPY.intro, chips: [] }),
  );
  const [stage, setStage] = useState<Stage>('describe');
  const [draft, setDraftState] = useState<DraftEvent | null>(null);
  const draftRef = useRef<DraftEvent | null>(null);
  const setDraft = useCallback((d: DraftEvent) => { draftRef.current = d; setDraftState(d); }, []);
  const asked = useRef({ where: false, extras: false, tickets: false });

  const reviewChips = useCallback((): Chip[] => [
    { label: CHIP.changeWhen, t: 'review_when' },
    { label: CHIP.changeWhere, t: 'review_where' },
    { label: CHIP.extras, t: 'review_extras' },
    ...(PAYMENTS_ENABLED ? [{ label: CHIP.tickets, t: 'review_tickets' as const }] : []),
    { label: CHIP.openComposer, t: 'open_composer', accent: true },
  ], []);

  const advance = useCallback(() => {
    const d = draftRef.current ?? emptyEventDraft();
    if (!d.eventName || !d.dateIso) {
      setStage('when');
      pushBot(d.eventName ? COPY.askWhen : COPY.intro, 380);
      setChips([]);
      return;
    }
    if (!d.city && !d.venue && !asked.current.where) {
      asked.current.where = true;
      setStage('where');
      pushBot(COPY.askWhere, 380);
      setChips([{ label: CHIP.skip, t: 'skip' }]);
      return;
    }
    if (d.capacity == null && d.questions.length === 0 && !asked.current.extras) {
      asked.current.extras = true;
      setStage('extras');
      pushBot(COPY.askExtras, 380);
      setChips([{ label: CHIP.skip, t: 'skip' }]);
      return;
    }
    if (PAYMENTS_ENABLED && d.tiers.length === 0 && !asked.current.tickets) {
      asked.current.tickets = true;
      setStage('tickets');
      pushBot(COPY.askTickets, 380);
      setChips([{ label: CHIP.skip, t: 'skip' }]);
      return;
    }
    setStage('review');
    pushBot(COPY.reviewIntro(d.eventName), 420);
    setChips(reviewChips());
  }, [pushBot, setChips, reviewChips]);

  /* The seed: local grammar floor + LLM merge, then route onward. */
  const seed = useCallback((text: string) => {
    void pushBotAfter((async () => {
      const d = { ...emptyEventDraft() };
      const urlHit = extractFirstUrl(text);
      let rest = text;
      if (urlHit) { d.link = urlHit.url; rest = urlHit.rest; }
      const quoted = extractQuotedName(rest);
      if (quoted) d.eventName = quoted.slice(0, 120);
      const when = parseEventWhen(rest, new Date());
      if (when.dateIso) d.dateIso = when.dateIso;
      if (when.startTime) d.startTime = when.startTime;
      if (when.endTime) d.endTime = when.endTime;
      d.capacity = parseCapacity(rest);
      if (!d.eventName) {
        // First clause before a comma often IS the event.
        const head = rest.split(',')[0].trim();
        if (head && head.length <= 80) d.eventName = head.replace(/^(?:a|an|the)\s+/i, '').slice(0, 120);
      }

      const fields = clampEventFields(await llmParse('event', text, privyId) ?? {});
      if (fields.eventName) d.eventName = fields.eventName;
      if (fields.description) d.description = fields.description;
      if (fields.dateIso) d.dateIso = fields.dateIso;
      if (fields.startTime) d.startTime = fields.startTime;
      if (fields.endTime) d.endTime = fields.endTime;
      if (fields.city) d.city = fields.city;
      if (fields.venue) d.venue = fields.venue;
      if (fields.link && !d.link) d.link = fields.link;
      if (fields.capacity != null) d.capacity = fields.capacity;
      if (fields.questions?.length) d.questions = fields.questions;
      if (fields.tiers?.length && PAYMENTS_ENABLED) {
        d.tiers = fields.tiers.map((t) => ({
          name: t.name, description: null, priceCents: t.priceCents,
          quantityTotal: t.quantityTotal, maxPerOrder: 10, quantitySold: 0,
          isActive: true, salesStartAt: null, salesEndAt: null,
        }));
      }
      setDraft(d);
      setTimeout(advance, 0);
      return d.eventName ? `${d.eventName} — sounds like a night.` : `Got it.`;
    })());
  }, [privyId, pushBotAfter, setDraft, advance]);

  const handleText = useCallback((raw: string) => {
    const text = raw.trim();
    if (!text) return;
    pushUser(text);

    if (stage === 'describe') { seed(text); return; }
    const d = { ...(draftRef.current ?? emptyEventDraft()) };
    if (stage === 'when') {
      if (!d.eventName) { seed(text); return; }
      const when = parseEventWhen(text, new Date());
      if (!when.dateIso && !when.startTime) { pushBot(COPY.whenMiss); return; }
      if (when.dateIso) d.dateIso = when.dateIso;
      if (when.startTime) d.startTime = when.startTime;
      if (when.endTime) d.endTime = when.endTime;
      setDraft(d);
      if (!d.dateIso) { pushBot(COPY.whenMiss); return; }
      advance();
      return;
    }
    if (stage === 'where') {
      const parts = text.split(',').map((p) => p.trim()).filter(Boolean);
      if (parts.length >= 2) { d.city = parts[0].slice(0, 80); d.venue = parts.slice(1).join(', ').slice(0, 80); }
      else d.city = text.slice(0, 80);
      setDraft(d);
      advance();
      return;
    }
    if (stage === 'extras') {
      const cap = parseCapacity(text);
      if (cap != null) d.capacity = cap;
      const stripped = text.replace(/\b(?:cap(?:acity)?(?:\s+(?:at|of|to))?|limit(?:ed)?(?:\s+to)?)\s+\d+\b/gi, '').replace(/\b\d+\s+(?:people|guests|spots|seats)\b/gi, '');
      const qs = parseQuestionList(stripped);
      if (qs.length) d.questions = [...d.questions, ...qs].slice(0, 8);
      setDraft(d);
      if (cap == null && qs.length === 0) { pushBot(COPY.unknown); setChips([{ label: CHIP.skip, t: 'skip' }]); return; }
      advance();
      return;
    }
    if (stage === 'tickets') {
      const tiers = parseTierList(text);
      if (!tiers.length) { pushBot(COPY.unknown); setChips([{ label: CHIP.skip, t: 'skip' }]); return; }
      d.tiers = tiers;
      setDraft(d);
      advance();
      return;
    }
    // review: free text re-runs the when/where/extras grammar opportunistically.
    const when = parseEventWhen(text, new Date());
    if (when.dateIso || when.startTime) {
      if (when.dateIso) d.dateIso = when.dateIso;
      if (when.startTime) d.startTime = when.startTime;
      if (when.endTime) d.endTime = when.endTime;
      setDraft(d);
      pushBot(`Updated the when.`);
    } else {
      pushBot(COPY.unknown);
    }
    setChips(reviewChips());
  }, [stage, pushUser, pushBot, setChips, setDraft, seed, advance, reviewChips]);

  const handleChip = useCallback((chip: Chip) => {
    pushUser(chip.label);
    switch (chip.t) {
      case 'skip':
        advance();
        break;
      case 'review_when':
        setStage('when'); pushBot(COPY.askWhen); setChips([{ label: CHIP.cancel, t: 'cancel' }]);
        break;
      case 'review_where':
        asked.current.where = true;
        setStage('where'); pushBot(COPY.askWhere); setChips([{ label: CHIP.cancel, t: 'cancel' }]);
        break;
      case 'review_extras':
        asked.current.extras = true;
        setStage('extras'); pushBot(COPY.askExtras); setChips([{ label: CHIP.cancel, t: 'cancel' }]);
        break;
      case 'review_tickets':
        asked.current.tickets = true;
        setStage('tickets'); pushBot(COPY.askTickets); setChips([{ label: CHIP.cancel, t: 'cancel' }]);
        break;
      case 'open_composer': {
        const d = draftRef.current;
        if (!d) break;
        pushBot(COPY.handoffNote, 100);
        setTimeout(() => onHandoff(draftToComposer(d)), 500);
        break;
      }
      case 'cancel':
        setStage('review');
        setChips(reviewChips());
        break;
    }
  }, [pushUser, pushBot, setChips, advance, reviewChips, onHandoff]);

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

  const requestClose = useCallback(() => {
    if (draftRef.current?.eventName && !window.confirm('Discard this draft?')) return;
    if (variant === 'page' && showBack) {
      // Landed here from the palette/nav — × means "take me back".
      if (window.history.length > 1) window.history.back();
      else window.location.assign('/events');
      return;
    }
    onClose();
  }, [onClose, variant, showBack]);

  return (
    <BuilderShell
      title="Event Builder"
      variant={variant}
      showClose={variant !== 'page' || showBack}
      headerLink={{ label: 'Use the form instead', onClick: onClose }}
      onRequestClose={requestClose}
      chat={
        <ChatPane
          messages={messages}
          chips={chips}
          onChip={handleChip}
          onSubmit={handleText}
          disabled={false}
          typing={typing}
          tiles={TILES}
        />
      }
      canvas={<EventCanvas draft={draft} />}
    />
  );
}
