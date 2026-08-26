'use client';

import { useEffect, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { CheckIcon } from '../../components/ui/Icons';
import LoginWall from '../../components/LoginWall';

const TOOL_CATEGORIES = [
  'AI', 'Audio', 'Video', 'Design', '3D', 'Animation', 'Music',
  'Photography', 'Writing', 'Development', 'Blockchain', 'Marketing',
  'Collaboration', 'Analytics', 'Other',
];
const PRICING_OPTIONS = ['Free', 'Freemium', 'Paid', 'Open Source'];

interface SubmittedTool {
  id: string;
  name: string;
  slug: string;
  category: string | null;
  description: string | null;
  pricing: string | null;
  url: string | null;
  featured: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /**
   * Called with the just-created tool when submission succeeds. Note: the
   * tool is created with published=false (awaits admin approval), so it
   * won't show up in /api/tools listings until approved — but the parent
   * can choose to show it locally as a teaser.
   */
  onSubmitted?: (tool: SubmittedTool | null) => void;
}

export default function SubmitToolModal({ open, onClose, onSubmitted }: Props) {
  const { authenticated, user } = usePrivy();
  const [form, setForm] = useState({ name: '', url: '', category: '', description: '', pricing: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  // ESC + body scroll lock
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

  // Reset state on open
  useEffect(() => {
    if (!open) return;
    setError('');
    setSuccess(false);
  }, [open]);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { setError('Tool name is required'); return; }
    if (!user) return;

    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/tools/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, privyId: user.id }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Failed to submit tool');
        return;
      }
      const { tool } = await res.json();
      setSuccess(true);
      onSubmitted?.(tool ?? null);
    } catch {
      setError('Failed to submit tool');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center px-3 sm:px-6 py-6 backdrop-blur-sm"
      style={{ backgroundColor: 'rgba(10,10,10,0.75)' }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg bg-[var(--page-bg)] text-ink rounded-lg border border-ink/[0.08] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-lime px-4 py-2 flex items-center justify-between">
          <span className="font-mono text-[10px] uppercase tracking-[2px] text-obsidian/60">topia://submit-tool</span>
          <button
            onClick={onClose}
            className="font-mono text-[14px] text-obsidian/70 hover:text-obsidian transition bg-transparent border-none cursor-pointer leading-none w-5 h-5 flex items-center justify-center"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {!authenticated ? (
          <div className="p-4 text-center">
            <LoginWall message="Log in to submit a tool." />
            <button
              onClick={onClose}
              className="font-mono text-[11px] uppercase tracking-[2px] text-ink/40 hover:text-ink bg-transparent border border-ink/20 px-4 py-1.5 cursor-pointer"
            >
              close
            </button>
          </div>
        ) : success ? (
          <div className="p-6 text-center">
            <h2 className="font-basement font-black text-[24px] uppercase text-[var(--accent-ink)] mb-2 inline-flex items-center gap-2">Submitted <CheckIcon size={18} strokeWidth={2.2} /></h2>
            <p className="font-mono text-[12px] text-ink/60 leading-relaxed">
              Your tool is pending review. It will appear in the public list once an admin approves it.
            </p>
            <button
              onClick={onClose}
              className="mt-5 font-mono text-[11px] uppercase tracking-[2px] text-ink/40 hover:text-ink bg-transparent border border-ink/20 px-4 py-1.5 cursor-pointer"
            >
              close
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-5 md:p-6">
            <h2 className="font-basement font-black text-[clamp(20px,2vw,28px)] uppercase text-ink mb-1">Submit a tool</h2>
            <p className="font-mono text-[11px] text-ink/40 mb-5">Add a tool you use to the public library. Pending review.</p>

            <div className="space-y-3">
              <div>
                <label className="block font-mono text-[10px] uppercase tracking-[2px] text-ink/40 mb-1">Name *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full bg-transparent border border-ink/15 focus:border-ink/40 font-mono text-[13px] text-ink px-3 py-1.5 rounded-sm outline-none transition-colors"
                  required
                />
              </div>
              <div>
                <label className="block font-mono text-[10px] uppercase tracking-[2px] text-ink/40 mb-1">URL</label>
                <input
                  type="url"
                  value={form.url}
                  onChange={(e) => setForm({ ...form, url: e.target.value })}
                  placeholder="https://"
                  className="w-full bg-transparent border border-ink/15 focus:border-ink/40 font-mono text-[13px] text-ink px-3 py-1.5 rounded-sm outline-none transition-colors"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-mono text-[10px] uppercase tracking-[2px] text-ink/40 mb-1">Category</label>
                  <select
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    className="w-full bg-transparent border border-ink/15 focus:border-ink/40 font-mono text-[12px] text-ink px-3 py-1.5 rounded-sm outline-none transition-colors cursor-pointer"
                  >
                    <option value="" className="bg-[var(--page-bg)] text-ink">—</option>
                    {TOOL_CATEGORIES.map((c) => (
                      <option key={c} value={c.toLowerCase()} className="bg-[var(--page-bg)] text-ink">{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-mono text-[10px] uppercase tracking-[2px] text-ink/40 mb-1">Pricing</label>
                  <select
                    value={form.pricing}
                    onChange={(e) => setForm({ ...form, pricing: e.target.value })}
                    className="w-full bg-transparent border border-ink/15 focus:border-ink/40 font-mono text-[12px] text-ink px-3 py-1.5 rounded-sm outline-none transition-colors cursor-pointer"
                  >
                    <option value="" className="bg-[var(--page-bg)] text-ink">—</option>
                    {PRICING_OPTIONS.map((p) => (
                      <option key={p} value={p} className="bg-[var(--page-bg)] text-ink">{p}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block font-mono text-[10px] uppercase tracking-[2px] text-ink/40 mb-1">Description</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={3}
                  className="w-full bg-transparent border border-ink/15 focus:border-ink/40 font-mono text-[13px] text-ink px-3 py-1.5 rounded-sm outline-none transition-colors resize-none"
                />
              </div>
            </div>

            {error && (
              <div className="mt-3 font-mono text-[11px] uppercase tracking-[2px] text-pink/80">{error}</div>
            )}

            <div className="mt-5 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={onClose}
                className="font-mono text-[11px] uppercase tracking-[2px] text-ink/40 hover:text-ink bg-transparent border-none cursor-pointer"
              >
                cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="font-mono text-[11px] uppercase tracking-[2px] bg-lime text-obsidian px-4 py-2 rounded-sm disabled:opacity-50 hover:opacity-90 transition cursor-pointer border-none"
              >
                {submitting ? 'submitting…' : 'submit →'}
              </button>
            </div>

            <p className="mt-3 font-mono text-[10px] uppercase tracking-[2px] text-ink/20">
              Tools require world membership + admin approval before going public.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
