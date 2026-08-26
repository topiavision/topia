'use client';

import { useState, useEffect, useMemo, useCallback, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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

/* ── Page ─────────────────────────────────────────────────────── */

export default function ProjectDetailPage({ params }: { params: Promise<{ slug: string; projectSlug: string }> }) {
  const { slug, projectSlug } = use(params);
  const router = useRouter();
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
  }, [world?.id, project?.id]);
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

  // ← → flip between sibling projects — same keys the world tabs use.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      const target = e.key === 'ArrowLeft' ? prevProject : nextProject;
      if (target) router.push(`/worlds/${slug}/projects/${target.slug}`);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [prevProject, nextProject, router, slug]);

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
      <section className="min-h-screen px-4 md:px-6 py-4 md:py-6 bg-[var(--page-bg)]">
        <div className="max-w-[var(--content-max)] mx-auto">
          <div className="relative z-10 max-w-[1320px] mx-auto border border-ink/[0.08] rounded-lg overflow-clip bg-[var(--page-bg)]">
            <div className="flex flex-col md:grid md:grid-cols-[252px_minmax(0,1fr)]">

              {/* ═══ SPINE — the world stays present ═══ */}
              <aside className="md:border-r md:border-ink/[0.06]">
                <div className="md:sticky md:top-[calc(var(--nav-height)+16px)] flex flex-col">
                  <div className={`${config.bg} px-4 py-2 flex items-center justify-between`}>
                    <span className={`font-mono text-[9px] uppercase tracking-[2px] ${config.textOn} opacity-70`}>topia://world/file</span>
                    <span className={`font-mono text-[10px] uppercase tracking-wider ${config.textOn} opacity-55`}>{fileNo}</span>
                  </div>

                  <div className="flex items-center gap-3 px-4 py-4 border-b border-ink/[0.05]">
                    <div className="w-11 h-11 rounded-lg border-2 border-ink/15 overflow-hidden shrink-0 bg-ink/[0.04]">
                      {world.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={world.imageUrl} alt={world.title} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center font-basement font-black text-[13px] text-ink/25 uppercase">{world.title[0]}</div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="font-basement font-black text-[15px] uppercase leading-none text-ink truncate">{world.title}</div>
                      <div className="font-mono text-[10px] text-ink/45 mt-1 truncate">topia://{world.slug}</div>
                      <Link href={`/worlds/${world.slug}#projects`} className="font-mono text-[9px] uppercase tracking-[1.5px] no-underline mt-1 block" style={{ color: 'var(--accent-ink)' }}>
                        ← back to world
                      </Link>
                    </div>
                  </div>

                  {/* Orbit index — every sibling one click away */}
                  <div className="hidden md:block py-3">
                    <span className="font-mono text-[10px] font-semibold uppercase tracking-[2px] text-ink/50 px-4 block mb-1.5">
                      in orbit · {siblings.length} {siblings.length === 1 ? 'project' : 'projects'}
                    </span>
                    {siblings.map((p) => {
                      const isCurrent = p.slug === projectSlug;
                      const firstTag = ((p.tags as string[] | null) || []).find((t) => !t.startsWith('tool:'));
                      return (
                        <Link
                          key={p.id}
                          href={`/worlds/${world.slug}/projects/${p.slug}`}
                          className={`flex items-center gap-2.5 px-4 py-2 no-underline border-l-[3px] transition-colors ${isCurrent ? 'bg-ink/[0.03]' : 'border-transparent hover:bg-ink/[0.02]'}`}
                          style={{ borderLeftColor: isCurrent ? config.hex : 'transparent' }}
                          aria-current={isCurrent ? 'page' : undefined}
                        >
                          <span className="w-8 h-6 rounded border border-ink/10 overflow-hidden shrink-0 bg-ink/[0.04]">
                            <ProjectThumb imageUrl={p.imageUrl} name={p.name} initialClassName="text-[8px]" />
                          </span>
                          <span className="min-w-0">
                            <span className={`font-mono text-[11px] font-bold uppercase block truncate ${isCurrent ? 'text-ink' : 'text-ink/55'}`}>{p.name}</span>
                            <span className={`font-mono text-[8.5px] uppercase tracking-[1px] block ${isCurrent ? '' : 'text-ink/35'}`} style={isCurrent ? { color: 'var(--accent-ink)' } : undefined}>
                              {isCurrent ? '● viewing' : firstTag || '—'}
                            </span>
                          </span>
                        </Link>
                      );
                    })}
                  </div>

                  <div className="hidden md:block px-4 py-3 border-t border-ink/[0.04] mt-auto">
                    <span className="font-mono text-[8px] tracking-[2px] text-ink/15 uppercase truncate block deco-text" data-deco={`P<TOPIA<${project.name.replace(/[^a-zA-Z0-9]/g, '<').toUpperCase().padEnd(18, '<')}`} />
                    <span className="font-mono text-[8px] tracking-[2px] text-ink/10 uppercase truncate block deco-text" data-deco={`${world.id.slice(0, 10)}<<${(logged || '').replace(/\s/g, '')}<<${(project.slug || '').padEnd(12, '<')}`} />
                  </div>
                </div>
              </aside>

              {/* ═══ FOLIO — the project file ═══ */}
              <main className="min-w-0 flex flex-col border-t border-ink/[0.06] md:border-t-0">

                {/* Registry header */}
                <div className="px-5 md:px-7 pt-5">
                  <div className="font-mono text-[9.5px] uppercase tracking-[1.5px] text-ink/40 mb-2.5 truncate">
                    <Link href="/worlds" className="no-underline text-ink/40 hover:text-ink/70 transition-colors">Worlds</Link>
                    <span className="mx-1.5 text-ink/20">/</span>
                    <Link href={`/worlds/${world.slug}`} className="no-underline font-bold text-ink/60 hover:text-ink transition-colors">{world.title}</Link>
                    <span className="mx-1.5 text-ink/20">/</span>
                    <Link href={`/worlds/${world.slug}#projects`} className="no-underline text-ink/40 hover:text-ink/70 transition-colors">Projects</Link>
                    <span className="mx-1.5 text-ink/20">/</span>
                    <span className="font-bold text-ink/70">{project.name}</span>
                  </div>

                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="min-w-0">
                      <h1 className="font-basement font-black text-[clamp(24px,3.4vw,38px)] leading-[0.92] uppercase text-ink">{project.name}</h1>
                      {project.description && (
                        <p className="font-zirkon text-[13px] text-ink/50 italic mt-2 max-w-[58ch]">&ldquo;{project.description}&rdquo;</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 mt-1">
                      {project.url && (
                        <a href={externalHref(project.url)} target="_blank" rel="noopener noreferrer" className={`font-mono text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-sm no-underline ${config.bg} ${config.textOn}`}>
                          Visit →
                        </a>
                      )}
                      <ShareButton
                        kind="project"
                        title={project.name}
                        text={`${project.name} — a project from ${world.title} on TOPIA`}
                        iconSize={11}
                        className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-ink/50 hover:text-ink/70 transition-colors border border-ink/[0.12] rounded-sm px-2.5 py-1 cursor-pointer bg-transparent"
                      />
                      {isBuilder && (
                        <Link href={`/dashboard/worlds/${world.slug}/projects`} className="font-mono text-[10px] uppercase tracking-wider text-ink/50 hover:text-ink/70 transition-colors border border-ink/[0.12] rounded-sm px-2.5 py-1 no-underline">
                          Edit
                        </Link>
                      )}
                    </div>
                  </div>
                </div>

                {/* Meta band */}
                <div className="mx-5 md:mx-7 mt-4 py-3 border-t border-b border-ink/[0.05] flex flex-wrap gap-x-7 gap-y-3">
                  <div>
                    <span className="font-mono text-[10px] font-semibold uppercase tracking-[2px] text-ink/50 block">file no.</span>
                    <span className="font-mono text-[11.5px] text-ink/70 mt-0.5 block tabular-nums">{fileNo}</span>
                  </div>
                  <div>
                    <span className="font-mono text-[10px] font-semibold uppercase tracking-[2px] text-ink/50 block">logged</span>
                    <span className="font-mono text-[11.5px] text-ink/70 mt-0.5 block">{logged || '—'}</span>
                  </div>
                  {regularTags.length > 0 && (
                    <div className="min-w-0">
                      <span className="font-mono text-[10px] font-semibold uppercase tracking-[2px] text-ink/50 block">tags</span>
                      <span className="flex flex-wrap gap-1 mt-1">
                        {regularTags.map((tag) => (
                          <span key={tag} className="font-mono text-[9px] uppercase tracking-[1px] border border-ink/[0.1] rounded-[3px] px-1.5 py-0.5 text-ink/50">{tag}</span>
                        ))}
                      </span>
                    </div>
                  )}
                </div>

                {/* Media hero — video wins over image; neither → text moves up */}
                {embed ? (
                  <div className="mx-5 md:mx-7 mt-5 rounded-lg overflow-hidden border border-ink/[0.08]" style={{ aspectRatio: embed.vertical ? '9/16' : '16/9', maxHeight: embed.vertical ? '440px' : undefined }}>
                    <iframe
                      src={embed.src}
                      className="w-full h-full"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      style={{ border: 'none' }}
                      title={project.name}
                    />
                  </div>
                ) : (
                  <div className="mx-5 md:mx-7 mt-5 rounded-lg overflow-hidden border border-ink/[0.08] max-h-[440px]">
                    <ProjectThumb imageUrl={project.imageUrl} name={project.name} alt={project.name} fallbackClassName="aspect-[16/5]" initialClassName="text-[clamp(32px,6vw,52px)]" />
                  </div>
                )}

                {/* Body: prose + side column */}
                <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_240px] gap-7 px-5 md:px-7 py-6 flex-1">
                  <article className="min-w-0 max-w-[62ch]">
                    {project.content ? (
                      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>{project.content}</ReactMarkdown>
                    ) : (
                      <p className="font-mono text-[11px] uppercase tracking-wider text-ink/30">No field notes yet</p>
                    )}
                  </article>

                  <aside className="min-w-0">
                    {credits.length > 0 && (
                      <div className="border border-ink/[0.08] rounded-lg px-4 py-3 mb-3 bg-ink/[0.02]">
                        <span className="font-mono text-[10px] font-semibold uppercase tracking-[2px] text-ink/50 block mb-2">credits</span>
                        {credits.map((c, i) => {
                          const initial = (c.name || c.username || '?')[0]?.toUpperCase();
                          const inner = (
                            <span className="flex items-center gap-2.5 py-1.5">
                              {c.avatarUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={c.avatarUrl} alt="" className="w-7 h-7 rounded-full object-cover border border-ink/10 shrink-0" />
                              ) : (
                                <span className={`w-7 h-7 rounded-full flex items-center justify-center font-basement font-black text-[10px] shrink-0 ${AVATAR_FILLS[i % AVATAR_FILLS.length]}`}>{initial}</span>
                              )}
                              <span className="min-w-0">
                                <span className="font-mono text-[11.5px] font-bold text-ink block truncate">{c.name || c.username || 'Unknown'}</span>
                                {c.role && <span className="font-mono text-[8.5px] uppercase tracking-[1px] block" style={{ color: 'var(--accent-ink)' }}>{c.role}</span>}
                              </span>
                            </span>
                          );
                          return c.username ? (
                            <Link key={c.userId} href={`/profile/${c.username}`} className="block no-underline hover:opacity-80 transition-opacity">{inner}</Link>
                          ) : (
                            <div key={c.userId}>{inner}</div>
                          );
                        })}
                      </div>
                    )}

                    {toolNames.length > 0 && (
                      <div className="border border-ink/[0.08] rounded-lg px-4 py-3 mb-3 bg-ink/[0.02]">
                        <span className="font-mono text-[10px] font-semibold uppercase tracking-[2px] text-ink/50 block mb-2">tools used</span>
                        {toolNames.map((name) => {
                          const match = registryTools.find((t) => norm(t.name) === norm(name) || norm(t.slug) === norm(name));
                          const fav = match ? faviconUrl(match.url, 32) : null;
                          const row = (
                            <span className="flex items-center gap-2 py-1.5">
                              <span className="w-5 h-5 rounded border border-ink/10 bg-ink/[0.04] overflow-hidden flex items-center justify-center shrink-0">
                                {fav ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={fav} alt="" className="w-full h-full object-contain" />
                                ) : (
                                  <span className="font-mono text-[9px] text-ink/40">{name[0]?.toUpperCase()}</span>
                                )}
                              </span>
                              <span className="font-mono text-[11.5px] text-ink truncate">{match?.name || name}</span>
                              {match?.category && <span className="font-mono text-[9px] text-ink/35 ml-auto shrink-0 truncate max-w-[80px]">{match.category.split(',')[0]}</span>}
                            </span>
                          );
                          return match ? (
                            <Link key={name} href={`/resources/tools/${match.slug}`} className="block no-underline hover:opacity-80 transition-opacity">{row}</Link>
                          ) : (
                            <div key={name}>{row}</div>
                          );
                        })}
                      </div>
                    )}

                    {(project.url || projectLinks.length > 0) && (
                      <div className="border border-ink/[0.08] rounded-lg px-4 py-3 bg-ink/[0.02]">
                        <span className="font-mono text-[10px] font-semibold uppercase tracking-[2px] text-ink/50 block mb-2">links</span>
                        {project.url && (
                          <a href={externalHref(project.url)} target="_blank" rel="noopener noreferrer" className={`flex items-center justify-between font-mono text-[10.5px] font-bold uppercase tracking-[1px] rounded-[5px] px-3 py-2 mb-1.5 no-underline ${config.bg} ${config.textOn}`}>
                            Visit <span>→</span>
                          </a>
                        )}
                        {projectLinks.map((link, i) => (
                          <a key={i} href={externalHref(link.url)} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between font-mono text-[10.5px] uppercase tracking-[1px] border border-ink/[0.1] rounded-[5px] px-3 py-2 mb-1.5 last:mb-0 no-underline text-ink hover:border-ink/30 transition-colors">
                            <span className="truncate">{link.label}</span> <span className="shrink-0 ml-2">→</span>
                          </a>
                        ))}
                      </div>
                    )}
                  </aside>
                </div>

                {/* In Process — this project's own roadmap + process log */}
                {(projectEras.length > 0 || isBuilder) && (
                  <div id="roadmap" className="border-t border-ink/[0.06] scroll-mt-[var(--nav-height,64px)]">
                    <InProcessLayer
                      eras={projectEras}
                      worldId={world.id}
                      slug={world.slug}
                      projects={[{ id: project.id, name: project.name, slug: project.slug }]}
                      canEdit={isBuilder}
                      onChanged={loadProjectEras}
                      projectScope={project.id}
                    />
                  </div>
                )}

                {/* Orbit navigation */}
                {(prevProject || nextProject) && (
                  <div className="grid grid-cols-2 border-t border-ink/[0.08]">
                    {prevProject ? (
                      <Link href={`/worlds/${world.slug}/projects/${prevProject.slug}`} className="px-5 md:px-7 py-3.5 no-underline hover:bg-ink/[0.02] transition-colors">
                        <span className="font-mono text-[8.5px] uppercase tracking-[2px] text-ink/40 block">← prev in orbit</span>
                        <span className="font-mono text-[12px] font-bold uppercase text-ink block truncate mt-0.5">{prevProject.name}</span>
                      </Link>
                    ) : <div />}
                    {nextProject ? (
                      <Link href={`/worlds/${world.slug}/projects/${nextProject.slug}`} className="px-5 md:px-7 py-3.5 no-underline hover:bg-ink/[0.02] transition-colors text-right border-l border-ink/[0.05]">
                        <span className="font-mono text-[8.5px] uppercase tracking-[2px] text-ink/40 block">next in orbit →</span>
                        <span className="font-mono text-[12px] font-bold uppercase text-ink block truncate mt-0.5">{nextProject.name}</span>
                      </Link>
                    ) : <div className="border-l border-ink/[0.05]" />}
                  </div>
                )}

                {/* More from this world */}
                {otherProjects.length > 0 && (
                  <div className="px-5 md:px-7 py-4 border-t border-ink/[0.05]">
                    <span className="font-mono text-[10px] font-semibold uppercase tracking-[2px] text-ink/50 block mb-2.5">more from {world.title}</span>
                    <div className="flex gap-2.5 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
                      {otherProjects.map((p) => (
                        <Link key={p.id} href={`/worlds/${world.slug}/projects/${p.slug}`} className="w-[150px] shrink-0 border border-ink/[0.08] rounded-md overflow-hidden no-underline bg-ink/[0.02] hover:border-ink/25 transition-colors">
                          <span className="block h-[62px] bg-ink/[0.04] overflow-hidden">
                            <ProjectThumb imageUrl={p.imageUrl} name={p.name} initialClassName="text-[16px]" />
                          </span>
                          <span className="font-mono text-[10px] font-bold uppercase text-ink block truncate px-2.5 py-2">{p.name}</span>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </main>
            </div>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
