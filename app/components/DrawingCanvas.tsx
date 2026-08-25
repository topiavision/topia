'use client';

import { useEffect, useRef, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';

interface Props {
  open: boolean;
  onClose: () => void;
  onSave: (dataUrl: string, caption: string) => Promise<void> | void;
  /** Suggested CSS size for the canvas. Internal rendering is HiDPI (2×). */
  size?: number;
}

/* ─── Tools + palettes ───────────────────────────────────────── */

type Tool = 'brush' | 'eraser' | 'select' | 'text' | 'rect' | 'circle' | 'line' | 'stamp';

const TOOLS: { id: Tool; label: string; icon: string }[] = [
  { id: 'brush',  label: 'Brush',  icon: '✎' },
  { id: 'eraser', label: 'Eraser', icon: '⌫' },
  { id: 'select', label: 'Move',   icon: '↔' },
  { id: 'text',   label: 'Text',   icon: 'T' },
  { id: 'rect',   label: 'Box',    icon: '▢' },
  { id: 'circle', label: 'Circle', icon: '◯' },
  { id: 'line',   label: 'Line',   icon: '╱' },
  { id: 'stamp',  label: 'Stamp',  icon: '★' },
];

// Tools that paint into the base canvas (pixel layer)
const PIXEL_TOOLS = new Set<Tool>(['brush', 'eraser']);
// Tools that drop an interactive object onto the SVG overlay
const OBJECT_TOOLS = new Set<Tool>(['text', 'rect', 'circle', 'line', 'stamp']);

const PALETTE = [
  '#0a0a0a', // black
  '#f5f0e8', // bone (≈ white)
  '#e4fe52', // lime
  '#FF5BD7', // pink
  '#4F46FF', // blue
  '#FF5C34', // orange
  '#00FF88', // green
];
const BG_PALETTE = [
  '#f5f0e8', // bone (default)
  '#0a0a0a', // obsidian
  '#1a1a1a', // softer dark
  '#fde68a', // butter
  '#bae6fd', // sky
  '#fbcfe8', // blush
  '#dcfce7', // mint
  '#fef3c7', // cream
];
const SIZES = [2, 5, 10, 18];
const STAMPS = ['⭐','❤️','🔥','✨','🌸','☁️','🌙','☀️','🎈','💎','🌈','👀','🪐','🎵','🥹','💀','🍄','🍒','💫','🦋'];

/* ─── Object model ───────────────────────────────────────────── */

type ObjectType = 'text' | 'rect' | 'circle' | 'line' | 'stamp';

interface ShapeObject {
  id: string;
  type: ObjectType;
  x: number;          // top-left in CSS px
  y: number;
  w: number;
  h: number;
  color: string;
  // text + stamp
  text?: string;
  // shapes
  strokeWidth?: number;
  filled?: boolean;
}

function uid() { return Math.random().toString(36).slice(2, 10); }

/* ─── Component ──────────────────────────────────────────────── */

export default function DrawingCanvas({ open, onClose, onSave, size = 512 }: Props) {
  const { user: privyUser } = usePrivy();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const svgRef    = useRef<SVGSVGElement>(null);
  const isDrawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const historyRef = useRef<string[]>([]);

  const [tool, setTool] = useState<Tool>('brush');
  const [color, setColor] = useState(PALETTE[0]);
  const [bgColor, setBgColor] = useState(BG_PALETTE[0]);
  const [brushSize, setBrushSize] = useState(SIZES[1]);
  const [stampChar, setStampChar] = useState(STAMPS[0]);
  const [filled, setFilled] = useState(false);

  const [objects, setObjects] = useState<ShapeObject[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragState, setDragState] = useState<
    | { mode: 'move'; id: string; offsetX: number; offsetY: number }
    | { mode: 'resize'; id: string; anchorX: number; anchorY: number; startW: number; startH: number; startX: number; startY: number }
    | null
  >(null);

  const [caption, setCaption] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* ── Canvas init ───────────────────────────────────────────── */
  useEffect(() => {
    if (!open) return;
    const cv = canvasRef.current;
    if (!cv) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width  = size * dpr;
    cv.height = size * dpr;
    cv.style.width  = `${size}px`;
    cv.style.height = `${size}px`;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size); // background div behind shows bgColor
    historyRef.current = [cv.toDataURL('image/png')];
    setObjects([]);
    setSelectedId(null);
    setError(null);
    setCaption('');
  }, [open, size]);

  /* ── ESC ───────────────────────────────────────────────────── */
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        const target = e.target as HTMLElement | null;
        // Don't intercept while typing in an input/textarea
        if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
        e.preventDefault();
        setObjects((prev) => prev.filter((o) => o.id !== selectedId));
        setSelectedId(null);
      }
    }
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose, selectedId]);

  /* ── History helpers (only for base-canvas changes) ──────── */
  function pushHistory() {
    const cv = canvasRef.current;
    if (!cv) return;
    historyRef.current.push(cv.toDataURL('image/png'));
    if (historyRef.current.length > 20) historyRef.current.shift();
  }
  function undo() {
    // Undo the most recent action — either an object placement OR a brush stroke
    if (objects.length > 0) {
      setObjects((prev) => prev.slice(0, -1));
      return;
    }
    if (historyRef.current.length <= 1) return;
    historyRef.current.pop();
    const last = historyRef.current[historyRef.current.length - 1];
    const cv = canvasRef.current;
    if (!cv || !last) return;
    const ctx = cv.getContext('2d');
    const img = new Image();
    img.onload = () => {
      ctx?.clearRect(0, 0, cv.width, cv.height);
      ctx?.drawImage(img, 0, 0, size, size);
    };
    img.src = last;
  }
  function clearAll() {
    const cv = canvasRef.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx) return;
    ctx.clearRect(0, 0, cv.width, cv.height);
    setObjects([]);
    setSelectedId(null);
    pushHistory();
  }

  /* ── Coord helpers ─────────────────────────────────────────── */
  function getCanvasPoint(e: React.PointerEvent): { x: number; y: number } {
    const cv = canvasRef.current!;
    const r = cv.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  /* ── Pixel-layer pointer (brush + eraser) ─────────────────── */
  function pixelStart(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!PIXEL_TOOLS.has(tool)) return;
    canvasRef.current?.setPointerCapture(e.pointerId);
    isDrawingRef.current = true;
    lastPointRef.current = getCanvasPoint(e);
  }
  function pixelMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!isDrawingRef.current) return;
    const cv = canvasRef.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx) return;
    const p = getCanvasPoint(e);
    const last = lastPointRef.current ?? p;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = brushSize;
    if (tool === 'eraser') {
      // Real eraser — clear pixels rather than paint bg color, so the
      // background color stays uniform when you erase strokes over it.
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = 'rgba(0,0,0,1)';
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = color;
    }
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    lastPointRef.current = p;
  }
  function pixelEnd() {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    lastPointRef.current = null;
    // Reset comp op
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) ctx.globalCompositeOperation = 'source-over';
    pushHistory();
  }

  /* ── Object creation (centered placement) ─────────────────── */
  function placeObject(at?: { x: number; y: number }) {
    const center = at ?? { x: size / 2, y: size / 2 };
    let obj: ShapeObject | null = null;
    if (tool === 'text') {
      const txt = prompt('Text:');
      if (!txt) return;
      const fontSize = Math.max(16, brushSize * 4);
      // Estimate width from char count (good enough; user can resize)
      const w = Math.min(size - 20, Math.max(60, txt.length * fontSize * 0.6));
      const h = fontSize * 1.2;
      obj = { id: uid(), type: 'text', x: center.x - w / 2, y: center.y - h / 2, w, h, color, text: txt };
    } else if (tool === 'stamp') {
      const stampSize = 64 + brushSize * 4;
      obj = { id: uid(), type: 'stamp', x: center.x - stampSize / 2, y: center.y - stampSize / 2, w: stampSize, h: stampSize, color: '#000', text: stampChar };
    } else if (tool === 'rect') {
      const w = 140, h = 90;
      obj = { id: uid(), type: 'rect', x: center.x - w / 2, y: center.y - h / 2, w, h, color, strokeWidth: brushSize, filled };
    } else if (tool === 'circle') {
      const w = 120, h = 120;
      obj = { id: uid(), type: 'circle', x: center.x - w / 2, y: center.y - h / 2, w, h, color, strokeWidth: brushSize, filled };
    } else if (tool === 'line') {
      const w = 160, h = 4 + brushSize;
      obj = { id: uid(), type: 'line', x: center.x - w / 2, y: center.y - h / 2, w, h, color, strokeWidth: brushSize };
    }
    if (obj) {
      setObjects((prev) => [...prev, obj as ShapeObject]);
      setSelectedId(obj.id);
      setTool('select'); // auto-switch to move after placement so user can adjust
    }
  }

  /* ── Object move + resize ────────────────────────────────── */
  function startMove(e: React.PointerEvent, id: string) {
    if (tool !== 'select') return;
    e.stopPropagation();
    const obj = objects.find((o) => o.id === id);
    if (!obj) return;
    const svg = svgRef.current;
    if (!svg) return;
    svg.setPointerCapture(e.pointerId);
    const r = svg.getBoundingClientRect();
    setSelectedId(id);
    setDragState({
      mode: 'move',
      id,
      offsetX: e.clientX - r.left - obj.x,
      offsetY: e.clientY - r.top - obj.y,
    });
  }

  function startResize(e: React.PointerEvent, id: string) {
    e.stopPropagation();
    const obj = objects.find((o) => o.id === id);
    if (!obj) return;
    const svg = svgRef.current;
    if (!svg) return;
    svg.setPointerCapture(e.pointerId);
    setDragState({
      mode: 'resize',
      id,
      anchorX: e.clientX,
      anchorY: e.clientY,
      startW: obj.w,
      startH: obj.h,
      startX: obj.x,
      startY: obj.y,
    });
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!dragState) return;
    const svg = svgRef.current;
    if (!svg) return;
    const r = svg.getBoundingClientRect();

    if (dragState.mode === 'move') {
      const nx = e.clientX - r.left - dragState.offsetX;
      const ny = e.clientY - r.top  - dragState.offsetY;
      setObjects((prev) => prev.map((o) => o.id === dragState.id
        ? { ...o, x: Math.max(-o.w / 2, Math.min(size - o.w / 2, nx)), y: Math.max(-o.h / 2, Math.min(size - o.h / 2, ny)) }
        : o,
      ));
    } else if (dragState.mode === 'resize') {
      const dx = e.clientX - dragState.anchorX;
      const dy = e.clientY - dragState.anchorY;
      setObjects((prev) => prev.map((o) => {
        if (o.id !== dragState.id) return o;
        if (o.type === 'circle') {
          const next = Math.max(20, Math.min(size, Math.max(dragState.startW + dx, dragState.startH + dy)));
          return { ...o, w: next, h: next };
        }
        if (o.type === 'line') {
          return { ...o, w: Math.max(20, dragState.startW + dx) };
        }
        if (o.type === 'stamp') {
          // Keep stamps square (font scales)
          const next = Math.max(24, Math.min(size, Math.max(dragState.startW + dx, dragState.startH + dy)));
          return { ...o, w: next, h: next };
        }
        // text + rect: free aspect
        return {
          ...o,
          w: Math.max(24, dragState.startW + dx),
          h: Math.max(o.type === 'text' ? 20 : 24, dragState.startH + dy),
        };
      }));
    }
  }
  function handlePointerUp() { setDragState(null); }

  /* ── Click on canvas / SVG background ──────────────────── */
  function handleCanvasPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (PIXEL_TOOLS.has(tool)) { pixelStart(e); return; }
    if (OBJECT_TOOLS.has(tool)) {
      const p = getCanvasPoint(e);
      placeObject(p);
    } else if (tool === 'select') {
      setSelectedId(null);
    }
  }

  /* ── Edit text on double-click ────────────────────────── */
  function editText(id: string) {
    const obj = objects.find((o) => o.id === id);
    if (!obj || obj.type !== 'text') return;
    const next = prompt('Edit text:', obj.text || '');
    if (next == null) return;
    setObjects((prev) => prev.map((o) => o.id === id ? { ...o, text: next } : o));
  }

  /* ── Save: composite canvas + bg + objects → PNG ────── */
  async function handleSave() {
    setError(null);
    const cv = canvasRef.current;
    if (!cv) return;
    setSaving(true);
    try {
      // Build offscreen canvas at the same logical size as our base (CSS size)
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const out = document.createElement('canvas');
      out.width  = size * dpr;
      out.height = size * dpr;
      const ctx = out.getContext('2d')!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // 1) bg
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, size, size);

      // 2) base canvas pixels (brush strokes)
      // drawImage from the original canvas — its internal size matches `size * dpr`
      ctx.drawImage(cv, 0, 0, size, size);

      // 3) objects, in placement order
      for (const o of objects) {
        if (o.type === 'rect') {
          ctx.lineWidth = o.strokeWidth ?? 4;
          if (o.filled) {
            ctx.fillStyle = o.color;
            ctx.fillRect(o.x, o.y, o.w, o.h);
          } else {
            ctx.strokeStyle = o.color;
            ctx.strokeRect(o.x, o.y, o.w, o.h);
          }
        } else if (o.type === 'circle') {
          const r = Math.min(o.w, o.h) / 2;
          const cx = o.x + o.w / 2;
          const cy = o.y + o.h / 2;
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          if (o.filled) { ctx.fillStyle = o.color; ctx.fill(); }
          else { ctx.lineWidth = o.strokeWidth ?? 4; ctx.strokeStyle = o.color; ctx.stroke(); }
        } else if (o.type === 'line') {
          ctx.beginPath();
          ctx.moveTo(o.x, o.y + o.h / 2);
          ctx.lineTo(o.x + o.w, o.y + o.h / 2);
          ctx.lineCap = 'round';
          ctx.lineWidth = o.strokeWidth ?? 4;
          ctx.strokeStyle = o.color;
          ctx.stroke();
        } else if (o.type === 'text') {
          const fontSize = Math.max(12, o.h * 0.85);
          ctx.fillStyle = o.color;
          ctx.font = `bold ${fontSize}px ui-sans-serif, system-ui, sans-serif`;
          ctx.textBaseline = 'top';
          // Word-wrap so resizing the box wraps the text
          const words = (o.text ?? '').split(/\s+/);
          let line = '';
          let yy = o.y;
          for (const word of words) {
            const test = line ? line + ' ' + word : word;
            if (ctx.measureText(test).width > o.w && line) {
              ctx.fillText(line, o.x, yy);
              yy += fontSize * 1.15;
              line = word;
            } else {
              line = test;
            }
          }
          if (line) ctx.fillText(line, o.x, yy);
        } else if (o.type === 'stamp') {
          const fontSize = Math.min(o.w, o.h);
          ctx.font = `${fontSize}px serif`;
          ctx.textBaseline = 'middle';
          ctx.textAlign = 'center';
          ctx.fillText(o.text ?? '★', o.x + o.w / 2, o.y + o.h / 2);
          ctx.textAlign = 'start';
        }
      }

      const blob = await new Promise<Blob>((resolve, reject) => {
        out.toBlob((b) => b ? resolve(b) : reject(new Error('Encode failed')), 'image/png');
      });
      const fd = new FormData();
      fd.append('file', blob, 'drawing.png');
      fd.append('privyId', privyUser?.id ?? '');
      const res = await fetch('/api/events/cover-upload', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok || !json.ok) { setError(json.error || 'Upload failed'); return; }
      await onSave(json.url as string, caption.trim());
      onClose();
    } catch (err) {
      console.error('drawing save failed', err);
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  const selected = selectedId ? objects.find((o) => o.id === selectedId) ?? null : null;

  return (
    <div
      className="fixed inset-0 z-[1600] flex items-center justify-center px-3 sm:px-6 py-6 backdrop-blur-sm"
      style={{ backgroundColor: 'rgba(10,10,10,0.75)' }}
      onClick={onClose}
    >
      <div
        className="relative bg-obsidian text-bone border border-bone/[0.08] rounded-lg overflow-hidden flex flex-col max-h-[95vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 py-2.5 border-b border-bone/[0.06] flex items-center justify-between gap-3 shrink-0">
          <span className="font-mono text-[10px] uppercase tracking-[2px] text-bone/40">draw something nice</span>
          <button
            onClick={onClose}
            className="font-mono text-[14px] text-bone/40 hover:text-bone bg-transparent border-none cursor-pointer w-6 h-6 flex items-center justify-center"
            aria-label="Close"
          >×</button>
        </div>

        {/* Toolbar row 1: tools */}
        <div className="px-3 py-2 border-b border-bone/[0.06] flex flex-wrap items-center gap-1.5 shrink-0">
          {TOOLS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTool(t.id)}
              title={t.label}
              className={`font-mono text-[10px] uppercase tracking-[2px] inline-flex items-center gap-1 px-2 py-1 rounded-sm border transition cursor-pointer ${
                tool === t.id ? 'bg-bone text-obsidian border-bone' : 'bg-transparent text-bone/60 border-bone/15 hover:text-bone'
              }`}
            >
              <span className="text-[14px] leading-none">{t.icon}</span>
              <span className="hidden sm:inline">{t.label}</span>
            </button>
          ))}

          <span className="w-px h-5 bg-bone/15 mx-1" />

          {/* Per-shape: filled toggle */}
          {(tool === 'rect' || tool === 'circle') && (
            <button
              onClick={() => setFilled((v) => !v)}
              className={`font-mono text-[10px] uppercase tracking-[2px] px-2 py-1 rounded-sm border transition cursor-pointer ${
                filled ? 'bg-bone/10 border-lime/50 text-bone' : 'bg-transparent border-bone/15 text-bone/60 hover:text-bone'
              }`}
              title="Toggle filled"
            >
              {filled ? '■ filled' : '□ outline'}
            </button>
          )}

          <span className="ml-auto inline-flex items-center gap-2">
            <button onClick={undo} className="font-mono text-[10px] uppercase tracking-[2px] px-2 py-1 rounded-sm border border-bone/15 text-bone/60 hover:text-bone bg-transparent cursor-pointer transition">↶ undo</button>
            <button onClick={clearAll} className="font-mono text-[10px] uppercase tracking-[2px] px-2 py-1 rounded-sm border border-bone/15 text-bone/60 hover:text-pink hover:border-pink/40 bg-transparent cursor-pointer transition">⌧ clear</button>
          </span>
        </div>

        {/* Toolbar row 2: colors + sizes + stamps + bg */}
        <div className="px-3 py-2 border-b border-bone/[0.06] flex flex-wrap items-center gap-2 shrink-0">
          {/* Stroke / text / shape color */}
          <span className="font-mono text-[9px] uppercase tracking-[2px] text-bone/40 mr-1">ink</span>
          {PALETTE.map((c) => (
            <button
              key={c}
              onClick={() => {
                setColor(c);
                if (selected) {
                  setObjects((prev) => prev.map((o) => o.id === selected.id ? { ...o, color: c } : o));
                }
              }}
              className="w-5 h-5 rounded-sm border-2 transition cursor-pointer"
              style={{
                backgroundColor: c,
                borderColor: color === c ? '#e4fe52' : 'rgba(245,240,232,0.15)',
                transform: color === c ? 'scale(1.1)' : 'scale(1)',
              }}
              title={c}
            />
          ))}

          <span className="w-px h-5 bg-bone/15 mx-1" />

          <span className="font-mono text-[9px] uppercase tracking-[2px] text-bone/40 mr-1">size</span>
          {SIZES.map((s) => (
            <button
              key={s}
              onClick={() => setBrushSize(s)}
              className={`w-6 h-6 rounded-sm border flex items-center justify-center transition cursor-pointer ${brushSize === s ? 'bg-bone/10 border-lime/50' : 'bg-transparent border-bone/15 hover:bg-bone/[0.04]'}`}
              title={`size ${s}`}
            >
              <span className="rounded-full bg-bone" style={{ width: Math.min(s, 14), height: Math.min(s, 14) }} />
            </button>
          ))}

          <span className="w-px h-5 bg-bone/15 mx-1" />

          {/* Background color */}
          <span className="font-mono text-[9px] uppercase tracking-[2px] text-bone/40 mr-1">bg</span>
          {BG_PALETTE.map((c) => (
            <button
              key={c}
              onClick={() => setBgColor(c)}
              className="w-5 h-5 rounded-full border-2 transition cursor-pointer"
              style={{
                backgroundColor: c,
                borderColor: bgColor === c ? '#e4fe52' : 'rgba(245,240,232,0.15)',
                transform: bgColor === c ? 'scale(1.1)' : 'scale(1)',
              }}
              title={c}
            />
          ))}
        </div>

        {/* Stamp picker — only when stamp tool is active */}
        {tool === 'stamp' && (
          <div className="px-3 py-2 border-b border-bone/[0.06] flex flex-wrap items-center gap-1 shrink-0">
            <span className="font-mono text-[9px] uppercase tracking-[2px] text-bone/40 mr-1">stamp</span>
            {STAMPS.map((s) => (
              <button
                key={s}
                onClick={() => setStampChar(s)}
                className={`w-8 h-8 rounded-sm flex items-center justify-center text-[18px] transition cursor-pointer border ${stampChar === s ? 'bg-bone/10 border-lime/50' : 'bg-transparent border-bone/15 hover:bg-bone/[0.04]'}`}
                title={s}
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {/* Canvas area */}
        <div className="p-4 bg-bone/[0.02] flex justify-center overflow-auto">
          <div
            className="relative rounded-sm border border-bone/15 shadow-2xl"
            style={{
              width: size,
              height: size,
              backgroundColor: bgColor,
              cursor: tool === 'select' ? 'default' : tool === 'eraser' ? 'cell' : tool === 'text' ? 'text' : 'crosshair',
              touchAction: 'none',
            }}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          >
            <canvas
              ref={canvasRef}
              onPointerDown={handleCanvasPointerDown}
              onPointerMove={pixelMove}
              onPointerUp={pixelEnd}
              onPointerLeave={pixelEnd}
              className="absolute inset-0"
              style={{ touchAction: 'none' }}
            />
            <svg
              ref={svgRef}
              className="absolute inset-0 pointer-events-none"
              width={size}
              height={size}
              viewBox={`0 0 ${size} ${size}`}
            >
              {objects.map((o) => {
                const sel = selectedId === o.id && tool === 'select';
                const objPointerEvents = tool === 'select' ? 'auto' : 'none';
                const moveHandlers = tool === 'select' ? {
                  onPointerDown: (e: React.PointerEvent) => startMove(e, o.id),
                  onPointerMove: handlePointerMove,
                  onPointerUp: handlePointerUp,
                  style: { cursor: 'move', pointerEvents: 'auto' as const },
                } : { style: { pointerEvents: objPointerEvents as 'none' | 'auto' } };
                return (
                  <g key={o.id}>
                    {o.type === 'rect' && (
                      <rect
                        x={o.x} y={o.y} width={o.w} height={o.h}
                        fill={o.filled ? o.color : 'transparent'}
                        stroke={o.color}
                        strokeWidth={o.strokeWidth ?? 4}
                        {...moveHandlers}
                      />
                    )}
                    {o.type === 'circle' && (
                      <ellipse
                        cx={o.x + o.w / 2} cy={o.y + o.h / 2}
                        rx={o.w / 2} ry={o.h / 2}
                        fill={o.filled ? o.color : 'transparent'}
                        stroke={o.color}
                        strokeWidth={o.strokeWidth ?? 4}
                        {...moveHandlers}
                      />
                    )}
                    {o.type === 'line' && (
                      <line
                        x1={o.x} y1={o.y + o.h / 2}
                        x2={o.x + o.w} y2={o.y + o.h / 2}
                        stroke={o.color}
                        strokeWidth={o.strokeWidth ?? 4}
                        strokeLinecap="round"
                        {...moveHandlers}
                      />
                    )}
                    {o.type === 'text' && (
                      <foreignObject x={o.x} y={o.y} width={o.w} height={o.h} {...moveHandlers}>
                        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
                        <div
                          onDoubleClick={() => editText(o.id)}
                          style={{
                            color: o.color,
                            fontFamily: 'ui-sans-serif, system-ui, sans-serif',
                            fontWeight: 700,
                            fontSize: Math.max(12, o.h * 0.85),
                            lineHeight: 1.15,
                            width: '100%',
                            height: '100%',
                            overflow: 'hidden',
                            wordBreak: 'break-word',
                            whiteSpace: 'pre-wrap',
                          }}
                          title="Double-click to edit"
                        >
                          {o.text}
                        </div>
                      </foreignObject>
                    )}
                    {o.type === 'stamp' && (
                      <text
                        x={o.x + o.w / 2}
                        y={o.y + o.h / 2}
                        fontSize={Math.min(o.w, o.h)}
                        textAnchor="middle"
                        dominantBaseline="central"
                        {...moveHandlers}
                      >
                        {o.text}
                      </text>
                    )}
                    {/* Selection chrome */}
                    {sel && (
                      <>
                        <rect
                          x={o.x - 4} y={o.y - 4}
                          width={o.w + 8} height={o.h + 8}
                          fill="none"
                          stroke="#e4fe52"
                          strokeWidth={1}
                          strokeDasharray="4 3"
                          style={{ pointerEvents: 'none' }}
                        />
                        {/* Resize handle (bottom-right) */}
                        <rect
                          x={o.x + o.w - 4} y={o.y + o.h - 4}
                          width={10} height={10}
                          fill="#e4fe52"
                          stroke="#0a0a0a"
                          strokeWidth={1}
                          onPointerDown={(e) => startResize(e, o.id)}
                          style={{ cursor: 'nwse-resize', pointerEvents: 'auto' }}
                        />
                      </>
                    )}
                  </g>
                );
              })}
            </svg>

            {/* Selected-object floating toolbar */}
            {selected && tool === 'select' && (
              <div
                className="absolute z-10 flex items-center gap-1 bg-obsidian/95 border border-bone/15 rounded-sm shadow-2xl px-1.5 py-1"
                style={{
                  left: Math.max(4, Math.min(size - 140, selected.x)),
                  top:  Math.max(4, selected.y - 32),
                }}
                onClick={(e) => e.stopPropagation()}
              >
                {selected.type === 'text' && (
                  <button
                    onClick={() => editText(selected.id)}
                    className="font-mono text-[10px] uppercase tracking-[2px] px-2 py-0.5 bg-transparent border border-bone/15 text-bone/70 hover:text-bone hover:border-lime/50 rounded-sm cursor-pointer transition"
                  >
                    edit text
                  </button>
                )}
                <button
                  onClick={() => {
                    setObjects((prev) => prev.filter((o) => o.id !== selected.id));
                    setSelectedId(null);
                  }}
                  className="font-mono text-[10px] uppercase tracking-[2px] px-2 py-0.5 bg-transparent border border-bone/15 text-bone/70 hover:text-pink hover:border-pink/40 rounded-sm cursor-pointer transition"
                >
                  delete
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Hint row */}
        <div className="px-4 pt-1 pb-2 text-center shrink-0">
          <span className="font-mono text-[9px] uppercase tracking-[2px] text-bone/30">
            {tool === 'select' ? 'drag to move · corner to resize · double-click text to edit · ⌫ delete'
             : tool === 'text' ? 'click anywhere to add text — switch to ↔ Move to drag/resize/edit'
             : tool === 'stamp' ? 'pick a stamp above, click anywhere to drop'
             : OBJECT_TOOLS.has(tool) ? 'click to add — switch to ↔ Move to drag/resize'
             : 'click + drag to paint'}
          </span>
        </div>

        {/* Footer: caption + save */}
        <div className="px-4 py-3 border-t border-bone/[0.06] flex items-center gap-3 shrink-0">
          <input
            type="text"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="add a caption (optional)"
            maxLength={120}
            className="flex-1 bg-bone/[0.04] border border-bone/15 focus:border-lime/40 rounded-sm px-3 py-1.5 font-mono text-[12px] text-bone placeholder:text-bone/25 outline-none"
          />
          <button
            onClick={handleSave}
            disabled={saving}
            className="font-mono text-[11px] uppercase tracking-[2px] bg-lime text-obsidian px-4 py-1.5 rounded-sm disabled:opacity-50 hover:opacity-90 transition cursor-pointer border-none"
          >
            {saving ? 'saving…' : 'sign guestbook →'}
          </button>
        </div>
        {error && (
          <div className="px-4 pb-3 font-mono text-[11px] text-pink/80 shrink-0">{error}</div>
        )}
      </div>
    </div>
  );
}
