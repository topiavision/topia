'use client';

import { useState, useEffect, useRef } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import PageShell from '../components/PageShell';
import LoadingBar from '../components/LoadingBar';
import { SocialIcon } from '../components/SocialIcons';
import { CheckIcon } from '../components/ui/Icons';
import SocialConnect, { ENABLED_SOCIAL_PROVIDERS, type SocialProvider } from '../components/SocialConnect';
import { PATH_CONFIG, type UserPath } from '../components/profile/pathConfig';
import ProfilePreviewCard from './_components/ProfilePreviewCard';
import NotificationPrefs from './_components/NotificationPrefs';
import InProcessConnectCard from '../components/InProcessConnectCard';
import HandleChangeModal from './_components/HandleChangeModal';
import { resizeAndUploadAvatar } from '../../lib/uploadImage';
import RoleTagPicker from '../components/RoleTagPicker';
import { ROLE_TAGS as EVENT_ROLE_TAGS, ROLES_MAX } from '../../lib/events/questions';
import { roleLabelToSlug, roleSlugToLabel } from '../../lib/profile/roleTags';

interface Tool { id: string; name: string; slug: string; category: string | null; }

/** Avatars now resize + upload to Blob (was inline base64). See lib/uploadImage. */
const resizeImage = resizeAndUploadAvatar;

/** Section header — used across all blocks for visual consistency. */
function Section({ label, sub, children, id }: { label: string; sub?: string; children: React.ReactNode; id?: string }) {
  return (
    <section id={id} className="border-t border-ink/[0.06] pt-6 mt-6 first:border-t-0 first:mt-0 first:pt-0">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="font-mono text-[11px] uppercase tracking-[3px] text-ink/80">{label}</h2>
        {sub && <span className="font-mono text-[10px] uppercase tracking-[2px] text-ink/30">{sub}</span>}
      </div>
      {children}
    </section>
  );
}

const fieldLabel = 'block font-mono text-[10px] uppercase tracking-[2px] text-ink/40 mb-1.5';
const fieldInput = 'w-full bg-ink/[0.04] border border-ink/15 focus:border-[var(--accent-ink)]/40 rounded-sm px-3 py-2 font-mono text-[13px] text-ink placeholder:text-ink/25 outline-none transition-colors';

