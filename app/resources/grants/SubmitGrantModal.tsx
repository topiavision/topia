'use client';

import { useEffect, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import LoginWall from '../../components/LoginWall';

const CURRENCIES = ['USD', 'EUR', 'GBP', 'ETH'];
const DEADLINE_TYPES = ['Fixed', 'Rolling', 'Ongoing', 'TBD'];
const GRANT_CATEGORIES = [
  'Art', 'Music', 'Film', 'Technology', 'Gaming', 'Fashion',
  'Education', 'Community', 'Environment', 'Social Impact', 'Other',
];

interface SubmittedGrant {
  id: string;
  grantName: string;
  slug: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSubmitted?: (grant: SubmittedGrant | null) => void;
}

const initialForm = {
  grantName: '',
  orgName: '',
  shortDescription: '',
  link: '',
  amountMin: '',
  amountMax: '',
  currency: 'USD',
  category: '',
  tags: '',
  deadlineType: '',
  deadlineDate: '',
  region: '',
  eligibility: '',
  notes: '',
};

export default function SubmitGrantModal({ open, onClose, onSubmitted }: Props) {
  const { authenticated, user } = usePrivy();
  const [form, setForm] = useState(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [parseUrl, setParseUrl] = useState('');
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState('');
  const [parseWarnings, setParseWarnings] = useState<string[]>([]);

  async function handleParse() {
    if (!parseUrl.trim() || !user) return;
    try { new URL(parseUrl); } catch { setParseError('Please enter a valid URL'); return; }
    setParsing(true);
    setParseError('');
    setParseWarnings([]);
    try {
      const res = await fetch('/api/grants/parse-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: parseUrl, privyId: user.id }),
      });
      const data = await res.json();
      if (!res.ok) { setParseError(data.error || 'Failed to parse URL'); return; }
      const g = data.grant;
      setForm((prev) => ({
        ...prev,
        grantName: g.grantName || prev.grantName,
        orgName: g.orgName || prev.orgName,
        shortDescription: g.shortDescription || prev.shortDescription,
        link: g.link || prev.link,
        amountMin: g.amountMin != null ? String(g.amountMin) : prev.amountMin,
        amountMax: g.amountMax != null ? String(g.amountMax) : prev.amountMax,
        currency: g.currency || prev.currency,
        deadlineType: g.deadlineType || prev.deadlineType,
        deadlineDate: g.deadlineDate || prev.deadlineDate,
        region: g.region || prev.region,
      }));
      setParseWarnings(data.warnings || []);
    } catch {
      setParseError('Failed to parse URL. Please try again.');
    } finally {
      setParsing(false);
    }
  }

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
    setForm(initialForm);
    setError('');
    setSuccess(false);
    setParseUrl('');
    setParseError('');
    setParseWarnings([]);
  }, [open]);

  if (!open) return null;

  const validate = (): string | null => {
    if (!form.grantName.trim()) return 'Grant name is required';
    if (!form.orgName.trim()) return 'Organization is required';
    if (!form.link.trim()) return 'Link is required';
    if (!form.deadlineType) return 'Deadline type is required';
    if (!form.tags.trim()) return 'At least one tag is required';
    return null;
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const validationError = validate();
    if (validationError) { setError(validationError); return; }
    if (!user) return;

    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/grants/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, privyId: user.id }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Failed to submit grant');
        return;
      }
      const { grant } = await res.json();
      setSuccess(true);
      onSubmitted?.(grant ?? null);
    } catch {
      setError('Failed to submit grant');
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
        className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border"
        style={{ backgroundColor: 'var(--page-bg)', borderColor: 'var(--border-color)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="sticky top-0 px-4 sm:px-6 py-3 flex items-center justify-between border-b"
          style={{ backgroundColor: 'var(--page-bg)', borderColor: 'var(--border-color)' }}
        >
          <span className="font-mono text-[13px] uppercase" style={{ color: 'var(--foreground)' }}>SUBMIT A GRANT</span>
          <button
            onClick={onClose}
            className="font-mono text-[16px] hover:opacity-60 transition bg-transparent border-none cursor-pointer leading-none w-6 h-6 flex items-center justify-center"
            style={{ color: 'var(--foreground)' }}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {!authenticated ? (
          <div className="p-4 text-center">
            <LoginWall message="Log in to submit a grant." />
            <button
              onClick={onClose}
              className="font-mono text-[13px] uppercase border rounded-lg px-4 py-1.5 hover:opacity-70 transition"
              style={{ color: 'var(--foreground)', borderColor: 'var(--border-color)' }}
            >
              close
            </button>
          </div>
        ) : success ? (
          <div className="p-6 text-center">
            <h2 className="font-mono text-[13px] uppercase mb-2" style={{ color: 'var(--foreground)' }}>Submitted</h2>
            <p className="font-mono text-[13px] opacity-60 leading-relaxed" style={{ color: 'var(--foreground)' }}>
              Your grant is pending review. It will appear on the site once an admin approves it.
            </p>
            <button
              onClick={onClose}
              className="mt-5 font-mono text-[13px] uppercase border rounded-lg px-4 py-1.5 hover:opacity-70 transition"
              style={{ color: 'var(--foreground)', borderColor: 'var(--border-color)' }}
            >
              close
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-3">
            {/* Auto-fill from a grant page URL */}
            <div className="border rounded-lg p-3" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--surface)' }}>
              <label className="block font-mono text-[13px] uppercase mb-1" style={{ color: 'var(--foreground)' }}>Auto-fill from URL</label>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={parseUrl}
                  onChange={(e) => setParseUrl(e.target.value)}
                  placeholder="Paste a grant page link…"
                  className="flex-1 min-w-0 px-3 py-1.5 font-mono text-[13px] border rounded-lg focus:outline-none focus:ring-2 bg-transparent"
                  style={{ borderColor: 'var(--border-color)', color: 'var(--foreground)' }}
                />
                <button
                  type="button"
                  onClick={handleParse}
                  disabled={parsing || !parseUrl.trim()}
                  className="font-mono text-[13px] uppercase rounded-lg px-3 py-1.5 disabled:opacity-40 hover:opacity-80 transition cursor-pointer border-none shrink-0"
                  style={{ backgroundColor: 'var(--foreground)', color: 'var(--background)' }}
                >
                  {parsing ? '…' : 'Fill'}
                </button>
              </div>
              {parseError && <p className="font-mono text-[12px] mt-1.5" style={{ color: '#C63A1E' }}>{parseError}</p>}
              {parseWarnings.length > 0 && (
                <ul className="mt-1.5 space-y-0.5">
                  {parseWarnings.map((w, i) => (
                    <li key={i} className="font-mono text-[12px] opacity-60" style={{ color: 'var(--foreground)' }}>· {w}</li>
                  ))}
                </ul>
              )}
              <p className="font-mono text-[12px] opacity-40 mt-1.5" style={{ color: 'var(--foreground)' }}>
                Fills the fields below — review before submitting.
              </p>
            </div>

            <div>
              <label className="block font-mono text-[13px] uppercase mb-1" style={{ color: 'var(--foreground)' }}>Grant Name *</label>
              <input
                type="text"
                value={form.grantName}
                onChange={(e) => setForm({ ...form, grantName: e.target.value })}
                placeholder="e.g. Creative Capital Award"
                className="w-full px-3 py-1.5 font-mono text-[13px] border rounded-lg focus:outline-none focus:ring-2 bg-transparent"
                style={{ borderColor: 'var(--border-color)', color: 'var(--foreground)' }}
              />
            </div>

            <div>
              <label className="block font-mono text-[13px] uppercase mb-1" style={{ color: 'var(--foreground)' }}>Organization *</label>
              <input
                type="text"
                value={form.orgName}
                onChange={(e) => setForm({ ...form, orgName: e.target.value })}
                placeholder="Funding organization name"
                className="w-full px-3 py-1.5 font-mono text-[13px] border rounded-lg focus:outline-none focus:ring-2 bg-transparent"
                style={{ borderColor: 'var(--border-color)', color: 'var(--foreground)' }}
              />
            </div>

            <div>
              <label className="block font-mono text-[13px] uppercase mb-1" style={{ color: 'var(--foreground)' }}>Link *</label>
              <input
                type="url"
                value={form.link}
                onChange={(e) => setForm({ ...form, link: e.target.value })}
                placeholder="https://..."
                className="w-full px-3 py-1.5 font-mono text-[13px] border rounded-lg focus:outline-none focus:ring-2 bg-transparent"
                style={{ borderColor: 'var(--border-color)', color: 'var(--foreground)' }}
              />
            </div>

            <div>
              <label className="block font-mono text-[13px] uppercase mb-1" style={{ color: 'var(--foreground)' }}>Short Description</label>
              <textarea
                value={form.shortDescription}
                onChange={(e) => setForm({ ...form, shortDescription: e.target.value })}
                rows={2}
                maxLength={200}
                className="w-full px-3 py-1.5 font-mono text-[13px] border rounded-lg focus:outline-none focus:ring-2 resize-none bg-transparent"
                style={{ borderColor: 'var(--border-color)', color: 'var(--foreground)' }}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-mono text-[13px] uppercase mb-1" style={{ color: 'var(--foreground)' }}>Amount Min</label>
                <input
                  type="number"
                  value={form.amountMin}
                  onChange={(e) => setForm({ ...form, amountMin: e.target.value })}
                  placeholder="1000"
                  className="w-full px-3 py-1.5 font-mono text-[13px] border rounded-lg focus:outline-none focus:ring-2 bg-transparent"
                  style={{ borderColor: 'var(--border-color)', color: 'var(--foreground)' }}
                />
              </div>
              <div>
                <label className="block font-mono text-[13px] uppercase mb-1" style={{ color: 'var(--foreground)' }}>Amount Max</label>
                <input
                  type="number"
                  value={form.amountMax}
                  onChange={(e) => setForm({ ...form, amountMax: e.target.value })}
                  placeholder="50000"
                  className="w-full px-3 py-1.5 font-mono text-[13px] border rounded-lg focus:outline-none focus:ring-2 bg-transparent"
                  style={{ borderColor: 'var(--border-color)', color: 'var(--foreground)' }}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-mono text-[13px] uppercase mb-1" style={{ color: 'var(--foreground)' }}>Currency</label>
                <select
                  value={form.currency}
                  onChange={(e) => setForm({ ...form, currency: e.target.value })}
                  className="w-full px-3 py-1.5 font-mono text-[13px] border rounded-lg focus:outline-none focus:ring-2 cursor-pointer"
                  style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--background)', color: 'var(--foreground)' }}
                >
                  {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="block font-mono text-[13px] uppercase mb-1" style={{ color: 'var(--foreground)' }}>Category</label>
                <select
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className="w-full px-3 py-1.5 font-mono text-[13px] border rounded-lg focus:outline-none focus:ring-2 cursor-pointer"
                  style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--background)', color: 'var(--foreground)' }}
                >
                  <option value="">—</option>
                  {GRANT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-mono text-[13px] uppercase mb-1" style={{ color: 'var(--foreground)' }}>Deadline Type *</label>
                <select
                  value={form.deadlineType}
                  onChange={(e) => setForm({ ...form, deadlineType: e.target.value })}
                  className="w-full px-3 py-1.5 font-mono text-[13px] border rounded-lg focus:outline-none focus:ring-2 cursor-pointer"
                  style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--background)', color: 'var(--foreground)' }}
                >
                  <option value="">Select...</option>
                  {DEADLINE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="block font-mono text-[13px] uppercase mb-1" style={{ color: 'var(--foreground)' }}>Deadline Date</label>
                <input
                  type="date"
                  value={form.deadlineDate}
                  onChange={(e) => setForm({ ...form, deadlineDate: e.target.value })}
                  className="w-full px-3 py-1.5 font-mono text-[13px] border rounded-lg focus:outline-none focus:ring-2 bg-transparent"
                  style={{ borderColor: 'var(--border-color)', color: 'var(--foreground)' }}
                />
              </div>
            </div>

            <div>
              <label className="block font-mono text-[13px] uppercase mb-1" style={{ color: 'var(--foreground)' }}>Region</label>
              <input
                type="text"
                value={form.region}
                onChange={(e) => setForm({ ...form, region: e.target.value })}
                placeholder="e.g. Global, US, EU"
                className="w-full px-3 py-1.5 font-mono text-[13px] border rounded-lg focus:outline-none focus:ring-2 bg-transparent"
                style={{ borderColor: 'var(--border-color)', color: 'var(--foreground)' }}
              />
            </div>

            <div>
              <label className="block font-mono text-[13px] uppercase mb-1" style={{ color: 'var(--foreground)' }}>Tags *</label>
              <input
                type="text"
                value={form.tags}
                onChange={(e) => setForm({ ...form, tags: e.target.value })}
                placeholder="art, music, public-goods"
                className="w-full px-3 py-1.5 font-mono text-[13px] border rounded-lg focus:outline-none focus:ring-2 bg-transparent"
                style={{ borderColor: 'var(--border-color)', color: 'var(--foreground)' }}
              />
              <p className="font-mono text-[13px] opacity-40 mt-1" style={{ color: 'var(--foreground)' }}>Comma-separated</p>
            </div>

            {error && (
              <div className="font-mono text-[13px] uppercase" style={{ color: '#C63A1E' }}>{error}</div>
            )}

            <div className="flex items-center justify-between gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="font-mono text-[13px] uppercase hover:opacity-60 transition bg-transparent border-none cursor-pointer"
                style={{ color: 'var(--foreground)' }}
              >
                cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="font-mono text-[13px] uppercase rounded-full px-4 py-2 disabled:opacity-50 hover:opacity-80 transition cursor-pointer border-none"
                style={{ backgroundColor: 'var(--foreground)', color: 'var(--background)' }}
              >
                {submitting ? 'submitting…' : 'submit →'}
              </button>
            </div>

            <p className="font-mono text-[13px] opacity-30" style={{ color: 'var(--foreground)' }}>
              Grants require world membership + admin approval before going public.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
