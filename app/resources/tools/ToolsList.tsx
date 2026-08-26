'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { Skeleton } from '../../components/Skeleton';
import { LoadFailed } from '../../components/AsyncStates';
import { faviconUrl } from './favicon';
import { fuzzyMatch } from './fuzzy';

// Both modals only render on click — keep them out of the tools-page bundle.
const ToolModal = dynamic(() => import('./ToolModal'), { ssr: false });
const SubmitToolModal = dynamic(() => import('./SubmitToolModal'), { ssr: false });

interface ToolUser {
  username: string | null;
  name: string | null;
  avatarUrl: string | null;
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
  users?: ToolUser[];
  userCount?: number;
}

const CATEGORIES = [
  'all', '3d', 'ads', 'ai', 'analytics', 'animation', 'app developer', 'brand',
  'code', 'community', 'content creation', 'creator monetization', 'curation',
  'deck creation', 'design', 'development', 'distribution', 'documentation',
  'editing', 'funding', 'image generator', 'inspiration', 'magazine', 'mood board',
  'music', 'podcast', 'production', 'productivity', 'research', 'social platform',
  'survey', 'trading platform', 'web3', 'website builder',
];

const SORT_OPTIONS = [
  { value: 'name_asc',  label: 'A → Z' },
  { value: 'name_desc', label: 'Z → A' },
  { value: 'newest',    label: 'Newest' },
  { value: 'popular',   label: 'Most used' },
];

function parseCategories(s: string | null): string[] {
  if (!s) return [];
  return s.split(',').map((c) => c.trim()).filter(Boolean);
}

interface TrendingTool {
  id: string;
  slug: string;
  name: string;
  url: string | null;
  category: string | null;
  score?: number;
}

