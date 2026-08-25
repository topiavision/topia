'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatMessage, ChipBase } from './ChatPane';

/* The chat plumbing every builder flow needs: message/chip/typing state,
 * delayed bot replies (typing dots absorb the beat — or an LLM round-trip),
 * timer cleanup, and a StrictMode-safe opening turn. The opening is computed
 * once in state initializers, never in an effect, so dev double-invocation
 * can't duplicate the intro — the mistake this hook exists to prevent. */

let msgId = 0;
const nextId = () => `bm${++msgId}`;

export function useBuilderChat<C extends ChipBase>(opening: () => { text: string; chips: C[] }) {
  const opened = useRef<{ text: string; chips: C[] } | null>(null);
  if (!opened.current) opened.current = opening();

  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    { id: nextId(), role: 'bot', text: opened.current!.text },
  ]);
  const [chips, setChips] = useState<C[]>(() => opened.current!.chips);
  const [pendingBots, setPendingBots] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const pushUser = useCallback((text: string) => {
    setMessages((m) => [...m, { id: nextId(), role: 'user', text }]);
  }, []);

  // Bot lines land on a beat — dots first, so turns read as a being
  // composing a thought rather than a form validating.
  const pushBot = useCallback((text: string, delay = 550) => {
    setPendingBots((n) => n + 1);
    const t = setTimeout(() => {
      setPendingBots((n) => Math.max(0, n - 1));
      setMessages((m) => [...m, { id: nextId(), role: 'bot', text }]);
    }, delay);
    timers.current.push(t);
  }, []);

  /* For LLM round-trips: hold the dots for the duration of an async job,
   * then deliver whatever reply the job produced. */
  const pushBotAfter = useCallback(async (job: Promise<string>) => {
    setPendingBots((n) => n + 1);
    try {
      const text = await job;
      setMessages((m) => [...m, { id: nextId(), role: 'bot', text }]);
    } finally {
      setPendingBots((n) => Math.max(0, n - 1));
    }
  }, []);

  useEffect(() => {
    const held = timers.current;
    return () => held.forEach(clearTimeout);
  }, []);

  return {
    messages, chips, setChips,
    typing: pendingBots > 0,
    pushUser, pushBot, pushBotAfter,
  };
}
