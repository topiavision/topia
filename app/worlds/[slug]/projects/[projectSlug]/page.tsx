'use client';

import { useState, useEffect, useMemo, useCallback, use } from 'react';
import Link from 'next/link';
import { usePrivy } from '@privy-io/react-auth';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import PageShell from '../../../../components/PageShell';
import LoadingBar from '../../../../components/LoadingBar';
import ShareButton from '../../../../components/ShareButton';
import ProjectThumb from '../../../../components/ProjectThumb';
import { getEmbedUrl, markdownComponents } from '../../../../components/ProjectContent';
import { getWorldConfig } from '../../../../components/world/worldConfig';
import InProcessLayer, { type EraView } from '../../../../components/world/InProcessLayer';
import { LoadFailed } from '../../../../components/AsyncStates';
import { faviconUrl } from '../../../../resources/tools/favicon';

/* ── Types ────────────────────────────────────────────────────── */

interface WorldBasic {
  id: string;
  title: string;
  slug: string;
  imageUrl: string | null;
  members: { userId: string; role: string }[];
}

interface Credit {
  userId: string;
  role: string | null;
  name: string | null;
  username: string | null;
  avatarUrl: string | null;
}

interface ProjectDetail {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  content?: string | null;
  imageUrl?: string | null;
  videoUrl?: string | null;
  url?: string | null;
  links?: { label: string; url: string }[] | null;
  tags?: string[] | null;
  createdAt?: string;
  credits?: Credit[];
}

interface RegistryTool {
  slug: string;
  name: string;
  url: string | null;
  category?: string | null;
}

// Same rule the world tools tab uses: compare lowercase alphanumerics so
// "Max/MSP" finds the directory's max-msp.
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

const AVATAR_FILLS = ['bg-lime text-obsidian', 'bg-blue text-bone', 'bg-pink text-obsidian', 'bg-green text-obsidian', 'bg-orange text-obsidian'];

const PROJECT_SECTIONS = [
  { id: 'progress', label: 'PROGRESS' },
  { id: 'story', label: 'STORY' },
  { id: 'media', label: 'MEDIA' },
  { id: 'builders', label: 'BUILDERS' },
] as const;
type ProjectSection = typeof PROJECT_SECTIONS[number]['id'];

/* ── Page ─────────────────────────────────────────────────────── */

