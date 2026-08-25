'use client';

import { useRef, useState } from 'react';
import { ROLE_TAGS } from '../../../lib/profile/roleTags';
import { PATH_CONFIG, UserPath } from '../../components/profile/pathConfig';
import { sanitizeUsername, useUsernameAvailability } from '../../onboarding/usernameAvailability';
import { isRealPhoto } from '../../../lib/avatar';
import { resizeAndUploadAvatar } from '../../../lib/uploadImage';
import type { UserProfile } from '../../hooks/useUserProfile';

// Avatars resize + upload to Blob (was inline base64). See lib/uploadImage.
const resizeImage = resizeAndUploadAvatar;

const PATH_OPTIONS: { id: UserPath; icon: string }[] = [
  { id: 'worldbuilder', icon: '◆' },
  { id: 'catalyst', icon: '⬡' },
  { id: 'anchor', icon: '◎' },
];

interface Props {
  privyId: string;
  profile: UserProfile;
  /** Called after a successful save. `nowComplete` is true if every missing field is now filled. */
  onComplete: (nowComplete: boolean) => void;
  onSkip: () => void;
}

/**
 * Inline profile-completion shown in the post-RSVP modal. Renders ONLY the
 * fields the member is still missing (handle · photo · path · craft · bio) and
 * saves them via the partial-merge sync API.
 */