export default function ProfilePage() {
  const {
    ready, authenticated, user, logout,
    linkEmail, unlinkEmail,
    linkPhone, unlinkPhone,
    linkGoogle, unlinkGoogle,
    linkWallet, unlinkWallet,
  } = usePrivy();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Profile fields
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [originalUsername, setOriginalUsername] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [socialWebsite, setSocialWebsite] = useState('');
  const [socialTwitter, setSocialTwitter] = useState('');
  const [socialInstagram, setSocialInstagram] = useState('');
  const [socialSoundcloud, setSocialSoundcloud] = useState('');
  const [socialSpotify, setSocialSpotify] = useState('');
  const [socialLinkedin, setSocialLinkedin] = useState('');
  const [socialSubstack, setSocialSubstack] = useState('');
  const [socialFarcaster, setSocialFarcaster] = useState('');
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [selectedTools, setSelectedTools] = useState<string[]>([]);
  const [stackTitle, setStackTitle] = useState('');
  const [path, setPath] = useState<UserPath | ''>('');
  const [pronouns, setPronouns] = useState('');
  const [customLinks, setCustomLinks] = useState<{ label: string; url: string }[]>([]);
  const [avatarDragging, setAvatarDragging] = useState(false);

  // Tools from DB
  const [allTools, setAllTools] = useState<Tool[]>([]);
  const [toolSearch, setToolSearch] = useState('');
  const [toolsLoading, setToolsLoading] = useState(true);

  // UI state
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [unlinking, setUnlinking] = useState<string | null>(null);
  const [handleModalOpen, setHandleModalOpen] = useState(false);

  // Dirty tracking — gates the save button + warns on navigation
  const [initialSnapshot, setInitialSnapshot] = useState<string>('');
  const currentSnapshot = JSON.stringify({
    name, username, bio, avatarUrl, pronouns,
    socialWebsite, socialTwitter, socialInstagram, socialSoundcloud, socialSpotify, socialLinkedin, socialSubstack, socialFarcaster,
    customLinks, path, selectedRoles, selectedTools, stackTitle,
  });
  const isDirty = initialSnapshot !== '' && initialSnapshot !== currentSnapshot;

  // Redirect if not authenticated
  useEffect(() => {
    if (ready && !authenticated) router.push('/');
  }, [ready, authenticated, router]);

  // Fetch all tools
  useEffect(() => {
    fetch('/api/tools')
      .then((r) => r.json())
      .then(({ tools }) => setAllTools(tools ?? []))
      .catch(console.error)
      .finally(() => setToolsLoading(false));
  }, []);

  // Load existing profile from DB on mount
  useEffect(() => {
    if (!ready || !authenticated || !user) return;
    fetch(`/api/auth/profile?privyId=${encodeURIComponent(user.id)}`)
      .then((r) => r.json())
      .then(({ user: saved }) => {
        let loadedName = '';
        let loadedUsername = '';
        let loadedBio = '';
        let loadedAvatar = '';
        let loadedPronouns = '';
        let loadedPath: UserPath | '' = '';
        let loadedWebsite = '';
        let loadedTwitter = '';
        let loadedInstagram = '';
        let loadedSoundcloud = '';
        let loadedSpotify = '';
        let loadedLinkedin = '';
        let loadedSubstack = '';
        let loadedFarcaster = '';
        let loadedCustomLinks: { label: string; url: string }[] = [];
        let loadedRoles: string[] = [];
        let loadedTools: string[] = [];
        let loadedStackTitle = '';

        if (saved) {
          if (saved.name)            loadedName = saved.name;
          if (saved.username)        loadedUsername = saved.username;
          if (saved.bio)             loadedBio = saved.bio;
          if (saved.avatarUrl)       loadedAvatar = saved.avatarUrl;
          if (saved.socialWebsite)    loadedWebsite = saved.socialWebsite;
          if (saved.socialTwitter)    loadedTwitter = saved.socialTwitter;
          if (saved.socialInstagram)  loadedInstagram = saved.socialInstagram;
          if (saved.socialSoundcloud) loadedSoundcloud = saved.socialSoundcloud;
          if (saved.socialSpotify)    loadedSpotify = saved.socialSpotify;
          if (saved.socialLinkedin)   loadedLinkedin = saved.socialLinkedin;
          if (saved.socialSubstack)   loadedSubstack = saved.socialSubstack;
          if (saved.socialFarcaster)  loadedFarcaster = saved.socialFarcaster;
          if (saved.path)            loadedPath = saved.path as UserPath;
          if (saved.pronouns)        loadedPronouns = saved.pronouns;
          if (Array.isArray(saved.customLinks)) loadedCustomLinks = saved.customLinks;
          if (saved.roleTags)        loadedRoles = saved.roleTags.split(',').map((s: string) => s.trim()).filter(Boolean);
          if (saved.toolSlugs)       loadedTools = saved.toolSlugs.split(',').map((s: string) => s.trim()).filter(Boolean);
          if (saved.stackTitle)      loadedStackTitle = saved.stackTitle;
        } else {
          // First-time profile: fall back to Google name/avatar if present.
          const googleName = user.google?.name;
          const googleAvatar = (user.google as { picture?: string; photoUrl?: string } | undefined)?.picture
                            ?? (user.google as { picture?: string; photoUrl?: string } | undefined)?.photoUrl;
          if (googleName) loadedName = googleName;
          if (googleAvatar) loadedAvatar = googleAvatar;
        }

        setName(loadedName);
        setUsername(loadedUsername);
        setOriginalUsername(loadedUsername);
        setBio(loadedBio);
        setAvatarUrl(loadedAvatar);
        setSocialWebsite(loadedWebsite);
        setSocialTwitter(loadedTwitter);
        setSocialInstagram(loadedInstagram);
        setSocialSoundcloud(loadedSoundcloud);
        setSocialSpotify(loadedSpotify);
        setSocialLinkedin(loadedLinkedin);
        setSocialSubstack(loadedSubstack);
        setSocialFarcaster(loadedFarcaster);
        setPath(loadedPath);
        setPronouns(loadedPronouns);
        setCustomLinks(loadedCustomLinks);
        setSelectedRoles(loadedRoles);
        setSelectedTools(loadedTools);
        setStackTitle(loadedStackTitle);

        // Snapshot for dirty tracking — must mirror currentSnapshot exactly
        setInitialSnapshot(JSON.stringify({
          name: loadedName, username: loadedUsername, bio: loadedBio, avatarUrl: loadedAvatar, pronouns: loadedPronouns,
          socialWebsite: loadedWebsite, socialTwitter: loadedTwitter, socialInstagram: loadedInstagram,
          socialSoundcloud: loadedSoundcloud, socialSpotify: loadedSpotify, socialLinkedin: loadedLinkedin,
          socialSubstack: loadedSubstack, socialFarcaster: loadedFarcaster,
          customLinks: loadedCustomLinks, path: loadedPath, selectedRoles: loadedRoles, selectedTools: loadedTools, stackTitle: loadedStackTitle,
        }));
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [ready, authenticated, user]);

  // Warn on navigation away with unsaved changes
  useEffect(() => {
    if (!isDirty) return;
    function onBeforeUnload(e: BeforeUnloadEvent) { e.preventDefault(); e.returnValue = ''; }
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [isDirty]);

  // Linked accounts
  const linkedAccounts = user?.linkedAccounts ?? [];
  const canUnlink = linkedAccounts.length > 1;
  const emailAccount  = linkedAccounts.find((a) => a.type === 'email')        as { type: 'email';        address: string }                              | undefined;
  const phoneAccount  = linkedAccounts.find((a) => a.type === 'phone')        as { type: 'phone';        number: string }                               | undefined;
  const googleAccount = linkedAccounts.find((a) => a.type === 'google_oauth') as { type: 'google_oauth'; subject: string; email?: string }              | undefined;
  const walletAccount = linkedAccounts.find((a) => a.type === 'wallet')       as { type: 'wallet';       address: string }                              | undefined;

  const toggleTool = (slug: string) => setSelectedTools((p) => p.includes(slug) ? p.filter((t) => t !== slug) : [...p, slug]);

  const filteredTools = allTools.filter((t) => {
    if (!toolSearch) return true;
    const q = toolSearch.toLowerCase();
    return t.name.toLowerCase().includes(q) || (t.category?.toLowerCase().includes(q) ?? false);
  });

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    setSaved(false);
    setSaveError(null);
    try {
      const res = await fetch('/api/auth/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          privyId: user.id,
          email: emailAccount?.address ?? googleAccount?.email ?? null,
          phone: phoneAccount?.number ?? null,
          walletAddress: walletAccount?.address ?? null,
          name, username, bio, avatarUrl, pronouns,
          socialWebsite, socialTwitter, socialInstagram, socialSoundcloud, socialSpotify, socialLinkedin, socialSubstack, socialFarcaster,
          customLinks,
          path: path || null,
          roleTags: selectedRoles.join(',') || null,
          toolSlugs: selectedTools.join(',') || null,
          stackTitle,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setSaveError((body as { error?: string }).error ?? 'Save failed — please try again.');
        return;
      }
      // Reset dirty snapshot to current
      setInitialSnapshot(currentSnapshot);
      setOriginalUsername(username);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {
      setSaveError('Network error — please check your connection.');
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try { setAvatarUrl(await resizeImage(file, user?.id ?? '')); } catch { console.error('Failed to process image'); }
  };

  const handleUnlink = async (type: string, fn: () => Promise<unknown>) => {
    if (!canUnlink) return;
    setUnlinking(type);
    try { await fn(); } finally { setUnlinking(null); }
  };

  if (!ready || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--page-bg)]">
        <LoadingBar />
      </div>
    );
  }

  const handleChanged = username !== originalUsername;

  return (
    <div className="min-h-screen bg-[var(--page-bg)] text-ink">
      <PageShell>
        {/* ── Sticky top action bar — sits below the nav ────────── */}
        <div
          className="sticky top-0 md:top-[var(--nav-height,56px)] z-30 backdrop-blur-md border-b border-ink/[0.06]"
          style={{ backgroundColor: 'var(--nav-bg)' }}
        >
          <div className="max-w-3xl mx-auto px-4 sm:px-6 py-2.5 flex items-center gap-3">
            <Link
              href="/dashboard"
              className="font-mono text-[11px] uppercase tracking-[2px] text-ink/50 hover:text-ink transition no-underline"
            >
              ← Dashboard
            </Link>
            <span className="font-mono text-[10px] uppercase tracking-[2px] text-ink/25 ml-auto">
              {saving ? 'Saving…'
                : saved ? (<span className="text-green inline-flex items-center gap-1.5"><CheckIcon size={9} /> Saved</span>)
                : isDirty ? 'Unsaved changes'
                : 'All saved'}
            </span>
            <button
              onClick={handleSave}
              disabled={saving || !isDirty}
              className="font-mono text-[11px] uppercase tracking-[2px] px-4 py-1.5 rounded-sm transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed border-none bg-lime text-obsidian hover:opacity-90"
              style={{
                boxShadow: !saving && isDirty ? '0 0 0 1px rgba(228,254,82,0.4), 0 6px 24px -8px rgba(228,254,82,0.5)' : 'none',
              }}
            >
              {saving ? 'Saving…' : saved ? 'Saved' : 'Save changes →'}
            </button>
          </div>
          {username && (
            <div className="max-w-3xl mx-auto px-4 sm:px-6 pb-2 -mt-1 flex items-center gap-3">
              <span className="font-mono text-[10px] uppercase tracking-[2px] text-ink/25">Public:</span>
              <Link
                href={`/profile/${username}`}
                className="font-mono text-[11px] text-ink/60 hover:text-[var(--accent-ink)] no-underline transition truncate"
              >
                topia.so/profile/@{username}
              </Link>
            </div>
          )}
        </div>

        {/* ── Body ───────────────────────────────────────────────── */}
        <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6 pb-24">

          {/* ─── 1. IDENTITY ─── */}
          <Section label="Identity" sub="how you show up">
            <div className="flex flex-col sm:flex-row gap-5">
              {/* Avatar drop zone */}
              <div
                className={`relative shrink-0 self-center sm:self-start group ${avatarDragging ? 'ring-2 ring-lime' : ''}`}
                onDragEnter={(e) => { e.preventDefault(); setAvatarDragging(true); }}
                onDragOver={(e) => { e.preventDefault(); setAvatarDragging(true); }}
                onDragLeave={(e) => {
                  if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                  setAvatarDragging(false);
                }}
                onDrop={async (e) => {
                  e.preventDefault();
                  setAvatarDragging(false);
                  const file = Array.from(e.dataTransfer.files).find((f) => f.type.startsWith('image/'));
                  if (!file) return;
                  try { setAvatarUrl(await resizeImage(file, user?.id ?? '')); } catch { console.error('drop failed'); }
                }}
              >
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="block w-28 h-28 rounded-full overflow-hidden border-2 border-dashed border-ink/20 hover:border-[var(--accent-ink)]/50 transition bg-ink/[0.03] cursor-pointer"
                  title="Click or drop an image"
                >
                  {avatarUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <span className="font-basement text-[36px] text-ink/20">{name ? name[0].toUpperCase() : '?'}</span>
                    </div>
                  )}
                </button>
                <input ref={fileInputRef} type="file" accept="image/*" onChange={handleAvatarChange} className="hidden" />
                <p className="text-center mt-2 font-mono text-[9px] uppercase tracking-[2px] text-ink/30">
                  {avatarDragging ? 'drop' : 'click or drop'}
                </p>
                {avatarUrl && (
                  <button
                    onClick={() => setAvatarUrl('')}
                    className="block mx-auto mt-1 font-mono text-[9px] uppercase tracking-[2px] text-ink/30 hover:text-pink bg-transparent border-none cursor-pointer"
                  >
                    × Remove photo
                  </button>
                )}
              </div>

              {/* Identity fields */}
              <div className="flex-1 space-y-4 min-w-0">
                <div>
                  <label className={fieldLabel}>Display name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your display name"
                    className={fieldInput}
                  />
                </div>

                {/* Handle — locked behind a confirm modal */}
                <div>
                  <label className={fieldLabel}>Handle</label>
                  <div className="flex items-center bg-ink/[0.04] border border-ink/15 rounded-sm px-3 py-2">
                    <span className="font-mono text-[13px] text-ink/25 mr-1">@</span>
                    <span className={`flex-1 font-mono text-[13px] truncate ${username ? 'text-ink' : 'text-ink/30'}`}>
                      {username || 'pick a handle'}
                    </span>
                    {handleChanged && (
                      <span className="font-mono text-[9px] uppercase tracking-[2px] text-[var(--accent-ink)]/80 mr-2">
                        ◆ changed
                      </span>
                    )}
                    <button
                      onClick={() => setHandleModalOpen(true)}
                      className="font-mono text-[10px] uppercase tracking-[2px] px-2 py-1 bg-transparent border border-ink/15 text-ink/60 hover:text-ink hover:border-[var(--accent-ink)]/40 rounded-sm transition cursor-pointer"
                    >
                      {username ? '✎ change' : '+ set handle'}
                    </button>
                  </div>
                  <p className="mt-1 font-mono text-[9px] uppercase tracking-[2px] text-ink/25">
                    your public URL · changes break old links
                  </p>
                </div>

                <div>
                  <label className={fieldLabel}>Pronouns · optional</label>
                  <input
                    type="text"
                    value={pronouns}
                    onChange={(e) => setPronouns(e.target.value.slice(0, 24))}
                    placeholder="she/her · they/them · he/him"
                    className={fieldInput}
                  />
                </div>

                <div>
                  <div className="flex items-baseline justify-between mb-1.5">
                    <label className={`${fieldLabel} mb-0`}>Bio · declaration</label>
                    <span className={`font-mono text-[9px] uppercase tracking-[2px] ${bio.length > 260 ? (bio.length >= 280 ? 'text-pink' : 'text-[var(--accent-ink)]/70') : 'text-ink/25'}`}>
                      {bio.length}/280
                    </span>
                  </div>
                  <textarea
                    value={bio}
                    onChange={(e) => setBio(e.target.value.slice(0, 280))}
                    placeholder="Tell your story…"
                    rows={3}
                    maxLength={280}
                    className={`${fieldInput} resize-none leading-relaxed`}
                  />
                </div>
              </div>
            </div>
          </Section>

          {/* ─── 2. PATH ─── */}
          <Section label="Path" sub="drives your accent color">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {(['worldbuilder', 'catalyst', 'anchor'] as const).map((p) => {
                const cfg = PATH_CONFIG[p];
                const selected = path === p;
                const icon = p === 'worldbuilder' ? '◆' : p === 'catalyst' ? '⬡' : '◎';
                const tagline = p === 'worldbuilder' ? 'I build worlds.' : p === 'catalyst' ? 'I shape worlds.' : 'I move through worlds.';
                return (
                  <button
                    key={p}
                    onClick={() => setPath(p)}
                    className={`text-left p-4 rounded-md border transition cursor-pointer ${
                      selected ? `${cfg.bg} ${cfg.textOn} border-transparent` : 'bg-transparent border-ink/15 text-ink hover:border-ink/40'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className={`font-basement font-black text-[24px] leading-none ${selected ? cfg.textOn : 'text-ink/40'}`}>{icon}</span>
                      <span className={`font-mono text-[10px] uppercase tracking-[2px] ${selected ? `${cfg.textOn} opacity-60` : 'text-ink/25'}`}>{cfg.label}</span>
                    </div>
                    <div className={`font-basement font-black text-[clamp(14px,1.5vw,18px)] uppercase ${selected ? cfg.textOn : 'text-ink'}`}>{tagline}</div>
                  </button>
                );
              })}
            </div>
          </Section>

          {/* ─── 3. ROLES ─── */}
          <Section label="Roles" sub={`what you do — search or add, up to ${ROLES_MAX}`}>
            <RoleTagPicker
              options={EVENT_ROLE_TAGS}
              value={selectedRoles.map(roleSlugToLabel)}
              onChange={(labels) => setSelectedRoles(labels.map(roleLabelToSlug))}
            />
          </Section>

          {/* ─── 4. TOOLS ─── */}
          <Section label="Tools" sub={selectedTools.length > 0 ? `${selectedTools.length} in your kit` : 'in your kit'}>
            {/* Stack headline — shown on the shareable /stacks/[username] page */}
            <div className="mb-4">
              <label htmlFor="stack-title" className={fieldLabel}>
                stack title · headlines your shareable stack page{username ? '' : ' (set a username first)'}
              </label>
              <input
                id="stack-title"
                type="text"
                value={stackTitle}
                onChange={(e) => setStackTitle(e.target.value.slice(0, 60))}
                maxLength={60}
                placeholder="e.g. my video-art stack"
                className={fieldInput}
              />
              {username && (
                <span className="font-mono text-[10px] text-ink/30 mt-1 block">
                  appears on topia.vision/stacks/{username}
                </span>
              )}
            </div>

            {/* Selected tools as pills */}
            {selectedTools.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-3">
                {selectedTools.map((slug) => {
                  const tool = allTools.find((t) => t.slug === slug);
                  if (!tool) return null;
                  return (
                    <button
                      key={slug}
                      onClick={() => toggleTool(slug)}
                      title="Click to remove"
                      className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[2px] px-2.5 py-1 rounded-sm bg-lime text-obsidian cursor-pointer transition hover:opacity-90 border-none"
                    >
                      {tool.name}
                      <span className="opacity-60">×</span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Search */}
            <input
              type="text"
              value={toolSearch}
              onChange={(e) => setToolSearch(e.target.value)}
              placeholder="Search tools…"
              className={`${fieldInput} mb-2`}
            />

            {/* Result list */}
            {toolsLoading ? (
              <p className="font-mono text-[11px] uppercase tracking-[2px] text-ink/30 py-4 text-center">loading…</p>
            ) : filteredTools.length === 0 ? (
              <p className="font-mono text-[11px] uppercase tracking-[2px] text-ink/30 py-4 text-center">no tools match</p>
            ) : (
              <div className="max-h-[280px] overflow-y-auto border border-ink/[0.06] rounded-sm divide-y divide-ink/[0.04]" style={{ scrollbarWidth: 'thin' }}>
                {filteredTools.map((tool) => {
                  const on = selectedTools.includes(tool.slug);
                  return (
                    <button
                      key={tool.slug}
                      onClick={() => toggleTool(tool.slug)}
                      className={`w-full flex items-center justify-between px-3 py-2 text-left transition cursor-pointer border-none ${on ? 'bg-ink/[0.04]' : 'bg-transparent hover:bg-ink/[0.02]'}`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span
                          className="w-3.5 h-3.5 rounded-sm border flex items-center justify-center shrink-0 transition-colors"
                          style={{
                            backgroundColor: on ? '#e4fe52' : 'transparent',
                            borderColor: on ? '#e4fe52' : 'rgba(245,240,232,0.2)',
                          }}
                        >
                          {on && <CheckIcon size={9} className="text-obsidian" />}
                        </span>
                        <span className="font-mono text-[12px] text-ink truncate">{tool.name}</span>
                      </div>
                      {tool.category && (
                        <span className="font-mono text-[9px] uppercase tracking-[2px] text-ink/25 shrink-0 ml-2">{tool.category}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </Section>

          {/* ─── 5. SOCIAL ─── */}
          <Section label="Social" sub="verified accounts + links">
            <div className="space-y-4">
              {/* Verified provider connections (Twitter, Farcaster, etc.) */}
              {ENABLED_SOCIAL_PROVIDERS.length > 0 && (
                <div>
                  <span className="block font-mono text-[10px] uppercase tracking-[2px] text-ink/30 mb-2">Verified accounts</span>
                  <div className="space-y-3">
                    {([
                      { p: 'twitter'   as const, v: socialTwitter,   set: setSocialTwitter   },
                      { p: 'instagram' as const, v: socialInstagram, set: setSocialInstagram },
                      { p: 'linkedin'  as const, v: socialLinkedin,  set: setSocialLinkedin  },
                      { p: 'spotify'   as const, v: socialSpotify,   set: setSocialSpotify   },
                      { p: 'farcaster' as const, v: socialFarcaster, set: setSocialFarcaster },
                    ] satisfies { p: SocialProvider; v: string; set: (s: string) => void }[])
                      .filter(({ p }) => ENABLED_SOCIAL_PROVIDERS.includes(p))
                      .map(({ p, v, set }) => (
                        <SocialConnect
                          key={p}
                          provider={p}
                          value={v}
                          onChange={set}
                          accent="#e4fe52"
                          onBeforeConnect={handleSave}
                        />
                      ))}
                  </div>
                </div>
              )}

              {/* Plain URL fields */}
              <div>
                <span className="block font-mono text-[10px] uppercase tracking-[2px] text-ink/30 mb-2">Links</span>
                <div className="space-y-2.5">
                  {/* Instagram — handle only, no OAuth needed. Stored as a full URL. */}
                  <div className="flex items-center gap-2 bg-ink/[0.03] border border-ink/15 focus-within:border-[var(--accent-ink)]/40 rounded-sm px-3 py-1.5 transition-colors">
                    <span className="text-ink/40 shrink-0 w-4 flex items-center justify-center"><SocialIcon type="instagram" /></span>
                    <span className="font-mono text-[10px] uppercase tracking-[2px] text-ink/40 w-20 shrink-0">Instagram</span>
                    <span className="font-mono text-[12px] text-ink/30 shrink-0">@</span>
                    <input
                      type="text"
                      value={socialInstagram.replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/^@/, '').replace(/\/+$/, '')}
                      onChange={(e) => {
                        const h = e.target.value.replace(/^@/, '').replace(/\s+/g, '').trim();
                        setSocialInstagram(h ? `https://instagram.com/${h}` : '');
                      }}
                      placeholder="yourhandle"
                      className="flex-1 bg-transparent border-none outline-none font-mono text-[12px] text-ink placeholder:text-ink/20"
                    />
                  </div>
                  {[
                    { key: 'website',    label: 'Website',    value: socialWebsite,    set: setSocialWebsite,    placeholder: 'https://yoursite.com',          icon: <SocialIcon type="website" /> },
                    { key: 'soundcloud', label: 'SoundCloud', value: socialSoundcloud, set: setSocialSoundcloud, placeholder: 'https://soundcloud.com/handle', icon: <SocialIcon type="soundcloud" /> },
                    { key: 'substack',   label: 'Substack',   value: socialSubstack,   set: setSocialSubstack,   placeholder: 'https://handle.substack.com',   icon: <SocialIcon type="substack" /> },
                  ].map(({ key, label, value, set, placeholder, icon }) => (
                    <div key={key} className="flex items-center gap-2 bg-ink/[0.03] border border-ink/15 focus-within:border-[var(--accent-ink)]/40 rounded-sm px-3 py-1.5 transition-colors">
                      <span className="text-ink/40 shrink-0 w-4 flex items-center justify-center">{icon}</span>
                      <span className="font-mono text-[10px] uppercase tracking-[2px] text-ink/40 w-20 shrink-0">{label}</span>
                      <input
                        type="url"
                        value={value}
                        onChange={(e) => set(e.target.value)}
                        placeholder={placeholder}
                        className="flex-1 bg-transparent border-none outline-none font-mono text-[12px] text-ink placeholder:text-ink/20"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Custom labeled links */}
              <div>
                <div className="flex items-baseline justify-between mb-2">
                  <span className="font-mono text-[10px] uppercase tracking-[2px] text-ink/30">Custom links</span>
                  <span className="font-mono text-[10px] uppercase tracking-[2px] text-ink/20">{customLinks.length}/10</span>
                </div>
                {customLinks.length === 0 && (
                  <p className="font-mono text-[11px] text-ink/30 mb-2">Newsletter, portfolio, music release… anything else.</p>
                )}
                <div className="space-y-1.5">
                  {customLinks.map((link, idx) => (
                    <div key={idx} className="flex items-center gap-1.5">
                      <input
                        type="text"
                        value={link.label}
                        onChange={(e) => {
                          const next = [...customLinks];
                          next[idx] = { ...next[idx], label: e.target.value.slice(0, 20) };
                          setCustomLinks(next);
                        }}
                        placeholder="LABEL"
                        maxLength={20}
                        className="w-28 bg-ink/[0.04] border border-ink/15 focus:border-[var(--accent-ink)]/40 rounded-sm px-2 py-1.5 font-mono text-[10px] uppercase tracking-[2px] text-ink outline-none transition-colors"
                      />
                      <input
                        type="url"
                        value={link.url}
                        onChange={(e) => {
                          const next = [...customLinks];
                          next[idx] = { ...next[idx], url: e.target.value };
                          setCustomLinks(next);
                        }}
                        placeholder="https://"
                        className="flex-1 bg-ink/[0.04] border border-ink/15 focus:border-[var(--accent-ink)]/40 rounded-sm px-2 py-1.5 font-mono text-[12px] text-ink outline-none transition-colors"
                      />
                      <button
                        onClick={() => setCustomLinks(customLinks.filter((_, i) => i !== idx))}
                        className="w-7 h-7 flex items-center justify-center font-mono text-[14px] text-ink/30 hover:text-pink bg-transparent border border-ink/10 rounded-sm cursor-pointer transition"
                        aria-label="Remove"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
                {customLinks.length < 10 && (
                  <button
                    onClick={() => setCustomLinks([...customLinks, { label: '', url: '' }])}
                    className="mt-2 font-mono text-[10px] uppercase tracking-[2px] text-ink/50 hover:text-ink bg-transparent border border-ink/15 hover:border-ink/40 rounded-sm px-3 py-1.5 cursor-pointer transition"
                  >
                    + add link
                  </button>
                )}
              </div>
            </div>
          </Section>

          {/* ─── 6. ACCOUNTS ─── */}
          <Section label="Accounts" sub="auth methods · email / phone / google / wallet">
            {!canUnlink && (
              <p className="font-mono text-[10px] uppercase tracking-[2px] text-ink/30 mb-2">
                Add a second account before removing this one
              </p>
            )}
            <div className="divide-y divide-ink/[0.06]">
              <AccountRow label="EMAIL"  value={emailAccount?.address ?? null}   isLinked={!!emailAccount}  unlinking={unlinking === 'email'}  canUnlink={canUnlink} onConnect={linkEmail}  onUnlink={() => handleUnlink('email',  () => unlinkEmail(emailAccount!.address))} />
              <AccountRow label="PHONE"  value={phoneAccount?.number ?? null}    isLinked={!!phoneAccount}  unlinking={unlinking === 'phone'}  canUnlink={canUnlink} onConnect={linkPhone}  onUnlink={() => handleUnlink('phone',  () => unlinkPhone(phoneAccount!.number))} />
              <AccountRow label="GOOGLE" value={googleAccount?.email ?? (googleAccount ? 'Connected' : null)} isLinked={!!googleAccount} unlinking={unlinking === 'google'} canUnlink={canUnlink} onConnect={linkGoogle} onUnlink={() => handleUnlink('google', () => unlinkGoogle(googleAccount!.subject))} />
              <AccountRow label="WALLET" value={walletAccount ? `${walletAccount.address.slice(0,6)}…${walletAccount.address.slice(-4)}` : null} isLinked={!!walletAccount} unlinking={unlinking === 'wallet'} canUnlink={canUnlink} onConnect={linkWallet} onUnlink={() => handleUnlink('wallet', () => unlinkWallet(walletAccount!.address))} />
            </div>
          </Section>

          {/* ─── 7. NOTIFICATIONS ─── */}
          <Section label="Notifications" sub="what we email you">
            <NotificationPrefs />
          </Section>

          {/* ─── 7b. IN PROCESS ─── */}
          <Section label="In Process" sub="your onchain timeline · inprocess.world">
            <InProcessConnectCard />
          </Section>

          {/* ─── 8. PREVIEW + EXTRAS ─── */}
          <Section label="Preview" sub="what others see">
            <ProfilePreviewCard
              name={name}
              username={username}
              bio={bio}
              avatarUrl={avatarUrl}
              path={path}
              roleTags={selectedRoles}
              pronouns={pronouns}
              customLinks={customLinks}
            />
            <div className="flex flex-wrap items-center gap-3 mt-4 text-[11px]">
              <Link
                href="/onboarding?from=profile"
                className="font-mono uppercase tracking-[2px] text-ink/50 hover:text-ink no-underline transition"
              >
                ↺ Redo intro
              </Link>
              <button
                onClick={logout}
                className="font-mono uppercase tracking-[2px] text-ink/30 hover:text-pink bg-transparent border-none cursor-pointer transition"
              >
                Log out
              </button>
            </div>
          </Section>

          {/* Save error banner */}
          {saveError && (
            <div className="mt-6 px-3 py-2 bg-pink/10 border border-pink/30 rounded-sm">
              <p className="font-mono text-[11px] uppercase tracking-[2px] text-pink/90">✗ {saveError}</p>
            </div>
          )}
        </main>

        {/* Handle change modal */}
        <HandleChangeModal
          open={handleModalOpen}
          currentHandle={username}
          privyId={user?.id ?? null}
          onClose={() => setHandleModalOpen(false)}
          onConfirm={(newHandle) => setUsername(newHandle)}
        />
      </PageShell>
    </div>
  );
}

/* ── Account row helper ───────────────────────────────────────── */
function AccountRow({ label, value, isLinked, unlinking, canUnlink, onConnect, onUnlink }: {
  label: string; value: string | null; isLinked: boolean; unlinking: boolean;
  canUnlink: boolean; onConnect: () => void; onUnlink: () => void;
}) {
  return (
    <div className="flex justify-between items-center py-2.5 gap-3">
      <span className="font-mono text-[10px] uppercase tracking-[2px] text-ink/40 shrink-0">{label}</span>
      <div className="flex items-center gap-3 min-w-0">
        {isLinked ? (
          <>
            <span className="font-mono text-[11px] text-ink truncate">{value}</span>
            <button
              onClick={onUnlink}
              disabled={!canUnlink || unlinking}
              className="font-mono text-[9px] uppercase tracking-[2px] text-ink/40 hover:text-pink disabled:opacity-20 disabled:cursor-not-allowed bg-transparent border-none cursor-pointer transition shrink-0"
            >
              {unlinking ? 'removing…' : 'remove'}
            </button>
          </>
        ) : (
          <button
            onClick={onConnect}
            className="font-mono text-[10px] uppercase tracking-[2px] px-2.5 py-1 bg-transparent border border-ink/15 hover:border-[var(--accent-ink)]/50 hover:text-[var(--accent-ink)] text-ink/60 rounded-sm cursor-pointer transition"
          >
            + connect
          </button>
        )}
      </div>
    </div>
  );
}
