'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { usePrivy } from '@privy-io/react-auth';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Navigation from '../../components/Navigation';
import { useUserProfile } from '../../hooks/useUserProfile';
import { QUESTION_TYPES, SELECT_TYPES, DEFAULT_LABELS, ROLE_TAGS } from '../../../lib/events/questions';
import { PAYMENTS_ENABLED } from '../../../lib/featureFlags';
import TicketSetup, { EMPTY_STAGED, persistStagedTickets, type StagedTickets } from './TicketSetup';

/* ════════════════════════════════════════════════════════════════════
 * EventComposer — the single create/edit surface. /events/create renders
 * it empty (POST); /events/[slug]/edit renders it pre-filled (PUT). Same
 * polished UI for both so the experience is identical. Save as draft keeps
 * the event unpublished (published=false); Publish makes it live.
 * ════════════════════════════════════════════════════════════════════ */

export interface EventComposerInitial {
  eventId?: string;     // edit only
  slug?: string;        // edit only — preserved so links don't break
  eventName: string;
  dateIso: string;      // 'YYYY-MM-DD'
  startTime: string;    // 'HH:MM' (24h)
  endTime: string;
  timezone: string;
  city: string;
  venue: string;
  link: string;
  description: string;
  imageUrl: string;
  worldId: string;
  published: boolean;
  rsvpCapacity: number | null;
  rsvpApprovalRequired: boolean;
}

interface DraftQuestion { id?: string; label: string; type: string; options: string[]; required: boolean; }

// Small mono glyph per question type, shown on each question card.
const QTYPE_GLYPH: Record<string, string> = {
  short_text: 'A', long_text: '¶', single_select: '◉', multi_select: '☰', checkbox: '☑', socials: '@',
};

const ACCENTS = [
  { name: 'lime',   hex: '#e4fe52', on: '#0a0a0a' },
] as const;

const TIMEZONES: { value: string; label: string }[] = [
  { value: 'America/New_York', label: 'Eastern (ET)' },
  { value: 'America/Chicago', label: 'Central (CT)' },
  { value: 'America/Denver', label: 'Mountain (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific (PT)' },
  { value: 'America/Anchorage', label: 'Alaska (AKT)' },
  { value: 'Pacific/Honolulu', label: 'Hawaii (HT)' },
  { value: 'Europe/London', label: 'GMT' },
  { value: 'Europe/Paris', label: 'Central Europe (CET)' },
  { value: 'Asia/Tokyo', label: 'Japan (JST)' },
  { value: 'Australia/Sydney', label: 'Australia East (AEST)' },
];

const MAX_VIDEO_BYTES = 25 * 1024 * 1024;
const MAX_VIDEO_SECONDS = 10;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const COVER_ACCEPT = 'image/jpeg,image/png,image/gif,image/webp,video/mp4,video/quicktime,video/webm';

const markdownComponents = {
  p: ({ children, ...props }: React.HTMLAttributes<HTMLParagraphElement>) => (<p className="font-mono text-[13px] leading-relaxed mb-3 last:mb-0 text-[var(--foreground)]" {...props}>{children}</p>),
  h1: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (<h1 className="font-mono text-[18px] font-bold mb-3 mt-6 first:mt-0 text-[var(--foreground)]" {...props}>{children}</h1>),
  h2: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (<h2 className="font-mono text-[16px] font-bold mb-2 mt-5 first:mt-0 text-[var(--foreground)]" {...props}>{children}</h2>),
  ul: ({ children, ...props }: React.HTMLAttributes<HTMLUListElement>) => (<ul className="font-mono text-[13px] list-disc pl-5 mb-3 space-y-1 text-[var(--foreground)]" {...props}>{children}</ul>),
  ol: ({ children, ...props }: React.HTMLAttributes<HTMLOListElement>) => (<ol className="font-mono text-[13px] list-decimal pl-5 mb-3 space-y-1 text-[var(--foreground)]" {...props}>{children}</ol>),
  li: ({ children, ...props }: React.HTMLAttributes<HTMLLIElement>) => (<li className="font-mono text-[13px] leading-relaxed text-[var(--foreground)]" {...props}>{children}</li>),
  a: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (<a href={href} target="_blank" rel="noopener noreferrer" className="underline hover:opacity-60 transition text-[var(--foreground)]" {...props}>{children}</a>),
  strong: ({ children, ...props }: React.HTMLAttributes<HTMLElement>) => (<strong className="font-bold" {...props}>{children}</strong>),
  em: ({ children, ...props }: React.HTMLAttributes<HTMLElement>) => (<em {...props}>{children}</em>),
};

function MarkdownToolbar({ onInsert }: { onInsert: (b: string, a: string, p: string) => void }) {
  const btn = 'px-2 py-1 font-mono text-[11px] border border-[var(--border-color)] hover:border-[var(--accent)] transition-all rounded-lg cursor-pointer text-[var(--foreground)] bg-transparent';
  return (
    <div className="flex flex-wrap gap-1 mb-1.5">
      <button type="button" className={btn} onClick={() => onInsert('**', '**', 'bold')}><strong>B</strong></button>
      <button type="button" className={btn} onClick={() => onInsert('*', '*', 'italic')}><em>I</em></button>
      <button type="button" className={btn} onClick={() => onInsert('[', '](url)', 'link text')}>Link</button>
      <button type="button" className={btn} onClick={() => onInsert('## ', '', 'Heading')}>H2</button>
      <button type="button" className={btn} onClick={() => onInsert('- ', '', 'list item')}>List</button>
    </div>
  );
}

const generateSlug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const COVER_PALETTES = [
  { name: 'obsidian',  bg: '#1a1a1a', fg: '#e4fe52', label: '#e4fe52', logoDark: false },
  { name: 'lime',      bg: '#e4fe52', fg: '#1a1a1a', label: '#1a1a1a', logoDark: true },
  { name: 'bone',      bg: '#f5f0e8', fg: '#1a1a1a', label: '#1a1a1a', logoDark: true },
  { name: 'blue',      bg: '#4F46FF', fg: '#ffffff', label: '#ffffff', logoDark: false },
  { name: 'orange',    bg: '#FF5C34', fg: '#ffffff', label: '#ffffff', logoDark: false },
  { name: 'pink',      bg: '#FF5BD7', fg: '#ffffff', label: '#ffffff', logoDark: false },
  { name: 'green',     bg: '#00FF88', fg: '#1a1a1a', label: '#1a1a1a', logoDark: true },
] as const;

