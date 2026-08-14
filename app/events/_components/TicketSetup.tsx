'use client';

import { useEffect, useState, useCallback } from 'react';

/* ── Draft shapes ──────────────────────────────────────────────────────
 * One component drives both host surfaces:
 *   - staged mode (event composer, no eventId yet): tiers + promo codes are
 *     held locally and persisted by persistStagedTickets() after the event
 *     row exists;
 *   - live mode (eventId set): every add/toggle/delete talks straight to
 *     /api/events/ticket-types and /api/events/promo-codes.
 * ──────────────────────────────────────────────────────────────────── */

export interface DraftTier {
  id?: string; // set in live mode
  name: string;
  description: string | null;
  priceCents: number;
  quantityTotal: number | null;
  maxPerOrder: number;
  quantitySold: number;
  isActive: boolean;
  // Sale window — datetime strings (from <input type="datetime-local">, local
  // time) or ISO from the API; null = unbounded. Before start the tier shows
  // as "on sale <date>"; after end it stays listed, crossed out.
  salesStartAt: string | null;
  salesEndAt: string | null;
}

function windowLabel(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const hasTime = d.getHours() !== 0 || d.getMinutes() !== 0;
  return hasTime ? `${date} ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}` : date;
}

// ISO timestamp → <input type="datetime-local"> value in the browser's local
// time ("YYYY-MM-DDTHH:mm"), for pre-filling the edit form.
function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

// datetime-local value → absolute ISO instant. MUST happen in the browser:
// the raw "2026-08-29T00:00" string has no timezone, so if it reached the
// server it would be read as UTC and shift by the host's UTC offset.
// new Date() here interprets it in the host's local timezone. Idempotent for
// values that are already ISO (live-mode data loaded from the API).
function localToIso(v: string | null): string | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// Short timezone label ("PDT", "GMT+2") so hosts know which clock the sale
// window fields use.
const TZ_LABEL = (() => {
  try {
    return new Intl.DateTimeFormat(undefined, { timeZoneName: 'short' })
      .formatToParts(new Date())
      .find((p) => p.type === 'timeZoneName')?.value ?? '';
  } catch {
    return '';
  }
})();

export interface DraftPromo {
  id?: string;
  code: string;
  discountType: 'percent' | 'fixed';
  discountValue: number; // percent 1–100 · fixed = cents
  tierIndex: number | null; // staged mode: index into tiers, null = any tier
  ticketTypeId: string | null; // live mode
  maxRedemptions: number | null;
  expiresAt: string | null; // yyyy-mm-dd
  redemptionCount: number;
  isActive: boolean;
}

export interface StagedTickets {
  tiers: DraftTier[];
  promos: DraftPromo[];
}

export const EMPTY_STAGED: StagedTickets = { tiers: [], promos: [] };

/** Create staged tiers + promo codes against a just-created event. Returns the
 * number of items that failed so the caller can warn (never throws). */
export async function persistStagedTickets(
  privyId: string,
  eventId: string,
  staged: StagedTickets,
): Promise<number> {
  let failed = 0;
  const tierIds: (string | null)[] = [];

  // Tiers first (sequentially, preserving order), so promo tier restrictions
  // can point at the created ids.
  for (let i = 0; i < staged.tiers.length; i++) {
    const t = staged.tiers[i];
    try {
      const res = await fetch('/api/events/ticket-types', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          privyId,
          eventId,
          name: t.name,
          description: t.description,
          priceCents: t.priceCents,
          quantityTotal: t.quantityTotal,
          maxPerOrder: t.maxPerOrder,
          sortOrder: i,
          salesStartAt: localToIso(t.salesStartAt),
          salesEndAt: localToIso(t.salesEndAt),
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      tierIds.push(d.ticketType?.id ?? null);
    } catch {
      failed++;
      tierIds.push(null);
    }
  }

  for (const p of staged.promos) {
    const restrictedTo = p.tierIndex != null ? tierIds[p.tierIndex] : null;
    if (p.tierIndex != null && !restrictedTo) {
      failed++; // its tier failed to create — skip rather than widen the code
      continue;
    }
    try {
      const res = await fetch('/api/events/promo-codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          privyId,
          eventId,
          code: p.code,
          discountType: p.discountType,
          discountValue: p.discountValue,
          ticketTypeId: restrictedTo,
          maxRedemptions: p.maxRedemptions,
          // A bare date means "valid through that day" — send the end of that
          // day as an absolute instant so the server never re-reads it as UTC
          // midnight (which would expire the code hours early).
          expiresAt: p.expiresAt ? localToIso(`${p.expiresAt.slice(0, 10)}T23:59:59`) : null,
        }),
      });
      if (!res.ok) throw new Error('failed');
    } catch {
      failed++;
    }
  }

  return failed;
}