export default function ProfileCompletionForm({ privyId, profile, onComplete, onSkip }: Props) {
  const needsHandle = !profile.username;
  // An auto-generated fallback avatar still counts as missing — prompt a real upload.
  const needsAvatar = !isRealPhoto(profile.avatarUrl);
  const needsPath = !profile.path;
  const needsRoles = !(profile.roleTags && profile.roleTags.trim());
  const needsBio = !(profile.bio && profile.bio.trim());

  const [handle, setHandle] = useState('');
  const [avatar, setAvatar] = useState('');
  const [path, setPath] = useState<UserPath | ''>('');
  const [roles, setRoles] = useState<string[]>([]);
  const [bio, setBio] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const availability = useUsernameAvailability(handle, privyId);
  const handleOk = !needsHandle || !handle || availability === 'available';

  const toggleRole = (slug: string) =>
    setRoles((prev) => (prev.includes(slug) ? prev.filter((r) => r !== slug) : [...prev, slug]));

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setAvatar(await resizeImage(file, privyId));
      setError(null);
    } catch {
      setError("Couldn't process that image — try another.");
    }
  }

  // The member has filled in at least one of the missing fields.
  const hasInput =
    (needsHandle && !!handle) ||
    (needsAvatar && !!avatar) ||
    (needsPath && !!path) ||
    (needsRoles && roles.length > 0) ||
    (needsBio && !!bio.trim());

  const canSave = hasInput && handleOk && !saving;

  async function save() {
    if (!canSave) return;
    setSaving(true);
    setError(null);

    const patch: Record<string, unknown> = { privyId };
    if (needsHandle && handle && availability === 'available') patch.username = handle;
    if (needsAvatar && avatar) patch.avatarUrl = avatar;
    if (needsPath && path) patch.path = path;
    if (needsRoles && roles.length) patch.roleTags = roles.join(',');
    if (needsBio && bio.trim()) patch.bio = bio.trim();

    try {
      const res = await fetch('/api/auth/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        setError('Save failed — please try again.');
        return;
      }
      // Complete = every previously-missing field is now satisfied.
      const nowComplete =
        (!needsHandle || (!!handle && availability === 'available')) &&
        (!needsAvatar || !!avatar) &&
        (!needsPath || !!path) &&
        (!needsRoles || roles.length > 0) &&
        (!needsBio || !!bio.trim());
      onComplete(nowComplete);
    } catch {
      setError('Network error — please check your connection.');
    } finally {
      setSaving(false);
    }
  }

  const initial = (profile.name || handle || 'Y')[0]?.toUpperCase() ?? '?';
  const fg = 'var(--foreground)';

  return (
    <div className="text-left">
      <h2 className="font-mono text-[16px] font-bold uppercase mb-1 text-center" style={{ color: fg }}>
        Finish your passport
      </h2>
      <p className="font-mono text-[12px] opacity-60 mb-6 text-center" style={{ color: fg }}>
        Add what&apos;s missing to earn your <span className="font-bold">Certified</span> stamp.
      </p>

      <div className="flex flex-col gap-6">
        {/* ── Handle / username ──────────────────────────────────── */}
        {needsHandle && (
          <div>
            <p className="font-mono text-[11px] uppercase tracking-widest font-bold mb-2" style={{ color: fg }}>
              Claim your handle
            </p>
            <div
              className="flex items-center gap-1.5 border rounded-lg px-3"
              style={{ borderColor: availability === 'taken' || availability === 'invalid' ? '#FF5BD7' : 'var(--border-color)' }}
            >
              <span className="font-mono text-[14px] opacity-40" style={{ color: fg }}>@</span>
              <input
                value={handle}
                onChange={(e) => setHandle(sanitizeUsername(e.target.value))}
                placeholder="yourhandle"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                className="flex-1 bg-transparent border-none outline-none font-mono text-[14px] py-2.5"
                style={{ color: fg }}
              />
              {handle && (
                <span
                  className="font-mono text-[10px] uppercase tracking-widest shrink-0"
                  style={{
                    color:
                      availability === 'available' ? 'var(--accent)'
                      : availability === 'checking' ? fg
                      : '#FF5BD7',
                    opacity: availability === 'checking' ? 0.4 : 1,
                  }}
                >
                  {availability === 'available' ? 'free ✓'
                    : availability === 'checking' ? '…'
                    : availability === 'taken' ? 'taken'
                    : availability === 'invalid' ? '3–30 a–z 0–9 _'
                    : ''}
                </span>
              )}
            </div>
            <p className="mt-1.5 font-mono text-[10px] opacity-40" style={{ color: fg }}>
              This is your public profile URL — topia.so/@{handle || 'yourhandle'}
            </p>
          </div>
        )}

        {/* ── Avatar ─────────────────────────────────────────────── */}
        {needsAvatar && (
          <div className="flex items-center gap-4">
            <button
              onClick={() => fileRef.current?.click()}
              className="relative shrink-0 w-16 h-16 rounded-full overflow-hidden border-2 border-dashed cursor-pointer bg-transparent p-0"
              style={{ borderColor: 'var(--border-color)' }}
            >
              {avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatar} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="font-mono text-[22px] opacity-30" style={{ color: fg }}>
                  {initial}
                </span>
              )}
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
            <div>
              <p className="font-mono text-[11px] uppercase tracking-widest font-bold mb-0.5" style={{ color: fg }}>
                Profile photo
              </p>
              <button
                onClick={() => fileRef.current?.click()}
                className="font-mono text-[11px] underline opacity-60 hover:opacity-100 transition cursor-pointer bg-transparent border-none p-0"
                style={{ color: fg }}
              >
                {avatar ? 'Change photo' : 'Upload a photo'}
              </button>
            </div>
          </div>
        )}

        {/* ── Path ───────────────────────────────────────────────── */}
        {needsPath && (
          <div>
            <p className="font-mono text-[11px] uppercase tracking-widest font-bold mb-2" style={{ color: fg }}>
              Your path
            </p>
            <div className="grid grid-cols-3 gap-2">
              {PATH_OPTIONS.map((opt) => {
                const cfg = PATH_CONFIG[opt.id];
                const on = path === opt.id;
                return (
                  <button
                    key={opt.id}
                    onClick={() => setPath(opt.id)}
                    className="p-2.5 border rounded-lg text-center transition cursor-pointer"
                    style={{
                      borderColor: on ? cfg.hex : 'var(--border-color)',
                      backgroundColor: on ? cfg.hex : 'transparent',
                      color: on ? cfg.hex === '#e4fe52' ? '#0c0c0e' : '#ffffff' : fg,
                    }}
                  >
                    <div className="text-[18px] leading-none mb-1">{opt.icon}</div>
                    <div className="font-mono text-[9px] uppercase tracking-[1px] font-bold">{cfg.label}</div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Craft / role tags ──────────────────────────────────── */}
        {needsRoles && (
          <div>
            <p className="font-mono text-[11px] uppercase tracking-widest font-bold mb-2" style={{ color: fg }}>
              Your craft
            </p>
            <div className="flex flex-wrap gap-1.5">
              {ROLE_TAGS.map(({ slug, label }) => {
                const on = roles.includes(slug);
                return (
                  <button
                    key={slug}
                    onClick={() => toggleRole(slug)}
                    className="font-mono text-[11px] uppercase tracking-[0.5px] px-2.5 py-1 rounded-full border transition cursor-pointer"
                    style={{
                      borderColor: on ? 'var(--accent)' : 'var(--border-color)',
                      backgroundColor: on ? 'var(--accent)' : 'transparent',
                      color: on ? 'var(--accent-text)' : fg,
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Bio ────────────────────────────────────────────────── */}
        {needsBio && (
          <div>
            <p className="font-mono text-[11px] uppercase tracking-widest font-bold mb-2" style={{ color: fg }}>
              One line about you
            </p>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="what you make, why you're here…"
              rows={2}
              maxLength={280}
              className="w-full bg-transparent border rounded-lg px-3 py-2 font-mono text-[13px] outline-none resize-none"
              style={{ color: fg, borderColor: 'var(--border-color)' }}
            />
          </div>
        )}
      </div>

      {error && (
        <p className="mt-4 font-mono text-[11px] uppercase tracking-widest text-center" style={{ color: '#FF5BD7' }}>
          {error}
        </p>
      )}

      <div className="mt-7 flex flex-col gap-2">
        <button
          onClick={save}
          disabled={!canSave}
          className="w-full px-4 py-3 font-mono text-[12px] uppercase tracking-widest rounded-lg cursor-pointer border-none font-bold transition disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90"
          style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-text)' }}
        >
          {saving ? 'Saving…' : 'Save & stamp it →'}
        </button>
        <button
          onClick={onSkip}
          className="font-mono text-[11px] uppercase tracking-widest opacity-40 hover:opacity-70 transition cursor-pointer bg-transparent border-none"
          style={{ color: fg }}
        >
          Skip for now
        </button>
      </div>
    </div>
  );
}