// Preload both logo variants so canvas draws are instant.
let _logoWhite: HTMLImageElement | null = null;
let _logoDark: HTMLImageElement | null = null;
function getLogoImage(dark: boolean): HTMLImageElement {
  if (dark) {
    if (!_logoDark) { _logoDark = new Image(); _logoDark.src = '/brand/topia-mark.png'; }
    return _logoDark;
  }
  if (!_logoWhite) { _logoWhite = new Image(); _logoWhite.src = '/brand/logo-white.png'; }
  return _logoWhite;
}

function drawPlaceholderCover(
  canvas: HTMLCanvasElement,
  eventName: string,
  palette: typeof COVER_PALETTES[number],
) {
  const W = 1200, H = 1500; // 4:5 portrait
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  // Background
  ctx.fillStyle = palette.bg;
  ctx.fillRect(0, 0, W, H);

  // Subtle radial gradient overlay for depth
  const grad = ctx.createRadialGradient(W / 2, H * 0.4, 0, W / 2, H * 0.4, W * 0.8);
  grad.addColorStop(0, palette.fg + '08');
  grad.addColorStop(1, 'transparent');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Logo mark — outlined star from topia-mark.png / logo-white.png
  const logoImg = getLogoImage(palette.logoDark);
  if (logoImg.complete && logoImg.naturalWidth > 0) {
    const logoW = 700, logoH = logoW * (logoImg.naturalHeight / logoImg.naturalWidth);
    ctx.globalAlpha = 0.15;
    ctx.drawImage(logoImg, (W - logoW) / 2, H * 0.22 - logoH / 2, logoW, logoH);
    ctx.globalAlpha = 1;
  }

  // "TOPIA" wordmark above event name
  ctx.fillStyle = palette.fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.font = '900 48px "Basement Grotesque", "Zalando Sans Expanded", "Arial Black", Impact, sans-serif';
  const topiaY = H * 0.48;
  ctx.fillText('TOPIA', W / 2, topiaY);

  // Event name — large, centered, wrapping
  const maxTextW = W - 160;
  const words = eventName.toUpperCase().split(/\s+/);
  let fontSize = 96;
  let lines: string[] = [];
  while (fontSize >= 36) {
    ctx.font = `900 ${fontSize}px "Basement Grotesque", "Zalando Sans Expanded", "Arial Black", Impact, sans-serif`;
    lines = [];
    let current = '';
    for (const word of words) {
      const test = current ? `${current} ${word}` : word;
      if (ctx.measureText(test).width > maxTextW && current) {
        lines.push(current);
        current = word;
      } else current = test;
    }
    if (current) lines.push(current);
    if (lines.length <= 4) break;
    fontSize -= 4;
  }
  const lineHeight = fontSize * 1.05;
  const blockH = lines.length * lineHeight;
  const startY = topiaY + 70;
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], W / 2, startY + i * lineHeight, maxTextW);
  }

  // Thin divider line
  ctx.strokeStyle = palette.fg + '20';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(80, H - 160);
  ctx.lineTo(W - 80, H - 160);
  ctx.stroke();

  // "TOPIA" small footer
  ctx.fillStyle = palette.label + '60';
  ctx.font = '900 28px "Basement Grotesque", "Zalando Sans Expanded", "Arial Black", Impact, sans-serif';
  ctx.fillText('TOPIA', W / 2, H - 120);
}

