'use client';

import { useEffect, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useToast } from './Toast';

interface FollowButtonProps {
  targetUserId: string;
  initialIsFollowing?: boolean;
  onFollowChange?: (isFollowing: boolean) => void;
}

export default function FollowButton({ targetUserId, initialIsFollowing = false, onFollowChange }: FollowButtonProps) {
  const { authenticated, user, ready, login } = usePrivy();
  const toast = useToast();
  const [isFollowing, setIsFollowing] = useState(initialIsFollowing);
  const [busy, setBusy] = useState(false);

  // Re-sync when the resolved follow state arrives (e.g. the guest list
  // refetches once the viewer is known), so a button mounted with a stale
  // value updates instead of being stuck on "Follow".
  useEffect(() => { setIsFollowing(initialIsFollowing); }, [initialIsFollowing]);

  // Logged-out visitors still see the primary action — tapping it opens the
  // Privy login modal instead of the button silently not existing.
  if (!authenticated) {
    return (
      <button
        onClick={() => { if (ready) login(); }}
        className="font-mono text-[10px] uppercase tracking-wider rounded-sm px-2.5 py-1 transition-colors cursor-pointer bg-lime text-obsidian border border-lime font-bold hover:opacity-80"
      >
        Connect
      </button>
    );
  }

  const handleToggle = async () => {
    if (busy || !user) return;
    setBusy(true);
    try {
      if (isFollowing) {
        await fetch('/api/follow', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ privyId: user.id, targetUserId }),
        });
        setIsFollowing(false);
        onFollowChange?.(false);
      } else {
        await fetch('/api/follow', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ privyId: user.id, targetUserId }),
        });
        setIsFollowing(true);
        onFollowChange?.(true);
      }
    } catch (err) {
      console.error('Follow toggle error:', err);
      toast.error("Couldn't update follow — check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      onClick={handleToggle}
      disabled={busy}
      className={`font-mono text-[10px] uppercase tracking-wider rounded-sm px-2.5 py-1 transition-colors disabled:opacity-40 ${
        isFollowing
          ? 'bg-transparent text-ink/60 border border-ink/20 hover:text-ink hover:border-ink/40'
          : 'bg-lime text-obsidian border border-lime font-bold hover:opacity-80'
      }`}
    >
      {busy ? '···' : isFollowing ? 'Connected' : 'Connect'}
    </button>
  );
}
