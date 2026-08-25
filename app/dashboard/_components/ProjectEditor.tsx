'use client';

import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { inputCls, labelCls } from './sharedStyles';
import { mdComponents } from './mdComponents';
import { MdToolbar } from './MdToolbar';
import { WritePrevToggle } from './WritePrevToggle';
import { resizeAndUploadImage } from '../../../lib/uploadImage';
import { ToolPicker, normalizeToolName } from './ToolPicker';
import { ToolOption, ProjectItem } from './types';

export interface CreditDraft { userId: string; role: string }

export function ProjectEditor({
  project, worldId, privyId, allTools, worldMembers = [], onSave, onCancel,
}: {
  project: ProjectItem | null;
  worldId: string;
  privyId: string;
  allTools: ToolOption[];
  worldMembers?: { userId: string; role: string; userName: string | null; userUsername: string | null }[];
  onSave: (p: ProjectItem) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(project?.name || '');
  const [description, setDescription] = useState(project?.description || '');
  const [content, setContent] = useState(project?.content || '');
  const [imageUrl, setImageUrl] = useState(project?.imageUrl || '');
  const [videoUrl, setVideoUrl] = useState(project?.videoUrl || '');
  const [url, setUrl] = useState(project?.url || '');
  const [tags, setTags] = useState<string[]>((project?.tags as string[]) || []);
  const [tagInput, setTagInput] = useState('');
  const [links, setLinks] = useState<{ label: string; url: string }[]>((project?.links as { label: string; url: string }[]) || []);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [contentPreview, setContentPreview] = useState(false);
  const [toolSearch, setToolSearch] = useState('');
  // Credits now ride the project object itself (list + save payloads include
  // them), so the editor reflects saved credits immediately — the old
  // slug-keyed refetch could resolve the wrong row when slugs collided,
  // which is exactly why saved credits "disappeared" from the editor.
  const [credits, setCredits] = useState<CreditDraft[]>(
    (project?.credits ?? []).map((c) => ({ userId: c.userId, role: c.role || '' })),
  );
  const [creditPick, setCreditPick] = useState('');

  const memberName = (userId: string) => {
    const m = worldMembers.find(x => x.userId === userId);
    return m ? (m.userName || m.userUsername || 'Unknown') : 'Unknown';
  };
  const uncredited = worldMembers.filter(m => !credits.some(c => c.userId === m.userId));

  const addCredit = () => {
    if (!creditPick || credits.some(c => c.userId === creditPick)) return;
    setCredits([...credits, { userId: creditPick, role: '' }]);
    setCreditPick('');
  };
  const setCreditRole = (userId: string, role: string) => setCredits(credits.map(c => c.userId === userId ? { ...c, role } : c));
  const removeCredit = (userId: string) => setCredits(credits.filter(c => c.userId !== userId));

  // Parse "tools:" from tags for display, but store them as regular tags prefixed
  // Actually: let's use tags for tools too — tags starting with "tool:" are tools
  const toolTags = tags.filter(t => t.startsWith('tool:'));
  const regularTags = tags.filter(t => !t.startsWith('tool:'));
  const selectedToolNames = toolTags.map(t => t.replace('tool:', ''));

  const toggleTool = (toolName: string) => {
    // Toggle by normalized name so picking a directory tool replaces a legacy
    // variant tag ("tool:ableton" vs "tool:Ableton") instead of duplicating.
    const n = normalizeToolName(toolName);
    const isVariant = (t: string) => t.startsWith('tool:') && normalizeToolName(t.slice(5)) === n;
    if (tags.some(isVariant)) setTags(tags.filter(t => !isVariant(t)));
    else setTags([...tags, `tool:${toolName}`]);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      // Blob URL, not base64 — keeps project rows small.
      setImageUrl(await resizeAndUploadImage(file, 1024, privyId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Image upload failed');
    } finally {
      setUploading(false);
    }
  };

  const addTag = () => {
    const t = tagInput.trim();
    if (t && !tags.includes(t)) setTags([...tags, t]);
    setTagInput('');
  };

  const addLink = () => setLinks([...links, { label: '', url: '' }]);
  const updateLink = (i: number, field: 'label' | 'url', val: string) => {
    const next = [...links]; next[i] = { ...next[i], [field]: val }; setLinks(next);
  };
  const removeLink = (i: number) => setLinks(links.filter((_, idx) => idx !== i));

  const save = async () => {
    if (!name.trim()) { setError('Project name is required'); return; }
    setSaving(true); setError('');
    try {
      const method = project ? 'PUT' : 'POST';
      const body: Record<string, unknown> = {
        worldId, privyId,
        name: name.trim(),
        description: description.trim() || null,
        content: content.trim() || null,
        imageUrl: imageUrl || null,
        videoUrl: videoUrl.trim() || null,
        url: url.trim() || null,
        tags: tags.length > 0 ? tags : null,
        links: links.filter(l => l.label && l.url).length > 0 ? links.filter(l => l.label && l.url) : null,
        credits: credits.map(c => ({ userId: c.userId, role: c.role.trim() || null })),
      };
      if (project) body.projectId = project.id;
      const res = await fetch('/api/worlds/projects', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to save'); return; }
      onSave(data.project);
    } catch { setError('Failed to save project'); } finally { setSaving(false); }
  };

  return (
    <div className="border border-ink/[0.08] rounded-lg overflow-hidden">
      <div className="bg-[var(--page-bg)] border-b border-ink/[0.06] px-4 py-2 flex items-center justify-between">
        <span className="font-mono text-[11px] uppercase tracking-[2px] text-ink/40">
          {project ? 'Edit project' : 'New project'}
        </span>
        <button onClick={onCancel} className="font-mono text-[14px] text-ink/30 hover:text-ink transition bg-transparent border-none cursor-pointer leading-none">×</button>
      </div>

      <div className="bg-[var(--page-bg)] p-4 sm:p-5 space-y-5">
        {/* Row 1: Name + Description */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Project name <span className="text-ink/30">*</span></label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="My Project" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Short description</label>
            <input type="text" value={description} onChange={e => setDescription(e.target.value)} placeholder="A brief one-liner..." className={inputCls} />
          </div>
        </div>

        {/* Row 2: Image + Video */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Cover image</label>
            {imageUrl && (
              <div className="mb-2 relative inline-block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imageUrl} alt="" className="max-w-full h-24 object-cover border border-ink/15 rounded-sm" />
                <button onClick={() => setImageUrl('')} className="absolute -top-1.5 -right-1.5 w-4 h-4 flex items-center justify-center rounded-full font-mono text-[12px] bg-obsidian text-bone cursor-pointer border-none leading-none">×</button>
              </div>
            )}
            <div className="flex gap-2 items-center">
              <label className={`shrink-0 font-mono text-[11px] uppercase tracking-[1px] border border-ink/15 rounded-sm px-3 py-2 transition ${uploading ? 'opacity-40' : 'cursor-pointer text-ink/60 hover:border-ink/40 hover:text-ink'}`}>
                {uploading ? 'Uploading…' : 'Upload'}
                <input type="file" accept="image/*" disabled={uploading} onChange={handleImageUpload} className="hidden" />
              </label>
              <input type="url" value={imageUrl.startsWith('data:') ? '' : imageUrl} onChange={e => setImageUrl(e.target.value)} placeholder="or paste URL" className={inputCls} />
            </div>
          </div>
          <div>
            <label className={labelCls}>Video URL</label>
            <input type="url" value={videoUrl} onChange={e => setVideoUrl(e.target.value)} placeholder="YouTube, Vimeo, etc." className={inputCls} />
            <p className="font-mono text-[11px] mt-1 text-ink/25">YouTube, Vimeo, Instagram, TikTok</p>
          </div>
        </div>

        {/* Content (Markdown) */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className={labelCls} style={{ marginBottom: 0 }}>Content</label>
            <WritePrevToggle preview={contentPreview} setPreview={setContentPreview} />
          </div>
          {!contentPreview ? (
            <>
              <MdToolbar tid="proj-content" value={content} onChange={setContent} />
              <textarea id="proj-content" value={content} onChange={e => setContent(e.target.value)} rows={6} placeholder="Write about this project... Supports **bold**, *italic*, [links](url)" className={inputCls} style={{ resize: 'vertical', minHeight: '120px' }} />
            </>
          ) : (
            <div className="border border-ink/10 rounded-sm px-4 py-3 min-h-[120px] bg-ink/[0.02]">
              {content ? <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>{content}</ReactMarkdown> : <p className="font-mono text-[12px] text-ink/25">Nothing to preview</p>}
            </div>
          )}
        </div>

        {/* Tools used */}
        {allTools.length > 0 && (
          <div>
            <label className={labelCls}>Tools used</label>
            <ToolPicker allTools={allTools} selected={selectedToolNames} onToggle={toggleTool} search={toolSearch} setSearch={setToolSearch} />
          </div>
        )}

        {/* Credits — world members with a free-text role each */}
        {worldMembers.length > 0 && (
          <div>
            <label className={labelCls}>Credits</label>
            {credits.map(c => (
              <div key={c.userId} className="flex items-center gap-2 mb-1.5">
                <span className="font-mono text-[12px] font-bold text-ink shrink-0 min-w-[110px] truncate">{memberName(c.userId)}</span>
                <input type="text" value={c.role} onChange={e => setCreditRole(c.userId, e.target.value)} placeholder="Role (e.g. design, sound)" className={inputCls + ' flex-1'} />
                <button type="button" onClick={() => removeCredit(c.userId)} className="font-mono text-[13px] text-ink/30 hover:text-ink transition px-1 bg-transparent border-none cursor-pointer">×</button>
              </div>
            ))}
            {uncredited.length > 0 && (
              <div className="flex gap-1.5">
                <select value={creditPick} onChange={e => setCreditPick(e.target.value)} className={inputCls + ' flex-1'}>
                  <option value="">Add a member…</option>
                  {uncredited.map(m => (
                    <option key={m.userId} value={m.userId}>{m.userName || m.userUsername || 'Unknown'}</option>
                  ))}
                </select>
                <button type="button" onClick={addCredit} disabled={!creditPick} className="px-3 py-2 border border-ink/15 text-ink/60 font-mono text-[13px] uppercase rounded-sm transition hover:border-ink/40 hover:text-ink cursor-pointer bg-transparent disabled:opacity-40">+</button>
              </div>
            )}
            <p className="font-mono text-[10px] text-ink/30 mt-1.5">Credits show on the project page and link to each person&apos;s passport. Invite someone to the world first to credit them.</p>
          </div>
        )}

        {/* Tags + URL in a row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Tags</label>
            {regularTags.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-1.5">
                {regularTags.map(t => (
                  <button key={t} type="button" onClick={() => setTags(tags.filter(x => x !== t))} className="flex items-center gap-0.5 px-2 py-0.5 border border-ink/15 text-ink/60 font-mono text-[11px] rounded-sm transition hover:border-ink/40 hover:text-ink cursor-pointer bg-transparent">
                    {t}<span className="text-[11px] text-ink/40">×</span>
                  </button>
                ))}
              </div>
            )}
            <div className="flex gap-1.5">
              <input type="text" value={tagInput} onChange={e => setTagInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }} placeholder="Add tag..." className={inputCls + ' flex-1'} />
              <button type="button" onClick={addTag} className="px-3 py-2 border border-ink/15 text-ink/60 font-mono text-[13px] uppercase rounded-sm transition hover:border-ink/40 hover:text-ink cursor-pointer bg-transparent">+</button>
            </div>
          </div>
          <div>
            <label className={labelCls}>Project URL</label>
            <input type="url" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://..." className={inputCls} />
          </div>
        </div>

        {/* Additional Links */}
        <div>
          <label className={labelCls}>Additional links</label>
          {links.map((link, i) => (
            <div key={i} className="flex gap-2 mb-1.5">
              <input type="text" value={link.label} onChange={e => updateLink(i, 'label', e.target.value)} placeholder="Label" className={inputCls + ' flex-1'} />
              <input type="url" value={link.url} onChange={e => updateLink(i, 'url', e.target.value)} placeholder="https://..." className={inputCls + ' flex-1'} />
              <button type="button" onClick={() => removeLink(i)} className="font-mono text-[13px] text-ink/30 hover:text-ink transition px-1 bg-transparent border-none cursor-pointer">×</button>
            </div>
          ))}
          <button type="button" onClick={addLink} className="font-mono text-[11px] uppercase tracking-[1px] text-ink/40 hover:text-ink transition bg-transparent border-none cursor-pointer">+ Add link</button>
        </div>

        {/* Actions */}
        {error && <p className="font-mono text-[11px] text-orange">{error}</p>}
        <div className="flex gap-2 pt-1">
          <button onClick={save} disabled={saving || uploading} className="font-mono text-[11px] uppercase tracking-[2px] bg-lime text-obsidian font-bold px-5 py-2 rounded-sm hover:opacity-90 transition disabled:opacity-40 cursor-pointer border-none">
            {saving ? 'Saving…' : project ? 'Save' : 'Create'}
          </button>
          <button onClick={onCancel} className="font-mono text-[11px] uppercase tracking-[2px] text-ink/60 border border-ink/15 hover:border-ink/40 hover:text-ink px-5 py-2 rounded-sm transition cursor-pointer bg-transparent">Cancel</button>
        </div>
      </div>
    </div>
  );
}