function formatDateForStorage(isoDate: string): string {
  if (!isoDate) return '';
  const d = new Date(isoDate + 'T00:00:00');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${d.getDate()}-${months[d.getMonth()]}-${d.getFullYear()}`;
}
function formatTimeForStorage(time24: string): string {
  if (!time24) return '';
  const [h, m] = time24.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return `${hour}:${m.toString().padStart(2, '0')} ${ampm}`;
}

export default function EventComposer({ mode, initial }: { mode: 'create' | 'edit'; initial: EventComposerInitial }) {
  const router = useRouter();
  const { user, authenticated, ready } = usePrivy();
  const { worldMemberships } = useUserProfile();

  const [eventName, setEventName] = useState(initial.eventName);
  const [date, setDate] = useState(initial.dateIso);
  const [startTime, setStartTime] = useState(initial.startTime);
  const [endTime, setEndTime] = useState(initial.endTime);
  const [city, setCity] = useState(initial.city);
  const [customCity, setCustomCity] = useState('');
  const [showCustomCity, setShowCustomCity] = useState(false);
  const [cities, setCities] = useState<string[]>([]);
  const [venue, setVenue] = useState(initial.venue);
  const [timezone, setTimezone] = useState(initial.timezone || (typeof window !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'America/New_York'));
  const [link, setLink] = useState(initial.link);
  const [description, setDescription] = useState(initial.description);
  const [imageUrl, setImageUrl] = useState(initial.imageUrl);
  const [worldId, setWorldId] = useState(initial.worldId);
  const [descriptionPreview, setDescriptionPreview] = useState(false);
  const [saving, setSaving] = useState<'draft' | 'publish' | null>(null);
  const [error, setError] = useState('');
  const [accent] = useState<typeof ACCENTS[number]>(ACCENTS[0]);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [paletteIdx, setPaletteIdx] = useState(0);
  const placeholderCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [canvasMounted, setCanvasMounted] = useState(false);
  const placeholderCanvasCallback = useCallback((node: HTMLCanvasElement | null) => {
    placeholderCanvasRef.current = node;
    setCanvasMounted(!!node);
  }, []);

  // Import-from-link (create only): paste a Partiful/Luma/Posh URL to autofill.
  const [importUrl, setImportUrl] = useState('');
  const [importing, setImporting] = useState(false);
  const [importNote, setImportNote] = useState('');
  const [externalSource, setExternalSource] = useState<string | null>(null);

  // Registration settings + custom questions.
  const [showReg, setShowReg] = useState(false);

  // Paid tickets + promo codes (behind PAYMENTS_ENABLED). Create mode stages
  // them locally and persists after the event row exists; edit mode manages
  // live via the ticket-types / promo-codes APIs inside TicketSetup.
  const [showTix, setShowTix] = useState(false);
  const [ticketDraft, setTicketDraft] = useState<StagedTickets>(EMPTY_STAGED);
  const [capacity, setCapacity] = useState(initial.rsvpCapacity != null ? String(initial.rsvpCapacity) : '');
  const [approval, setApproval] = useState(initial.rsvpApprovalRequired);
  const [questions, setQuestions] = useState<DraftQuestion[]>([]);
  const [qLabel, setQLabel] = useState('');
  const [qType, setQType] = useState('short_text');
  const [qOptions, setQOptions] = useState('');
  const [qRequired, setQRequired] = useState(false);
  const [qBusy, setQBusy] = useState(false);
  const [qError, setQError] = useState('');
  // Editor state: editorOpen toggles the add/edit form; editIdx === null means
  // "adding new", a number means "editing the question at that index".
  const [editorOpen, setEditorOpen] = useState(false);
  const [editIdx, setEditIdx] = useState<number | null>(null);
  // Copy-from-previous-event state.
  const [copyOpen, setCopyOpen] = useState(false);
  const [copyEvents, setCopyEvents] = useState<{ eventId: string; eventName: string; slug: string; date: string | null; questionCount: number }[]>([]);
  const [copyLoading, setCopyLoading] = useState(false);

  // Edit mode: load existing questions (managed live against the API).
  useEffect(() => {
    if (mode !== 'edit' || !initial.slug) return;
    fetch(`/api/events/questions?slug=${initial.slug}&includeInactive=1`)
      .then((r) => r.json())
      .then((d) => setQuestions((d.questions ?? []).map((q: { id: string; label: string; type: string; options: string[] | null; required: boolean }) => ({ id: q.id, label: q.label, type: q.type, options: q.options ?? [], required: q.required }))))
      .catch(() => setQError('Could not load existing questions — reload to retry.'));
  }, [mode, initial.slug]);

  const resetEditorFields = () => { setQLabel(''); setQType('short_text'); setQOptions(''); setQRequired(false); };
  // Switch question type: auto-fill a friendly default label (unless the host
  // typed a custom one) and seed the roles picker with the suggestion list.
  const onTypeChange = (t: string) => {
    setQType(t);
    const known = Object.values(DEFAULT_LABELS);
    if (DEFAULT_LABELS[t] && (!qLabel.trim() || known.includes(qLabel.trim()))) setQLabel(DEFAULT_LABELS[t]);
    if (t === 'roles') { if (!qOptions.trim()) setQOptions(ROLE_TAGS.join('\n')); setQRequired(true); }
  };
  const openEditor = (idx: number | null) => {
    setQError('');
    if (idx === null) { resetEditorFields(); }
    else { const q = questions[idx]; setQLabel(q.label); setQType(q.type); setQOptions(q.options.join('\n')); setQRequired(q.required); }
    setEditIdx(idx); setEditorOpen(true);
  };
  const closeEditor = () => { setEditorOpen(false); setEditIdx(null); resetEditorFields(); setQError(''); };

  const openCopyPicker = async () => {
    if (!user) return;
    setCopyOpen(true);
    setCopyLoading(true);
    try {
      const res = await fetch(`/api/events/questions?myEvents=1&privyId=${encodeURIComponent(user.id)}`);
      const data = await res.json();
      setCopyEvents(data.events ?? []);
    } catch { setCopyEvents([]); }
    finally { setCopyLoading(false); }
  };
  const copyQuestionsFrom = async (eventId: string) => {
    setQError('');
    try {
      const res = await fetch(`/api/events/questions?eventId=${encodeURIComponent(eventId)}`);
      const data = await res.json();
      const imported: DraftQuestion[] = (data.questions ?? []).map((q: { label: string; type: string; options: string[] | null; required: boolean }) => ({
        label: q.label, type: q.type, options: q.options ?? [], required: q.required,
      }));
      if (imported.length === 0) { setQError('No questions found on that event.'); return; }
      setQuestions((prev) => [...prev, ...imported]);
      setCopyOpen(false);
    } catch { setQError('Could not load questions — try again.'); }
  };

  // Save the editor — adds a new question (editIdx === null) or updates an
  // existing one. Edit mode persists immediately; create mode stages until save.
  const saveQuestion = async () => {
    setQError('');
    if (!qLabel.trim()) { setQError('Add a question label.'); return; }
    const options = SELECT_TYPES.has(qType) ? qOptions.split('\n').map((s) => s.trim()).filter(Boolean) : [];
    if (SELECT_TYPES.has(qType) && options.length === 0) { setQError(qType === 'roles' ? 'Add at least one role tag.' : 'Add at least one option for a choice question.'); return; }
    const draft: DraftQuestion = { label: qLabel.trim(), type: qType, options, required: qRequired };

    if (editIdx === null) {
      // ADD
      if (mode === 'edit' && initial.eventId && user) {
        setQBusy(true);
        try {
          const res = await fetch('/api/events/questions', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ privyId: user.id, eventId: initial.eventId, ...draft, sortOrder: questions.length }),
          });
          const d = await res.json().catch(() => ({}));
          if (!res.ok) { setQError(d.error || 'Could not save question — try again.'); return; }
          draft.id = d.question?.id;
        } catch { setQError('Could not save question — check your connection.'); return; }
        finally { setQBusy(false); }
      }
      setQuestions((qs) => [...qs, draft]);
    } else {
      // UPDATE
      const existing = questions[editIdx];
      draft.id = existing.id;
      if (mode === 'edit' && existing.id && user) {
        setQBusy(true);
        try {
          const res = await fetch('/api/events/questions', {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ privyId: user.id, id: existing.id, ...draft }),
          });
          if (!res.ok) { const d = await res.json().catch(() => ({})); setQError(d.error || 'Could not update question.'); return; }
        } catch { setQError('Could not update question — check your connection.'); return; }
        finally { setQBusy(false); }
      }
      setQuestions((qs) => qs.map((q, i) => (i === editIdx ? draft : q)));
    }
    closeEditor();
  };

  const moveQuestion = async (idx: number, dir: -1 | 1) => {
    const j = idx + dir;
    if (j < 0 || j >= questions.length) return;
    const next = [...questions];
    [next[idx], next[j]] = [next[j], next[idx]];
    setQuestions(next);
    if (mode === 'edit' && user) {
      await Promise.allSettled([
        next[idx].id && fetch('/api/events/questions', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ privyId: user.id, id: next[idx].id, sortOrder: idx }) }),
        next[j].id && fetch('/api/events/questions', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ privyId: user.id, id: next[j].id, sortOrder: j }) }),
      ].filter(Boolean) as Promise<Response>[]);
    }
  };

  const removeQuestion = async (idx: number) => {
    const q = questions[idx];
    if (q.id && user) {
      try {
        const res = await fetch(`/api/events/questions?id=${q.id}&privyId=${user.id}`, { method: 'DELETE' });
        if (!res.ok) { setQError('Could not remove question — try again.'); return; }
      } catch { setQError('Could not remove question — check your connection.'); return; }
    }
    setQError('');
    setQuestions((qs) => qs.filter((_, i) => i !== idx));
  };

  // Any world the user belongs to can host their event — so they can pick
  // whichever world they want it presented by.
  const myWorlds = useMemo(() =>
    worldMemberships.map((wm) => ({ id: wm.worldId, title: wm.worldTitle })),
    [worldMemberships]);

  useEffect(() => {
    fetch('/api/events?cities=true').then((r) => r.json()).then((d) => setCities(d.cities || [])).catch(console.error);
  }, []);

  // Redraw placeholder cover preview when name, palette, or canvas mount state changes.
  useEffect(() => {
    const c = placeholderCanvasRef.current;
    if (!c || imageUrl) return;
    const palette = COVER_PALETTES[paletteIdx];
    const name = eventName.trim() || 'Your Event';
    const img = getLogoImage(palette.logoDark);
    const draw = () => drawPlaceholderCover(c, name, palette);
    if (img.complete && img.naturalWidth > 0) { draw(); return; }
    img.onload = draw;
    draw();
  }, [eventName, paletteIdx, imageUrl, canvasMounted]);

  const generatePlaceholderBlob = useCallback((): Promise<Blob> => {
    const palette = COVER_PALETTES[paletteIdx];
    const name = eventName.trim() || 'Your Event';
    const img = getLogoImage(palette.logoDark);
    const go = () => new Promise<Blob>((resolve, reject) => {
      const c = document.createElement('canvas');
      drawPlaceholderCover(c, name, palette);
      c.toBlob((b) => (b ? resolve(b) : reject(new Error('Canvas encode failed'))), 'image/jpeg', 0.92);
    });
    if (img.complete && img.naturalWidth > 0) return go();
    return new Promise<Blob>((resolve) => { img.onload = () => resolve(go()); });
  }, [eventName, paletteIdx]);

  /* ── cover upload ── */
  // Preserve the poster's full aspect ratio — only scale down so the longest
  // side fits within maxDim. No cropping, so tall/wide posters stay intact.
  const compressImageToBlob = (file: File, maxDim = 1600, quality = 0.85): Promise<Blob> => new Promise((resolve, reject) => {
    const img = new Image();
    img.onerror = () => reject(new Error('Could not decode image'));
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d')?.drawImage(img, 0, 0, w, h);
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Canvas encode failed'))), 'image/jpeg', quality);
    };
    img.src = URL.createObjectURL(file);
  });
  const getVideoDuration = (file: File): Promise<number> => new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement('video');
    v.preload = 'metadata'; v.muted = true;
    v.onloadedmetadata = () => { URL.revokeObjectURL(url); resolve(v.duration); };
    v.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read video metadata')); };
    v.src = url;
  });
  const uploadToBlob = async (file: Blob, filename: string): Promise<string> => {
    const fd = new FormData(); fd.append('file', file, filename);
    const res = await fetch('/api/events/cover-upload', { method: 'POST', body: fd });
    const json = await res.json();
    if (!res.ok || !json.ok) throw new Error(json.error || 'Upload failed');
    return json.url as string;
  };
  async function uploadFile(file: File) {
    setError('');
    const isVideo = file.type.startsWith('video/'), isGif = file.type === 'image/gif';
    try {
      setUploading(true);
      if (isVideo) {
        if (file.size > MAX_VIDEO_BYTES) { setError(`Video too large — max ${Math.round(MAX_VIDEO_BYTES / 1024 / 1024)} MB.`); return; }
        const d = await getVideoDuration(file);
        if (d > MAX_VIDEO_SECONDS + 0.2) { setError(`Video too long — max ${MAX_VIDEO_SECONDS}s.`); return; }
        setImageUrl(await uploadToBlob(file, file.name));
      } else if (isGif) {
        if (file.size > MAX_IMAGE_BYTES) { setError(`GIF too large — max ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)} MB.`); return; }
        setImageUrl(await uploadToBlob(file, file.name));
      } else if (file.type.startsWith('image/')) {
        setImageUrl(await uploadToBlob(await compressImageToBlob(file), 'cover.jpg'));
      } else setError('Unsupported file. Use JPG, PNG, GIF, or short MP4/MOV.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally { setUploading(false); }
  }
  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; if (f) await uploadFile(f); e.target.value = ''; };
  const onDrop = async (e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) await uploadFile(f); };
  const coverIsVideo = imageUrl.startsWith('data:video/') || /\.(mp4|mov|webm)(\?|#|$)/i.test(imageUrl);

  const insertMarkdown = (before: string, after: string, placeholder: string) => {
    const ta = document.getElementById('composer-description') as HTMLTextAreaElement | null;
    if (!ta) return;
    const start = ta.selectionStart, end = ta.selectionEnd;
    const selected = description.substring(start, end);
    const text = selected || placeholder;
    setDescription(description.substring(0, start) + before + text + after + description.substring(end));
  };

  /* ── import from link ── */
  const parseTo24 = (t: string): string => {
    const m = t.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
    if (!m) return '';
    let h = parseInt(m[1]);
    const ap = m[3]?.toUpperCase();
    if (ap === 'PM' && h !== 12) h += 12;
    if (ap === 'AM' && h === 12) h = 0;
    return `${h.toString().padStart(2, '0')}:${m[2]}`;
  };
  const handleImport = async () => {
    if (!importUrl.trim()) return;
    setImporting(true);
    setImportNote('');
    try {
      const res = await fetch('/api/events/import', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: importUrl.trim() }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) { setImportNote(json.error || 'Could not fetch that link'); return; }
      const d = json.data;
      if (d.title) setEventName(d.title);
      if (d.dateIso) setDate(d.dateIso);
      if (d.startTime) setStartTime(parseTo24(d.startTime));
      if (d.timezone) setTimezone(d.timezone);
      if (d.city) setCity(d.city);
      if (d.address) setVenue(d.address);
      if (d.imageUrl) setImageUrl(d.imageUrl);
      if (d.description) setDescription(d.description.slice(0, 800));
      if (d.link) setLink(d.link);
      setExternalSource(json.source ?? null);
      setImportUrl('');
      setImportNote(`Imported from ${json.source ?? 'link'} — review and publish.`);
    } catch {
      setImportNote('Network error — try again');
    } finally {
      setImporting(false);
    }
  };

  /* ── submit ── */
  const submit = async (publish: boolean) => {
    if (!user || !eventName.trim()) { setError('Event name is required'); return; }
    // Date + start time are required to publish. Drafts can be incomplete —
    // that's the point of saving a draft — so we only enforce on publish.
    if (publish) {
      if (!date) { setError('Pick a date before publishing.'); return; }
      if (!startTime) { setError('Add a start time before publishing.'); return; }
    }
    setSaving(publish ? 'publish' : 'draft');
    setError('');

    // Auto-generate a placeholder cover if none was uploaded.
    let finalImageUrl = imageUrl;
    if (!finalImageUrl && eventName.trim()) {
      try {
        const blob = await generatePlaceholderBlob();
        finalImageUrl = await uploadToBlob(blob, 'cover.jpg');
        setImageUrl(finalImageUrl);
      } catch { /* proceed without — not critical */ }
    }

    const payload = {
      privyId: user.id,
      eventName: eventName.trim(),
      slug: mode === 'edit' && initial.slug ? initial.slug : generateSlug(eventName),
      description: description || null,
      date: date ? formatDateForStorage(date) : null,
      dateIso: date || null,
      startTime: startTime ? formatTimeForStorage(startTime) : null,
      endTime: endTime ? formatTimeForStorage(endTime) : null,
      timezone: timezone || null,
      city: (showCustomCity ? customCity.trim() : city) || null,
      address: venue || null,
      link: link || null,
      imageUrl: finalImageUrl || null,
      published: publish,
      // Capacity below 1 is meaningless (locks everyone out) → unlimited.
      rsvpCapacity: (() => { const n = capacity.trim() === '' ? NaN : Number(capacity); return Number.isFinite(n) && n >= 1 ? Math.floor(n) : null; })(),
      rsvpApprovalRequired: approval,
    };
    try {
      const res = await fetch('/api/events', {
        method: mode === 'edit' ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mode === 'edit' ? { ...payload, eventId: initial.eventId, worldId: worldId || null } : { ...payload, worldId: worldId || null, externalSource }),
      });
      if (!res.ok) {
        let msg = 'Failed to save event';
        try { const d = await res.json(); msg = d.error || msg; } catch { if (res.status === 413) msg = 'Image is too large.'; }
        setError(msg); return;
      }
      const data = await res.json();
      const finalSlug = data.event?.slug ?? payload.slug;
      const newEventId = data.event?.id;

      // Create-mode: persist the staged custom questions now that the event exists.
      // The event itself is already saved, so a question failure shouldn't block
      // navigation — but we warn the host so they can re-add it from Manage.
      if (mode !== 'edit' && newEventId) {
        const staged = questions.filter((q) => !q.id);
        const results = await Promise.allSettled(staged.map((q, i) =>
          fetch('/api/events/questions', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ privyId: user.id, eventId: newEventId, label: q.label, type: q.type, options: q.options, required: q.required, sortOrder: i }),
          }).then((r) => { if (!r.ok) throw new Error('failed'); }),
        ));
        const failed = results.filter((r) => r.status === 'rejected').length;
        if (failed > 0) {
          try { sessionStorage.setItem('eventComposerNotice', `Event saved, but ${failed} registration question${failed > 1 ? 's' : ''} didn't save. Add ${failed > 1 ? 'them' : 'it'} again from Manage.`); } catch {}
        }

        // Same deal for staged ticket tiers + promo codes.
        if (PAYMENTS_ENABLED && (ticketDraft.tiers.length > 0 || ticketDraft.promos.length > 0)) {
          const tixFailed = await persistStagedTickets(user.id, newEventId, ticketDraft);
          if (tixFailed > 0) {
            try { sessionStorage.setItem('eventComposerNotice', `Event saved, but ${tixFailed} ticket item${tixFailed > 1 ? 's' : ''} didn't save. Add ${tixFailed > 1 ? 'them' : 'it'} again from Manage → Tickets.`); } catch {}
          }
        }
      }

      router.push(`/events/${finalSlug}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save event');
    } finally { setSaving(null); }
  };

  if (!ready) return null;
  if (!authenticated) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center" style={{ backgroundColor: 'var(--background)' }}>
        <Navigation />
        <p className="font-mono text-[13px] mb-4" style={{ color: 'var(--foreground)' }}>Please log in to {mode === 'edit' ? 'edit this event' : 'create an event'}.</p>
        <Link href="/events" className="font-mono text-[13px] underline" style={{ color: 'var(--foreground)' }}>← Back to Events</Link>
      </div>
    );
  }

  const primaryLabel = mode === 'edit' && initial.published ? 'Update →' : 'Publish →';
  const backHref = mode === 'edit' && initial.slug ? `/events/${initial.slug}` : '/events';

  // Themed field styling (adapts to light/dark via CSS variables).
  const inputCls = 'w-full rounded-sm px-3 py-2 font-mono text-[12px] outline-none border bg-[var(--surface-hover)] text-[var(--foreground)] border-[var(--border-color)] focus:border-[var(--accent)] placeholder:opacity-40';
  const labelCls = 'block font-mono text-[10px] uppercase tracking-[2px] opacity-40 mb-1';
  const ERR = '#FF5C34';

  // Shared add/edit question editor (used inline for both new + existing).
  const renderQuestionEditor = () => (
    <div className="border rounded-lg p-3 space-y-2" style={{ borderColor: 'var(--accent)', backgroundColor: 'var(--surface-hover)' }}>
      <p className="font-mono text-[10px] uppercase tracking-[2px] opacity-40">{editIdx === null ? 'New question' : 'Edit question'}</p>
      <input value={qLabel} onChange={(e) => setQLabel(e.target.value)} placeholder="Question (e.g. Dietary preference?)" className={inputCls} />
      <div className="flex gap-2">
        <select value={qType} onChange={(e) => onTypeChange(e.target.value)} className={`${inputCls} flex-1 cursor-pointer`}>
          {QUESTION_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <label className="flex items-center gap-1.5 cursor-pointer font-mono text-[11px] uppercase tracking-[1px] opacity-70 shrink-0 px-1">
          <input type="checkbox" checked={qRequired} onChange={(e) => setQRequired(e.target.checked)} style={{ accentColor: 'var(--accent)' }} /> Required
        </label>
      </div>
      {SELECT_TYPES.has(qType) && (
        <textarea value={qOptions} onChange={(e) => setQOptions(e.target.value)} rows={3} placeholder={qType === 'roles' ? 'Role tags — one per line (guests can add their own)' : 'One option per line'} className={`${inputCls} resize-none`} />
      )}
      <div className="flex gap-2 pt-1">
        <button type="button" onClick={saveQuestion} disabled={qBusy} className="font-mono text-[11px] uppercase tracking-[2px] px-3 py-1.5 rounded-sm cursor-pointer border-none disabled:opacity-40 font-bold" style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-text)' }}>
          {qBusy ? 'Saving…' : (editIdx === null ? 'Add question' : 'Save')}
        </button>
        <button type="button" onClick={closeEditor} className="font-mono text-[11px] uppercase tracking-[2px] px-3 py-1.5 rounded-sm cursor-pointer border bg-transparent hover:opacity-70" style={{ borderColor: 'var(--border-color)', color: 'var(--foreground)' }}>
          Cancel
        </button>
      </div>
      {qError && <p className="font-mono text-[11px]" style={{ color: ERR }}>{qError}</p>}
    </div>
  );

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--background)', color: 'var(--foreground)' }}>
      <Navigation />

      {/* Sticky bar — back · status · save draft · publish */}
      <div className="sticky top-0 z-40 backdrop-blur-md border-b md:mt-[var(--nav-height)]" style={{ backgroundColor: 'var(--nav-bg)', borderColor: 'var(--border-color)' }}>
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-2.5 flex items-center gap-3">
          <Link href={backHref} className="font-mono text-[11px] uppercase tracking-[2px] opacity-50 hover:opacity-100 transition no-underline">← {mode === 'edit' ? 'Event' : 'Events'}</Link>
          <span className="font-mono text-[10px] uppercase tracking-[2px] opacity-30 ml-auto">
            {mode === 'edit' ? (initial.published ? 'Published' : 'Draft') : (eventName.trim() ? 'Unsaved draft' : 'New event')}
          </span>
          <button
            onClick={() => submit(false)}
            disabled={saving !== null || !eventName.trim()}
            className="font-mono text-[11px] uppercase tracking-[2px] px-3 py-1.5 rounded-sm transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed border bg-transparent hover:opacity-70"
            style={{ borderColor: 'var(--border-color)', color: 'var(--foreground)' }}
          >
            {saving === 'draft' ? 'Saving…' : 'Save draft'}
          </button>
          <button
            onClick={() => submit(true)}
            disabled={saving !== null || !eventName.trim()}
            className="font-mono text-[11px] uppercase tracking-[2px] px-4 py-1.5 rounded-sm transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed border-none"
            style={{ backgroundColor: accent.hex, color: accent.on, boxShadow: saving === null && eventName.trim() ? `0 0 0 1px ${accent.hex}40, 0 6px 24px -8px ${accent.hex}80` : 'none' }}
          >
            {saving === 'publish' ? 'Publishing…' : primaryLabel}
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-6 pb-[var(--mobile-nav-clearance)] md:pb-32">
        {/* Import from link — create only. Paste a Partiful/Luma/Posh URL to
            autofill the fields, then review + publish. */}
        {mode === 'create' && (
          <div className="mb-6 rounded-lg border p-3" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--surface-hover)' }}>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="url" value={importUrl} onChange={(e) => setImportUrl(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleImport(); } }}
                placeholder="Have a Partiful / Luma / Posh link? Paste it to autofill…"
                className={inputCls}
              />
              <button type="button" onClick={handleImport} disabled={importing || !importUrl.trim()}
                className="font-mono text-[11px] uppercase tracking-[2px] px-4 py-2 rounded-sm cursor-pointer disabled:opacity-40 border-none shrink-0"
                style={{ backgroundColor: 'var(--foreground)', color: 'var(--background)' }}>
                {importing ? 'Importing…' : 'Import'}
              </button>
            </div>
            {importNote && <p className="font-mono text-[11px] opacity-70 mt-2">{importNote}</p>}
          </div>
        )}

        {/* Cover */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={`relative group rounded-2xl overflow-hidden mb-8 transition-all duration-300 border ${dragOver ? 'border-[var(--accent)]' : 'border-[var(--border-color)]'}`}
          style={{ boxShadow: dragOver ? `0 0 0 4px ${accent.hex}30` : 'none' }}
        >
          {imageUrl ? (
            <>
              {coverIsVideo ? (
                <video src={imageUrl} className="w-full h-auto block" autoPlay loop muted playsInline preload="metadata" />
              ) : (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={imageUrl} alt="cover" className="w-full h-auto block" />
              )}
              <div className="absolute top-3 right-3 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                <label className={`font-mono text-[10px] uppercase tracking-[2px] backdrop-blur-sm border px-3 py-1.5 rounded-sm cursor-pointer ${uploading ? 'opacity-50 cursor-wait' : ''}`} style={{ backgroundColor: 'var(--background)', color: 'var(--foreground)', borderColor: 'var(--border-color)' }}>
                  {uploading ? 'Uploading…' : 'Change'}
                  <input type="file" accept={COVER_ACCEPT} onChange={onPick} className="hidden" disabled={uploading} />
                </label>
                <button onClick={() => setImageUrl('')} className="font-mono text-[10px] uppercase tracking-[2px] backdrop-blur-sm border px-3 py-1.5 rounded-sm cursor-pointer hover:opacity-70" style={{ backgroundColor: 'var(--background)', color: 'var(--foreground)', borderColor: 'var(--border-color)' }}>Remove</button>
              </div>
            </>
          ) : (
            <div className="relative">
              {/* Live placeholder preview */}
              <canvas ref={placeholderCanvasCallback} className="w-full h-auto block" style={{ aspectRatio: '4 / 5' }} />
              {/* Overlay controls */}
              <div className="absolute inset-0 flex flex-col items-center justify-end pb-6 gap-3">
                {/* Palette picker */}
                <div className="flex items-center gap-2 bg-black/50 backdrop-blur-sm rounded-full px-3 py-2">
                  {COVER_PALETTES.map((p, i) => (
                    <button
                      key={p.name}
                      type="button"
                      onClick={() => setPaletteIdx(i)}
                      className="w-7 h-7 rounded-full border-2 transition-all cursor-pointer"
                      style={{
                        backgroundColor: p.bg,
                        borderColor: i === paletteIdx ? '#ffffff' : 'rgba(255,255,255,0.15)',
                        boxShadow: i === paletteIdx ? '0 0 0 2px rgba(0,0,0,0.4)' : 'none',
                      }}
                      title={p.name}
                    />
                  ))}
                </div>
                {/* Upload button */}
                <label className={`font-mono text-[10px] uppercase tracking-[2px] bg-white/90 text-black px-4 py-2 rounded-full cursor-pointer hover:bg-white transition ${uploading ? 'opacity-50 cursor-wait' : ''}`}>
                  <input type="file" accept={COVER_ACCEPT} onChange={onPick} className="hidden" disabled={uploading} />
                  {uploading ? 'Uploading…' : 'Upload your own'}
                </label>
                <span className="font-mono text-[9px] uppercase tracking-[2px] text-white/40">or save with this generated cover</span>
              </div>
            </div>
          )}
        </div>

        {/* Title */}
        <input
          type="text" value={eventName} onChange={(e) => setEventName(e.target.value)}
          placeholder="Untitled event" autoFocus={mode === 'create'}
          className="w-full bg-transparent border-none outline-none font-basement font-black uppercase placeholder:opacity-30 mb-5 px-0"
          style={{ fontSize: 'clamp(32px, 6vw, 64px)', lineHeight: 0.95, letterSpacing: '-0.02em', color: 'var(--foreground)' }}
        />

        {/* When & where — always visible; these are the essentials */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <div>
            <label className={labelCls}>Date<span style={{ color: ERR }}> *</span></label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`${inputCls} cursor-pointer`} />
          </div>
          <div>
            <label className={labelCls}>Start<span style={{ color: ERR }}> *</span></label>
            <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>End</label>
            <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Timezone</label>
            <select value={timezone} onChange={(e) => setTimezone(e.target.value)} className={`${inputCls} cursor-pointer`}>
              {TIMEZONES.map((tz) => <option key={tz.value} value={tz.value}>{tz.label}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
          <div>
            <label className={labelCls}>City</label>
            {!showCustomCity ? (
              <select value={city} onChange={(e) => { if (e.target.value === '__new__') { setShowCustomCity(true); setCity(''); } else setCity(e.target.value); }} className={`${inputCls} cursor-pointer`}>
                <option value="">Select a city…</option>
                {cities.map((c) => <option key={c} value={c}>{c}</option>)}
                <option value="__new__">+ Add new city</option>
              </select>
            ) : (
              <div className="flex gap-1.5">
                <input type="text" value={customCity} onChange={(e) => setCustomCity(e.target.value)} placeholder="e.g. Los Angeles" autoFocus className={inputCls} />
                <button type="button" onClick={() => { setShowCustomCity(false); setCustomCity(''); }} className="px-2 font-mono text-[12px] opacity-50 hover:opacity-100 bg-transparent border rounded-sm cursor-pointer shrink-0" style={{ borderColor: 'var(--border-color)' }}>↺</button>
              </div>
            )}
          </div>
          <div>
            <label className={labelCls}>Venue / address</label>
            <input type="text" value={venue} onChange={(e) => setVenue(e.target.value)} placeholder="e.g. The Fonda Theatre" className={inputCls} />
          </div>
        </div>

        {/* Description */}
        <div className="mb-6 border rounded-lg overflow-hidden transition-colors" style={{ borderColor: 'var(--border-color)' }}>
          <div className="flex items-center justify-between border-b px-3 py-1.5" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--surface-hover)' }}>
            <span className="font-mono text-[10px] uppercase tracking-[2px] opacity-40">Description</span>
            {description && (
              <div className="flex gap-1">
                <button type="button" onClick={() => setDescriptionPreview(false)} className="font-mono text-[10px] uppercase tracking-[2px] px-2 py-0.5 rounded-sm cursor-pointer border-none" style={!descriptionPreview ? { backgroundColor: 'var(--foreground)', color: 'var(--background)' } : { backgroundColor: 'transparent', color: 'var(--foreground)', opacity: 0.4 }}>Write</button>
                <button type="button" onClick={() => setDescriptionPreview(true)} className="font-mono text-[10px] uppercase tracking-[2px] px-2 py-0.5 rounded-sm cursor-pointer border-none" style={descriptionPreview ? { backgroundColor: 'var(--foreground)', color: 'var(--background)' } : { backgroundColor: 'transparent', color: 'var(--foreground)', opacity: 0.4 }}>Preview</button>
              </div>
            )}
          </div>
          {!descriptionPreview ? (
            <div className="p-3">
              {description && <MarkdownToolbar onInsert={insertMarkdown} />}
              <textarea id="composer-description" value={description} onChange={(e) => setDescription(e.target.value)} rows={6} placeholder="What's the vibe? Who's it for? **Markdown** works." className="w-full bg-transparent border-none outline-none font-mono text-[14px] placeholder:opacity-30 resize-none leading-relaxed" style={{ minHeight: '120px', color: 'var(--foreground)' }} />
            </div>
          ) : (
            <div className="p-3 min-h-[150px]">
              {description ? <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>{description}</ReactMarkdown> : <p className="font-mono text-[12px] opacity-30">Nothing to preview yet</p>}
            </div>
          )}
        </div>

        {/* External link + world host — always visible */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
          <div className={myWorlds.length > 0 ? '' : 'sm:col-span-2'}>
            <label className={labelCls}>External event link <span className="opacity-60 normal-case">· optional</span></label>
            <input type="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://… (RSVP somewhere else)" className={inputCls} />
          </div>
          {myWorlds.length > 0 && (
            <div>
              <label className={labelCls}>Host as world</label>
              <select value={worldId} onChange={(e) => setWorldId(e.target.value)} className={`${inputCls} cursor-pointer`}>
                <option value="">Just me (personal)</option>
                {myWorlds.map((w) => <option key={w.id} value={w.id}>{w.title}</option>)}
              </select>
            </div>
          )}
        </div>

        {/* Registration — capacity, approval + custom questions */}
        <button type="button" onClick={() => setShowReg(!showReg)} className="font-mono text-[11px] uppercase tracking-[2px] opacity-40 hover:opacity-100 transition bg-transparent border-none cursor-pointer flex items-center gap-2 mb-3">
          <span style={{ transition: 'transform 200ms', display: 'inline-block', transform: showReg ? 'rotate(90deg)' : 'rotate(0deg)' }}>›</span>
          {showReg ? 'Hide registration' : 'Registration · capacity · approval · questions' + (questions.length ? ` · ${questions.length} question${questions.length > 1 ? 's' : ''}` : '')}
        </button>
        {showReg && (
          <div className="space-y-4 border rounded-lg p-4 mb-6" style={{ borderColor: 'var(--border-color)' }}>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-mono text-[10px] uppercase tracking-[2px] opacity-40 mb-1">Capacity</label>
                <input value={capacity} onChange={(e) => setCapacity(e.target.value)} inputMode="numeric" placeholder="∞ unlimited" className={inputCls} />
              </div>
              <label className="flex items-end gap-2 cursor-pointer pb-2 font-mono text-[12px] opacity-80">
                <input type="checkbox" checked={approval} onChange={(e) => setApproval(e.target.checked)} style={{ accentColor: 'var(--accent)' }} /> Require approval
              </label>
            </div>

            {/* Custom questions — Luma-style cards with edit + reorder */}
            <div>
              <label className="block font-mono text-[10px] uppercase tracking-[2px] opacity-40 mb-2">Registration questions</label>

              {questions.length > 0 && (
                <div className="space-y-2 mb-3">
                  {questions.map((q, i) => (
                    editorOpen && editIdx === i ? (
                      <div key={q.id ?? i}>{renderQuestionEditor()}</div>
                    ) : (
                      <div key={q.id ?? i} className="flex items-center gap-3 border rounded-lg px-3 py-2.5" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--surface-hover)' }}>
                        <div className="flex flex-col -my-1 shrink-0">
                          <button type="button" onClick={() => moveQuestion(i, -1)} disabled={i === 0} className="font-mono text-[10px] leading-none disabled:opacity-20 hover:opacity-70 bg-transparent border-none cursor-pointer p-0.5" style={{ color: 'var(--foreground)' }} aria-label="Move up">▲</button>
                          <button type="button" onClick={() => moveQuestion(i, 1)} disabled={i === questions.length - 1} className="font-mono text-[10px] leading-none disabled:opacity-20 hover:opacity-70 bg-transparent border-none cursor-pointer p-0.5" style={{ color: 'var(--foreground)' }} aria-label="Move down">▼</button>
                        </div>
                        <span className="shrink-0 w-6 h-6 rounded flex items-center justify-center font-mono text-[12px] border" style={{ borderColor: 'var(--border-color)', color: 'var(--foreground)' }}>{QTYPE_GLYPH[q.type] ?? 'A'}</span>
                        <div className="flex-1 min-w-0">
                          <p className="font-mono text-[13px] font-bold truncate" style={{ color: 'var(--foreground)' }}>{q.label}</p>
                          <p className="font-mono text-[11px] opacity-40 truncate" style={{ color: 'var(--foreground)' }}>
                            {QUESTION_TYPES.find((t) => t.value === q.type)?.label}{q.required && ' · Required'}{q.options.length ? ` · ${q.options.join(', ')}` : ''}
                          </p>
                        </div>
                        <button type="button" onClick={() => openEditor(i)} className="shrink-0 font-mono text-[14px] opacity-50 hover:opacity-100 bg-transparent border-none cursor-pointer" title="Edit" style={{ color: 'var(--foreground)' }}>✎</button>
                        <button type="button" onClick={() => removeQuestion(i)} className="shrink-0 font-mono text-[13px] opacity-50 hover:opacity-100 bg-transparent border-none cursor-pointer" title="Delete" style={{ color: ERR }}>✕</button>
                      </div>
                    )
                  ))}
                </div>
              )}

              {editorOpen && editIdx === null ? (
                renderQuestionEditor()
              ) : !editorOpen && !copyOpen ? (
                <div className="flex gap-2">
                  <button type="button" onClick={() => openEditor(null)} className="flex-1 font-mono text-[11px] uppercase tracking-[2px] border border-dashed px-3 py-2.5 rounded-lg cursor-pointer bg-transparent hover:opacity-70" style={{ borderColor: 'var(--border-color)', color: 'var(--foreground)' }}>
                    + Add question
                  </button>
                  <button type="button" onClick={openCopyPicker} className="font-mono text-[11px] uppercase tracking-[2px] border border-dashed px-3 py-2.5 rounded-lg cursor-pointer bg-transparent hover:opacity-70 shrink-0" style={{ borderColor: 'var(--border-color)', color: 'var(--foreground)' }}>
                    Copy from event
                  </button>
                </div>
              ) : null}

              {copyOpen && (
                <div className="border rounded-lg p-3 space-y-2" style={{ borderColor: 'var(--accent)', backgroundColor: 'var(--surface-hover)' }}>
                  <div className="flex items-center justify-between">
                    <p className="font-mono text-[10px] uppercase tracking-[2px] opacity-40">Copy questions from…</p>
                    <button type="button" onClick={() => setCopyOpen(false)} className="font-mono text-[11px] opacity-50 hover:opacity-100 bg-transparent border-none cursor-pointer" style={{ color: 'var(--foreground)' }}>✕</button>
                  </div>
                  {copyLoading ? (
                    <p className="font-mono text-[11px] opacity-40 py-4 text-center">Loading your events…</p>
                  ) : copyEvents.length === 0 ? (
                    <p className="font-mono text-[11px] opacity-40 py-4 text-center">No previous events with questions found.</p>
                  ) : (
                    <div className="max-h-48 overflow-y-auto -mx-1 px-1 space-y-1">
                      {copyEvents.map((ev) => (
                        <button
                          key={ev.eventId}
                          type="button"
                          onClick={() => copyQuestionsFrom(ev.eventId)}
                          className="w-full text-left flex items-center justify-between gap-3 px-3 py-2 rounded-sm hover:bg-[var(--foreground)]/5 cursor-pointer bg-transparent border-none transition"
                        >
                          <div className="min-w-0">
                            <p className="font-mono text-[12px] font-bold truncate" style={{ color: 'var(--foreground)' }}>{ev.eventName}</p>
                            {ev.date && <p className="font-mono text-[10px] opacity-40">{ev.date}</p>}
                          </div>
                          <span className="font-mono text-[10px] opacity-40 shrink-0">{ev.questionCount}q</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {qError && !editorOpen && <p className="font-mono text-[11px] mt-2" style={{ color: ERR }}>{qError}</p>}
            </div>
            <p className="font-mono text-[10px] opacity-30">Guests always provide name, email &amp; phone. Add custom questions above.</p>
          </div>
        )}

        {/* Tickets — paid tiers + promo codes (Stripe) */}
        {PAYMENTS_ENABLED && (
          <>
            <button type="button" onClick={() => setShowTix(!showTix)} className="font-mono text-[11px] uppercase tracking-[2px] opacity-40 hover:opacity-100 transition bg-transparent border-none cursor-pointer flex items-center gap-2 mb-3">
              <span style={{ transition: 'transform 200ms', display: 'inline-block', transform: showTix ? 'rotate(90deg)' : 'rotate(0deg)' }}>›</span>
              {showTix
                ? 'Hide tickets'
                : 'Tickets · paid admission · promo codes' +
                  (mode !== 'edit' && ticketDraft.tiers.length ? ` · ${ticketDraft.tiers.length} tier${ticketDraft.tiers.length > 1 ? 's' : ''}` : '') +
                  (mode !== 'edit' && ticketDraft.promos.length ? ` · ${ticketDraft.promos.length} code${ticketDraft.promos.length > 1 ? 's' : ''}` : '')}
            </button>
            {showTix && (
              <div className="border rounded-lg p-4 mb-6" style={{ borderColor: 'var(--border-color)' }}>
                <TicketSetup
                  privyId={user?.id ?? null}
                  eventId={mode === 'edit' ? initial.eventId ?? null : null}
                  staged={ticketDraft}
                  onStagedChange={setTicketDraft}
                />
              </div>
            )}
          </>
        )}

        {error && <div className="mb-6 font-mono text-[12px] uppercase tracking-[2px] border rounded-sm px-3 py-2" style={{ color: ERR, borderColor: `${ERR}55`, backgroundColor: `${ERR}14` }}>{error}</div>}

        {/* Edit: pointer to deeper settings */}
        {mode === 'edit' && initial.slug && (
          <Link href={`/events/${initial.slug}/manage`} className="inline-block font-mono text-[11px] uppercase tracking-[2px] opacity-40 hover:opacity-100 transition no-underline">
            Guests · co-hosts · approvals →
          </Link>
        )}
      </div>
    </div>
  );
}
