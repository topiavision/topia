'use client';

import { useState, useEffect, useRef } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useDashboard } from '../_components/DashboardContext';
import { resizeAndUploadImage } from '../../../lib/uploadImage';
import { WORLD_CATEGORIES } from '@/lib/builder/world';
import { WorldBuilder } from '../../components/builder/world/WorldBuilder';

/**
 * Create-world lives INSIDE the dashboard shell (sidebar + nav come from
 * dashboard/layout.tsx — this page must not render its own chrome).
 *
 * Bot-first: the World Builder takeover opens by default; "Use the form
 * instead" (permanent header link in the builder) swaps to the classic form
 * below, which is unchanged.
 */
export default function CreateWorldPage() {
  const { user } = usePrivy();
  const router = useRouter();
  const { profile } = useDashboard();

  const [mode, setMode] = useState<'bot' | 'form'>('bot');
  const [form, setForm] = useState({
    title: '',
    shortDescription: '',
    category: '',
    country: '',
    imageUrl: '',
  });
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  // Catalysts can't create worlds — bounce to the overview.
  useEffect(() => {
  }, [profile?.path, router]);

  const handleImage = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const url = await resizeAndUploadImage(file, 1024, user?.id ?? '');
      setForm((p) => ({ ...p, imageUrl: url }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Image upload failed');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) { setError('World title is required'); return; }
    if (!user) return;

    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/worlds/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, privyId: user.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to create world');
        return;
      }
      router.push(`/dashboard/worlds/${data.world.slug}`);
    } catch {
      setError('Failed to create world');
    } finally {
      setSubmitting(false);
    }
  };

  const inputCls = 'w-full bg-transparent border border-ink/15 rounded-sm px-3 py-2.5 font-mono text-[16px] md:text-[13px] text-ink outline-none focus:border-[var(--accent-ink)]/60 transition-colors';

  // Bot mode: the takeover renders over the dashboard shell; the header band
  // below stays as the page behind it. Wait for Privy so the builder always
  // holds a real privyId.
  if (mode === 'bot') {
    // Hold blank (not the form — no flash) until Privy hands us the user.
    if (!user) return <div className="max-w-4xl" />;
    // v0-style: the builder IS the page — chat left, world card right.
    return (
      <div className="max-w-4xl">
        <WorldBuilder
          variant="page"
          privyId={user.id}
          onExitToForm={() => setMode('form')}
          onClose={() => router.push('/dashboard')}
        />
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      {/* Header band */}
      <div className="border border-ink/[0.08] rounded-lg overflow-hidden mb-6">
        <div className="bg-lime px-5 py-4">
          <span className="font-mono text-[10px] uppercase tracking-[2px] text-obsidian/50 block">topia://new-world</span>
          <h1 className="font-basement font-black text-[clamp(22px,3.5vw,32px)] uppercase leading-[0.9] text-obsidian mt-0.5">
            Create a world.
          </h1>
        </div>
        <div className="bg-[var(--page-bg)] px-5 py-3">
          <p className="font-mono text-[12px] text-ink/50 leading-relaxed">
            A world is your scene — a project, collective, or community creators rally around.
            You can fill in the details (description, tools, socials, projects) after it exists.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="border border-ink/[0.08] rounded-lg overflow-hidden">
        <div className="bg-[var(--page-bg)] p-5 space-y-5">
          {/* Title */}
          <div>
            <label className="font-mono text-[10px] font-semibold uppercase tracking-[2px] text-ink/50 block mb-1.5">
              World title <span className="text-ink/30">*</span>
            </label>
            <input
              className={inputCls}
              value={form.title}
              onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
              placeholder="Your world's name"
              autoFocus
            />
          </div>

          {/* Short description */}
          <div>
            <label className="font-mono text-[10px] font-semibold uppercase tracking-[2px] text-ink/50 block mb-1.5">
              Short description
            </label>
            <textarea
              className={`${inputCls} resize-none`}
              rows={3}
              value={form.shortDescription}
              onChange={(e) => setForm((p) => ({ ...p, shortDescription: e.target.value }))}
              placeholder="One or two lines on what this world is about"
            />
          </div>

          {/* Category chips */}
          <div>
            <label className="font-mono text-[10px] font-semibold uppercase tracking-[2px] text-ink/50 block mb-1.5">
              Category
            </label>
            <div className="flex flex-wrap gap-1.5">
              {WORLD_CATEGORIES.map((cat) => {
                const active = form.category === cat;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setForm((p) => ({ ...p, category: active ? '' : cat }))}
                    className={`font-mono text-[11px] uppercase tracking-[1px] px-2.5 py-1.5 rounded-sm border transition cursor-pointer ${
                      active
                        ? 'bg-lime text-obsidian border-lime font-bold'
                        : 'bg-transparent text-ink/55 border-ink/15 hover:border-ink/40 hover:text-ink'
                    }`}
                  >
                    {cat}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Country + image, side by side on wide */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label className="font-mono text-[10px] font-semibold uppercase tracking-[2px] text-ink/50 block mb-1.5">
                Country
              </label>
              <input
                className={inputCls}
                value={form.country}
                onChange={(e) => setForm((p) => ({ ...p, country: e.target.value }))}
                placeholder="e.g. US, UK, DE"
              />
            </div>
            <div>
              <label className="font-mono text-[10px] font-semibold uppercase tracking-[2px] text-ink/50 block mb-1.5">
                World image
              </label>
              <div className="flex items-center gap-3">
                {form.imageUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={form.imageUrl} alt="" className="w-11 h-11 rounded-sm object-cover border border-ink/15 shrink-0" />
                ) : (
                  <div className="w-11 h-11 rounded-sm border border-dashed border-ink/20 bg-ink/[0.03] shrink-0" />
                )}
                <label className={`font-mono text-[11px] uppercase tracking-[1px] border border-ink/15 rounded-sm px-3 py-2 transition ${uploading ? 'opacity-40' : 'cursor-pointer text-ink/60 hover:border-ink/40 hover:text-ink'}`}>
                  {uploading ? 'Uploading…' : form.imageUrl ? 'Change' : 'Upload'}
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    disabled={uploading}
                    onChange={(e) => handleImage(e.target.files?.[0])}
                    className="hidden"
                  />
                </label>
                {form.imageUrl && !uploading && (
                  <button
                    type="button"
                    onClick={() => setForm((p) => ({ ...p, imageUrl: '' }))}
                    className="font-mono text-[11px] uppercase tracking-[1px] text-ink/40 hover:text-ink transition bg-transparent border-none cursor-pointer"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div className="bg-[var(--page-bg)] border-t border-ink/[0.06] px-5 py-3 flex items-center gap-3">
          <button
            type="submit"
            disabled={submitting || uploading}
            className="font-mono text-[11px] uppercase tracking-[2px] bg-lime text-obsidian px-4 py-2 rounded-sm hover:opacity-90 transition disabled:opacity-40 cursor-pointer border-none font-bold"
          >
            {submitting ? 'Creating…' : 'Create world'}
          </button>
          <Link
            href="/dashboard"
            className="font-mono text-[11px] uppercase tracking-[2px] text-ink/50 hover:text-ink transition no-underline"
          >
            Cancel
          </Link>
          {error && <span className="font-mono text-[11px] text-orange">{error}</span>}
        </div>
      </form>
    </div>
  );
}