export default function ToolsList({ initialTools = [] }: { initialTools?: Tool[] }) {
  const [allTools, setAllTools] = useState<Tool[]>(initialTools);
  const [loading, setLoading] = useState(initialTools.length === 0);
  // A failed directory fetch must render as an error with retry, not as
  // the "no tools found" empty state.
  const [loadError, setLoadError] = useState(false);
  const [initialLoad, setInitialLoad] = useState(initialTools.length === 0);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('name_asc');
  const [modalSlug, setModalSlug] = useState<string | null>(null);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [trending, setTrending] = useState<TrendingTool[]>([]);
  const [newest, setNewest] = useState<TrendingTool[]>([]);
  const [visibleCount, setVisibleCount] = useState(24);
  const initialFetchedRef = useRef(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // ?submit=1 deep-link (dashboard "+ Tool" quick action) — open the submit
  // modal on arrival, then strip the param so refresh/back doesn't reopen it.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get('submit') === '1') {
      setSubmitOpen(true);
      url.searchParams.delete('submit');
      window.history.replaceState(null, '', url.pathname + url.search);
    }
  }, []);

  // Set of slugs added in the last 30 days (from /api/tools/trending newest)
  const newSlugSet = useMemo(() => new Set(newest.map((t) => t.slug)), [newest]);

  // Reset paging whenever the filter set changes
  useEffect(() => {
    setVisibleCount(24);
  }, [search, selectedCategory, sortBy]);

  // Keyboard shortcut: '/' focuses search (unless an input is already focused)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const tag = (document.activeElement?.tagName ?? '').toLowerCase();
        if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Single fetch — load everything once, filter & sort client-side for instant feel + fuzzy.
  // Skipped when the server page already seeded the list. Also the retry path.
  const fetchTools = async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const response = await fetch('/api/tools');
      if (!response.ok) throw new Error(`tools fetch failed (${response.status})`);
      const data = await response.json();
      setAllTools((data.tools as Tool[]) || []);
    } catch (error) {
      console.error('Error fetching tools:', error);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    if (initialFetchedRef.current) return;
    initialFetchedRef.current = true;
    if (initialTools.length > 0) return;
    void fetchTools();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Trending + newest
  useEffect(() => {
    fetch('/api/tools/trending')
      .then((r) => r.json())
      .then(({ trending, newest }) => {
        setTrending(trending ?? []);
        setNewest(newest ?? []);
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (!loading && allTools.length > 0) setInitialLoad(false);
  }, [loading, allTools]);

  // Apply category filter + fuzzy search + sort client-side
  const tools = useMemo(() => {
    let list: Tool[] = allTools;

    if (selectedCategory && selectedCategory !== 'all') {
      list = list.filter((t) => parseCategories(t.category).some((c) => c.toLowerCase().includes(selectedCategory.toLowerCase())));
    }

    if (search) {
      list = fuzzyMatch(search, list, (t) => [t.name, t.description ?? '', t.category ?? '']);
    }

    if (search) {
      // Fuzzy returns sorted by relevance — preserve order.
      return list;
    }

    switch (sortBy) {
      case 'name_desc': return [...list].sort((a, b) => b.name.localeCompare(a.name));
      case 'newest':    return list; // server already sorted; fall through (no createdAt on client)
      case 'popular':   return [...list].sort((a, b) => (b.userCount ?? 0) - (a.userCount ?? 0));
      default:          return [...list].sort((a, b) => a.name.localeCompare(b.name));
    }
  }, [allTools, selectedCategory, search, sortBy]);

  return (
    <div className="min-h-screen bg-[var(--page-bg)] text-ink">
      <section className="px-4 md:px-6 py-4 md:py-6">
        <div className="max-w-[var(--content-max)] mx-auto">
          <div className="grid grid-cols-1 gap-[3px] border border-ink/[0.08] rounded-lg overflow-hidden">

            {/* ─── ROW 1: Title bar ─── */}
            <div className="bg-lime relative">
              <div className="px-4 md:px-6 py-4 md:py-5 flex flex-col md:flex-row md:items-end md:justify-between gap-3">
                <div>
                  <span className="font-mono text-[11px] uppercase tracking-[2px] text-[var(--on-accent-muted)] block">tools // toolkit</span>
                  <h1 className="font-basement font-black text-[clamp(28px,5vw,64px)] uppercase leading-[0.9] text-obsidian mt-1">
                    TOOLS
                  </h1>
                </div>
                <div className="flex flex-col items-start md:items-end gap-1">
                  <span className="font-mono text-[12px] text-obsidian/80 leading-snug">software, hardware, platforms.</span>
                  <span className="font-mono text-[12px] text-[var(--on-accent-muted)] leading-snug">what creators use to build worlds.</span>
                  <button
                    onClick={() => setSubmitOpen(true)}
                    className="submit-tool-btn mt-2 self-start md:self-end font-mono text-[11px] font-bold uppercase tracking-[2px] text-obsidian border border-obsidian/30 hover:bg-obsidian hover:text-lime px-3 py-1.5 rounded-sm bg-transparent cursor-pointer transition"
                  >
                    + submit a tool
                  </button>
                </div>
              </div>
            </div>

            {/* ─── ROW 2: Search + sort + count ─── */}
            <div className="bg-[var(--page-bg)] border-t border-b border-ink/[0.06] px-4 py-3 flex flex-col md:flex-row md:items-center gap-3 md:gap-4 sticky top-0 md:top-[var(--nav-height,56px)] z-30">
              <div className="relative flex-1">
                <input
                  ref={searchInputRef}
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="search tools…  press /"
                  className="w-full bg-transparent border border-ink/15 focus:border-ink/40 font-mono text-[13px] text-ink placeholder:text-ink/25 px-3 py-1.5 pr-10 rounded-sm outline-none transition-colors"
                />
                {search && (
                  <button
                    onClick={() => setSearch('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 font-mono text-[14px] text-[var(--text-muted)] hover:text-ink transition bg-transparent border-none cursor-pointer w-5 h-5 flex items-center justify-center"
                    aria-label="Clear search"
                  >
                    ×
                  </button>
                )}
              </div>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                aria-label="Sort tools"
                className="bg-transparent border border-ink/15 focus:border-ink/40 font-mono text-[12px] uppercase tracking-[1px] text-ink/70 px-3 py-1.5 rounded-sm outline-none cursor-pointer transition-colors"
              >
                {SORT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value} className="bg-[var(--page-bg)] text-ink">{opt.label}</option>
                ))}
              </select>
              <span className="font-mono text-[11px] uppercase tracking-[2px] text-[var(--text-muted)] md:ml-auto shrink-0">
                {tools.length} tool{tools.length !== 1 ? 's' : ''}
              </span>
            </div>

            {/* ─── ROW 3: Category chips ─── */}
            <div className="bg-[var(--page-bg)] border-b border-ink/[0.06] px-4 py-2 flex items-center gap-1.5 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
              {CATEGORIES.map((cat) => {
                const active = selectedCategory === cat;
                return (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`font-mono text-[11px] uppercase tracking-wider px-2.5 py-1 rounded-sm whitespace-nowrap transition cursor-pointer ${
                      active
                        ? 'bg-lime text-obsidian font-bold border-transparent'
                        : 'text-[var(--text-muted)] hover:text-ink/80 bg-transparent border border-transparent'
                    }`}
                  >
                    {cat}
                  </button>
                );
              })}
            </div>

            {/* ─── ROW 3.5: Trending & new (only when not filtering/searching) ─── */}
            {!search && selectedCategory === 'all' && (trending.length > 0 || newest.length > 0) && (
              <div className="bg-[var(--page-bg)] border-b border-ink/[0.06] px-4 py-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                {trending.length > 0 && (
                  <div>
                    <span className="font-mono text-[10px] uppercase tracking-[2px] text-ink/30 block mb-2">
                      ◉ trending now
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {trending.slice(0, 6).map((t) => {
                        const fav = faviconUrl(t.url, 32);
                        return (
                          <button
                            key={t.slug}
                            onClick={() => setModalSlug(t.slug)}
                            className="inline-flex items-center gap-2 border border-ink/15 hover:border-[var(--accent-ink)]/50 px-2.5 py-1.5 rounded-sm transition cursor-pointer bg-ink/[0.02]"
                          >
                            {fav && (
                              /* eslint-disable-next-line @next/next/no-img-element */
                              <img src={fav} alt="" width={16} height={16} loading="lazy" className="w-4 h-4 rounded-sm object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                            )}
                            <span className="font-mono text-[11px] text-ink">{t.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
                {newest.length > 0 && (
                  <div>
                    <span className="font-mono text-[10px] uppercase tracking-[2px] text-ink/30 block mb-2">
                      ✦ new this month
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {newest.slice(0, 6).map((t) => {
                        const fav = faviconUrl(t.url, 32);
                        return (
                          <button
                            key={t.slug}
                            onClick={() => setModalSlug(t.slug)}
                            className="inline-flex items-center gap-2 border border-ink/15 hover:border-pink/50 px-2.5 py-1.5 rounded-sm transition cursor-pointer bg-ink/[0.02]"
                          >
                            {fav && (
                              /* eslint-disable-next-line @next/next/no-img-element */
                              <img src={fav} alt="" width={16} height={16} loading="lazy" className="w-4 h-4 rounded-sm object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                            )}
                            <span className="font-mono text-[11px] text-ink">{t.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ─── ROW 4: Grid ─── */}
            <div className="bg-[var(--page-bg)] p-4 md:p-6 min-h-[400px]">
              {loading && initialLoad ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3" aria-busy="true">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="border border-ink/10 rounded-lg p-4">
                      <div className="flex items-center gap-3 mb-3">
                        <Skeleton className="h-10 w-10 rounded-md" />
                        <Skeleton className="h-4 w-1/2" />
                      </div>
                      <Skeleton className="h-3 w-full mb-2" />
                      <Skeleton className="h-3 w-2/3" />
                    </div>
                  ))}
                </div>
              ) : loadError && allTools.length === 0 && !loading ? (
                /* Fetch failed with nothing loaded — an error, not emptiness. */
                <LoadFailed what="the tools directory" onRetry={() => void fetchTools()} className="py-16" />
              ) : tools.length === 0 && !loading ? (
                <div className="text-center py-16">
                  <p className="font-mono text-[13px] uppercase tracking-[2px] text-[var(--text-muted)] mb-4">
                    {search
                      ? `no tools matching "${search}"${selectedCategory !== 'all' ? ` in ${selectedCategory}` : ''}`
                      : 'no tools found'}
                  </p>
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    {search && (
                      <button
                        onClick={() => setSearch('')}
                        className="font-mono text-[11px] uppercase tracking-[2px] text-lime border border-lime/30 hover:bg-lime hover:text-obsidian px-3 py-1.5 rounded-sm bg-transparent cursor-pointer transition"
                      >
                        clear search
                      </button>
                    )}
                    {selectedCategory !== 'all' && (
                      <button
                        onClick={() => setSelectedCategory('all')}
                        className="font-mono text-[11px] uppercase tracking-[2px] text-ink/60 border border-ink/20 hover:border-ink/60 px-3 py-1.5 rounded-sm bg-transparent cursor-pointer transition"
                      >
                        reset category
                      </button>
                    )}
                    <button
                      onClick={() => setSubmitOpen(true)}
                      className="font-mono text-[11px] uppercase tracking-[2px] text-ink/60 border border-ink/20 hover:border-ink/60 px-3 py-1.5 rounded-sm bg-transparent cursor-pointer transition"
                    >
                      + submit a tool
                    </button>
                  </div>
                </div>
              ) : (
                <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 transition-opacity duration-200 ${loading ? 'opacity-50' : 'opacity-100'}`}>
                  {tools.slice(0, visibleCount).map((tool) => {
                    const categories = parseCategories(tool.category);
                    const favicon = faviconUrl(tool.url, 64);
                    const isNew = newSlugSet.has(tool.slug);
                    return (
                      <button
                        key={tool.id}
                        onClick={() => setModalSlug(tool.slug)}
                        className="relative text-left bg-ink/[0.02] hover:bg-ink/[0.06] border border-ink/10 hover:border-[var(--accent-ink)]/40 rounded-md p-4 transition-all flex flex-col gap-3 cursor-pointer"
                      >
                        {isNew && (
                          <span className="absolute top-2 right-2 font-mono text-[8px] uppercase tracking-[2px] bg-pink/15 text-pink border border-pink/30 px-1.5 py-0.5 rounded-sm">
                            ✦ new
                          </span>
                        )}
                        <div className="flex items-start gap-3">
                          <div className="shrink-0 w-10 h-10 rounded-sm border border-ink/10 bg-ink/[0.04] overflow-hidden flex items-center justify-center">
                            {favicon ? (
                              /* eslint-disable-next-line @next/next/no-img-element */
                              <img src={favicon} alt="" width={40} height={40} loading="lazy" className="w-full h-full object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                            ) : (
                              <span className="font-basement text-base text-ink/30">{tool.name[0]?.toUpperCase()}</span>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <h2 className="font-mono text-[13px] uppercase font-bold text-ink truncate">{tool.name}</h2>
                              {tool.featured && !isNew && (
                                <span className="font-mono text-[9px] uppercase tracking-wider text-[var(--accent-ink)]/80 shrink-0">★</span>
                              )}
                            </div>
                            {tool.pricing && (
                              <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-muted)] mt-0.5 block">{tool.pricing}</span>
                            )}
                          </div>
                        </div>

                        {tool.description && (
                          <p className="font-mono text-[11px] text-ink/60 leading-relaxed line-clamp-2">{tool.description}</p>
                        )}

                        <div className="flex items-center justify-between mt-auto pt-2 border-t border-ink/[0.06]">
                          {/* Categories */}
                          <div className="flex flex-wrap gap-1">
                            {categories.slice(0, 2).map((cat) => (
                              <span
                                key={cat}
                                className="font-mono text-[9px] uppercase tracking-wider px-1.5 py-0.5 border border-ink/10 text-[var(--text-muted)] rounded-sm"
                              >
                                {cat}
                              </span>
                            ))}
                          </div>
                          {/* Users using */}
                          {(tool.userCount ?? 0) > 0 && (
                            <div className="flex items-center -space-x-1.5">
                              {(tool.users || []).slice(0, 3).map((u, i) => (
                                <span
                                  key={i}
                                  className="relative block w-5 h-5 rounded-full border overflow-hidden bg-ink/5"
                                  style={{ borderColor: '#1a1a1a', zIndex: 3 - i }}
                                  title={u.name || u.username || ''}
                                >
                                  {u.avatarUrl ? (
                                    /* eslint-disable-next-line @next/next/no-img-element */
                                    <img src={u.avatarUrl} alt="" className="w-full h-full object-cover" />
                                  ) : (
                                    <span className="w-full h-full flex items-center justify-center font-basement text-[9px] text-[var(--text-muted)]">
                                      {(u.name || u.username || '?')[0]?.toUpperCase()}
                                    </span>
                                  )}
                                </span>
                              ))}
                              {(tool.userCount ?? 0) > 3 && (
                                <span
                                  className="relative w-5 h-5 rounded-full border flex items-center justify-center font-mono text-[9px] font-bold bg-ink/10 text-ink/60"
                                  style={{ borderColor: '#1a1a1a', zIndex: 0 }}
                                >
                                  +{(tool.userCount ?? 0) - 3}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Load more */}
              {!loading && tools.length > visibleCount && (
                <div className="mt-6 flex flex-col items-center gap-2">
                  <span className="font-mono text-[10px] uppercase tracking-[2px] text-ink/30">
                    showing {visibleCount} of {tools.length}
                  </span>
                  <button
                    onClick={() => setVisibleCount((n) => n + 24)}
                    className="font-mono text-[11px] uppercase tracking-[2px] text-ink/70 hover:text-ink border border-ink/20 hover:border-ink/60 px-4 py-2 rounded-sm bg-transparent cursor-pointer transition"
                  >
                    load more →
                  </button>
                  {tools.length > visibleCount + 24 && (
                    <button
                      onClick={() => setVisibleCount(tools.length)}
                      className="font-mono text-[10px] uppercase tracking-[2px] text-ink/30 hover:text-ink/70 bg-transparent border-none cursor-pointer transition"
                    >
                      show all {tools.length}
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* ─── ROW 5: Footer ─── */}
            <div className="bg-[var(--page-bg)] border-t border-ink/[0.04] px-4 py-3 flex items-center justify-between">
              <span className="font-mono text-[10px] uppercase tracking-[2px] text-ink/20">topia://tools</span>
            </div>
          </div>
        </div>
      </section>

      <ToolModal slug={modalSlug} onClose={() => setModalSlug(null)} />
      <SubmitToolModal
        open={submitOpen}
        onClose={() => setSubmitOpen(false)}
        onSubmitted={(t) => {
          // Add the new tool to the local list so it shows up immediately
          if (t) setAllTools((prev) => [t, ...prev]);
        }}
      />
    </div>
  );
}
