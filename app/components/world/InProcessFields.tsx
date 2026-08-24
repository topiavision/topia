'use client';

import { ORANGE } from './in-process/constants';

import { useState } from 'react';
import { resizeAndUploadImage } from '../../../lib/uploadImage';

/* Shared editor primitives for In Process roadmaps — used by the world-page
 * tab (the primary editing surface), the dashboard page, and project pages. */

export type Precision = 'day' | 'month' | 'year';

export const inputCls = 'w-full border border-ink/15 bg-transparent px-3 py-2 font-mono text-[16px] sm:text-[13px] rounded-sm outline-none text-ink placeholder:text-ink/30 focus:border-ink/40';
export const labelCls = 'block font-mono text-[10px] uppercase tracking-[2px] text-ink/40 mb-1';
export const btnLime = 'font-mono text-[11px] uppercase tracking-[2px] bg-lime text-obsidian font-bold px-3 py-1.5 rounded-sm hover:opacity-90 transition cursor-pointer border-none disabled:opacity-40';
export const btnGhost = 'font-mono text-[11px] uppercase tracking-[2px] text-ink/60 border border-ink/15 hover:border-ink/40 hover:text-ink px-3 py-1.5 rounded-sm transition cursor-pointer bg-transparent disabled:opacity-40';

export const MILESTONE_STATUSES = [
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'now', label: 'In motion (now)' },
  { value: 'done', label: 'Done ✓' },
  { value: 'paused', label: 'Paused' },
];

// Normalize a stored YYYY-MM-DD to the chosen precision (month → 1st,
// year → Jan 1) so the DB always holds a valid full date.
export function normalizeDate(v: string, p: Precision): string {
  if (!v) return '';
  const [y, m] = v.split('-');
  if (p === 'year') return `${y}-01-01`;
  if (p === 'month') return `${y}-${m || '01'}-01`;
  return v;
}

/* One roadmap date: how precise? (exact day / month / just a year) + the
 * matching input. Value always propagates as a normalized full date. */
export function EraDateField({ label, value, precision, onChange }: {
  label: string;
  value: string; // '' or YYYY-MM-DD
  precision: Precision;
  onChange: (next: { value: string; precision: Precision }) => void;
}) {
  const [yearText, setYearText] = useState(value ? value.slice(0, 4) : '');

  const setP = (p: Precision) => onChange({ value: normalizeDate(value, p), precision: p });

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="font-mono text-[10px] uppercase tracking-[2px] text-ink/40">{label}</label>
        <select
          value={precision}
          onChange={(e) => setP(e.target.value as Precision)}
          className="font-mono text-[10px] uppercase tracking-[1px] text-ink/50 bg-transparent border border-ink/10 rounded-sm px-1.5 py-0.5 cursor-pointer outline-none"
        >
          <option value="day">Exact date</option>
          <option value="month">Month + year</option>
          <option value="year">Year only</option>
        </select>
      </div>
      {precision === 'year' ? (
        <input
          inputMode="numeric"
          value={yearText}
          onChange={(e) => {
            const t = e.target.value.replace(/\D/g, '').slice(0, 4);
            setYearText(t);
            onChange({ value: /^\d{4}$/.test(t) ? `${t}-01-01` : '', precision });
          }}
          placeholder="2026"
          className={inputCls}
        />
      ) : precision === 'month' ? (
        <input
          type="month"
          value={value ? value.slice(0, 7) : ''}
          onChange={(e) => onChange({ value: e.target.value ? `${e.target.value}-01` : '', precision })}
          className={inputCls}
        />
      ) : (
        <input
          type="date"
          value={value}
          onChange={(e) => onChange({ value: e.target.value, precision })}
          className={inputCls}
        />
      )}
    </div>
  );
}

/* Shared image picker — real file upload through the blob pipeline, with
 * preview and remove. */
export function ImageField({ value, onChange, label = 'Image (optional)' }: {
  value: string; onChange: (url: string) => void; label?: string;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true); setError('');
    try {
      onChange(await resizeAndUploadImage(file, 1280));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Image upload failed');
    } finally { setUploading(false); }
  };

  return (
    <div>
      <label className={labelCls}>{label}</label>
      <div className="flex items-center gap-3 flex-wrap">
        <label className={`${btnGhost} inline-block`} style={{ cursor: 'pointer' }}>
          {uploading ? 'Uploading…' : value ? '↺ Replace image' : '+ Upload image'}
          <input type="file" accept="image/*" onChange={upload} className="hidden" />
        </label>
        {value && (
          <span className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={value} alt="" className="h-12 w-12 object-cover rounded-sm border border-ink/10" />
            <button onClick={() => onChange('')} aria-label="Remove image" className="font-mono text-[10px] uppercase underline cursor-pointer bg-transparent border-none" style={{ color: ORANGE }}>
              Remove
            </button>
          </span>
        )}
      </div>
      {error && <p className="font-mono text-[11px] mt-1" style={{ color: ORANGE }}>{error}</p>}
    </div>
  );
}