/* ── Formatting helpers ────────────────────────────────────────────── */

function usd(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

export function describeDiscount(p: Pick<DraftPromo, 'discountType' | 'discountValue'>) {
  return p.discountType === 'percent' ? `${p.discountValue}% off` : `${usd(p.discountValue)} off`;
}

/* ── Component ─────────────────────────────────────────────────────── */

export default function TicketSetup({
  privyId,
  eventId,
  staged,
  onStagedChange,
}: {
  privyId: string | null;
  /** null → staged mode (composer, event not created yet) */
  eventId: string | null;
  /** staged-mode state, owned by the parent so it survives section collapse */
  staged?: StagedTickets;
  onStagedChange?: (next: StagedTickets) => void;
}) {
  const live = eventId != null;
  const [localStaged, setLocalStaged] = useState<StagedTickets>(EMPTY_STAGED);
  const data = live ? localStaged : (staged ?? localStaged);

  const setData = useCallback(
    (next: StagedTickets) => {
      setLocalStaged(next);
      if (!live) onStagedChange?.(next);
    },
    [live, onStagedChange],
  );

  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Tier form — doubles as add (editTierIdx null) and edit (index set).
  const [tierOpen, setTierOpen] = useState(false);
  const [editTierIdx, setEditTierIdx] = useState<number | null>(null);
  const [tName, setTName] = useState('');
  const [tDesc, setTDesc] = useState('');
  const [tPrice, setTPrice] = useState('');
  const [tQty, setTQty] = useState('');
  const [tMax, setTMax] = useState('');
  const [tStart, setTStart] = useState(''); // datetime-local, '' = on sale now
  const [tEnd, setTEnd] = useState('');     // datetime-local, '' = never ends

  // Promo form
  const [promoOpen, setPromoOpen] = useState(false);
  const [pCode, setPCode] = useState('');
  const [pType, setPType] = useState<'percent' | 'fixed'>('percent');
  const [pValue, setPValue] = useState('');
  const [pTier, setPTier] = useState(''); // '' = any tier; staged: index; live: tier id
  const [pMax, setPMax] = useState('');
  const [pExpires, setPExpires] = useState('');

  const loadLive = useCallback(() => {
    if (!eventId || !privyId) return;
    Promise.all([
      fetch(`/api/events/ticket-types?eventId=${eventId}&includeInactive=1`).then((r) => r.json()),
      fetch(`/api/events/promo-codes?eventId=${eventId}&privyId=${encodeURIComponent(privyId)}`).then((r) => r.json()),
    ])
      .then(([tt, pc]) => {
        type ApiTier = { id: string; name: string; description: string | null; priceCents: number; quantityTotal: number | null; maxPerOrder: number | null; quantitySold: number; isActive: boolean; salesStartAt: string | null; salesEndAt: string | null };
        type ApiPromo = { id: string; code: string; discountType: 'percent' | 'fixed'; discountValue: number; ticketTypeId: string | null; maxRedemptions: number | null; expiresAt: string | null; redemptionCount: number; isActive: boolean };
        setLocalStaged({
          tiers: ((tt.ticketTypes ?? []) as ApiTier[]).map((t) => ({
            id: t.id,
            name: t.name,
            description: t.description,
            priceCents: t.priceCents,
            quantityTotal: t.quantityTotal,
            maxPerOrder: t.maxPerOrder ?? 10,
            quantitySold: t.quantitySold,
            isActive: t.isActive,
            salesStartAt: t.salesStartAt,
            salesEndAt: t.salesEndAt,
          })),
          promos: ((pc.promoCodes ?? []) as ApiPromo[]).map((p) => ({
            id: p.id,
            code: p.code,
            discountType: p.discountType,
            discountValue: p.discountValue,
            tierIndex: null,
            ticketTypeId: p.ticketTypeId,
            maxRedemptions: p.maxRedemptions,
            expiresAt: p.expiresAt ? String(p.expiresAt).slice(0, 10) : null,
            redemptionCount: p.redemptionCount,
            isActive: p.isActive,
          })),
        });
      })
      .catch(() => setError('Could not load ticket settings — reload to retry.'));
  }, [eventId, privyId]);

  useEffect(() => {
    if (live) loadLive();
  }, [live, loadLive]);

  /* ── Tier actions ───────────────────────────────────────────────── */

  const resetTierForm = () => {
    setTName(''); setTDesc(''); setTPrice(''); setTQty(''); setTMax('');
    setTStart(''); setTEnd('');
    setTierOpen(false);
    setEditTierIdx(null);
  };

  // Open the form pre-filled with an existing tier's values.
  const openTierEditor = (idx: number) => {
    const t = data.tiers[idx];
    setTName(t.name);
    setTDesc(t.description ?? '');
    setTPrice(t.priceCents === 0 ? '0' : (t.priceCents / 100).toFixed(2));
    setTQty(t.quantityTotal == null ? '' : String(t.quantityTotal));
    setTMax(t.maxPerOrder === 10 ? '' : String(t.maxPerOrder));
    setTStart(toLocalInput(t.salesStartAt));
    setTEnd(toLocalInput(t.salesEndAt));
    setEditTierIdx(idx);
    setTierOpen(true);
    setPromoOpen(false);
    setError('');
  };

  const addTier = async () => {
    setError('');
    if (!tName.trim()) { setError('Tier name is required'); return; }
    const priceCents = Math.round(parseFloat(tPrice || '0') * 100);
    if (Number.isNaN(priceCents) || priceCents < 0) { setError('Enter a valid price'); return; }
    if (priceCents > 0 && priceCents < 50) { setError('Paid tickets must be at least $0.50 (card minimum)'); return; }
    const quantityTotal = tQty.trim() === '' ? null : Math.max(0, parseInt(tQty, 10) || 0);
    const maxPerOrder = tMax.trim() === '' ? 10 : Math.max(1, parseInt(tMax, 10) || 10);
    if (tStart && tEnd && new Date(tEnd) <= new Date(tStart)) {
      setError('Sale end must be after sale start');
      return;
    }
    const tier: DraftTier = {
      name: tName.trim(),
      description: tDesc.trim() || null,
      priceCents,
      quantityTotal,
      maxPerOrder,
      quantitySold: 0,
      isActive: true,
      salesStartAt: tStart || null,
      salesEndAt: tEnd || null,
    };

    const editing = editTierIdx != null ? data.tiers[editTierIdx] : null;

    if (!live) {
      // Staged: append, or replace in place (keeping sold/active bookkeeping).
      const tiers =
        editTierIdx != null
          ? data.tiers.map((x, i) => (i === editTierIdx ? { ...x, ...tier, quantitySold: x.quantitySold, isActive: x.isActive } : x))
          : [...data.tiers, tier];
      setData({ ...data, tiers });
      resetTierForm();
      return;
    }

    setBusy(true);
    try {
      // Dates convert to absolute instants here in the browser (localToIso) so
      // the server never guesses a timezone.
      const fields = {
        name: tier.name,
        description: tier.description,
        priceCents,
        quantityTotal,
        maxPerOrder,
        salesStartAt: localToIso(tier.salesStartAt),
        salesEndAt: localToIso(tier.salesEndAt),
      };
      const res = await fetch('/api/events/ticket-types', {
        method: editing?.id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          editing?.id
            ? { privyId, id: editing.id, ...fields }
            : { privyId, eventId, sortOrder: data.tiers.length, ...fields },
        ),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? 'Failed to save tier');
      resetTierForm();
      loadLive();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save tier');
    } finally {
      setBusy(false);
    }
  };

  const removeTier = async (idx: number) => {
    const t = data.tiers[idx];
    if (!live || !t.id) {
      // Staged: also drop promos restricted to this tier and reindex the rest.
      setData({
        tiers: data.tiers.filter((_, i) => i !== idx),
        promos: data.promos
          .filter((p) => p.tierIndex !== idx)
          .map((p) => (p.tierIndex != null && p.tierIndex > idx ? { ...p, tierIndex: p.tierIndex - 1 } : p)),
      });
      return;
    }
    await fetch(`/api/events/ticket-types?id=${t.id}&privyId=${privyId}`, { method: 'DELETE' });
    loadLive();
  };

  const toggleTier = async (idx: number) => {
    const t = data.tiers[idx];
    if (!live || !t.id) return;
    await fetch('/api/events/ticket-types', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ privyId, id: t.id, isActive: !t.isActive }),
    });
    loadLive();
  };

  /* ── Promo actions ──────────────────────────────────────────────── */

  const resetPromoForm = () => {
    setPCode(''); setPType('percent'); setPValue(''); setPTier(''); setPMax(''); setPExpires('');
    setPromoOpen(false);
  };

  const addPromo = async () => {
    setError('');
    const code = pCode.trim().toUpperCase();
    if (!/^[A-Z0-9-]{2,40}$/.test(code)) { setError('Codes are 2–40 letters, numbers or dashes'); return; }
    const rawValue = parseFloat(pValue);
    if (Number.isNaN(rawValue) || rawValue <= 0) { setError('Enter a discount amount'); return; }
    const discountValue = pType === 'percent' ? Math.round(rawValue) : Math.round(rawValue * 100);
    if (pType === 'percent' && discountValue > 100) { setError('Percent discount can be at most 100'); return; }
    if (data.promos.some((p) => p.code === code)) { setError('That code already exists'); return; }
    const maxRedemptions = pMax.trim() === '' ? null : Math.max(1, parseInt(pMax, 10) || 1);
    const expiresAt = pExpires || null;

    if (!live) {
      const tierIndex = pTier === '' ? null : Number(pTier);
      setData({
        ...data,
        promos: [...data.promos, { code, discountType: pType, discountValue, tierIndex, ticketTypeId: null, maxRedemptions, expiresAt, redemptionCount: 0, isActive: true }],
      });
      resetPromoForm();
      return;
    }

    setBusy(true);
    try {
      const res = await fetch('/api/events/promo-codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ privyId, eventId, code, discountType: pType, discountValue, ticketTypeId: pTier || null, maxRedemptions, expiresAt: expiresAt ? localToIso(`${expiresAt}T23:59:59`) : null }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? 'Failed to add code');
      resetPromoForm();
      loadLive();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add code');
    } finally {
      setBusy(false);
    }
  };

  const removePromo = async (idx: number) => {
    const p = data.promos[idx];
    if (!live || !p.id) {
      setData({ ...data, promos: data.promos.filter((_, i) => i !== idx) });
      return;
    }
    await fetch(`/api/events/promo-codes?id=${p.id}&privyId=${privyId}`, { method: 'DELETE' });
    loadLive();
  };

  const togglePromo = async (idx: number) => {
    const p = data.promos[idx];
    if (!live || !p.id) return;
    await fetch('/api/events/promo-codes', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ privyId, id: p.id, isActive: !p.isActive }),
    });
    loadLive();
  };

  /* ── Render ─────────────────────────────────────────────────────── */

  const inputCls = 'w-full rounded-sm px-3 py-2 font-mono text-[12px] outline-none border bg-[var(--surface-hover)] text-[var(--foreground)] border-[var(--border-color)] focus:border-[var(--accent)] placeholder:opacity-40';
  const labelCls = 'block font-mono text-[10px] uppercase tracking-[2px] opacity-40 mb-2';
  const dashedBtnCls = 'w-full font-mono text-[11px] uppercase tracking-[2px] border border-dashed px-3 py-2.5 rounded-lg cursor-pointer bg-transparent hover:opacity-70';
  const ERR = '#FF5C34';

  const tierLabel = (p: DraftPromo): string | null => {
    if (!live && p.tierIndex != null) return data.tiers[p.tierIndex]?.name ?? null;
    if (live && p.ticketTypeId) return data.tiers.find((t) => t.id === p.ticketTypeId)?.name ?? null;
    return null;
  };

  return (
    <div className="space-y-5">
      {/* ── Tiers ── */}
      <div>
        <label className={labelCls}>Ticket tiers</label>

        {data.tiers.length === 0 && !tierOpen && (
          <p className="font-mono text-[11px] opacity-40 mb-2" style={{ color: 'var(--foreground)' }}>
            No tiers yet. Add one to sell tickets — buyers pay by card via Stripe. Without tiers, the event stays free-RSVP.
          </p>
        )}

        {data.tiers.length > 0 && (
          <div className="space-y-2 mb-2">
            {data.tiers.map((t, i) => (
              <div key={t.id ?? i} className="flex items-center gap-3 border rounded-lg px-3 py-2.5" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--surface-hover)', opacity: t.isActive ? 1 : 0.5 }}>
                <div className="flex-1 min-w-0">
                  <p className="font-mono text-[13px] font-bold truncate" style={{ color: 'var(--foreground)' }}>
                    {t.name} · {t.priceCents === 0 ? 'Free' : usd(t.priceCents)}
                  </p>
                  <p className="font-mono text-[11px] opacity-40 truncate" style={{ color: 'var(--foreground)' }}>
                    {t.quantityTotal != null ? `${t.quantitySold}/${t.quantityTotal} sold` : live ? `${t.quantitySold} sold · unlimited` : 'Unlimited'}
                    {t.maxPerOrder !== 10 && ` · max ${t.maxPerOrder}/order`}
                    {t.salesStartAt && ` · on sale ${windowLabel(t.salesStartAt)}`}
                    {t.salesEndAt && ` · ends ${windowLabel(t.salesEndAt)}`}
                    {!t.isActive && ' · hidden'}
                    {t.description && ` · ${t.description}`}
                  </p>
                </div>
                <button type="button" onClick={() => openTierEditor(i)} className="shrink-0 font-mono text-[14px] opacity-50 hover:opacity-100 bg-transparent border-none cursor-pointer" title="Edit" style={{ color: 'var(--foreground)' }}>✎</button>
                {live && t.id && (
                  <button type="button" onClick={() => toggleTier(i)} className="shrink-0 font-mono text-[11px] underline cursor-pointer bg-transparent border-none" style={{ color: 'var(--foreground)' }}>
                    {t.isActive ? 'Hide' : 'Show'}
                  </button>
                )}
                <button type="button" onClick={() => removeTier(i)} className="shrink-0 font-mono text-[13px] opacity-50 hover:opacity-100 bg-transparent border-none cursor-pointer" title={t.quantitySold > 0 ? 'Close sales' : 'Delete'} style={{ color: ERR }}>✕</button>
              </div>
            ))}
          </div>
        )}

        {tierOpen ? (
          <div className="border rounded-lg p-3 space-y-2" style={{ borderColor: 'var(--accent)', backgroundColor: 'var(--surface-hover)' }}>
            <input value={tName} onChange={(e) => setTName(e.target.value)} placeholder="Tier name (e.g. General Admission)" className={inputCls} />
            <input value={tDesc} onChange={(e) => setTDesc(e.target.value)} placeholder="Description (optional)" className={inputCls} />
            <div className="grid grid-cols-3 gap-2">
              <input value={tPrice} onChange={(e) => setTPrice(e.target.value)} inputMode="decimal" placeholder="Price USD" className={inputCls} />
              <input value={tQty} onChange={(e) => setTQty(e.target.value)} inputMode="numeric" placeholder="Qty (∞)" className={inputCls} />
              <input value={tMax} onChange={(e) => setTMax(e.target.value)} inputMode="numeric" placeholder="Max/order" className={inputCls} />
            </div>
            {/* Sale window — both optional. A future start shows the tier as
                "on sale <date>"; a passed end keeps it listed, crossed out. */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block font-mono text-[10px] uppercase tracking-[2px] opacity-40 mb-1">Goes on sale{TZ_LABEL && ` · ${TZ_LABEL}`}</label>
                <input type="datetime-local" value={tStart} onChange={(e) => setTStart(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className="block font-mono text-[10px] uppercase tracking-[2px] opacity-40 mb-1">Sales end{TZ_LABEL && ` · ${TZ_LABEL}`}</label>
                <input type="datetime-local" value={tEnd} onChange={(e) => setTEnd(e.target.value)} className={inputCls} />
              </div>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={addTier} disabled={busy} className="flex-1 px-4 py-2 font-mono text-[11px] uppercase tracking-[2px] rounded-lg cursor-pointer border-none font-bold disabled:opacity-40" style={{ backgroundColor: 'var(--foreground)', color: 'var(--background)' }}>
                {busy ? 'Saving…' : editTierIdx != null ? 'Save changes' : live ? 'Save tier' : 'Add tier'}
              </button>
              <button type="button" onClick={resetTierForm} className="px-4 py-2 font-mono text-[11px] uppercase tracking-[2px] rounded-lg cursor-pointer border bg-transparent" style={{ color: 'var(--foreground)', borderColor: 'var(--border-color)' }}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => { setEditTierIdx(null); setTierOpen(true); setPromoOpen(false); setError(''); }} className={dashedBtnCls} style={{ borderColor: 'var(--border-color)', color: 'var(--foreground)' }}>
            + Add ticket tier
          </button>
        )}
      </div>

      {/* ── Promo codes ── */}
      <div>
        <label className={labelCls}>Promo codes</label>

        {data.promos.length === 0 && !promoOpen && (
          <p className="font-mono text-[11px] opacity-40 mb-2" style={{ color: 'var(--foreground)' }}>
            Optional discount codes, e.g. EARLYBIRD for 20% off. Codes can be limited to a tier, capped in uses, or given an expiry.
          </p>
        )}

        {data.promos.length > 0 && (
          <div className="space-y-2 mb-2">
            {data.promos.map((p, i) => (
              <div key={p.id ?? i} className="flex items-center gap-3 border rounded-lg px-3 py-2.5" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--surface-hover)', opacity: p.isActive ? 1 : 0.5 }}>
                <div className="flex-1 min-w-0">
                  <p className="font-mono text-[13px] font-bold truncate" style={{ color: 'var(--foreground)' }}>
                    {p.code} · {describeDiscount(p)}
                  </p>
                  <p className="font-mono text-[11px] opacity-40 truncate" style={{ color: 'var(--foreground)' }}>
                    {tierLabel(p) ?? 'Any tier'}
                    {p.maxRedemptions != null
                      ? ` · ${live ? `${p.redemptionCount}/${p.maxRedemptions} used` : `${p.maxRedemptions} uses`}`
                      : live && p.redemptionCount > 0 ? ` · ${p.redemptionCount} used` : ''}
                    {p.expiresAt && ` · expires ${p.expiresAt}`}
                    {!p.isActive && ' · disabled'}
                  </p>
                </div>
                {live && p.id && (
                  <button type="button" onClick={() => togglePromo(i)} className="shrink-0 font-mono text-[11px] underline cursor-pointer bg-transparent border-none" style={{ color: 'var(--foreground)' }}>
                    {p.isActive ? 'Disable' : 'Enable'}
                  </button>
                )}
                <button type="button" onClick={() => removePromo(i)} className="shrink-0 font-mono text-[13px] opacity-50 hover:opacity-100 bg-transparent border-none cursor-pointer" title={p.redemptionCount > 0 ? 'Disable' : 'Delete'} style={{ color: ERR }}>✕</button>
              </div>
            ))}
          </div>
        )}

        {promoOpen ? (
          <div className="border rounded-lg p-3 space-y-2" style={{ borderColor: 'var(--accent)', backgroundColor: 'var(--surface-hover)' }}>
            <input value={pCode} onChange={(e) => setPCode(e.target.value.toUpperCase())} placeholder="Code (e.g. EARLYBIRD)" className={`${inputCls} uppercase`} />
            <div className="grid grid-cols-2 gap-2">
              <select value={pType} onChange={(e) => setPType(e.target.value as 'percent' | 'fixed')} className={`${inputCls} cursor-pointer`}>
                <option value="percent">% off</option>
                <option value="fixed">$ off</option>
              </select>
              <input value={pValue} onChange={(e) => setPValue(e.target.value)} inputMode="decimal" placeholder={pType === 'percent' ? 'Percent (e.g. 20)' : 'Amount (e.g. 10)'} className={inputCls} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <select value={pTier} onChange={(e) => setPTier(e.target.value)} className={`${inputCls} cursor-pointer`}>
                <option value="">Any tier</option>
                {data.tiers.map((t, i) => (
                  <option key={t.id ?? i} value={live ? (t.id ?? '') : String(i)}>{t.name}</option>
                ))}
              </select>
              <input value={pMax} onChange={(e) => setPMax(e.target.value)} inputMode="numeric" placeholder="Max uses (∞)" className={inputCls} />
            </div>
            <div>
              <label className="block font-mono text-[10px] uppercase tracking-[2px] opacity-40 mb-1">Expires (optional)</label>
              <input type="date" value={pExpires} onChange={(e) => setPExpires(e.target.value)} className={inputCls} />
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={addPromo} disabled={busy} className="flex-1 px-4 py-2 font-mono text-[11px] uppercase tracking-[2px] rounded-lg cursor-pointer border-none font-bold disabled:opacity-40" style={{ backgroundColor: 'var(--foreground)', color: 'var(--background)' }}>
                {busy ? 'Saving…' : live ? 'Save code' : 'Add code'}
              </button>
              <button type="button" onClick={resetPromoForm} className="px-4 py-2 font-mono text-[11px] uppercase tracking-[2px] rounded-lg cursor-pointer border bg-transparent" style={{ color: 'var(--foreground)', borderColor: 'var(--border-color)' }}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => { setPromoOpen(true); setTierOpen(false); setError(''); }} className={dashedBtnCls} style={{ borderColor: 'var(--border-color)', color: 'var(--foreground)' }}>
            + Add promo code
          </button>
        )}
      </div>

      {error && <p className="font-mono text-[11px]" style={{ color: ERR }}>{error}</p>}

      <p className="font-mono text-[10px] opacity-30" style={{ color: 'var(--foreground)' }}>
        Card payments are processed by Stripe. Buyers get a QR-coded ticket for door check-in; sold tiers can be hidden but not deleted.
      </p>
    </div>
  );
}
