'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { usePrivy } from '@privy-io/react-auth';
import { useUserProfile } from '../../hooks/useUserProfile';
import EventComposer, { type DraftQuestion } from '../_components/EventComposer';
import type { EventComposerInitial } from '../_components/EventComposer';
import type { StagedTickets } from '../_components/TicketSetup';
import { EventBuilder } from '../../components/builder/event/EventBuilder';
import { AssistantLauncher } from '../../components/builder/AssistantLauncher';

/* Create event — assistant-first, v0-style: the builder IS the page.
 * Describe the event on the left, watch it assemble on the right, then the
 * review handoff opens the classic composer prefilled for publish. "Use the
 * form instead" swaps to the composer at any time. */

const EMPTY: EventComposerInitial = {
  eventName: '', dateIso: '', startTime: '', endTime: '', timezone: '',
  city: '', venue: '', link: '', description: '', imageUrl: '', worldId: '', published: false,
  rsvpCapacity: null, rsvpApprovalRequired: false,
};

export default function CreateEventPage() {
  const router = useRouter();
  const { user } = usePrivy();
  const { profile, loading } = useUserProfile();

  const [mode, setMode] = useState<'assistant' | 'form'>('assistant');
  const [prefill, setPrefill] = useState<null | { initial: EventComposerInitial; initialQuestions: DraftQuestion[]; initialTickets: StagedTickets }>(null);
  const [seedVersion, setSeedVersion] = useState(0);

  useEffect(() => {
    if (!loading && profile?.path === 'catalyst') router.push('/dashboard');
  }, [loading, profile?.path, router]);

  if (!loading && profile?.path === 'catalyst') return null;

  if (mode === 'assistant') {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-[calc(var(--nav-height)+16px)] pb-[var(--mobile-nav-clearance)] md:pb-8">
        <EventBuilder
          variant="page"
          privyId={user?.id ?? ''}
          onHandoff={(props) => {
            setPrefill(props);
            setSeedVersion((v) => v + 1);
            setMode('form');
            window.scrollTo({ top: 0 });
          }}
          onClose={() => setMode('form')}
        />
      </div>
    );
  }

  return (
    <EventComposer
      key={seedVersion}
      mode="create"
      initial={prefill?.initial ?? EMPTY}
      initialQuestions={prefill?.initialQuestions}
      initialTickets={prefill?.initialTickets}
      topSlot={
        <AssistantLauncher
          compact
          heading="Start over with the assistant"
          prompts={['describe the event and I’ll fill this whole form in…']}
          onOpen={() => { setPrefill(null); setSeedVersion((v) => v + 1); setMode('assistant'); }}
        />
      }
    />
  );
}
