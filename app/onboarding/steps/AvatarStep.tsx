'use client';

import { useRef, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import StepShell from '../StepShell';
import { PathConfig } from '../../components/profile/pathConfig';
import { resizeAndUploadAvatar } from '../../../lib/uploadImage';
import { isRealPhoto } from '../../../lib/avatar';

interface Props {
  step: number;
  total: number;
  config: PathConfig | null;
  initialValue: string;
  fallbackName: string;
  onBack: () => void;
  onAdvance: (avatarUrl: string) => void;
}

// Avatars resize + upload to Blob (was inline base64). See lib/uploadImage.
const resizeImage = resizeAndUploadAvatar;

export default function AvatarStep({ step, total, config, initialValue, fallbackName, onBack, onAdvance }: Props) {
  // Only a real uploaded photo pre-fills — an auto-generated SVG fallback is
  // treated as "no photo yet" so the user is prompted to upload a real one.
  const { user } = usePrivy();
  const [avatarUrl, setAvatarUrl] = useState(isRealPhoto(initialValue) ? initialValue : '');
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const resized = await resizeImage(file, user?.id ?? '');
      setAvatarUrl(resized);
      setError('');
    } catch {
      setError('couldn\'t process that image — try another.');
    }
  }

  // Photo is optional — continuing without one keeps the generated fallback
  // avatar. The upload affordance stays front-and-center, but never blocks.
  function submit() {
    onAdvance(avatarUrl);
  }

  const initial = (fallbackName || 'Y')[0]?.toUpperCase() ?? '?';

  return (
    <StepShell
      step={step}
      total={total}
      config={config}
      kicker={`${String(step).padStart(2, '0')} · your face`}
      heading="Add a profile photo."
      hint={avatarUrl ? 'press enter — or pick another' : 'click the circle to upload — or continue and add one later'}
      onBack={onBack}
    >
      <div className="flex items-center gap-8">
        <button
          onClick={() => fileInputRef.current?.click()}
          className="relative group cursor-pointer bg-transparent border-none p-0"
          style={{ width: 160, height: 160 }}
        >
          {/* Corner marks */}
          <span className="absolute -top-2 -left-2 w-4 h-4"><span className="absolute top-0 left-0 w-full h-[1px] bg-ink/30" /><span className="absolute top-0 left-0 h-full w-[1px] bg-ink/30" /></span>
          <span className="absolute -top-2 -right-2 w-4 h-4"><span className="absolute top-0 right-0 w-full h-[1px] bg-ink/30" /><span className="absolute top-0 right-0 h-full w-[1px] bg-ink/30" /></span>
          <span className="absolute -bottom-2 -left-2 w-4 h-4"><span className="absolute bottom-0 left-0 w-full h-[1px] bg-ink/30" /><span className="absolute bottom-0 left-0 h-full w-[1px] bg-ink/30" /></span>
          <span className="absolute -bottom-2 -right-2 w-4 h-4"><span className="absolute bottom-0 right-0 w-full h-[1px] bg-ink/30" /><span className="absolute bottom-0 right-0 h-full w-[1px] bg-ink/30" /></span>
          <div className="w-full h-full rounded-full overflow-hidden border-2 border-dashed border-ink/15 group-hover:border-ink/40 transition-colors">
            {avatarUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-ink/[0.04]">
                <span className="font-basement text-5xl text-ink/20">{initial}</span>
              </div>
            )}
          </div>
          <div className="absolute inset-0 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-[var(--page-bg)]/60">
            <span className="font-mono text-[10px] uppercase tracking-[2px] text-ink">{avatarUrl ? 'change' : 'upload'}</span>
          </div>
        </button>
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />

        <div className="flex flex-col gap-3">
          <button
            onClick={submit}
            className="font-mono text-[12px] uppercase tracking-[2px] text-ink/70 hover:text-ink transition-colors bg-transparent border border-ink/30 hover:border-ink/70 px-4 py-2 cursor-pointer w-fit"
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
          >
            continue →
          </button>
          {avatarUrl && (
            <button
              onClick={() => setAvatarUrl('')}
              className="font-mono text-[10px] uppercase tracking-[2px] text-ink/30 hover:text-ink/60 transition-colors bg-transparent border-none cursor-pointer w-fit"
            >
              remove
            </button>
          )}
        </div>
      </div>
      {error && (
        <div className="mt-4 font-mono text-[11px] uppercase tracking-[2px] text-pink/80">{error}</div>
      )}
    </StepShell>
  );
}
