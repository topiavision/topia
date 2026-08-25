'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { usePrivy } from '@privy-io/react-auth';
import { useUserProfile } from '../../hooks/useUserProfile';
import EventComposer, { type DraftQuestion } from '../_components/EventComposer';
import type { EventComposerInitial } from '../_components/EventComposer';
import type { StagedTickets } from '../_components/TicketSetup';
import { EventBuilder } from '../../components/builder/event/EventBuilder';
import { AssistantBar } from '../../components/builder/AssistantBar';

const EMPTY: EventComposerInitial = {
  eventName: '', dateIso: '', startTime: '', endTime: '', timezone: '',
  city: '', venue: '', link: '', description: '', imageUrl: '', worldId: '', published: false,
  rsvpCapacity: null, rsvpApprovalRequired: false,
};

export default function CreateEventPage() {
  const router = useRouter();
  const { user } = usePrivy();
  const { profile, loading } = useUserProfile();

  // Bot-first: the ✦ bar is the hero; typing opens the Event Builder, and its
  // handoff re-renders the composer prefilled (keyed so initializers re-run).
  // The form below stays fully usable — the bar is additive, not a gate.
  const [builderSeed, setBuilderSeed] = useState<string | null>(null);
  const [prefill, setPrefill] = useState<null | { initial: EventComposerInitial; initialQuestions: DraftQuestion[]; initialTickets: StagedTickets }>(null);
  const [seedVersion, setSeedVersion] = useState(0);

  useEffect(() => {
    if (!loading && profile?.path === 'catalyst') router.push('/dashboard');
  }, [loading, profile?.path, router]);

  if (!loading && profile?.path === 'catalyst') return null;

  return (
    <>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-[calc(var(--nav-height)+16px)] md:pt-4">
        <AssistantBar
          id="tour-event-assistant"
          placeholder="Describe your event — “rooftop listening party, Sept 12, 7pm, 60 people”…"
          suggestions={['A listening party next month', 'A gallery opening, free entry', 'A ticketed workshop']}
          onLaunch={(seed) => setBuilderSeed(seed)}
        />
      </div>
      <EventComposer
        key={seedVersion}
        mode="create"
        initial={prefill?.initial ?? EMPTY}
        initialQuestions={prefill?.initialQuestions}
        initialTickets={prefill?.initialTickets}
      />
      {builderSeed !== null && (
        <EventBuilder
          privyId={user?.id ?? ''}
          seedText={builderSeed || undefined}
          onHandoff={(props) => {
            setPrefill(props);
            setSeedVersion((v) => v + 1);
            setBuilderSeed(null);
            window.scrollTo({ top: 0 });
          }}
          onClose={() => setBuilderSeed(null)}
        />
      )}
    </>
  );
}