export default function ProjectDetailPage({ params }: { params: Promise<{ slug: string; projectSlug: string }> }) {
  const { slug, projectSlug } = use(params);
  const { user, authenticated } = usePrivy();
  const [world, setWorld] = useState<WorldBasic | null>(null);
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [siblings, setSiblings] = useState<ProjectDetail[]>([]);
  const [registryTools, setRegistryTools] = useState<RegistryTool[]>([]);
  const [projectEras, setProjectEras] = useState<EraView[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // Not-found vs load-failed: a 404 means the file genuinely isn't there;
  // anything else (network, 500) gets an honest error + retry instead.
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [activeSection, setActiveSection] = useState<ProjectSection>('progress');

  useEffect(() => {
    let cancelled = false;
    setNotFound(false);
    setLoadError(false);

    fetch(`/api/worlds?slug=${slug}`)
      .then((r) => {
        if (!r.ok) throw new Error(`world fetch failed (${r.status})`);
        return r.json();
      })
      .then((data) => {
        if (cancelled) return;
        if (!data.worlds?.length) { setNotFound(true); setLoading(false); return; }
        const w = data.worlds[0];
        setWorld({ id: w.id, title: w.title, slug: w.slug, imageUrl: w.imageUrl ?? null, members: w.members ?? [] });

        return Promise.all([
          fetch(`/api/worlds/projects?worldId=${w.id}&slug=${projectSlug}`)
            .then((r) => {
              if (!r.ok) throw new Error(`project fetch failed (${r.status})`);
              return r.json();
            })
            .then((d) => {
              if (cancelled) return;
              if (d.project) setProject(d.project);
              else setNotFound(true);
            }),
          // Siblings are decorative (orbit index) — their failure must not
          // take down a project that loaded fine.
          fetch(`/api/worlds/projects?worldId=${w.id}`)
            .then((r) => r.json())
            .then((d) => { if (!cancelled) setSiblings(d.projects || []); })
            .catch(() => {}),
        ]);
      })
      .catch((err) => {
        console.error('[project] load failed', err);
        if (!cancelled) setLoadError(true);
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [slug, projectSlug, loadAttempt]);

  useEffect(() => {
    fetch('/api/tools').then((r) => r.json()).then((d) => setRegistryTools(d.tools || [])).catch(() => {});
  }, []);

  // This project's own roadmap (In Process section below the notes).
  const loadProjectEras = useCallback(() => {
    if (!world?.id || !project?.id) return;
    fetch(`/api/worlds/eras?worldId=${world.id}&projectId=${project.id}`)
      .then((r) => r.json())
      .then((d) => setProjectEras(d.eras ?? []))
      .catch(() => {});
  }, [world, project]);
  useEffect(() => { loadProjectEras(); }, [loadProjectEras]);

  useEffect(() => {
    if (!authenticated || !user?.id) { setCurrentUserId(null); return; }
    fetch(`/api/auth/profile?privyId=${encodeURIComponent(user.id)}`)
      .then((r) => r.json())
      .then((d) => { if (d.user) setCurrentUserId(d.user.id); })
      .catch(() => {});
  }, [authenticated, user?.id]);

  const config = useMemo(() => getWorldConfig(slug), [slug]);

  const isBuilder = useMemo(
    () => Boolean(currentUserId && world?.members.some((m) => m.userId === currentUserId && (m.role === 'world_builder' || m.role === 'owner'))),
    [currentUserId, world],
  );

  const currentIndex = useMemo(() => siblings.findIndex((p) => p.slug === projectSlug), [siblings, projectSlug]);
  const prevProject = currentIndex > 0 ? siblings[currentIndex - 1] : null;
  const nextProject = currentIndex >= 0 && currentIndex < siblings.length - 1 ? siblings[currentIndex + 1] : null;
  const otherProjects = useMemo(() => siblings.filter((p) => p.slug !== projectSlug).slice(0, 6), [siblings, projectSlug]);

  // Project sections deep-link without query strings so links survive Privy
  // OAuth. The old #roadmap anchor maps to the new Progress destination.
  useEffect(() => {
    function applyHash() {
      const hash = window.location.hash.slice(1);
      if (hash === 'roadmap') setActiveSection('progress');
      else if (PROJECT_SECTIONS.some((section) => section.id === hash)) setActiveSection(hash as ProjectSection);
    }
    applyHash();
    window.addEventListener('hashchange', applyHash);
    return () => window.removeEventListener('hashchange', applyHash);
  }, []);

  function selectSection(section: ProjectSection) {
    setActiveSection(section);
    history.replaceState(null, '', section === 'progress' ? window.location.pathname : `#${section}`);
  }

  const embed = project?.videoUrl ? getEmbedUrl(project.videoUrl) : null;
  const allTags = (project?.tags as string[] | null) || [];
  const toolNames = allTags.filter((t) => t.startsWith('tool:')).map((t) => t.replace('tool:', ''));
  const regularTags = allTags.filter((t) => !t.startsWith('tool:'));
  const projectLinks = (project?.links as { label: string; url: string }[] | null) || [];
  const credits = project?.credits || [];

  const logged = project?.createdAt
    ? new Date(project.createdAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }).toUpperCase()
    : null;
  const fileNo = world && project
    ? `PRJ-${world.id.slice(0, 4).toUpperCase()}-${String((currentIndex >= 0 ? currentIndex : 0) + 1).padStart(2, '0')}`
    : null;

  const externalHref = (u: string) => (u.startsWith('http') ? u : `https://${u}`);

  if (loading) {
    return (
      <PageShell>
        <div className="min-h-screen flex items-center justify-center bg-[var(--page-bg)]">
          <LoadingBar />
        </div>
      </PageShell>
    );
  }

  if (loadError && (!world || !project)) {
    return (
      <PageShell>
        <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--page-bg)]">
          <LoadFailed
            what="this project"
            onRetry={() => { setLoading(true); setLoadAttempt((n) => n + 1); }}
          />
          <Link href={`/worlds/${slug}`} className="font-mono text-[12px] underline text-ink">← Back to world</Link>
        </div>
      </PageShell>
    );
  }

  if (notFound || !world || !project) {
    return (
      <PageShell>
        <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-[var(--page-bg)]">
          <p className="font-mono text-[13px] text-ink">Project not found.</p>
          <Link href={`/worlds/${slug}`} className="font-mono text-[12px] underline text-ink">← Back to world</Link>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <section className="min-h-screen px-3 sm:px-4 md:px-6 py-3 md:py-5 bg-[var(--page-bg)]">
        <div className="relative z-10 max-w-[1320px] mx-auto border border-ink/[0.1] rounded-xl overflow-clip bg-[var(--page-bg)]">
          <header>
            <div className={`${config.bg} min-h-8 px-4 py-2 flex items-center justify-between gap-4`}>
              <span className={`min-w-0 truncate font-mono text-[9px] uppercase tracking-[2px] ${config.textOn} opacity-75`}>topia://project/{project.slug}</span>
              <span className={`shrink-0 font-mono text-[9px] font-bold uppercase tracking-[1.5px] ${config.textOn}`}>
                {projectEras.some((era) => era.status === 'active' && era.milestones.some((milestone) => milestone.status === 'now')) ? '● In motion' : 'Project'}
              </span>
            </div>

            <div className="p-4 md:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <Link href={`/worlds/${world.slug}#projects`} className="inline-flex items-center gap-2.5 no-underline group min-w-0">
                  <span className="w-9 h-9 rounded-md border border-ink/[0.12] overflow-hidden bg-ink/[0.04] shrink-0">
                    {world.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={world.imageUrl} alt="" className="w-full h-full object-cover" />
                    ) : <span className="w-full h-full flex items-center justify-center font-basement font-black text-[11px] text-ink/30">{world.title[0]}</span>}
                  </span>
                  <span className="min-w-0">
                    <span className="font-mono text-[8px] uppercase tracking-[1.5px] text-ink/35 block">World</span>
                    <span className="font-mono text-[11px] font-bold uppercase text-ink/65 group-hover:text-ink block truncate">{world.title} / Projects</span>
                  </span>
                </Link>
                <span className="font-mono text-[9px] uppercase tracking-[1.5px] text-ink/35">{currentIndex >= 0 ? `${currentIndex + 1} of ${siblings.length}` : `${siblings.length} projects`}</span>
              </div>

              <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-mono text-[9px] font-bold uppercase tracking-[2px]" style={{ color: 'var(--accent-ink)' }}>Project</p>
                  <h1 className="font-basement font-black text-[clamp(28px,4vw,42px)] leading-[0.92] uppercase text-ink mt-1 break-words">{project.name}</h1>
                  {project.description && <p className="font-zirkon text-[15px] leading-relaxed text-ink/60 mt-2 max-w-3xl">{project.description}</p>}
                </div>
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {project.url && <a href={externalHref(project.url)} target="_blank" rel="noopener noreferrer" className={`min-h-9 inline-flex items-center font-mono text-[10px] font-bold uppercase tracking-wider px-3 rounded-md no-underline ${config.bg} ${config.textOn}`}>Visit ↗</a>}
                  <ShareButton kind="project" title={project.name} text={`${project.name} — a project from ${world.title} on TOPIA`} iconSize={12} className="min-h-9 inline-flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-wider text-ink/60 hover:text-ink border border-ink/[0.16] rounded-md px-3 cursor-pointer bg-transparent" />
                  {isBuilder && <Link href={`/dashboard/worlds/${world.slug}/projects`} className="min-h-9 inline-flex items-center font-mono text-[10px] font-bold uppercase tracking-wider text-ink/60 hover:text-ink border border-ink/[0.16] rounded-md px-3 no-underline">Edit</Link>}
                </div>
              </div>
            </div>
          </header>

          <div role="tablist" aria-label={`${project.name} sections`} className="sticky top-[env(safe-area-inset-top,0px)] md:top-[var(--nav-height)] z-20 bg-[var(--page-bg)] border-y border-ink/[0.08] px-1 sm:px-2 flex items-center overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
            {PROJECT_SECTIONS.map((section) => {
              const active = activeSection === section.id;
              const count = section.id === 'progress' ? projectEras.length : section.id === 'builders' ? credits.length : undefined;
              return (
                <button key={section.id} id={`project-tab-${section.id}`} role="tab" aria-selected={active} aria-controls="project-tabpanel" onClick={() => selectSection(section.id)} className={`min-h-11 font-mono text-[10px] uppercase tracking-[1.5px] px-3 sm:px-4 whitespace-nowrap cursor-pointer bg-transparent border-x-0 border-t-0 border-b-2 border-solid transition-colors flex items-center gap-1.5 ${active ? 'text-ink font-bold' : 'text-ink/45 hover:text-ink/75'}`} style={{ borderBottomColor: active ? config.hex : 'transparent' }}>
                  {section.label}
                  {count !== undefined && <span className={`font-mono text-[9px] px-1.5 py-px rounded-full tabular-nums ${active ? `${config.bg} ${config.textOn}` : 'text-ink/40 border border-ink/[0.12]'}`}>{count}</span>}
                </button>
              );
            })}
          </div>

          <main id="project-tabpanel" role="tabpanel" aria-labelledby={`project-tab-${activeSection}`} className="min-h-[420px]">
            {activeSection === 'progress' && (
              projectEras.length > 0 || isBuilder ? (
                <InProcessLayer eras={projectEras} worldId={world.id} slug={world.slug} projects={[{ id: project.id, name: project.name, slug: project.slug }]} canEdit={isBuilder} onChanged={loadProjectEras} projectScope={project.id} />
              ) : (
                <div className="min-h-[360px] flex flex-col items-center justify-center text-center p-6">
                  <p className="font-mono text-[11px] font-bold uppercase tracking-[1.5px] text-ink/50">No public roadmap yet</p>
                  <p className="font-zirkon text-[14px] text-ink/45 mt-2 max-w-md">When the builders publish milestones and process updates, the project&apos;s progress will live here.</p>
                </div>
              )
            )}

            {activeSection === 'story' && (
              <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_280px] gap-7 p-5 md:p-7">
                <article className="min-w-0 max-w-[68ch]">
                  {project.content ? <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>{project.content}</ReactMarkdown> : <p className="font-mono text-[11px] uppercase tracking-wider text-ink/35">No story published yet</p>}
                </article>
                <aside className="min-w-0 space-y-3">
                  <div className="rounded-lg border border-ink/[0.1] p-4">
                    <span className="font-mono text-[9px] font-bold uppercase tracking-[2px] text-ink/45 block">Project details</span>
                    <dl className="mt-3 space-y-2.5">
                      <div><dt className="font-mono text-[8px] uppercase tracking-[1.5px] text-ink/35">Logged</dt><dd className="font-mono text-[11px] text-ink/65 mt-0.5">{logged || '—'}</dd></div>
                      <div><dt className="font-mono text-[8px] uppercase tracking-[1.5px] text-ink/35">File</dt><dd className="font-mono text-[11px] text-ink/65 mt-0.5">{fileNo}</dd></div>
                      {regularTags.length > 0 && <div><dt className="font-mono text-[8px] uppercase tracking-[1.5px] text-ink/35">Tags</dt><dd className="flex flex-wrap gap-1 mt-1">{regularTags.map((tag) => <span key={tag} className="font-mono text-[9px] uppercase tracking-[1px] border border-ink/[0.12] rounded px-1.5 py-0.5 text-ink/55">{tag}</span>)}</dd></div>}
                    </dl>
                  </div>
                  {toolNames.length > 0 && (
                    <div className="rounded-lg border border-ink/[0.1] p-4">
                      <span className="font-mono text-[9px] font-bold uppercase tracking-[2px] text-ink/45 block mb-2">Tools used</span>
                      {toolNames.map((name) => {
                        const match = registryTools.find((tool) => norm(tool.name) === norm(name) || norm(tool.slug) === norm(name));
                        const fav = match ? faviconUrl(match.url, 32) : null;
                        const row = (
                          <span className="min-h-9 flex items-center gap-2">
                            <span className="w-5 h-5 rounded border border-ink/10 bg-ink/[0.04] overflow-hidden flex items-center justify-center shrink-0">
                              {fav ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={fav} alt="" className="w-full h-full object-contain" />
                              ) : <span className="font-mono text-[9px] text-ink/40">{name[0]?.toUpperCase()}</span>}
                            </span>
                            <span className="font-mono text-[11px] text-ink/70 truncate">{match?.name || name}</span>
                          </span>
                        );
                        return match ? <Link key={name} href={`/resources/tools/${match.slug}`} className="block no-underline hover:opacity-80">{row}</Link> : <div key={name}>{row}</div>;
                      })}
                    </div>
                  )}
                  {(project.url || projectLinks.length > 0) && (
                    <div className="rounded-lg border border-ink/[0.1] p-4">
                      <span className="font-mono text-[9px] font-bold uppercase tracking-[2px] text-ink/45 block mb-2">Links</span>
                      {project.url && <a href={externalHref(project.url)} target="_blank" rel="noopener noreferrer" className="min-h-9 flex items-center justify-between font-mono text-[10px] font-bold uppercase tracking-[1px] no-underline text-ink/70">Project site <span>↗</span></a>}
                      {projectLinks.map((link) => <a key={`${link.label}-${link.url}`} href={externalHref(link.url)} target="_blank" rel="noopener noreferrer" className="min-h-9 flex items-center justify-between font-mono text-[10px] uppercase tracking-[1px] no-underline text-ink/60 border-t border-ink/[0.06]">{link.label}<span>↗</span></a>)}
                    </div>
                  )}
                </aside>
              </div>
            )}

            {activeSection === 'media' && (
              <div className="p-5 md:p-7">
                {embed ? (
                  <div className="max-w-5xl mx-auto rounded-xl overflow-hidden border border-ink/[0.1]" style={{ aspectRatio: embed.vertical ? '9/16' : '16/9', maxHeight: embed.vertical ? '680px' : undefined }}><iframe src={embed.src} className="w-full h-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen style={{ border: 'none' }} title={project.name} /></div>
                ) : project.imageUrl ? (
                  <div className="max-w-5xl mx-auto rounded-xl overflow-hidden border border-ink/[0.1] max-h-[680px]"><ProjectThumb imageUrl={project.imageUrl} name={project.name} alt={project.name} fallbackClassName="aspect-[16/9]" initialClassName="text-[clamp(32px,6vw,52px)]" /></div>
                ) : (
                  <div className="min-h-[320px] flex items-center justify-center"><p className="font-mono text-[11px] uppercase tracking-[1.5px] text-ink/35">No media published yet</p></div>
                )}
              </div>
            )}

            {activeSection === 'builders' && (
              <div className="p-5 md:p-7">
                {credits.length === 0 ? <div className="min-h-[320px] flex items-center justify-center"><p className="font-mono text-[11px] uppercase tracking-[1.5px] text-ink/35">No credited builders yet</p></div> : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {credits.map((credit, index) => {
                      const inner = (
                        <span className="min-h-[72px] flex items-center gap-3 rounded-lg border border-ink/[0.1] p-3 hover:border-ink/30 transition-colors">
                          {credit.avatarUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={credit.avatarUrl} alt="" className="w-11 h-11 rounded-full object-cover border border-ink/10 shrink-0" />
                          ) : (
                            <span className={`w-11 h-11 rounded-full flex items-center justify-center font-basement font-black text-[12px] shrink-0 ${AVATAR_FILLS[index % AVATAR_FILLS.length]}`}>{(credit.name || credit.username || '?')[0]?.toUpperCase()}</span>
                          )}
                          <span className="min-w-0">
                            <span className="font-mono text-[12px] font-bold uppercase text-ink block truncate">{credit.name || credit.username || 'Unknown'}</span>
                            {credit.username && <span className="font-mono text-[10px] text-ink/40 block truncate">@{credit.username}</span>}
                            <span className="font-mono text-[8px] uppercase tracking-[1.5px] block mt-1" style={{ color: 'var(--accent-ink)' }}>{credit.role || 'Contributor'}</span>
                          </span>
                        </span>
                      );
                      return credit.username ? <Link key={credit.userId} href={`/profile/${credit.username}`} className="no-underline">{inner}</Link> : <div key={credit.userId}>{inner}</div>;
                    })}
                  </div>
                )}
              </div>
            )}
          </main>

          {(prevProject || nextProject) && (
            <nav aria-label="Other projects in this world" className="grid grid-cols-2 border-t border-ink/[0.08]">
              {prevProject ? <Link href={`/worlds/${world.slug}/projects/${prevProject.slug}`} className="px-4 md:px-6 py-4 no-underline hover:bg-ink/[0.025] transition-colors"><span className="font-mono text-[8px] uppercase tracking-[2px] text-ink/40 block">← Previous project</span><span className="font-mono text-[11px] font-bold uppercase text-ink block truncate mt-1">{prevProject.name}</span></Link> : <div />}
              {nextProject ? <Link href={`/worlds/${world.slug}/projects/${nextProject.slug}`} className="px-4 md:px-6 py-4 no-underline hover:bg-ink/[0.025] transition-colors text-right border-l border-ink/[0.06]"><span className="font-mono text-[8px] uppercase tracking-[2px] text-ink/40 block">Next project →</span><span className="font-mono text-[11px] font-bold uppercase text-ink block truncate mt-1">{nextProject.name}</span></Link> : <div className="border-l border-ink/[0.06]" />}
            </nav>
          )}

          {otherProjects.length > 0 && (
            <div className="px-4 md:px-6 py-4 border-t border-ink/[0.06]">
              <span className="font-mono text-[9px] font-bold uppercase tracking-[2px] text-ink/45 block mb-2.5">More from {world.title}</span>
              <div className="flex gap-2.5 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
                {otherProjects.map((item) => <Link key={item.id} href={`/worlds/${world.slug}/projects/${item.slug}`} className="w-[156px] shrink-0 border border-ink/[0.1] rounded-lg overflow-hidden no-underline hover:border-ink/30 transition-colors"><span className="block h-[68px] bg-ink/[0.04] overflow-hidden"><ProjectThumb imageUrl={item.imageUrl} name={item.name} initialClassName="text-[16px]" /></span><span className="font-mono text-[10px] font-bold uppercase text-ink block truncate px-2.5 py-2">{item.name}</span></Link>)}
              </div>
            </div>
          )}
          </div>
      </section>
    </PageShell>
  );
}
