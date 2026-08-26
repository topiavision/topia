'use client';

import { usePrivy } from '@privy-io/react-auth';
import { TopiaAgent } from './TopiaAgent';

/* The agent as a full-screen takeover — opened from the nav ✦ or ⌘K, so
 * you never lose your place. The host (Navigation) only mounts this for
 * authenticated users; /assistant remains the deep-linkable page form. */
export function AssistantTakeover({ onClose }: { onClose: () => void }) {
  const { user } = usePrivy();
  if (!user) return null;
  return <TopiaAgent privyId={user.id} onExit={onClose} />;
}

export default AssistantTakeover;
