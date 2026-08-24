'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { isRealPhoto } from '../../lib/avatar';
import { uploadToBlob } from '../../lib/uploadImage';
import ConfirmDialog from '../components/ConfirmDialog';
import { AdminAuthProvider, useAdminAuth } from './_components/AdminAuthContext';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SocialLinks {
  website?: string;
  twitter?: string;
  instagram?: string;
  soundcloud?: string;
  spotify?: string;
  linkedin?: string;
  substack?: string;
}

interface World {
  id: string;
  title: string;
  slug: string;
  shortDescription: string | null;
  description: string | null;
  category: string | null;
  imageUrl: string | null;
  country: string | null;
  tools: string | null;
  collaborators: string | null;
  socialLinks: SocialLinks | null;
  dateAdded: string | null;
  creatorId: string | null;
  published: boolean;
  creatorName: string | null;
}

interface Event {
  id: string;
  eventName: string;
  slug: string;
  date: string | null;
  startTime: string | null;
  city: string | null;
  link: string | null;
  imageUrl: string | null;
  published: boolean;
}

interface Grant {
  id: string;
  grantName: string;
  slug: string;
  shortDescription: string | null;
  amountMin: number | null;
  amountMax: number | null;
  currency: string | null;
  tags: string | null;
  eligibility: string | null;
  deadlineType: string | null;
  deadlineDate: string | null;
  link: string | null;
  region: string | null;
  category: string | null;
  frequency: string | null;
  orgName: string | null;
  status: string | null;
  notes: string | null;
  source: string | null;
  published: boolean;
}

interface Tool {
  id: string;
  name: string;
  slug: string;
  category: string | null;
  description: string | null;
  pricing: string | null;
  url: string | null;
  featured: boolean;
  priority: number | null;
  easeOfUse: string | null;
  published: boolean;
}

interface WorldMember {
  userId: string;
  role: string;
  userName: string | null;
  userUsername: string | null;
}

interface WorldWithMembers extends World {
  displayOrder: number | null;
  members: WorldMember[];
}

interface UserRow {
  id: string;
  name: string | null;
  username: string | null;
  email: string | null;
  bio: string | null;
  avatarUrl: string | null;
  role: string | null;
  roleTags: string | null;
  toolSlugs: string | null;
  socialWebsite: string | null;
  socialTwitter: string | null;
  socialInstagram: string | null;
  socialSoundcloud: string | null;
  socialSpotify: string | null;
  socialLinkedin: string | null;
  socialSubstack: string | null;
  published: boolean;
  createdAt?: string;
  feedbackRef?: string; // opaque ref shown on feedback issues (server-computed)
  worldMemberships: { worldId: string; role: string; worldTitle: string; worldSlug: string }[];
  features?: string[]; // phased-rollout grants, e.g. ['funding']
}

type Tab = 'worlds' | 'users' | 'creators' | 'events' | 'grants' | 'tools' | 'catalysts' | 'tv' | 'projects' | 'links' | 'emails' | 'broadcast' | 'newsletter';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

// Build a CSV from a header + rows and trigger a client-side download. Every
// cell is quote-escaped so commas/quotes/newlines in the data stay intact.
function downloadCsv(filename: string, header: string[], rows: (string | number | null | undefined)[][]) {
  const csv = [header, ...rows]
    .map((row) => row.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Shared UI ────────────────────────────────────────────────────────────────

// One-click publish/unpublish. Renders like the Badge but toggles on click via
// the generic /api/admin/publish endpoint, then asks the parent tab to reload.
function PublishToggle({ type, id, published, onChange }: { type: string; id: string; published: boolean; onChange: () => void }) {
  const { adminFetch } = useAdminAuth();
  const [busy, setBusy] = useState(false);
  const toggle = async () => {
    setBusy(true);
    try {
      const res = await adminFetch('/api/admin/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, id, published: !published }),
      });
      if (res.ok) onChange();
    } finally {
      setBusy(false);
    }
  };
  return (
    <button
      onClick={toggle}
      disabled={busy}
      title={published ? 'Published — click to unpublish' : 'Hidden — click to publish'}
      className="font-mono text-[12px] px-2 py-0.5 border hover:opacity-70 disabled:opacity-40 cursor-pointer"
      style={{ backgroundColor: published ? '#00FF88' : '#FF5C34', color: '#1a1a1a', borderColor: '#1a1a1a' }}
    >
      {busy ? '…' : published ? 'PUB' : 'DRAFT'}
    </button>
  );
}

function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto py-12 px-4">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-2xl border border-[#1a1a1a] shadow-lg" style={{ backgroundColor: '#f5f0e8' }}>
        <div className="flex items-center justify-between border-b border-[#1a1a1a] px-5 py-3">
          <h2 className="font-mono text-[13px] font-bold uppercase" style={{ color: '#1a1a1a' }}>{title}</h2>
          <button onClick={onClose} className="font-mono text-[18px] leading-none hover:opacity-60" style={{ color: '#1a1a1a' }}>×</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <label className="block font-mono text-[12px] uppercase tracking-widest mb-1" style={{ color: '#1a1a1a' }}>{label}</label>
      {children}
    </div>
  );
}

const inputCls = 'w-full border border-[#1a1a1a] px-3 py-1.5 font-mono text-[12px] outline-none focus:ring-2 focus:ring-[#1a1a1a]';
const inputStyle: React.CSSProperties = { backgroundColor: '#f5f0e8', color: '#1a1a1a' };

function TextInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return <input type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={inputCls} style={inputStyle} />;
}

function TextArea({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={3} className={`${inputCls} resize-none`} style={inputStyle} />;
}

function CheckboxField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <Field label={label}>
      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="w-4 h-4" style={{ accentColor: '#1a1a1a' }} />
        <span className="font-mono text-[13px]" style={{ color: '#1a1a1a' }}>{checked ? 'Yes' : 'No'}</span>
      </label>
    </Field>
  );
}

function ActionButtons({ onSave, onCancel, saving, error }: { onSave: () => void; onCancel: () => void; saving: boolean; error?: string }) {
  return (
    <div className="mt-5 pt-4 border-t border-[#1a1a1a]">
      {error && <p className="font-mono text-[12px] mb-2" style={{ color: '#FF5C34' }}>{error}</p>}
      <div className="flex gap-2">
        <button onClick={onSave} disabled={saving} className="px-4 py-1.5 font-mono text-[13px] uppercase border border-[#1a1a1a] disabled:opacity-50" style={{ backgroundColor: '#1a1a1a', color: '#f5f0e8' }}>
          {saving ? 'SAVING...' : 'SAVE'}
        </button>
        <button onClick={onCancel} className="px-4 py-1.5 font-mono text-[13px] uppercase border border-[#1a1a1a] hover:bg-[#1a1a1a]/5" style={{ color: '#1a1a1a' }}>
          CANCEL
        </button>
      </div>
    </div>
  );
}

// ─── Worlds Tab ───────────────────────────────────────────────────────────────

interface Creator {
  id: string;
  name: string;
  slug: string;
}

