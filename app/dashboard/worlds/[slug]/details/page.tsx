'use client';

import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { SocialIcon, SOCIAL_PLATFORMS } from '../../../../components/SocialIcons';
import { inputCls, labelCls } from '../../../_components/sharedStyles';
import { mdComponents } from '../../../_components/mdComponents';
import { MdToolbar } from '../../../_components/MdToolbar';
import { WritePrevToggle } from '../../../_components/WritePrevToggle';
import { resizeAndUploadImage } from '../../../../../lib/uploadImage';
import { ToolPicker, normalizeToolName } from '../../../_components/ToolPicker';
import { SocialLinks } from '../../../_components/types';
import { ReadOnlyBanner } from '../../../_components/ReadOnlyBanner';
import { useWorldDashboard } from '../layout';

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border border-ink/[0.08] rounded-lg overflow-hidden mb-5">
      <div className="bg-[var(--page-bg)] border-b border-ink/[0.06] px-4 py-2">
        <span className="font-mono text-[11px] uppercase tracking-[2px] text-ink/40">{title}</span>
      </div>
      <div className="bg-[var(--page-bg)] p-4 sm:p-5">{children}</div>
    </div>
  );
}

export default function WorldDetailsPage() {
  const { world, allTools, privyId, imageUrl, setImageUrl, isBuilder } = useWorldDashboard();

  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<'image' | 'header' | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [shortDescription, setShortDescription] = useState(world.shortDescription || '');
  const [description, setDescription] = useState(world.description || '');
  const [headerImageUrl, setHeaderImageUrl] = useState(world.headerImageUrl || '');
  const [tools, setTools] = useState(world.tools || '');
  const [socialLinks, setSocialLinks] = useState<SocialLinks>((world.socialLinks as SocialLinks) || {});
  const [toolSearch, setToolSearch] = useState('');
  const [descPreview, setDescPreview] = useState(!isBuilder);

  const selectedTools = tools.split(',').map(t => t.trim()).filter(Boolean);
  const toggleTool = (name: string) => {
    if (!isBuilder) return;
    const c = tools.split(',').map(t => t.trim()).filter(Boolean);
    // Toggle by normalized name so picking "Ableton" replaces a legacy
    // "ableton" instead of adding a duplicate variant.
    const n = normalizeToolName(name);
    const has = c.some(t => normalizeToolName(t) === n);
    setTools((has ? c.filter(t => normalizeToolName(t) !== n) : [...c, name]).join(', '));
  };

  const uploadImage = async (file: File | undefined, kind: 'image' | 'header') => {
    if (!file) return;
    setUploading(kind);
    setError('');
    try {
      // Blob URL, not a base64 data URL — world rows were migrated off base64
      // once already (scripts/migrate-world-images-to-blob.mjs).
      const url = await resizeAndUploadImage(file, kind === 'header' ? 1600 : 1024, privyId);
      if (kind === 'image') setImageUrl(url);
      else setHeaderImageUrl(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Image upload failed');
    } finally {
      setUploading(null);
    }
  };

  const saveDetails = async () => {
    if (!world || !isBuilder) return;
    setSaving(true); setError(''); setSuccess('');
    try {
      const res = await fetch('/api/worlds/update', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ worldId: world.id, privyId, shortDescription: shortDescription || null, description: description || null, imageUrl: imageUrl || null, headerImageUrl: headerImageUrl || null, tools: tools || null, socialLinks: Object.values(socialLinks).some(v => v) ? socialLinks : null }),
      });
      if (!res.ok) { let msg = 'Save failed'; try { const d = await res.json(); msg = d.error || msg; } catch { if (res.status === 413) msg = 'Images are too large.'; } setError(msg); return; }
      await res.json();
      setSuccess('Saved'); setTimeout(() => setSuccess(''), 3000);
    } catch (err) { setError(err instanceof Error ? err.message : 'Save failed'); } finally { setSaving(false); }
  };

  const uploadBtnCls = 'inline-block font-mono text-[11px] uppercase tracking-[1px] border border-ink/15 rounded-sm px-3 py-2 cursor-pointer text-ink/60 hover:border-ink/40 hover:text-ink transition';

  return (
    <div>
      {!isBuilder && <ReadOnlyBanner />}

      <SectionCard title="Images">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div>
            <span className={labelCls}>World image</span>
            <div className="flex items-center gap-3">
              {imageUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={imageUrl} alt="" className="w-16 h-16 rounded-sm object-cover border border-ink/15 shrink-0" />
              ) : (
                <div className="w-16 h-16 rounded-sm border border-dashed border-ink/20 bg-ink/[0.03] shrink-0" />
              )}
              {isBuilder && (
                <div className="flex flex-col gap-1.5">
                  <label className={`${uploadBtnCls} ${uploading === 'image' ? 'opacity-40 pointer-events-none' : ''}`}>
                    {uploading === 'image' ? 'Uploading…' : imageUrl ? 'Change' : 'Upload'}
                    <input type="file" accept="image/*" onChange={(e) => uploadImage(e.target.files?.[0], 'image')} className="hidden" />
                  </label>
                  {imageUrl && (
                    <button onClick={() => setImageUrl('')} className="font-mono text-[10px] uppercase tracking-[1px] text-ink/40 hover:text-ink transition bg-transparent border-none cursor-pointer text-left">
                      Remove
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
          <div>
            <span className={labelCls}>Header image</span>
            <div className="flex items-start gap-3">
              {headerImageUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={headerImageUrl} alt="" className="h-16 max-w-[60%] rounded-sm object-cover border border-ink/15" />
              ) : (
                <div className="w-28 h-16 rounded-sm border border-dashed border-ink/20 bg-ink/[0.03] shrink-0" />
              )}
              {isBuilder && (
                <div className="flex flex-col gap-1.5">
                  <label className={`${uploadBtnCls} ${uploading === 'header' ? 'opacity-40 pointer-events-none' : ''}`}>
                    {uploading === 'header' ? 'Uploading…' : headerImageUrl ? 'Change' : 'Upload'}
                    <input type="file" accept="image/*" onChange={(e) => uploadImage(e.target.files?.[0], 'header')} className="hidden" />
                  </label>
                  {headerImageUrl && (
                    <button onClick={() => setHeaderImageUrl('')} className="font-mono text-[10px] uppercase tracking-[1px] text-ink/40 hover:text-ink transition bg-transparent border-none cursor-pointer text-left">
                      Remove
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Description">
        <div className="space-y-4">
          <div>
            <span className={labelCls}>Short description</span>
            {isBuilder ? (
              <input type="text" value={shortDescription} onChange={e => setShortDescription(e.target.value)} placeholder="Brief one-liner" className={inputCls} />
            ) : (
              <p className={`font-mono text-[13px] ${shortDescription ? 'text-ink' : 'text-ink/30'}`}>{shortDescription || 'None'}</p>
            )}
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className={`${labelCls} mb-0`}>About</span>
              {isBuilder && <WritePrevToggle preview={descPreview} setPreview={setDescPreview} />}
            </div>
            {isBuilder && !descPreview ? (
              <>
                <MdToolbar tid="desc-editor" value={description} onChange={setDescription} />
                <textarea id="desc-editor" value={description} onChange={e => setDescription(e.target.value)} rows={8} placeholder="Write about this world..." className={inputCls} style={{ resize: 'vertical', minHeight: '150px' }} />
              </>
            ) : (
              <div className="border border-ink/10 rounded-sm px-4 py-3 min-h-[80px] bg-ink/[0.02]">
                {description ? <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>{description}</ReactMarkdown> : <p className="font-mono text-[12px] text-ink/25">{isBuilder ? 'Nothing to preview' : 'No description yet'}</p>}
              </div>
            )}
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Tools & social">
        <div className="space-y-5">
          <div>
            <span className={labelCls}>Tools</span>
            {isBuilder ? (
              allTools.length > 0 ? (
                <ToolPicker allTools={allTools} selected={selectedTools} onToggle={toggleTool} search={toolSearch} setSearch={setToolSearch} />
              ) : (
                <input type="text" value={tools} onChange={e => setTools(e.target.value)} placeholder="Comma-separated" className={inputCls} />
              )
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {selectedTools.length > 0 ? selectedTools.map(t => (
                  <span key={t} className="font-mono text-[11px] uppercase tracking-[1px] px-2.5 py-1 rounded-sm border border-ink/15 text-ink/60">{t}</span>
                )) : (
                  <p className="font-mono text-[11px] text-ink/30">None</p>
                )}
              </div>
            )}
          </div>
          <div>
            <span className={labelCls}>Social links</span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {SOCIAL_PLATFORMS.map(({ key, label, placeholder }) => {
                const val = (socialLinks as Record<string, string | undefined>)[key] || '';
                return (
                  <div key={key} className="flex items-center gap-2" title={label}>
                    <div className="text-ink/30 shrink-0"><SocialIcon type={key} size={14} /></div>
                    {isBuilder ? (
                      <input type="url" value={val} onChange={e => setSocialLinks(p => ({ ...p, [key]: e.target.value }))} placeholder={placeholder} className="flex-1 min-w-0 border-b border-ink/15 focus:border-lime/60 bg-transparent font-mono text-[16px] md:text-[12px] text-ink py-1.5 outline-none transition-colors" />
                    ) : val ? (
                      <a href={val} target="_blank" rel="noopener noreferrer" className="font-mono text-[12px] text-ink truncate hover:opacity-70 transition">{val}</a>
                    ) : (
                      <span className="font-mono text-[12px] text-ink/20">—</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </SectionCard>

      {/* Save — builders only */}
      {isBuilder && (
        <div className="flex items-center gap-3 pt-1">
          <button
            onClick={saveDetails}
            disabled={saving || uploading !== null}
            className="font-mono text-[11px] uppercase tracking-[2px] bg-lime text-obsidian font-bold px-5 py-2 rounded-sm hover:opacity-90 transition disabled:opacity-40 cursor-pointer border-none"
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>
          {error && <span className="font-mono text-[11px] text-orange">{error}</span>}
          {success && <span className="font-mono text-[11px]" style={{ color: 'var(--accent-ink)' }}>{success}</span>}
        </div>
      )}
    </div>
  );
}
