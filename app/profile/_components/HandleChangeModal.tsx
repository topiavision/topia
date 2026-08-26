'use client';

import { useEffect, useState } from 'react';
import { CheckIcon } from '../../components/ui/Icons';
import { sanitizeUsername, useUsernameAvailability } from '../../onboarding/usernameAvailability';

interface Props {
  open: boolean;
  currentHandle: string;
  privyId: string | null;
  onClose: () => void;
  /** Called with the new sanitized handle once the user confirms. */
  onConfirm: (newHandle: string) => void;
}

/**
 * Modal that gates username changes. We don't want users casually editing
 * their handle while filling out other fields — it's their public URL.
 *
 * Flow: explicit warning → typed-in new handle → live availability check
 * → confirm button only enabled when the handle is valid, available, AND
 * different from the current one.
 */
export default function HandleChangeModal({ open, currentHandle, privyId, onClose, onConfirm }: Props) {
  const [draft, setDraft] = useState('');
  const availability = useUsernameAvailability(draft, privyId ?? undefined);

  // Reset draft when opened
  useEffect(() => {
    if (open) setDraft(currentHandle);
  }, [open, currentHandle]);

  // ESC + scroll lock
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  const sanitized = sanitizeUsername(draft);
  const unchanged = sanitized === currentHandle.toLowerCase();
  const canConfirm =
    !!sanitized &&
    !unchanged &&
    sanitized.length >= 3 &&
    (availability === 'available' || availability === 'idle');

  return (
    <div
      className="fixed inset-0 z-[1500] flex items-center justify-center px-3 sm:px-6 py-6 backdrop-blur-sm"
      style={{ backgroundColor: 'rgba(10,10,10,0.75)' }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md bg-[var(--page-bg)] text-ink rounded-lg border border-ink/[0.08] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-pink/10 border-b border-pink/30 px-5 py-3">
          <span className="font-mono text-[10px] uppercase tracking-[2px] text-pink/80 block">
            ⚠ Heads up
          </span>
          <h2 className="font-basement font-black text-[20px] uppercase text-ink mt-1 leading-tight">
            Change your handle?
          </h2>
        </div>

        <div className="p-5 space-y-4">
          <p className="font-mono text-[12px] text-ink/60 leading-relaxed">
            Your handle is your public URL: <span className="text-ink">topia.vision/profile/{currentHandle || '…'}</span>.
            Changing it will <span className="text-pink">break any existing links to your profile</span> — old links won&apos;t redirect to the new handle.
          </p>

          <div>
            <label className="block font-mono text-[10px] uppercase tracking-[2px] text-ink/40 mb-1">
              New handle
            </label>
            <div className="flex items-center bg-ink/[0.04] border border-ink/15 focus-within:border-[var(--accent-ink)]/40 rounded-sm px-3 py-2 transition-colors">
              <span className="font-mono text-[13px] text-ink/25 mr-1">@</span>
              <input
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                placeholder="handle"
                autoFocus
                className="flex-1 bg-transparent border-none outline-none font-mono text-[13px] text-ink placeholder:text-ink/25"
              />
            </div>
            {/* Live availability indicator */}
            <p
              className="mt-1.5 font-mono text-[10px] uppercase tracking-[2px] h-4"
              style={{
                color: availability === 'available' && !unchanged ? '#00FF88'
                  : availability === 'taken' ? '#FF5BD7'
                  : 'rgba(255,255,255,0.4)',
              }}
            >
              {unchanged && draft ? 'same as current'
                : availability === 'available' ? (<span className="inline-flex items-center gap-1"><CheckIcon size={9} /> available</span>)
                : availability === 'taken'    ? '✗ taken'
                : availability === 'invalid'  ? '3–30 chars · a–z 0–9 _'
                : availability === 'checking' ? 'checking…'
                : ''}
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-ink/[0.06] flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="font-mono text-[11px] uppercase tracking-[2px] px-3 py-1.5 bg-transparent border border-ink/15 text-ink/60 hover:text-ink rounded-sm transition cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={() => { onConfirm(sanitized); onClose(); }}
            disabled={!canConfirm}
            className="font-mono text-[11px] uppercase tracking-[2px] px-3 py-1.5 bg-lime text-obsidian rounded-sm transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed border-none hover:opacity-90"
          >
            Use this handle →
          </button>
        </div>
      </div>
    </div>
  );
}