function WorldsTab() {
  const { adminFetch } = useAdminAuth();
  const [items, setItems] = useState<WorldWithMembers[]>([]);
  const [modal, setModal] = useState<{ open: boolean; item: WorldWithMembers | null }>({ open: false, item: null });
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Omit<World, 'creatorName'> & { id: string; displayOrder: number; worldBuilderIds: string[]; collaboratorIds: string[] }>({
    id: '', title: '', slug: '', shortDescription: '', description: '', category: '', imageUrl: '',
    country: '', tools: '', collaborators: '', socialLinks: null, dateAdded: '', creatorId: '', published: true,
    displayOrder: 0, worldBuilderIds: [], collaboratorIds: [],
  });
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [creators, setCreators] = useState<Creator[]>([]);
  const [allTools, setAllTools] = useState<Tool[]>([]);
  const [allUsers, setAllUsers] = useState<{ id: string; name: string | null; username: string | null }[]>([]);

  const load = useCallback(async () => {
    const res = await adminFetch('/api/admin/worlds');
    const data = await res.json();
    setItems(data.worlds || []);
  }, [adminFetch]);

  useEffect(() => {
    load();
    adminFetch('/api/admin/creators').then(r => r.json()).then(d => setCreators(d.creators || []));
    adminFetch('/api/admin/tools').then(r => r.json()).then(d => setAllTools(d.tools || []));
    adminFetch('/api/admin/users').then(r => r.json()).then(d => setAllUsers((d.users || []).map((u: UserRow) => ({ id: u.id, name: u.name, username: u.username }))));
  }, [load]);

  const openCreate = () => {
    setError('');
    setForm({ id: '', title: '', slug: '', shortDescription: '', description: '', category: '', imageUrl: '', country: '', tools: '', collaborators: '', socialLinks: null, dateAdded: '', creatorId: '', published: true, displayOrder: 0, worldBuilderIds: [], collaboratorIds: [] });
    setModal({ open: true, item: null });
  };

  const openEdit = (item: WorldWithMembers) => {
    setError('');
    const builders = item.members.filter(m => m.role === 'world_builder').map(m => m.userId);
    const collabs = item.members.filter(m => m.role === 'collaborator').map(m => m.userId);
    setForm({ ...item, shortDescription: item.shortDescription || '', description: item.description || '', category: item.category || '', imageUrl: item.imageUrl || '', country: item.country || '', tools: item.tools || '', collaborators: item.collaborators || '', socialLinks: item.socialLinks || null, dateAdded: item.dateAdded || '', creatorId: item.creatorId || '', displayOrder: item.displayOrder ?? 0, worldBuilderIds: builders, collaboratorIds: collabs });
    setModal({ open: true, item });
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Upload to Blob and store the URL (was an inline base64 data URL).
    try {
      const url = await uploadToBlob(file);
      setForm(p => ({ ...p, imageUrl: url }));
    } catch {
      setError('Image upload failed');
    }
  };

  const selectedTools = (form.tools || '').split(',').map(t => t.trim()).filter(Boolean);

  const toggleTool = (toolName: string) => {
    setForm(p => {
      const current = (p.tools || '').split(',').map(t => t.trim()).filter(Boolean);
      const next = current.includes(toolName)
        ? current.filter(t => t !== toolName)
        : [...current, toolName];
      return { ...p, tools: next.join(', ') };
    });
  };

  const toggleWorldBuilder = (userId: string) => {
    setForm(p => {
      const next = p.worldBuilderIds.includes(userId)
        ? p.worldBuilderIds.filter(id => id !== userId)
        : [...p.worldBuilderIds, userId];
      return { ...p, worldBuilderIds: next };
    });
  };

  const toggleCollaborator = (userId: string) => {
    setForm(p => {
      const next = p.collaboratorIds.includes(userId)
        ? p.collaboratorIds.filter(id => id !== userId)
        : [...p.collaboratorIds, userId];
      return { ...p, collaboratorIds: next };
    });
  };

  const save = async () => {
    setSaving(true);
    setError('');
    const payload = {
      ...form,
      slug: form.slug || generateSlug(form.title),
      creatorId: form.creatorId || null,
      socialLinks: form.socialLinks || null,
      worldBuilderIds: form.worldBuilderIds,
      collaboratorIds: form.collaboratorIds,
    };
    const method = modal.item ? 'PUT' : 'POST';
    const res = await adminFetch('/api/admin/worlds', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || 'Save failed');
      setSaving(false);
      return;
    }
    setSaving(false);
    setModal({ open: false, item: null });
    load();
  };

  const remove = async (id: string) => {
    const res = await adminFetch('/api/admin/worlds', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
    if (!res.ok) { setError('Delete failed'); return; }
    setDeleteConfirm(null);
    load();
  };

  const moveBuilder = (index: number, direction: 'up' | 'down') => {
    setForm(p => {
      const ids = [...p.worldBuilderIds];
      const swapIndex = direction === 'up' ? index - 1 : index + 1;
      if (swapIndex < 0 || swapIndex >= ids.length) return p;
      [ids[index], ids[swapIndex]] = [ids[swapIndex], ids[index]];
      return { ...p, worldBuilderIds: ids };
    });
  };

  const getSocialLink = (key: string) => (form.socialLinks as SocialLinks)?.[key as keyof SocialLinks] || '';
  const setSocialLink = (key: string, value: string) => {
    setForm(p => ({
      ...p,
      socialLinks: { ...(p.socialLinks as SocialLinks || {}), [key]: value } as SocialLinks,
    }));
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <span className="font-mono text-[13px]" style={{ color: '#1a1a1a' }}>{items.length} worlds</span>
        <button onClick={openCreate} className="px-3 py-1 font-mono text-[13px] border border-[#1a1a1a]" style={{ backgroundColor: '#1a1a1a', color: '#f5f0e8' }}>+ ADD</button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse font-mono text-[13px]" style={{ color: '#1a1a1a' }}>
          <thead>
            <tr style={{ backgroundColor: '#1a1a1a', color: '#f5f0e8' }}>
              <th className="text-left px-3 py-2 font-bold uppercase text-[12px]">Title</th>
              <th className="text-left px-3 py-2 font-bold uppercase text-[12px]">World Builder(s)</th>
              <th className="text-left px-3 py-2 font-bold uppercase text-[12px]">Category</th>
              <th className="text-left px-3 py-2 font-bold uppercase text-[12px]">Status</th>
              <th className="px-3 py-2 text-[12px]"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => {
              const builders = item.members.filter(m => m.role === 'world_builder');
              return (
                <tr key={item.id} style={{ backgroundColor: i % 2 === 0 ? '#f5f0e8' : '#ebe6de', borderBottom: '1px solid #1a1a1a' }}>
                  <td className="px-3 py-2 font-bold">{item.title}</td>
                  <td className="px-3 py-2">{builders.length > 0 ? builders.map(b => b.userName || b.userUsername).join(', ') : item.creatorName || '—'}</td>
                  <td className="px-3 py-2">{item.category || '—'}</td>
                  <td className="px-3 py-2"><PublishToggle type="worlds" id={item.id} published={item.published} onChange={load} /></td>
                  <td className="px-3 py-2">
                    <div className="flex gap-2">
                      <button onClick={() => openEdit(item)} className="font-mono text-[12px] underline hover:opacity-60">EDIT</button>
                      {deleteConfirm === item.id ? (
                        <span className="flex gap-1">
                          <button onClick={() => remove(item.id)} className="font-mono text-[12px] underline" style={{ color: '#FF5C34' }}>CONFIRM</button>
                          <button onClick={() => setDeleteConfirm(null)} className="font-mono text-[12px] underline hover:opacity-60">NO</button>
                        </span>
                      ) : (
                        <button onClick={() => setDeleteConfirm(item.id)} className="font-mono text-[12px] underline hover:opacity-60" style={{ color: '#FF5C34' }}>DEL</button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Modal open={modal.open} onClose={() => setModal({ open: false, item: null })} title={modal.item ? 'Edit World' : 'New World'}>
        <Field label="Title"><TextInput value={form.title} onChange={(v) => setForm(p => ({ ...p, title: v, slug: p.slug || generateSlug(v) }))} /></Field>
        <Field label="Slug"><TextInput value={form.slug} onChange={(v) => setForm(p => ({ ...p, slug: v }))} /></Field>
        <Field label="Short Description"><TextInput value={form.shortDescription || ''} onChange={(v) => setForm(p => ({ ...p, shortDescription: v }))} placeholder="Brief one-line description" /></Field>
        <Field label="Long Description"><TextArea value={form.description || ''} onChange={(v) => setForm(p => ({ ...p, description: v }))} /></Field>
        <Field label="Category"><TextInput value={form.category || ''} onChange={(v) => setForm(p => ({ ...p, category: v }))} /></Field>

        <Field label="Image">
          <div className="flex items-center gap-3">
            <label className="px-3 py-1.5 border border-[#1a1a1a] font-mono text-[13px] cursor-pointer hover:opacity-70" style={{ backgroundColor: '#1a1a1a', color: '#f5f0e8' }}>
              UPLOAD
              <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
            </label>
            {form.imageUrl && (
              <div className="flex items-center gap-2">
                <img src={form.imageUrl} alt="preview" className="w-10 h-10 object-cover border border-[#1a1a1a]" />
                <button onClick={() => setForm(p => ({ ...p, imageUrl: '' }))} className="font-mono text-[12px] underline hover:opacity-60" style={{ color: '#FF5C34' }}>REMOVE</button>
              </div>
            )}
          </div>
          {!form.imageUrl && (
            <p className="font-mono text-[12px] mt-1.5 opacity-50" style={{ color: '#1a1a1a' }}>Or paste a URL:</p>
          )}
          {!form.imageUrl && <TextInput value={form.imageUrl || ''} onChange={(v) => setForm(p => ({ ...p, imageUrl: v }))} placeholder="https://..." />}
        </Field>

        <Field label="Country"><TextInput value={form.country || ''} onChange={(v) => setForm(p => ({ ...p, country: v }))} placeholder="e.g. US" /></Field>

        <Field label="World Builder(s)">
          <div className="border border-[#1a1a1a] p-2 max-h-36 overflow-y-auto" style={{ backgroundColor: '#f5f0e8' }}>
            {allUsers.length === 0 && <p className="font-mono text-[12px] opacity-50" style={{ color: '#1a1a1a' }}>No users yet</p>}
            {allUsers.map(u => (
              <label key={u.id} className="flex items-center gap-2 py-0.5 cursor-pointer">
                <input type="checkbox" checked={form.worldBuilderIds.includes(u.id)} onChange={() => toggleWorldBuilder(u.id)} className="w-3.5 h-3.5" style={{ accentColor: '#1a1a1a' }} />
                <span className="font-mono text-[13px]" style={{ color: '#1a1a1a' }}>{u.name || u.username || 'Unnamed'}{u.username ? ` (@${u.username})` : ''}</span>
              </label>
            ))}
          </div>
          {form.worldBuilderIds.length > 1 && (
            <div className="mt-2 border border-[#1a1a1a] p-2" style={{ backgroundColor: '#ebe6de' }}>
              <p className="font-mono text-[13px] uppercase tracking-widest mb-1 opacity-60" style={{ color: '#1a1a1a' }}>Display Order</p>
              {form.worldBuilderIds.map((uid, idx) => {
                const u = allUsers.find(u => u.id === uid);
                return (
                  <div key={uid} className="flex items-center gap-2 py-0.5">
                    <button onClick={() => moveBuilder(idx, 'up')} disabled={idx === 0} className="text-[12px] leading-none hover:opacity-60 disabled:opacity-20" style={{ color: '#1a1a1a' }}>&#x25B2;</button>
                    <button onClick={() => moveBuilder(idx, 'down')} disabled={idx === form.worldBuilderIds.length - 1} className="text-[12px] leading-none hover:opacity-60 disabled:opacity-20" style={{ color: '#1a1a1a' }}>&#x25BC;</button>
                    <span className="font-mono text-[12px]" style={{ color: '#1a1a1a' }}>{u?.name || u?.username || 'Unknown'}</span>
                  </div>
                );
              })}
            </div>
          )}
        </Field>

        <Field label="Built By (Legacy Creator)">
          <select value={form.creatorId || ''} onChange={(e) => setForm(p => ({ ...p, creatorId: e.target.value }))} className={inputCls} style={inputStyle}>
            <option value="">— None —</option>
            {creators.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </Field>

        <Field label="Tools Used">
          <div className="border border-[#1a1a1a] p-2 max-h-36 overflow-y-auto" style={{ backgroundColor: '#f5f0e8' }}>
            {allTools.length === 0 && <p className="font-mono text-[12px] opacity-50" style={{ color: '#1a1a1a' }}>No tools in DB yet</p>}
            {allTools.map(t => (
              <label key={t.id} className="flex items-center gap-2 py-0.5 cursor-pointer">
                <input type="checkbox" checked={selectedTools.includes(t.name)} onChange={() => toggleTool(t.name)} className="w-3.5 h-3.5" style={{ accentColor: '#1a1a1a' }} />
                <span className="font-mono text-[13px]" style={{ color: '#1a1a1a' }}>{t.name}</span>
              </label>
            ))}
          </div>
        </Field>

        <Field label="Collaborators (Users)">
          <div className="border border-[#1a1a1a] p-2 max-h-36 overflow-y-auto" style={{ backgroundColor: '#f5f0e8' }}>
            {allUsers.length === 0 && <p className="font-mono text-[12px] opacity-50" style={{ color: '#1a1a1a' }}>No users yet</p>}
            {allUsers.filter(u => !form.worldBuilderIds.includes(u.id)).map(u => (
              <label key={u.id} className="flex items-center gap-2 py-0.5 cursor-pointer">
                <input type="checkbox" checked={form.collaboratorIds.includes(u.id)} onChange={() => toggleCollaborator(u.id)} className="w-3.5 h-3.5" style={{ accentColor: '#1a1a1a' }} />
                <span className="font-mono text-[13px]" style={{ color: '#1a1a1a' }}>{u.name || u.username || 'Unnamed'}{u.username ? ` (@${u.username})` : ''}</span>
              </label>
            ))}
          </div>
        </Field>
        <Field label="Collaborators (Legacy Text)"><TextInput value={form.collaborators || ''} onChange={(v) => setForm(p => ({ ...p, collaborators: v }))} placeholder="Comma-separated names for non-user collaborators" /></Field>

        <Field label="Social Links">
          <div className="space-y-1.5">
            <TextInput value={getSocialLink('website')} onChange={(v) => setSocialLink('website', v)} placeholder="Website URL" />
            <TextInput value={getSocialLink('twitter')} onChange={(v) => setSocialLink('twitter', v)} placeholder="Twitter/X URL" />
            <TextInput value={getSocialLink('instagram')} onChange={(v) => setSocialLink('instagram', v)} placeholder="Instagram URL" />
            <TextInput value={getSocialLink('spotify')} onChange={(v) => setSocialLink('spotify', v)} placeholder="Spotify URL" />
            <TextInput value={getSocialLink('soundcloud')} onChange={(v) => setSocialLink('soundcloud', v)} placeholder="SoundCloud URL" />
          </div>
        </Field>

        <Field label="Date Added"><TextInput value={form.dateAdded || ''} onChange={(v) => setForm(p => ({ ...p, dateAdded: v }))} placeholder="e.g. Feb 01, 2026" /></Field>
        <CheckboxField label="Published" checked={form.published} onChange={(v) => setForm(p => ({ ...p, published: v }))} />
        <ActionButtons onSave={save} onCancel={() => setModal({ open: false, item: null })} saving={saving} error={error} />
      </Modal>
    </div>
  );
}

// ─── Events Tab ───────────────────────────────────────────────────────────────

function EventsTab() {
  const { adminFetch } = useAdminAuth();
  const [items, setItems] = useState<Event[]>([]);
  const [modal, setModal] = useState<{ open: boolean; item: Event | null }>({ open: false, item: null });
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Event>({ id: '', eventName: '', slug: '', date: '', startTime: '', city: '', link: '', imageUrl: '', published: true });
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const res = await adminFetch('/api/admin/events');
    const data = await res.json();
    setItems(data.events || []);
  }, [adminFetch]);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setError('');
    setForm({ id: '', eventName: '', slug: '', date: '', startTime: '', city: '', link: '', imageUrl: '', published: true });
    setModal({ open: true, item: null });
  };

  const openEdit = (item: Event) => {
    setError('');
    setForm({ ...item, date: item.date || '', startTime: item.startTime || '', city: item.city || '', link: item.link || '', imageUrl: item.imageUrl || '' });
    setModal({ open: true, item });
  };

  const save = async () => {
    setSaving(true);
    setError('');
    const payload = { ...form, slug: form.slug || generateSlug(form.eventName) };
    const method = modal.item ? 'PUT' : 'POST';
    const res = await adminFetch('/api/admin/events', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const data = await res.json();
    if (!res.ok) { setError(data.error || 'Save failed'); setSaving(false); return; }
    setSaving(false);
    setModal({ open: false, item: null });
    load();
  };

  const remove = async (id: string) => {
    const res = await adminFetch('/api/admin/events', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
    if (!res.ok) { setError('Delete failed'); return; }
    setDeleteConfirm(null);
    load();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <span className="font-mono text-[13px]" style={{ color: '#1a1a1a' }}>{items.length} events</span>
        <button onClick={openCreate} className="px-3 py-1 font-mono text-[13px] border border-[#1a1a1a]" style={{ backgroundColor: '#1a1a1a', color: '#f5f0e8' }}>+ ADD</button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse font-mono text-[13px]" style={{ color: '#1a1a1a' }}>
          <thead>
            <tr style={{ backgroundColor: '#1a1a1a', color: '#f5f0e8' }}>
              <th className="text-left px-3 py-2 font-bold uppercase text-[12px]">Name</th>
              <th className="text-left px-3 py-2 font-bold uppercase text-[12px]">Date</th>
              <th className="text-left px-3 py-2 font-bold uppercase text-[12px]">City</th>
              <th className="text-left px-3 py-2 font-bold uppercase text-[12px]">Status</th>
              <th className="px-3 py-2 text-[12px]"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => (
              <tr key={item.id} style={{ backgroundColor: i % 2 === 0 ? '#f5f0e8' : '#ebe6de', borderBottom: '1px solid #1a1a1a' }}>
                <td className="px-3 py-2 font-bold">{item.eventName}</td>
                <td className="px-3 py-2">{item.date || '—'}</td>
                <td className="px-3 py-2">{item.city || '—'}</td>
                <td className="px-3 py-2"><PublishToggle type="events" id={item.id} published={item.published} onChange={load} /></td>
                <td className="px-3 py-2">
                  <div className="flex gap-2">
                    <button onClick={() => openEdit(item)} className="font-mono text-[12px] underline hover:opacity-60">EDIT</button>
                    {deleteConfirm === item.id ? (
                      <span className="flex gap-1">
                        <button onClick={() => remove(item.id)} className="font-mono text-[12px] underline" style={{ color: '#FF5C34' }}>CONFIRM</button>
                        <button onClick={() => setDeleteConfirm(null)} className="font-mono text-[12px] underline hover:opacity-60">NO</button>
                      </span>
                    ) : (
                      <button onClick={() => setDeleteConfirm(item.id)} className="font-mono text-[12px] underline hover:opacity-60" style={{ color: '#FF5C34' }}>DEL</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={modal.open} onClose={() => setModal({ open: false, item: null })} title={modal.item ? 'Edit Event' : 'New Event'}>
        <Field label="Event Name"><TextInput value={form.eventName} onChange={(v) => setForm(p => ({ ...p, eventName: v, slug: p.slug || generateSlug(v) }))} /></Field>
        <Field label="Slug"><TextInput value={form.slug} onChange={(v) => setForm(p => ({ ...p, slug: v }))} /></Field>
        <Field label="Date"><TextInput value={form.date || ''} onChange={(v) => setForm(p => ({ ...p, date: v }))} placeholder="e.g. 18-Jul-2025" /></Field>
        <Field label="Start Time"><TextInput value={form.startTime || ''} onChange={(v) => setForm(p => ({ ...p, startTime: v }))} placeholder="e.g. 9:00 PM" /></Field>
        <Field label="City"><TextInput value={form.city || ''} onChange={(v) => setForm(p => ({ ...p, city: v }))} /></Field>
        <Field label="Link"><TextInput value={form.link || ''} onChange={(v) => setForm(p => ({ ...p, link: v }))} /></Field>
        <Field label="Image URL"><TextInput value={form.imageUrl || ''} onChange={(v) => setForm(p => ({ ...p, imageUrl: v }))} /></Field>
        <CheckboxField label="Published" checked={form.published} onChange={(v) => setForm(p => ({ ...p, published: v }))} />
        <ActionButtons onSave={save} onCancel={() => setModal({ open: false, item: null })} saving={saving} error={error} />
      </Modal>
    </div>
  );
}

// ─── Grants Tab ───────────────────────────────────────────────────────────────

function GrantsTab() {
  const { adminFetch } = useAdminAuth();
  const [items, setItems] = useState<Grant[]>([]);
  const [modal, setModal] = useState<{ open: boolean; item: Grant | null }>({ open: false, item: null });
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Grant>({
    id: '', grantName: '', slug: '', shortDescription: '', amountMin: null, amountMax: null,
    currency: 'USD', tags: '', eligibility: '', deadlineType: '', deadlineDate: '', link: '',
    region: '', category: '', frequency: '', orgName: '', status: '', notes: '', source: '', published: true,
  });
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const res = await adminFetch('/api/admin/grants');
    const data = await res.json();
    setItems(data.grants || []);
  }, [adminFetch]);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setError('');
    setForm({ id: '', grantName: '', slug: '', shortDescription: '', amountMin: null, amountMax: null, currency: 'USD', tags: '', eligibility: '', deadlineType: '', deadlineDate: '', link: '', region: '', category: '', frequency: '', orgName: '', status: '', notes: '', source: '', published: true });
    setModal({ open: true, item: null });
  };

  const openEdit = (item: Grant) => {
    setError('');
    setForm({
      ...item,
      shortDescription: item.shortDescription || '', tags: item.tags || '', eligibility: item.eligibility || '',
      deadlineType: item.deadlineType || '', deadlineDate: item.deadlineDate || '', link: item.link || '',
      region: item.region || '', category: item.category || '', frequency: item.frequency || '',
      orgName: item.orgName || '', status: item.status || '', notes: item.notes || '', source: item.source || '',
      currency: item.currency || 'USD',
    });
    setModal({ open: true, item });
  };

  const save = async () => {
    setSaving(true);
    setError('');
    const payload = { ...form, slug: form.slug || generateSlug(form.grantName) };
    const method = modal.item ? 'PUT' : 'POST';
    const res = await adminFetch('/api/admin/grants', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const data = await res.json();
    if (!res.ok) { setError(data.error || 'Save failed'); setSaving(false); return; }
    setSaving(false);
    setModal({ open: false, item: null });
    load();
  };

  const remove = async (id: string) => {
    const res = await adminFetch('/api/admin/grants', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
    if (!res.ok) { setError('Delete failed'); return; }
    setDeleteConfirm(null);
    load();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <span className="font-mono text-[13px]" style={{ color: '#1a1a1a' }}>{items.length} grants</span>
        <button onClick={openCreate} className="px-3 py-1 font-mono text-[13px] border border-[#1a1a1a]" style={{ backgroundColor: '#1a1a1a', color: '#f5f0e8' }}>+ ADD</button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse font-mono text-[13px]" style={{ color: '#1a1a1a' }}>
          <thead>
            <tr style={{ backgroundColor: '#1a1a1a', color: '#f5f0e8' }}>
              <th className="text-left px-3 py-2 font-bold uppercase text-[12px]">Grant Name</th>
              <th className="text-left px-3 py-2 font-bold uppercase text-[12px]">Org</th>
              <th className="text-left px-3 py-2 font-bold uppercase text-[12px]">Amount</th>
              <th className="text-left px-3 py-2 font-bold uppercase text-[12px]">Status</th>
              <th className="text-left px-3 py-2 font-bold uppercase text-[12px]">Pub</th>
              <th className="px-3 py-2 text-[12px]"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => (
              <tr key={item.id} style={{ backgroundColor: i % 2 === 0 ? '#f5f0e8' : '#ebe6de', borderBottom: '1px solid #1a1a1a' }}>
                <td className="px-3 py-2 font-bold">{item.grantName}</td>
                <td className="px-3 py-2">{item.orgName || '—'}</td>
                <td className="px-3 py-2">
                  {item.amountMin != null || item.amountMax != null
                    ? `${item.amountMin != null ? '$' + item.amountMin.toLocaleString() : ''}${item.amountMin != null && item.amountMax != null ? '–' : ''}${item.amountMax != null ? '$' + item.amountMax.toLocaleString() : ''}`
                    : '—'}
                </td>
                <td className="px-3 py-2">{item.status || '—'}</td>
                <td className="px-3 py-2"><PublishToggle type="grants" id={item.id} published={item.published} onChange={load} /></td>
                <td className="px-3 py-2">
                  <div className="flex gap-2">
                    <button onClick={() => openEdit(item)} className="font-mono text-[12px] underline hover:opacity-60">EDIT</button>
                    {deleteConfirm === item.id ? (
                      <span className="flex gap-1">
                        <button onClick={() => remove(item.id)} className="font-mono text-[12px] underline" style={{ color: '#FF5C34' }}>CONFIRM</button>
                        <button onClick={() => setDeleteConfirm(null)} className="font-mono text-[12px] underline hover:opacity-60">NO</button>
                      </span>
                    ) : (
                      <button onClick={() => setDeleteConfirm(item.id)} className="font-mono text-[12px] underline hover:opacity-60" style={{ color: '#FF5C34' }}>DEL</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={modal.open} onClose={() => setModal({ open: false, item: null })} title={modal.item ? 'Edit Grant' : 'New Grant'}>
        <Field label="Grant Name"><TextInput value={form.grantName} onChange={(v) => setForm(p => ({ ...p, grantName: v, slug: p.slug || generateSlug(v) }))} /></Field>
        <Field label="Slug"><TextInput value={form.slug} onChange={(v) => setForm(p => ({ ...p, slug: v }))} /></Field>
        <Field label="Organization"><TextInput value={form.orgName || ''} onChange={(v) => setForm(p => ({ ...p, orgName: v }))} /></Field>
        <Field label="Short Description"><TextArea value={form.shortDescription || ''} onChange={(v) => setForm(p => ({ ...p, shortDescription: v }))} /></Field>
        <div className="flex gap-3">
          <div className="flex-1"><Field label="Amount Min ($)"><TextInput value={form.amountMin?.toString() || ''} onChange={(v) => setForm(p => ({ ...p, amountMin: v ? Number(v) : null }))} /></Field></div>
          <div className="flex-1"><Field label="Amount Max ($)"><TextInput value={form.amountMax?.toString() || ''} onChange={(v) => setForm(p => ({ ...p, amountMax: v ? Number(v) : null }))} /></Field></div>
        </div>
        <Field label="Tags (comma-separated)"><TextInput value={form.tags || ''} onChange={(v) => setForm(p => ({ ...p, tags: v }))} /></Field>
        <Field label="Category"><TextInput value={form.category || ''} onChange={(v) => setForm(p => ({ ...p, category: v }))} /></Field>
        <Field label="Region"><TextInput value={form.region || ''} onChange={(v) => setForm(p => ({ ...p, region: v }))} /></Field>
        <Field label="Deadline Type"><TextInput value={form.deadlineType || ''} onChange={(v) => setForm(p => ({ ...p, deadlineType: v }))} placeholder="Fixed, Rolling..." /></Field>
        <Field label="Deadline Date"><TextInput value={form.deadlineDate || ''} onChange={(v) => setForm(p => ({ ...p, deadlineDate: v }))} /></Field>
        <Field label="Frequency"><TextInput value={form.frequency || ''} onChange={(v) => setForm(p => ({ ...p, frequency: v }))} placeholder="Annual, One-time..." /></Field>
        <Field label="Status"><TextInput value={form.status || ''} onChange={(v) => setForm(p => ({ ...p, status: v }))} placeholder="Open, Closed..." /></Field>
        <Field label="Link"><TextInput value={form.link || ''} onChange={(v) => setForm(p => ({ ...p, link: v }))} /></Field>
        <Field label="Eligibility"><TextArea value={form.eligibility || ''} onChange={(v) => setForm(p => ({ ...p, eligibility: v }))} /></Field>
        <Field label="Notes"><TextArea value={form.notes || ''} onChange={(v) => setForm(p => ({ ...p, notes: v }))} /></Field>
        <Field label="Source"><TextInput value={form.source || ''} onChange={(v) => setForm(p => ({ ...p, source: v }))} /></Field>
        <CheckboxField label="Published" checked={form.published} onChange={(v) => setForm(p => ({ ...p, published: v }))} />
        <ActionButtons onSave={save} onCancel={() => setModal({ open: false, item: null })} saving={saving} error={error} />
      </Modal>
    </div>
  );
}

// ─── Tools Tab ────────────────────────────────────────────────────────────────

function ToolsTab() {
  const { adminFetch } = useAdminAuth();
  const [items, setItems] = useState<Tool[]>([]);
  const [modal, setModal] = useState<{ open: boolean; item: Tool | null }>({ open: false, item: null });
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Tool>({ id: '', name: '', slug: '', category: '', description: '', pricing: '', url: '', featured: false, priority: null, easeOfUse: '', published: true });
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const res = await adminFetch('/api/admin/tools');
    const data = await res.json();
    setItems(data.tools || []);
  }, [adminFetch]);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setError('');
    setForm({ id: '', name: '', slug: '', category: '', description: '', pricing: '', url: '', featured: false, priority: null, easeOfUse: '', published: true });
    setModal({ open: true, item: null });
  };

  const openEdit = (item: Tool) => {
    setError('');
    setForm({ ...item, category: item.category || '', description: item.description || '', pricing: item.pricing || '', url: item.url || '', easeOfUse: item.easeOfUse || '' });
    setModal({ open: true, item });
  };

  const save = async () => {
    setSaving(true);
    setError('');
    const payload = { ...form, slug: form.slug || generateSlug(form.name) };
    const method = modal.item ? 'PUT' : 'POST';
    const res = await adminFetch('/api/admin/tools', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const data = await res.json();
    if (!res.ok) { setError(data.error || 'Save failed'); setSaving(false); return; }
    setSaving(false);
    setModal({ open: false, item: null });
    load();
  };

  const remove = async (id: string) => {
    const res = await adminFetch('/api/admin/tools', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
    if (!res.ok) { setError('Delete failed'); return; }
    setDeleteConfirm(null);
    load();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <span className="font-mono text-[13px]" style={{ color: '#1a1a1a' }}>{items.length} tools</span>
        <button onClick={openCreate} className="px-3 py-1 font-mono text-[13px] border border-[#1a1a1a]" style={{ backgroundColor: '#1a1a1a', color: '#f5f0e8' }}>+ ADD</button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse font-mono text-[13px]" style={{ color: '#1a1a1a' }}>
          <thead>
            <tr style={{ backgroundColor: '#1a1a1a', color: '#f5f0e8' }}>
              <th className="text-left px-3 py-2 font-bold uppercase text-[12px]">Name</th>
              <th className="text-left px-3 py-2 font-bold uppercase text-[12px]">Category</th>
              <th className="text-left px-3 py-2 font-bold uppercase text-[12px]">Pricing</th>
              <th className="text-left px-3 py-2 font-bold uppercase text-[12px]">Featured</th>
              <th className="text-left px-3 py-2 font-bold uppercase text-[12px]">Status</th>
              <th className="px-3 py-2 text-[12px]"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => (
              <tr key={item.id} style={{ backgroundColor: i % 2 === 0 ? '#f5f0e8' : '#ebe6de', borderBottom: '1px solid #1a1a1a' }}>
                <td className="px-3 py-2 font-bold">{item.name}</td>
                <td className="px-3 py-2">{item.category || '—'}</td>
                <td className="px-3 py-2">{item.pricing || '—'}</td>
                <td className="px-3 py-2">{item.featured ? '★' : '—'}</td>
                <td className="px-3 py-2"><PublishToggle type="tools" id={item.id} published={item.published} onChange={load} /></td>
                <td className="px-3 py-2">
                  <div className="flex gap-2">
                    <button onClick={() => openEdit(item)} className="font-mono text-[12px] underline hover:opacity-60">EDIT</button>
                    {deleteConfirm === item.id ? (
                      <span className="flex gap-1">
                        <button onClick={() => remove(item.id)} className="font-mono text-[12px] underline" style={{ color: '#FF5C34' }}>CONFIRM</button>
                        <button onClick={() => setDeleteConfirm(null)} className="font-mono text-[12px] underline hover:opacity-60">NO</button>
                      </span>
                    ) : (
                      <button onClick={() => setDeleteConfirm(item.id)} className="font-mono text-[12px] underline hover:opacity-60" style={{ color: '#FF5C34' }}>DEL</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={modal.open} onClose={() => setModal({ open: false, item: null })} title={modal.item ? 'Edit Tool' : 'New Tool'}>
        <Field label="Name"><TextInput value={form.name} onChange={(v) => setForm(p => ({ ...p, name: v, slug: p.slug || generateSlug(v) }))} /></Field>
        <Field label="Slug"><TextInput value={form.slug} onChange={(v) => setForm(p => ({ ...p, slug: v }))} /></Field>
        <Field label="Category"><TextInput value={form.category || ''} onChange={(v) => setForm(p => ({ ...p, category: v }))} /></Field>
        <Field label="Description"><TextArea value={form.description || ''} onChange={(v) => setForm(p => ({ ...p, description: v }))} /></Field>
        <Field label="Pricing"><TextInput value={form.pricing || ''} onChange={(v) => setForm(p => ({ ...p, pricing: v }))} placeholder="Free, Paid, Freemium..." /></Field>
        <Field label="URL"><TextInput value={form.url || ''} onChange={(v) => setForm(p => ({ ...p, url: v }))} /></Field>
        <Field label="Ease of Use"><TextInput value={form.easeOfUse || ''} onChange={(v) => setForm(p => ({ ...p, easeOfUse: v }))} placeholder="Easy, Medium, Advanced..." /></Field>
        <Field label="Priority"><TextInput value={form.priority?.toString() || ''} onChange={(v) => setForm(p => ({ ...p, priority: v ? Number(v) : null }))} /></Field>
        <CheckboxField label="Featured" checked={form.featured} onChange={(v) => setForm(p => ({ ...p, featured: v }))} />
        <CheckboxField label="Published" checked={form.published} onChange={(v) => setForm(p => ({ ...p, published: v }))} />
        <ActionButtons onSave={save} onCancel={() => setModal({ open: false, item: null })} saving={saving} error={error} />
      </Modal>
    </div>
  );
}

// ─── Creators Tab ─────────────────────────────────────────────────────────────

interface CreatorRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  websiteUrl: string | null;
  country: string | null;
  userId: string | null;
  linkedUserName: string | null;
  linkedUserUsername: string | null;
  published: boolean;
}

function CreatorsTab() {
  const { adminFetch } = useAdminAuth();
  const [items, setItems] = useState<CreatorRow[]>([]);
  const [modal, setModal] = useState<{ open: boolean; item: CreatorRow | null }>({ open: false, item: null });
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Omit<CreatorRow, 'linkedUserName' | 'linkedUserUsername'>>({ id: '', name: '', slug: '', description: '', imageUrl: '', websiteUrl: '', country: '', userId: '', published: true });
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [allUsers, setAllUsers] = useState<{ id: string; name: string | null; username: string | null }[]>([]);

  const load = useCallback(async () => {
    const res = await adminFetch('/api/admin/creators');
    const data = await res.json();
    setItems(data.creators || []);
  }, [adminFetch]);

  useEffect(() => {
    load();
    adminFetch('/api/admin/users').then(r => r.json()).then(d => setAllUsers((d.users || []).map((u: UserRow) => ({ id: u.id, name: u.name, username: u.username }))));
  }, [load]);

  const openCreate = () => {
    setError('');
    setForm({ id: '', name: '', slug: '', description: '', imageUrl: '', websiteUrl: '', country: '', userId: '', published: true });
    setModal({ open: true, item: null });
  };

  const openEdit = (item: CreatorRow) => {
    setError('');
    setForm({ ...item, description: item.description || '', imageUrl: item.imageUrl || '', websiteUrl: item.websiteUrl || '', country: item.country || '', userId: item.userId || '' });
    setModal({ open: true, item });
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Upload to Blob and store the URL (was an inline base64 data URL).
    try {
      const url = await uploadToBlob(file);
      setForm(p => ({ ...p, imageUrl: url }));
    } catch {
      setError('Image upload failed');
    }
  };

  const save = async () => {
    setSaving(true);
    setError('');
    const payload = { ...form, slug: form.slug || generateSlug(form.name) };
    const method = modal.item ? 'PUT' : 'POST';
    const res = await adminFetch('/api/admin/creators', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const data = await res.json();
    if (!res.ok) { setError(data.error || 'Save failed'); setSaving(false); return; }
    setSaving(false);
    setModal({ open: false, item: null });
    load();
  };

  const remove = async (id: string) => {
    const res = await adminFetch('/api/admin/creators', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
    if (!res.ok) { setError('Delete failed'); return; }
    setDeleteConfirm(null);
    load();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <span className="font-mono text-[13px]" style={{ color: '#1a1a1a' }}>{items.length} creators</span>
        <button onClick={openCreate} className="px-3 py-1 font-mono text-[13px] border border-[#1a1a1a]" style={{ backgroundColor: '#1a1a1a', color: '#f5f0e8' }}>+ ADD</button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse font-mono text-[13px]" style={{ color: '#1a1a1a' }}>
          <thead>
            <tr style={{ backgroundColor: '#1a1a1a', color: '#f5f0e8' }}>
              <th className="text-left px-3 py-2 font-bold uppercase text-[12px]">Name</th>
              <th className="text-left px-3 py-2 font-bold uppercase text-[12px]">Slug</th>
              <th className="text-left px-3 py-2 font-bold uppercase text-[12px]">Linked Profile</th>
              <th className="text-left px-3 py-2 font-bold uppercase text-[12px]">Country</th>
              <th className="text-left px-3 py-2 font-bold uppercase text-[12px]">Status</th>
              <th className="px-3 py-2 text-[12px]"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => (
              <tr key={item.id} style={{ backgroundColor: i % 2 === 0 ? '#f5f0e8' : '#ebe6de', borderBottom: '1px solid #1a1a1a' }}>
                <td className="px-3 py-2 font-bold">{item.name}</td>
                <td className="px-3 py-2 opacity-60">{item.slug}</td>
                <td className="px-3 py-2">{item.linkedUserUsername ? `@${item.linkedUserUsername}` : item.linkedUserName || '—'}</td>
                <td className="px-3 py-2">{item.country || '—'}</td>
                <td className="px-3 py-2"><PublishToggle type="creators" id={item.id} published={item.published} onChange={load} /></td>
                <td className="px-3 py-2">
                  <div className="flex gap-2">
                    <button onClick={() => openEdit(item)} className="font-mono text-[12px] underline hover:opacity-60">EDIT</button>
                    {deleteConfirm === item.id ? (
                      <span className="flex gap-1">
                        <button onClick={() => remove(item.id)} className="font-mono text-[12px] underline" style={{ color: '#FF5C34' }}>CONFIRM</button>
                        <button onClick={() => setDeleteConfirm(null)} className="font-mono text-[12px] underline hover:opacity-60">NO</button>
                      </span>
                    ) : (
                      <button onClick={() => setDeleteConfirm(item.id)} className="font-mono text-[12px] underline hover:opacity-60" style={{ color: '#FF5C34' }}>DEL</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={modal.open} onClose={() => setModal({ open: false, item: null })} title={modal.item ? 'Edit Creator' : 'New Creator'}>
        <Field label="Name"><TextInput value={form.name} onChange={(v) => setForm(p => ({ ...p, name: v, slug: p.slug || generateSlug(v) }))} /></Field>
        <Field label="Slug"><TextInput value={form.slug} onChange={(v) => setForm(p => ({ ...p, slug: v }))} /></Field>
        <Field label="Description"><TextArea value={form.description || ''} onChange={(v) => setForm(p => ({ ...p, description: v }))} /></Field>
        <Field label="Country"><TextInput value={form.country || ''} onChange={(v) => setForm(p => ({ ...p, country: v }))} placeholder="e.g. US, SE, DE" /></Field>
        <Field label="Website URL"><TextInput value={form.websiteUrl || ''} onChange={(v) => setForm(p => ({ ...p, websiteUrl: v }))} /></Field>

        <Field label="Image">
          <div className="flex items-center gap-3">
            <label className="px-3 py-1.5 border border-[#1a1a1a] font-mono text-[13px] cursor-pointer hover:opacity-70" style={{ backgroundColor: '#1a1a1a', color: '#f5f0e8' }}>
              UPLOAD
              <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
            </label>
            {form.imageUrl && (
              <div className="flex items-center gap-2">
                <img src={form.imageUrl} alt="preview" className="w-10 h-10 object-cover border border-[#1a1a1a]" />
                <button onClick={() => setForm(p => ({ ...p, imageUrl: '' }))} className="font-mono text-[12px] underline hover:opacity-60" style={{ color: '#FF5C34' }}>REMOVE</button>
              </div>
            )}
          </div>
          {!form.imageUrl && (
            <p className="font-mono text-[12px] mt-1.5 opacity-50" style={{ color: '#1a1a1a' }}>Or paste a URL:</p>
          )}
          {!form.imageUrl && <TextInput value={form.imageUrl || ''} onChange={(v) => setForm(p => ({ ...p, imageUrl: v }))} placeholder="https://..." />}
        </Field>

        <Field label="Linked User Profile">
          <select value={form.userId || ''} onChange={(e) => setForm(p => ({ ...p, userId: e.target.value }))} className={inputCls} style={inputStyle}>
            <option value="">— None —</option>
            {allUsers.map(u => (
              <option key={u.id} value={u.id}>{u.name || u.username || 'Unnamed'}{u.username ? ` (@${u.username})` : ''}</option>
            ))}
          </select>
        </Field>

        <CheckboxField label="Published" checked={form.published} onChange={(v) => setForm(p => ({ ...p, published: v }))} />
        <ActionButtons onSave={save} onCancel={() => setModal({ open: false, item: null })} saving={saving} error={error} />
      </Modal>
    </div>
  );
}

// ─── Users Tab ────────────────────────────────────────────────────────────────

const ROLE_TAGS = [
  'music','dj','visual-artist','filmmaker','photographer','writer','poet','dancer',
  'performer','producer','designer','illustrator','game-designer','architect',
  'technologist','curator','educator','community-builder','entrepreneur','researcher',
];

function UsersTab() {
  const { adminFetch } = useAdminAuth();
  const [items, setItems] = useState<UserRow[]>([]);
  const [modal, setModal] = useState<{ open: boolean; item: UserRow | null }>({ open: false, item: null });
  const [saving, setSaving] = useState(false);
  // `published` is toggled separately (PATCH), not via this edit form.
  const [form, setForm] = useState<Omit<UserRow, 'worldMemberships' | 'published'>>({
    id: '', name: '', username: '', email: '', bio: '', avatarUrl: '', role: 'user',
    roleTags: '', toolSlugs: '', socialWebsite: '', socialTwitter: '', socialInstagram: '',
    socialSoundcloud: '', socialSpotify: '', socialLinkedin: '', socialSubstack: '',
  });
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await adminFetch('/api/admin/users');
    const data = await res.json();
    setItems(data.users || []);
  }, [adminFetch]);

  useEffect(() => { load(); }, [load]);

  const openEdit = (item: UserRow) => {
    setError('');
    setForm({
      id: item.id,
      name: item.name || '', username: item.username || '', email: item.email || '',
      bio: item.bio || '', avatarUrl: item.avatarUrl || '', role: item.role || 'user',
      roleTags: item.roleTags || '', toolSlugs: item.toolSlugs || '',
      socialWebsite: item.socialWebsite || '', socialTwitter: item.socialTwitter || '',
      socialInstagram: item.socialInstagram || '', socialSoundcloud: item.socialSoundcloud || '',
      socialSpotify: item.socialSpotify || '', socialLinkedin: item.socialLinkedin || '',
      socialSubstack: item.socialSubstack || '',
    });
    setModal({ open: true, item });
  };

  const save = async () => {
    setSaving(true);
    setError('');
    const res = await adminFetch('/api/admin/users', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    const data = await res.json();
    if (!res.ok) { setError(data.error || 'Save failed'); setSaving(false); return; }
    setSaving(false);
    setModal({ open: false, item: null });
    load();
  };

  const remove = async (id: string) => {
    const res = await adminFetch('/api/admin/users', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
    if (!res.ok) { setError('Delete failed'); return; }
    setDeleteConfirm(null);
    load();
  };

  // Publish / unpublish a profile (hides it from the Discover grid).
  const togglePublished = async (item: UserRow) => {
    setItems((prev) => prev.map((u) => (u.id === item.id ? { ...u, published: !item.published } : u))); // optimistic
    const res = await adminFetch('/api/admin/users', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: item.id, published: !item.published }) });
    if (!res.ok) { setError('Failed to update visibility'); load(); }
  };

  /* Phased rollout: grant or revoke a feature for one person. Optimistic like
   * togglePublished, and reloads on failure so the pill never lies. */
  const toggleFeature = async (item: UserRow, feature: string) => {
    const has = (item.features || []).includes(feature);
    setItems((prev) => prev.map((u) => (u.id === item.id
      ? { ...u, features: has ? (u.features || []).filter((f) => f !== feature) : [...(u.features || []), feature] }
      : u)));
    const res = await adminFetch('/api/admin/features', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: item.id, feature, enabled: !has }),
    });
    if (!res.ok) { setError(`Failed to update ${feature} access`); load(); }
  };

  const filtered = items.filter(u => {
    if (!search) return true;
    const q = search.toLowerCase();
    // Match the feedback ref too, so an issue's User ref can be pasted here to
    // track down who submitted it.
    return (u.name?.toLowerCase().includes(q) || u.username?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q) || (u.feedbackRef || '').toLowerCase().includes(q));
  });

  const selectedRoles = (form.roleTags || '').split(',').map(r => r.trim()).filter(Boolean);
  const toggleRole = (slug: string) => {
    const next = selectedRoles.includes(slug)
      ? selectedRoles.filter(r => r !== slug)
      : [...selectedRoles, slug];
    setForm(p => ({ ...p, roleTags: next.join(',') || '' }));
  };

  const exportCsv = () => {
    const header = ['Name', 'Username', 'Email', 'Role', 'Published', 'Role Tags', 'Worlds', 'Joined'];
    const rows = filtered.map((u) => [
      u.name, u.username, u.email, u.role || 'user', u.published ? 'yes' : 'no',
      u.roleTags, u.worldMemberships.map((w) => w.worldTitle).join('; '),
      u.createdAt ? new Date(u.createdAt).toISOString().slice(0, 10) : '',
    ]);
    downloadCsv('topia-users.csv', header, rows);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-3">
        <span className="font-mono text-[13px] shrink-0" style={{ color: '#1a1a1a' }}>{items.length} users</span>
        <div className="flex items-center gap-2">
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, @handle, email, or feedback ref…" className="border border-[#1a1a1a] px-3 py-1 font-mono text-[12px] outline-none w-72" style={{ backgroundColor: '#f5f0e8', color: '#1a1a1a' }} />
          <button onClick={exportCsv} className="px-3 py-1 font-mono text-[12px] uppercase border border-[#1a1a1a] hover:bg-[#1a1a1a]/5 whitespace-nowrap" style={{ color: '#1a1a1a' }}>Export CSV</button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse font-mono text-[13px]" style={{ color: '#1a1a1a' }}>
          <thead>
            <tr style={{ backgroundColor: '#1a1a1a', color: '#f5f0e8' }}>
              <th className="text-left px-3 py-2 font-bold uppercase text-[12px]">Name</th>
              <th className="text-left px-3 py-2 font-bold uppercase text-[12px]">Username</th>
              <th className="text-left px-3 py-2 font-bold uppercase text-[12px]">Email</th>
              <th className="text-left px-3 py-2 font-bold uppercase text-[12px]">Photo</th>
              <th className="text-left px-3 py-2 font-bold uppercase text-[12px]">Role</th>
              <th className="text-left px-3 py-2 font-bold uppercase text-[12px]">Worlds</th>
              <th className="text-left px-3 py-2 font-bold uppercase text-[12px]">Visibility</th>
              <th className="text-left px-3 py-2 font-bold uppercase text-[12px]">Funding</th>
              <th className="px-3 py-2 text-[12px]"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((item, i) => (
              <tr key={item.id} style={{ backgroundColor: i % 2 === 0 ? '#f5f0e8' : '#ebe6de', borderBottom: '1px solid #1a1a1a' }}>
                <td className="px-3 py-2 font-bold">{item.name || '—'}</td>
                <td className="px-3 py-2">{item.username ? `@${item.username}` : '—'}</td>
                <td className="px-3 py-2 opacity-60">{item.email || '—'}</td>
                <td className="px-3 py-2">
                  {!item.avatarUrl ? (
                    <span className="opacity-40">—</span>
                  ) : isRealPhoto(item.avatarUrl) ? (
                    <span className="font-mono text-[11px] px-2 py-0.5 border" style={{ backgroundColor: '#00FF88', color: '#1a1a1a', borderColor: '#1a1a1a' }}>UPLOADED</span>
                  ) : (
                    <span className="font-mono text-[11px] px-2 py-0.5 border" style={{ backgroundColor: '#FFD60A', color: '#1a1a1a', borderColor: '#1a1a1a' }} title="Auto-generated placeholder avatar — not uploaded by the user">AUTO</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <span className="font-mono text-[12px] px-2 py-0.5 border" style={{
                    backgroundColor: item.role === 'admin' ? '#8B5CF6' : item.role === 'artist' ? '#3B82F6' : '#e5e5e5',
                    color: item.role === 'admin' || item.role === 'artist' ? '#fff' : '#1a1a1a',
                    borderColor: '#1a1a1a',
                  }}>
                    {(item.role || 'user').toUpperCase()}
                  </span>
                </td>
                <td className="px-3 py-2">
                  {item.worldMemberships.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {item.worldMemberships.map(wm => (
                        <span key={wm.worldId} className="font-mono text-[12px] px-1.5 py-0.5 border" style={{
                          backgroundColor: wm.role === 'world_builder' ? '#00FF88' : '#e5e5e5',
                          color: '#1a1a1a', borderColor: '#1a1a1a',
                        }}>
                          {wm.worldTitle} ({wm.role === 'world_builder' ? 'BUILDER' : 'COLLAB'})
                        </span>
                      ))}
                    </div>
                  ) : '—'}
                </td>
                <td className="px-3 py-2">
                  <button
                    onClick={() => togglePublished(item)}
                    title={item.published ? 'Visible in Discover — click to hide' : 'Hidden from Discover — click to publish'}
                    className="font-mono text-[11px] px-2 py-0.5 border font-bold"
                    style={{ backgroundColor: item.published ? '#00FF88' : '#FF5C34', color: '#1a1a1a', borderColor: '#1a1a1a' }}
                  >
                    {item.published ? 'PUB' : 'HIDDEN'}
                  </button>
                </td>
                <td className="px-3 py-2">
                  <button
                    onClick={() => toggleFeature(item, 'funding')}
                    title={(item.features || []).includes('funding')
                      ? 'Can set funding goals and receive money — click to revoke'
                      : 'No access to funding — click to grant for the pilot cohort'}
                    className="font-mono text-[11px] px-2 py-0.5 border font-bold"
                    style={{
                      backgroundColor: (item.features || []).includes('funding') ? '#e4fe52' : '#e5e5e5',
                      color: '#1a1a1a', borderColor: '#1a1a1a',
                    }}
                  >
                    {(item.features || []).includes('funding') ? 'ON' : 'OFF'}
                  </button>
                </td>
                <td className="px-3 py-2">
                  <div className="flex gap-2">
                    <button onClick={() => openEdit(item)} className="font-mono text-[12px] underline hover:opacity-60">EDIT</button>
                    {deleteConfirm === item.id ? (
                      <span className="flex gap-1">
                        <button onClick={() => remove(item.id)} className="font-mono text-[12px] underline" style={{ color: '#FF5C34' }}>CONFIRM</button>
                        <button onClick={() => setDeleteConfirm(null)} className="font-mono text-[12px] underline hover:opacity-60">NO</button>
                      </span>
                    ) : (
                      <button onClick={() => setDeleteConfirm(item.id)} className="font-mono text-[12px] underline hover:opacity-60" style={{ color: '#FF5C34' }}>DEL</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={modal.open} onClose={() => setModal({ open: false, item: null })} title="Edit User">
        {modal.item?.feedbackRef && (
          <Field label="Feedback ID">
            <div className="font-mono text-[12px] px-3 py-2 border break-all select-all" style={{ backgroundColor: '#ebe6de', borderColor: '#1a1a1a', color: '#1a1a1a' }} title="The opaque ID shown on feedback issues — paste it into search to find this user.">{modal.item.feedbackRef}</div>
          </Field>
        )}
        <Field label="Name"><TextInput value={form.name || ''} onChange={(v) => setForm(p => ({ ...p, name: v }))} /></Field>
        <Field label="Username"><TextInput value={form.username || ''} onChange={(v) => setForm(p => ({ ...p, username: v.toLowerCase().replace(/[^a-z0-9_]/g, '') }))} /></Field>
        <Field label="Email"><TextInput value={form.email || ''} onChange={(v) => setForm(p => ({ ...p, email: v }))} /></Field>
        <Field label="Bio"><TextArea value={form.bio || ''} onChange={(v) => setForm(p => ({ ...p, bio: v }))} /></Field>
        <Field label="Avatar URL"><TextInput value={form.avatarUrl || ''} onChange={(v) => setForm(p => ({ ...p, avatarUrl: v }))} /></Field>

        <Field label="System Role">
          <select value={form.role || 'user'} onChange={(e) => setForm(p => ({ ...p, role: e.target.value }))} className={inputCls} style={inputStyle}>
            <option value="user">User</option>
            <option value="artist">Artist</option>
            <option value="admin">Admin</option>
          </select>
        </Field>

        <Field label="Creative Roles">
          <div className="flex flex-wrap gap-1.5">
            {ROLE_TAGS.map(slug => (
              <button key={slug} onClick={() => toggleRole(slug)} className="font-mono text-[13px] uppercase px-2 py-1 border transition-colors" style={{
                borderColor: '#1a1a1a',
                backgroundColor: selectedRoles.includes(slug) ? '#1a1a1a' : 'transparent',
                color: selectedRoles.includes(slug) ? '#f5f0e8' : '#1a1a1a',
              }}>
                {slug.replace(/-/g, ' ')}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Social - Website"><TextInput value={form.socialWebsite || ''} onChange={(v) => setForm(p => ({ ...p, socialWebsite: v }))} /></Field>
        <Field label="Social - Twitter"><TextInput value={form.socialTwitter || ''} onChange={(v) => setForm(p => ({ ...p, socialTwitter: v }))} /></Field>
        <Field label="Social - Instagram"><TextInput value={form.socialInstagram || ''} onChange={(v) => setForm(p => ({ ...p, socialInstagram: v }))} /></Field>
        <Field label="Social - SoundCloud"><TextInput value={form.socialSoundcloud || ''} onChange={(v) => setForm(p => ({ ...p, socialSoundcloud: v }))} /></Field>
        <Field label="Social - Spotify"><TextInput value={form.socialSpotify || ''} onChange={(v) => setForm(p => ({ ...p, socialSpotify: v }))} /></Field>
        <Field label="Social - LinkedIn"><TextInput value={form.socialLinkedin || ''} onChange={(v) => setForm(p => ({ ...p, socialLinkedin: v }))} /></Field>
        <Field label="Social - Substack"><TextInput value={form.socialSubstack || ''} onChange={(v) => setForm(p => ({ ...p, socialSubstack: v }))} /></Field>

        {/* Show world memberships (read-only here, managed from Worlds tab) */}
        {modal.item && modal.item.worldMemberships.length > 0 && (
          <Field label="World Memberships">
            <div className="space-y-1">
              {modal.item.worldMemberships.map(wm => (
                <div key={wm.worldId} className="flex items-center gap-2">
                  <span className="font-mono text-[12px] px-1.5 py-0.5 border" style={{
                    backgroundColor: wm.role === 'world_builder' ? '#00FF88' : '#e5e5e5',
                    color: '#1a1a1a', borderColor: '#1a1a1a',
                  }}>
                    {wm.role === 'world_builder' ? 'WORLD BUILDER' : 'COLLABORATOR'}
                  </span>
                  <span className="font-mono text-[12px]" style={{ color: '#1a1a1a' }}>{wm.worldTitle}</span>
                </div>
              ))}
            </div>
          </Field>
        )}

        <ActionButtons onSave={save} onCancel={() => setModal({ open: false, item: null })} saving={saving} error={error} />
      </Modal>
    </div>
  );
}

// ─── Generic publish-only tab ─────────────────────────────────────────────────
// For content types managed/created elsewhere (catalysts, TV episodes, world
// projects). Lists items with a one-click publish toggle — no create/edit here.

interface PublishItem {
  id: string;
  name: string | null;
  slug: string | null;
  published: boolean;
}

function SimplePublishTab({ type, noun }: { type: string; noun: string }) {
  const { adminFetch } = useAdminAuth();
  const [items, setItems] = useState<PublishItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const res = await adminFetch(`/api/admin/publish?type=${type}`);
    const data = await res.json();
    setItems(data.items || []);
    setLoading(false);
  }, [type, adminFetch]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <span className="font-mono text-[13px]" style={{ color: '#1a1a1a' }}>{items.length} {noun}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse font-mono text-[13px]" style={{ color: '#1a1a1a' }}>
          <thead>
            <tr style={{ backgroundColor: '#1a1a1a', color: '#f5f0e8' }}>
              <th className="text-left px-3 py-2 font-bold uppercase text-[12px]">Name</th>
              <th className="text-left px-3 py-2 font-bold uppercase text-[12px]">Slug</th>
              <th className="text-left px-3 py-2 font-bold uppercase text-[12px]">Status</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => (
              <tr key={item.id} style={{ backgroundColor: i % 2 === 0 ? '#f5f0e8' : '#ebe6de', borderBottom: '1px solid #1a1a1a' }}>
                <td className="px-3 py-2 font-bold">{item.name || '—'}</td>
                <td className="px-3 py-2">{item.slug || '—'}</td>
                <td className="px-3 py-2"><PublishToggle type={type} id={item.id} published={item.published} onChange={load} /></td>
              </tr>
            ))}
            {!loading && items.length === 0 && (
              <tr><td className="px-3 py-4 opacity-60" colSpan={3}>No {noun} yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Main Dashboard ──────────────────────────────────────────────────────────

// ─── Links (short-link analytics) ───────────────────────────────────────────

interface ShortLinkRow {
  id: string;
  code: string;
  targetPath: string;
  kind: string | null;
  clicks: number;
  createdAt: string | null;
  creatorName: string | null;
  creatorUsername: string | null;
}

function LinksTab() {
  const { adminFetch } = useAdminAuth();
  const [items, setItems] = useState<ShortLinkRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    adminFetch('/api/admin/links')
      .then((r) => r.json())
      .then((d) => setItems(d.links || []))
      .finally(() => setLoading(false));
  }, [adminFetch]);

  useEffect(() => { load(); }, [load]);

  const totalClicks = items.reduce((s, l) => s + (l.clicks || 0), 0);
  const th = 'text-left px-3 py-2 font-mono text-[11px] uppercase tracking-widest';
  const td = 'px-3 py-2 font-mono text-[12px] align-top';

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="font-mono text-[12px]" style={{ color: '#1a1a1a' }}>
          {items.length} link{items.length === 1 ? '' : 's'} · {totalClicks} total click{totalClicks === 1 ? '' : 's'}
        </p>
        <button onClick={load} className="font-mono text-[12px] uppercase tracking-widest px-3 py-1 border border-[#1a1a1a] hover:bg-[#1a1a1a]/5" style={{ color: '#1a1a1a' }}>
          Refresh
        </button>
      </div>

      {loading ? (
        <p className="font-mono text-[12px]" style={{ color: '#1a1a1a' }}>Loading…</p>
      ) : (
        <div className="border border-[#1a1a1a] overflow-x-auto">
          <table className="w-full" style={{ color: '#1a1a1a' }}>
            <thead>
              <tr style={{ backgroundColor: '#1a1a1a', color: '#f5f0e8' }}>
                <th className={th}>Clicks</th>
                <th className={th}>Short</th>
                <th className={th}>Target</th>
                <th className={th}>Kind</th>
                <th className={th}>Creator</th>
                <th className={th}>Created</th>
              </tr>
            </thead>
            <tbody>
              {items.map((l) => {
                const shortPath = l.kind === 'profile'
                  ? `/@${l.targetPath.replace(/^\/profile\//, '')}`
                  : `/s/${l.code}`;
                return (
                  <tr key={l.id} className="border-t border-[#1a1a1a]/15">
                    <td className={`${td} font-bold`}>{l.clicks}</td>
                    <td className={td}>
                      <a href={shortPath} target="_blank" rel="noreferrer" className="underline hover:opacity-60">{shortPath}</a>
                    </td>
                    <td className={`${td} break-all`}>
                      <a href={l.targetPath} target="_blank" rel="noreferrer" className="underline hover:opacity-60">{l.targetPath}</a>
                    </td>
                    <td className={td}>{l.kind || '—'}</td>
                    <td className={td}>{l.creatorUsername ? `@${l.creatorUsername}` : l.creatorName || '—'}</td>
                    <td className={td}>{l.createdAt ? new Date(l.createdAt).toLocaleDateString() : '—'}</td>
                  </tr>
                );
              })}
              {items.length === 0 && (
                <tr><td colSpan={6} className="px-3 py-6 text-center font-mono text-[12px] opacity-50">No short links yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const TABS: { id: Tab; label: string }[] = [
  { id: 'worlds', label: 'WORLDS' },
  { id: 'users', label: 'USERS' },
  { id: 'creators', label: 'CREATORS' },
  { id: 'events', label: 'EVENTS' },
  { id: 'grants', label: 'GRANTS' },
  { id: 'tools', label: 'TOOLS' },
  { id: 'catalysts', label: 'CATALYSTS' },
  { id: 'tv', label: 'TV' },
  { id: 'projects', label: 'PROJECTS' },
  { id: 'links', label: 'LINKS' },
  { id: 'emails', label: 'EMAILS' },
  { id: 'broadcast', label: 'BROADCAST' },
  { id: 'newsletter', label: 'NEWSLETTER' },
];

export default function AdminPage() {
  return (
    <AdminAuthProvider>
      <AdminDashboard />
    </AdminAuthProvider>
  );
}

function AdminDashboard() {
  const [tab, setTab] = useState<Tab>('worlds');
  const { logout } = useAdminAuth();

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#f5f0e8' }}>
      {/* Header */}
      <header className="border-b border-[#1a1a1a]" style={{ backgroundColor: '#1a1a1a' }}>
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="font-mono text-[18px] font-bold" style={{ color: '#f5f0e8' }}>TOPIA</span>
            <span className="font-mono text-[12px] px-2 py-0.5 border border-[#f5f0e8]/40" style={{ color: '#f5f0e8' }}>ADMIN</span>
          </div>
          <button onClick={logout} className="font-mono text-[12px] uppercase tracking-widest px-3 py-1 border border-[#f5f0e8]/40 hover:border-[#f5f0e8] transition-colors" style={{ color: '#f5f0e8' }}>
            LOGOUT
          </button>
        </div>
      </header>

      {/* Tab nav */}
      <nav className="border-b border-[#1a1a1a]" style={{ backgroundColor: '#f5f0e8' }}>
        <div className="max-w-6xl mx-auto px-4 flex gap-0">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="relative px-5 py-3 font-mono text-[13px] uppercase tracking-widest transition-colors"
              style={{
                color: tab === t.id ? '#f5f0e8' : '#1a1a1a',
                backgroundColor: tab === t.id ? '#1a1a1a' : 'transparent',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </nav>

      {/* Content */}
      <main className="max-w-6xl mx-auto px-4 py-6">
        {tab === 'worlds' && <WorldsTab />}
        {tab === 'users' && <UsersTab />}
        {tab === 'creators' && <CreatorsTab />}
        {tab === 'events' && <EventsTab />}
        {tab === 'grants' && <GrantsTab />}
        {tab === 'tools' && <ToolsTab />}
        {tab === 'catalysts' && <SimplePublishTab type="catalysts" noun="catalysts" />}
        {tab === 'tv' && <SimplePublishTab type="tv-episodes" noun="episodes" />}
        {tab === 'projects' && <SimplePublishTab type="world-projects" noun="projects" />}
        {tab === 'links' && <LinksTab />}
        {tab === 'emails' && <EmailsTab />}
        {tab === 'broadcast' && <BroadcastTab />}
        {tab === 'newsletter' && <NewsletterTab />}
      </main>
    </div>
  );
}

// ─── Newsletter Tab — captured sign-ups, attributed to profiles by email ──────
interface NewsletterRow {
  id: string;
  email: string;
  name: string | null;
  source: string | null;
  roles: string | null;
  createdAt: string;
  userId: string | null;    // attributed profile (live email match), null if none
  username: string | null;
  userName: string | null;
}

function NewsletterTab() {
  const { adminFetch } = useAdminAuth();
  const [items, setItems] = useState<NewsletterRow[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await adminFetch('/api/admin/newsletter');
    const data = await res.json();
    setItems(data.signups || []);
    setLoading(false);
  }, [adminFetch]);

  useEffect(() => { load(); }, [load]);

  const remove = async (id: string) => {
    const res = await adminFetch('/api/admin/newsletter', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
    if (res.ok) { setDeleteConfirm(null); load(); }
  };

  const filtered = items.filter((s) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (s.email.toLowerCase().includes(q) || (s.name || '').toLowerCase().includes(q)
      || (s.username || '').toLowerCase().includes(q) || (s.source || '').toLowerCase().includes(q));
  });

  const attributed = items.filter((s) => s.userId).length;

  const exportCsv = () => {
    const header = ['Date', 'Name', 'Email', 'Source', 'Roles', 'Attributed Profile', 'Profile URL'];
    const rows = filtered.map((s) => [
      new Date(s.createdAt).toISOString().slice(0, 10),
      s.name, s.email, s.source, s.roles,
      s.username ? `@${s.username}` : '',
      s.username ? `https://topia.vision/profile/${s.username}` : '',
    ]);
    downloadCsv('topia-newsletter-signups.csv', header, rows);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-3">
        <span className="font-mono text-[13px] shrink-0" style={{ color: '#1a1a1a' }}>
          {items.length} sign-ups · {attributed} with a profile
        </span>
        <div className="flex items-center gap-2">
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search email, name, @handle, source…" className="border border-[#1a1a1a] px-3 py-1 font-mono text-[12px] outline-none w-72" style={{ backgroundColor: '#f5f0e8', color: '#1a1a1a' }} />
          <button onClick={exportCsv} disabled={items.length === 0} className="px-3 py-1 font-mono text-[12px] uppercase border border-[#1a1a1a] hover:bg-[#1a1a1a]/5 disabled:opacity-40 whitespace-nowrap" style={{ color: '#1a1a1a' }}>Export CSV</button>
        </div>
      </div>

      {loading ? (
        <p className="font-mono text-[13px] opacity-60" style={{ color: '#1a1a1a' }}>Loading…</p>
      ) : items.length === 0 ? (
        <p className="font-mono text-[13px] opacity-60" style={{ color: '#1a1a1a' }}>No sign-ups yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse font-mono text-[13px]" style={{ color: '#1a1a1a' }}>
            <thead>
              <tr style={{ backgroundColor: '#1a1a1a', color: '#f5f0e8' }}>
                <th className="text-left px-3 py-2 font-bold uppercase text-[12px]">Date</th>
                <th className="text-left px-3 py-2 font-bold uppercase text-[12px]">Name</th>
                <th className="text-left px-3 py-2 font-bold uppercase text-[12px]">Email</th>
                <th className="text-left px-3 py-2 font-bold uppercase text-[12px]">Source</th>
                <th className="text-left px-3 py-2 font-bold uppercase text-[12px]">Profile</th>
                <th className="px-3 py-2 text-[12px]"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s, i) => (
                <tr key={s.id} style={{ backgroundColor: i % 2 === 0 ? '#f5f0e8' : '#ebe6de', borderBottom: '1px solid #1a1a1a' }}>
                  <td className="px-3 py-2 whitespace-nowrap opacity-70">{new Date(s.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</td>
                  <td className="px-3 py-2 font-bold">{s.name || '—'}</td>
                  <td className="px-3 py-2">{s.email}</td>
                  <td className="px-3 py-2">
                    {s.source ? (
                      <span className="font-mono text-[11px] px-2 py-0.5 border" style={{ backgroundColor: '#e5e5e5', color: '#1a1a1a', borderColor: '#1a1a1a' }}>{s.source}</span>
                    ) : <span className="opacity-40">—</span>}
                  </td>
                  <td className="px-3 py-2">
                    {s.username ? (
                      <a href={`/profile/${s.username}`} target="_blank" rel="noopener noreferrer" className="font-mono text-[12px] px-2 py-0.5 border inline-block hover:opacity-80" style={{ backgroundColor: '#00FF88', color: '#1a1a1a', borderColor: '#1a1a1a' }} title={s.userName || ''}>
                        @{s.username}
                      </a>
                    ) : (
                      <span className="font-mono text-[11px] opacity-40">no profile</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    {deleteConfirm === s.id ? (
                      <>
                        <button onClick={() => remove(s.id)} className="font-mono text-[12px] underline" style={{ color: '#FF5C34' }}>CONFIRM</button>
                        {' '}
                        <button onClick={() => setDeleteConfirm(null)} className="font-mono text-[12px] underline hover:opacity-60">NO</button>
                      </>
                    ) : (
                      <button onClick={() => setDeleteConfirm(s.id)} className="font-mono text-[12px] underline hover:opacity-60" style={{ color: '#FF5C34' }}>DEL</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Emails Tab — trigger any template to selected users, with preview ────────
interface TemplateMeta { id: string; label: string; scope: 'event' | 'profile'; variables: string[] }
interface EventLite { id: string; eventName: string; slug: string }
interface SendResult { email: string | null; name: string | null; sent: boolean; reason?: string }

function EmailsTab() {
  const { adminFetch } = useAdminAuth();
  const [templates, setTemplates] = useState<TemplateMeta[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [events, setEvents] = useState<EventLite[]>([]);
  const [templateId, setTemplateId] = useState('');
  const [eventId, setEventId] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [preview, setPreview] = useState<{ subject: string; html: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmSendOpen, setConfirmSendOpen] = useState(false);
  const [results, setResults] = useState<{ sentCount: number; total: number; results: SendResult[] } | null>(null);

  useEffect(() => {
    adminFetch('/api/admin/emails').then(r => r.json()).then(d => setTemplates(d.templates || [])).catch(() => {});
    adminFetch('/api/admin/users').then(r => r.json()).then(d => setUsers(d.users || [])).catch(() => {});
    adminFetch('/api/admin/events').then(r => r.json()).then(d => setEvents((d.events || []).map((e: EventLite) => ({ id: e.id, eventName: e.eventName, slug: e.slug })))).catch(() => {});
  }, [adminFetch]);

  const tpl = templates.find(t => t.id === templateId);
  const needsEvent = tpl?.scope === 'event';

  const filteredUsers = users.filter(u => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return [u.name, u.username, u.email, u.feedbackRef].some(v => (v || '').toLowerCase().includes(q));
  });

  const toggle = (id: string) => {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };
  const selectAllFiltered = () => setSelected(new Set(filteredUsers.map(u => u.id)));
  const clearSelection = () => setSelected(new Set());

  const doPreview = async () => {
    setError(''); setResults(null);
    if (!templateId) { setError('Pick a template'); return; }
    if (needsEvent && !eventId) { setError('Pick an event for this template'); return; }
    setBusy(true);
    try {
      const sampleUserId = [...selected][0];
      const res = await adminFetch('/api/admin/emails', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'preview', templateId, eventId: needsEvent ? eventId : undefined, sampleUserId }),
      });
      const d = await res.json();
      if (!res.ok) { setError(d.error || 'Preview failed'); return; }
      setPreview({ subject: d.subject, html: d.html });
    } catch { setError('Preview failed'); }
    finally { setBusy(false); }
  };

  const doSend = async () => {
    setError(''); setResults(null);
    if (!templateId) { setError('Pick a template'); return; }
    if (needsEvent && !eventId) { setError('Pick an event for this template'); return; }
    if (selected.size === 0) { setError('Select at least one recipient'); return; }
    setConfirmSendOpen(true);
  };

  const reallySend = async () => {
    setConfirmSendOpen(false);
    setBusy(true);
    try {
      const res = await adminFetch('/api/admin/emails', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send', templateId, eventId: needsEvent ? eventId : undefined, userIds: [...selected] }),
      });
      const d = await res.json();
      if (!res.ok) { setError(d.error || 'Send failed'); return; }
      setResults(d);
    } catch { setError('Send failed'); }
    finally { setBusy(false); }
  };

  const sel = { backgroundColor: '#f5f0e8', color: '#1a1a1a', borderColor: '#1a1a1a' };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6" style={{ color: '#1a1a1a' }}>
      {confirmSendOpen && (
        <ConfirmDialog
          title={`Send "${tpl?.label}" to ${selected.size} recipient(s)?`}
          body="Emails go out immediately via Resend."
          confirmLabel="Send"
          onConfirm={reallySend}
          onCancel={() => setConfirmSendOpen(false)}
        />
      )}
      {/* Left: controls */}
      <div>
        <Field label="Template">
          <select value={templateId} onChange={e => { setTemplateId(e.target.value); setPreview(null); setResults(null); }} className="w-full border px-3 py-2 font-mono text-[13px] outline-none" style={sel}>
            <option value="">Select a template…</option>
            {templates.map(t => <option key={t.id} value={t.id}>{t.label} ({t.scope})</option>)}
          </select>
        </Field>

        {needsEvent && (
          <Field label="Event">
            <select value={eventId} onChange={e => { setEventId(e.target.value); setPreview(null); }} className="w-full border px-3 py-2 font-mono text-[13px] outline-none" style={sel}>
              <option value="">Select an event…</option>
              {events.map(e => <option key={e.id} value={e.id}>{e.eventName}</option>)}
            </select>
          </Field>
        )}

        <div className="mb-2 flex items-center justify-between">
          <span className="font-mono text-[12px] uppercase tracking-[0.12em] font-bold opacity-60">Recipients · {selected.size} selected</span>
          <span className="flex gap-3">
            <button onClick={selectAllFiltered} className="font-mono text-[11px] uppercase underline">Select all</button>
            <button onClick={clearSelection} className="font-mono text-[11px] uppercase underline">Clear</button>
          </span>
        </div>
        <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search users…" className="w-full border px-3 py-2 font-mono text-[12px] outline-none mb-2" style={sel} />
        <div className="border max-h-[340px] overflow-y-auto" style={{ borderColor: '#1a1a1a' }}>
          {filteredUsers.length === 0 && <p className="font-mono text-[12px] opacity-50 p-3">No users</p>}
          {filteredUsers.map(u => (
            <label key={u.id} className="flex items-center gap-2 px-3 py-1.5 cursor-pointer border-b" style={{ borderColor: 'rgba(26,26,26,0.1)' }}>
              <input type="checkbox" checked={selected.has(u.id)} onChange={() => toggle(u.id)} />
              <span className="font-mono text-[12px] flex-1 min-w-0 truncate">
                {u.name || '(no name)'}{u.username ? ` @${u.username}` : ''}
                <span className="opacity-50"> · {u.email || 'no email'}</span>
              </span>
            </label>
          ))}
        </div>

        {error && <p className="font-mono text-[12px] mt-3" style={{ color: '#FF5C34' }}>{error}</p>}

        <div className="flex gap-2 mt-4">
          <button onClick={doPreview} disabled={busy} className="px-4 py-2 font-mono text-[12px] uppercase tracking-widest border disabled:opacity-40" style={{ borderColor: '#1a1a1a' }}>{busy ? '…' : 'Preview'}</button>
          <button onClick={doSend} disabled={busy || selected.size === 0} className="px-4 py-2 font-mono text-[12px] uppercase tracking-widest font-bold disabled:opacity-40" style={{ backgroundColor: '#1a1a1a', color: '#f5f0e8' }}>{busy ? 'Sending…' : `Send to ${selected.size}`}</button>
        </div>

        {results && (
          <div className="mt-4 border p-3" style={{ borderColor: '#1a1a1a' }}>
            <p className="font-mono text-[12px] font-bold mb-2">Sent {results.sentCount}/{results.total}</p>
            {results.results.map((r, i) => (
              <p key={i} className="font-mono text-[11px]" style={{ color: r.sent ? '#1a1a1a' : '#FF5C34' }}>
                {r.sent ? '✓' : '✗'} {r.email || r.name || 'unknown'}{r.reason ? ` — ${r.reason}` : ''}
              </p>
            ))}
          </div>
        )}
      </div>

      {/* Right: preview */}
      <div>
        <span className="font-mono text-[12px] uppercase tracking-[0.12em] font-bold opacity-60">Preview</span>
        {preview ? (
          <div className="mt-2">
            <p className="font-mono text-[12px] mb-2"><span className="opacity-50">Subject:</span> {preview.subject}</p>
            <iframe title="email preview" srcDoc={preview.html} className="w-full border" style={{ height: 620, borderColor: '#1a1a1a', backgroundColor: '#fff' }} />
          </div>
        ) : (
          <p className="font-mono text-[12px] opacity-50 mt-2">Pick a template{`'`}s options and hit Preview. With a recipient selected, the preview uses their name; otherwise it shows sample data.</p>
        )}
      </div>
    </div>
  );
}

// ─── Markdown editor with a formatting toolbar + shortcuts. Operates on the
// textarea selection (wrap for inline, line-prefix for blocks) so the admin can
// format without typing markdown syntax. Cmd/Ctrl+B / I / K shortcuts too. ─────
function MarkdownField({ value, onChange, rows = 14 }: { value: string; onChange: (v: string) => void; rows?: number }) {
  const taRef = useRef<HTMLTextAreaElement>(null);

  // Re-focus + reselect after the controlled re-render commits.
  const restore = (start: number, end: number) => {
    requestAnimationFrame(() => {
      const ta = taRef.current; if (!ta) return;
      ta.focus();
      ta.setSelectionRange(start, end);
    });
  };

  // Wrap the selection in `before`/`after` (inline styles: bold, italic, code).
  const surround = (before: string, after = before) => {
    const ta = taRef.current; if (!ta) return;
    const { selectionStart: s, selectionEnd: e, value: v } = ta;
    const sel = v.slice(s, e);
    onChange(v.slice(0, s) + before + sel + after + v.slice(e));
    restore(s + before.length, s + before.length + sel.length);
  };

  // Prefix every selected line (headings, lists, quote).
  const prefixLines = (makePrefix: (i: number) => string) => {
    const ta = taRef.current; if (!ta) return;
    const { selectionStart: s, selectionEnd: e, value: v } = ta;
    const lineStart = v.lastIndexOf('\n', s - 1) + 1;
    const block = v.slice(lineStart, e);
    const prefixed = block.split('\n').map((l, i) => makePrefix(i) + l).join('\n');
    onChange(v.slice(0, lineStart) + prefixed + v.slice(e));
    restore(lineStart, lineStart + prefixed.length);
  };

  const insertLink = () => {
    const ta = taRef.current; if (!ta) return;
    const { selectionStart: s, selectionEnd: e, value: v } = ta;
    const label = v.slice(s, e) || 'link text';
    const snippet = `[${label}](https://)`;
    onChange(v.slice(0, s) + snippet + v.slice(e));
    const urlStart = s + label.length + 3; // after "[label]("
    restore(urlStart, urlStart + 8);       // select "https://"
  };

  const onKeyDown = (ev: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!(ev.metaKey || ev.ctrlKey)) return;
    const k = ev.key.toLowerCase();
    if (k === 'b') { ev.preventDefault(); surround('**'); }
    else if (k === 'i') { ev.preventDefault(); surround('*'); }
    else if (k === 'k') { ev.preventDefault(); insertLink(); }
  };

  const Btn = ({ onClick, title, children }: { onClick: () => void; title: string; children: React.ReactNode }) => (
    <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={onClick} title={title}
      className="px-2 py-1 font-mono text-[12px] border hover:bg-[#1a1a1a] hover:text-[#f5f0e8] transition-colors"
      style={{ borderColor: '#1a1a1a', minWidth: 30 }}>
      {children}
    </button>
  );

  return (
    <div>
      <div className="flex flex-wrap gap-1 mb-1">
        <Btn title="Heading" onClick={() => prefixLines(() => '## ')}>H</Btn>
        <Btn title="Bold (⌘B)" onClick={() => surround('**')}><strong>B</strong></Btn>
        <Btn title="Italic (⌘I)" onClick={() => surround('*')}><em>I</em></Btn>
        <Btn title="Bulleted list" onClick={() => prefixLines(() => '- ')}>• List</Btn>
        <Btn title="Numbered list" onClick={() => prefixLines((i) => `${i + 1}. `)}>1. List</Btn>
        <Btn title="Quote" onClick={() => prefixLines(() => '> ')}>❝</Btn>
        <Btn title="Link (⌘K)" onClick={insertLink}>Link</Btn>
        <Btn title="Divider" onClick={() => { const ta = taRef.current; if (!ta) return; const { selectionStart: s, value: v } = ta; onChange(v.slice(0, s) + '\n\n---\n\n' + v.slice(s)); }}>―</Btn>
      </div>
      <textarea ref={taRef} value={value} onChange={(e) => onChange(e.target.value)} onKeyDown={onKeyDown} rows={rows}
        className="w-full border px-3 py-2 font-mono text-[12px] leading-relaxed outline-none resize-y"
        style={{ backgroundColor: '#f5f0e8', color: '#1a1a1a', borderColor: '#1a1a1a' }} />
    </div>
  );
}

// ─── Broadcast Tab — write a markdown email and send it to ALL confirmed RSVPs
// of one event. Sends rate-limit-safe via the Resend batch API (server side). ──
const BROADCAST_STARTER = `Hi {{firstName}},

A quick update about **{{eventName}}**.

-
-

See you there!`;

function BroadcastTab() {
  const { adminFetch } = useAdminAuth();
  const [events, setEvents] = useState<EventLite[]>([]);
  const [eventId, setEventId] = useState('');
  const [subject, setSubject] = useState('');
  const [markdown, setMarkdown] = useState(BROADCAST_STARTER);
  const [recipientCount, setRecipientCount] = useState<number | null>(null);
  const [preview, setPreview] = useState<{ subject: string; html: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState<{ sent: number; failed: number; total: number; errors: string[] } | null>(null);

  useEffect(() => {
    adminFetch('/api/admin/events').then(r => r.json())
      .then(d => setEvents((d.events || []).map((e: EventLite) => ({ id: e.id, eventName: e.eventName, slug: e.slug }))))
      .catch(() => {});
  }, [adminFetch]);

  // Recipient count refreshes whenever the chosen event changes.
  useEffect(() => {
    setRecipientCount(null);
    if (!eventId) return;
    let alive = true;
    adminFetch(`/api/admin/broadcast?eventId=${encodeURIComponent(eventId)}`).then(r => r.json())
      .then(d => { if (alive) setRecipientCount(typeof d.recipientCount === 'number' ? d.recipientCount : null); })
      .catch(() => {});
    return () => { alive = false; };
  }, [eventId]);

  const doPreview = async () => {
    setError(''); setResults(null);
    if (!eventId) { setError('Pick an event'); return; }
    if (!markdown.trim()) { setError('Write a message'); return; }
    setBusy(true);
    try {
      const res = await adminFetch('/api/admin/broadcast', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'preview', eventId, subject, markdown }),
      });
      const d = await res.json();
      if (!res.ok) { setError(d.error || 'Preview failed'); return; }
      setPreview({ subject: d.subject, html: d.html });
      if (typeof d.recipientCount === 'number') setRecipientCount(d.recipientCount);
    } catch { setError('Preview failed'); }
    finally { setBusy(false); }
  };

  const doSend = async () => {
    setError(''); setResults(null);
    if (!eventId) { setError('Pick an event'); return; }
    if (!subject.trim()) { setError('Add a subject'); return; }
    if (!markdown.trim()) { setError('Write a message'); return; }
    if (!recipientCount) { setError('No confirmed RSVPs with an email for this event'); return; }
    const ev = events.find(e => e.id === eventId);
    if (!window.confirm(`Send this email to ${recipientCount} confirmed RSVP${recipientCount === 1 ? '' : 's'} of "${ev?.eventName}"?\n\nThis sends real emails and can't be undone.`)) return;
    setBusy(true);
    try {
      const res = await adminFetch('/api/admin/broadcast', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send', eventId, subject, markdown }),
      });
      const d = await res.json();
      if (!res.ok) { setError(d.error || 'Send failed'); return; }
      setResults({ sent: d.sent, failed: d.failed, total: d.total, errors: d.errors || [] });
    } catch { setError('Send failed'); }
    finally { setBusy(false); }
  };

  const sel = { backgroundColor: '#f5f0e8', color: '#1a1a1a', borderColor: '#1a1a1a' };
  const countLabel = recipientCount == null ? '' : `${recipientCount} confirmed RSVP${recipientCount === 1 ? '' : 's'} with an email`;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6" style={{ color: '#1a1a1a' }}>
      {/* Left: compose */}
      <div>
        <Field label="Event">
          <select value={eventId} onChange={e => { setEventId(e.target.value); setPreview(null); setResults(null); }} className="w-full border px-3 py-2 font-mono text-[13px] outline-none" style={sel}>
            <option value="">Select an event…</option>
            {events.map(e => <option key={e.id} value={e.id}>{e.eventName}</option>)}
          </select>
        </Field>
        {eventId && (
          <p className="font-mono text-[12px] -mt-2 mb-3 opacity-70">
            {recipientCount == null ? 'Counting recipients…' : `→ ${countLabel}`}
          </p>
        )}

        <Field label="Subject">
          <input type="text" value={subject} onChange={e => { setSubject(e.target.value); setResults(null); }} placeholder="Subject line — {{eventName}} works here too" className="w-full border px-3 py-2 font-mono text-[13px] outline-none" style={sel} />
        </Field>

        <Field label="Message (Markdown)">
          <MarkdownField value={markdown} onChange={v => { setMarkdown(v); setResults(null); }} rows={14} />
        </Field>
        <p className="font-mono text-[11px] opacity-60 -mt-2 mb-3">
          Markdown: <code># heading</code>, <code>**bold**</code>, <code>- list</code>, <code>[link](url)</code>. Placeholders: <code>{'{{firstName}}'}</code>, <code>{'{{name}}'}</code>, <code>{'{{eventName}}'}</code>, <code>{'{{eventUrl}}'}</code>.
        </p>

        {error && <p className="font-mono text-[12px] mt-1 mb-2" style={{ color: '#FF5C34' }}>{error}</p>}

        <div className="flex gap-2 mt-2">
          <button onClick={doPreview} disabled={busy} className="px-4 py-2 font-mono text-[12px] uppercase tracking-widest border disabled:opacity-40" style={{ borderColor: '#1a1a1a' }}>{busy ? '…' : 'Preview'}</button>
          <button onClick={doSend} disabled={busy || !recipientCount} className="px-4 py-2 font-mono text-[12px] uppercase tracking-widest font-bold disabled:opacity-40" style={{ backgroundColor: '#1a1a1a', color: '#f5f0e8' }}>
            {busy ? 'Sending…' : recipientCount ? `Send to ${recipientCount}` : 'Send'}
          </button>
        </div>
        <p className="font-mono text-[11px] opacity-50 mt-2">Sent in throttled batches (Resend batch API) so a large list won{`'`}t hit the rate limit.</p>

        {results && (
          <div className="mt-4 border p-3" style={{ borderColor: '#1a1a1a' }}>
            <p className="font-mono text-[12px] font-bold mb-1">Sent {results.sent}/{results.total}{results.failed ? ` · ${results.failed} failed` : ''}</p>
            {results.errors.length > 0
              ? results.errors.map((er, i) => <p key={i} className="font-mono text-[11px]" style={{ color: '#FF5C34' }}>✗ {er}</p>)
              : <p className="font-mono text-[11px] opacity-70">All batches delivered to Resend.</p>}
          </div>
        )}
      </div>

      {/* Right: preview */}
      <div>
        <span className="font-mono text-[12px] uppercase tracking-[0.12em] font-bold opacity-60">Preview</span>
        {preview ? (
          <div className="mt-2">
            <p className="font-mono text-[12px] mb-2"><span className="opacity-50">Subject:</span> {preview.subject}</p>
            <iframe title="broadcast preview" srcDoc={preview.html} className="w-full border" style={{ height: 620, borderColor: '#1a1a1a', backgroundColor: '#fff' }} />
          </div>
        ) : (
          <p className="font-mono text-[12px] opacity-50 mt-2">Pick an event, write your message, and hit Preview. The preview fills <code>{'{{firstName}}'}</code> with a real attendee{`'`}s name when there is one.</p>
        )}
      </div>
    </div>
  );
}
