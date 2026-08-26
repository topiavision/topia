'use client';

import { useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { Skeleton } from '../../components/Skeleton';
import { LoadFailed } from '../../components/AsyncStates';

const SubmitGrantModal = dynamic(() => import('./SubmitGrantModal'), { ssr: false });

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
  deadlineDate: string | null;
  orgName: string | null;
  region: string | null;
  status: string | null;
  link: string | null;
}

const COMMON_TAGS = [
  'all tags', 'art', 'artists', 'arts-org', 'base', 'black', 'creators',
  'crypto', 'dao', 'fellowship', 'femme', 'film', 'grant', 'interactive',
  'international', 'mentorship', 'music', 'nft', 'photography', 'poc',
  'public-goods', 'queer', 'residency', 'social', 'trans', 'visual arts', 'women'
];

export default function GrantsList({ initialGrants = [] }: { initialGrants?: Grant[] }) {
  const [grants, setGrants] = useState<Grant[]>(initialGrants);
  const [loading, setLoading] = useState(initialGrants.length === 0);
  // A failed fetch must render as an error with retry, not as "no grants found".
  const [loadError, setLoadError] = useState(false);
  const [initialLoad, setInitialLoad] = useState(initialGrants.length === 0);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedTag, setSelectedTag] = useState('all tags');
  const [sortBy, setSortBy] = useState('deadline-asc');
  const [submitOpen, setSubmitOpen] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout>(undefined);

  // ?submit=1 deep-link (dashboard "+ Grant" quick action) — open the submit
  // modal on arrival, then strip the param so refresh/back doesn't reopen it.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get('submit') === '1') {
      setSubmitOpen(true);
      url.searchParams.delete('submit');
      window.history.replaceState(null, '', url.pathname + url.search);
    }
  }, []);

  // Debounce search input by 300ms
  useEffect(() => {
    debounceRef.current = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(debounceRef.current);
  }, [search]);

  // Server page seeds the default list — skip the first (mount) fetch and
  // only hit the API when filters actually change.
  const skipFirstFetch = useRef(initialGrants.length > 0);
  useEffect(() => {
    if (skipFirstFetch.current) { skipFirstFetch.current = false; return; }
    fetchGrants();
  }, [debouncedSearch, selectedTag, sortBy]);

  const fetchGrants = async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const params = new URLSearchParams();
      if (debouncedSearch) params.append('search', debouncedSearch);
      if (selectedTag && selectedTag !== 'all tags') params.append('tag', selectedTag);
      params.append('sortBy', sortBy);

      const response = await fetch(`/api/grants?${params}`);
      if (!response.ok) throw new Error(`grants fetch failed (${response.status})`);
      const data = await response.json();
      setGrants(data.grants || []);
    } catch (error) {
      console.error('Error fetching grants:', error);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  };

  // Track whether this is the first load vs filter change
  useEffect(() => {
    if (!loading && grants.length > 0) setInitialLoad(false);
  }, [loading, grants]);

  const formatAmount = (grant: Grant) => {
    if (!grant.amountMin && !grant.amountMax) return null;

    const currency = grant.currency || 'USD';
    if (grant.amountMin && grant.amountMax && grant.amountMin === grant.amountMax) {
      return `${currency} ${grant.amountMax.toLocaleString()}`;
    }
    if (grant.amountMin && grant.amountMax) {
      return `${currency} ${grant.amountMin.toLocaleString()} - ${grant.amountMax.toLocaleString()}`;
    } else if (grant.amountMax) {
      return `${currency} ${grant.amountMax.toLocaleString()}`;
    } else if (grant.amountMin) {
      return `${currency} ${grant.amountMin.toLocaleString()}`;
    }
    return null;
  };

  const parseTags = (tagsString: string | null) => {
    if (!tagsString) return [];
    return tagsString.split(',').map(tag => tag.trim()).filter(Boolean);
  };

  const isGrantClosed = (grant: Grant) => {
    // An explicit Closed status wins — some programs are discontinued even
    // though their deadline reads "Rolling" or "Varies".
    if ((grant.status ?? '').toLowerCase().includes('closed')) return true;
    if (!grant.deadlineDate) return false;
    try {
      const deadline = new Date(grant.deadlineDate);
      if (isNaN(deadline.getTime())) return false;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return deadline < today;
    } catch {
      return false;
    }
  };

  // Sort: current grants first, then closed
  const sortedGrants = [...grants].sort((a, b) => {
    const aClosed = isGrantClosed(a);
    const bClosed = isGrantClosed(b);
    if (aClosed !== bClosed) return aClosed ? 1 : -1;
    return 0; // preserve API sort order within each group
  });

  return (
    <div className="min-h-screen bg-[var(--page-bg)] text-ink">
      <section className="px-4 md:px-6 py-4 md:py-6">
        <div className="max-w-[var(--content-max)] mx-auto">
          <div className="grid grid-cols-1 gap-[3px] border border-ink/[0.08] rounded-lg overflow-hidden">

            {/* ─── ROW 1: Title bar ─── */}
            <div className="bg-lime relative">
              <div className="px-4 md:px-6 py-4 md:py-5 flex flex-col md:flex-row md:items-end md:justify-between gap-3">
                <div>
                  <span className="font-mono text-[11px] uppercase tracking-[2px] text-[var(--on-accent-muted)] block">resources // funding</span>
                  <h1 className="font-basement font-black text-[clamp(28px,5vw,64px)] uppercase leading-[0.9] text-obsidian mt-1">
                    GRANTS
                  </h1>
                </div>
                <div className="flex flex-col items-start md:items-end gap-1">
                  <span className="font-mono text-[12px] text-obsidian/80 leading-snug">funds, fellowships, residencies.</span>
                  <span className="font-mono text-[12px] text-[var(--on-accent-muted)] leading-snug">money that backs creative work.</span>
                  <button
                    onClick={() => setSubmitOpen(true)}
                    className="mt-2 self-start md:self-end font-mono text-[11px] font-bold uppercase tracking-[2px] text-obsidian border border-obsidian/30 hover:bg-obsidian hover:text-lime px-3 py-1.5 rounded-sm bg-transparent cursor-pointer transition"
                  >
                    + submit a grant
                  </button>
                </div>
              </div>
            </div>

            {/* ─── ROW 2: Search + sort + count ─── */}
            <div className="bg-[var(--page-bg)] border-t border-b border-ink/[0.06] px-4 py-3 flex flex-col md:flex-row md:items-center gap-3 md:gap-4 sticky top-0 md:top-[var(--nav-height,56px)] z-30">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="search grants, orgs, tags…"
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
                aria-label="Sort grants"
                className="bg-transparent border border-ink/15 focus:border-ink/40 font-mono text-[12px] uppercase tracking-[1px] text-ink/70 px-3 py-1.5 rounded-sm outline-none cursor-pointer transition-colors"
              >
                <option value="deadline-asc" className="bg-[var(--page-bg)] text-ink">Deadline (soonest)</option>
                <option value="deadline-desc" className="bg-[var(--page-bg)] text-ink">Deadline (latest)</option>
                <option value="amount-desc" className="bg-[var(--page-bg)] text-ink">Amount (highest)</option>
                <option value="amount-asc" className="bg-[var(--page-bg)] text-ink">Amount (lowest)</option>
                <option value="name-asc" className="bg-[var(--page-bg)] text-ink">Name (A–Z)</option>
                <option value="name-desc" className="bg-[var(--page-bg)] text-ink">Name (Z–A)</option>
              </select>
              <span className="font-mono text-[11px] uppercase tracking-[2px] text-[var(--text-muted)] md:ml-auto shrink-0">
                {grants.length} grant{grants.length !== 1 ? 's' : ''}
              </span>
            </div>

            {/* ─── ROW 3: Tag chips ─── */}
            <div className="bg-[var(--page-bg)] border-b border-ink/[0.06] px-4 py-2 flex items-center gap-1.5 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
              {COMMON_TAGS.map((tag) => {
                const active = selectedTag === tag;
                return (
                  <button
                    key={tag}
                    onClick={() => setSelectedTag(tag)}
                    className={`font-mono text-[11px] uppercase tracking-wider px-2.5 py-1 rounded-sm whitespace-nowrap transition cursor-pointer ${
                      active
                        ? 'bg-lime text-obsidian font-bold border-transparent'
                        : 'text-[var(--text-muted)] hover:text-ink/80 bg-transparent border border-transparent'
                    }`}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>

            {/* ─── ROW 4: List ─── */}
            <div className="bg-[var(--page-bg)] p-4 md:p-6 min-h-[400px]">
              {loading && initialLoad ? (
                <div className="space-y-3" aria-busy="true">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="border border-ink/10 rounded-lg p-4 md:p-5">
                      <Skeleton className="h-4 w-1/3 mb-3" />
                      <Skeleton className="h-3 w-2/3 mb-2" />
                      <Skeleton className="h-3 w-1/2" />
                    </div>
                  ))}
                </div>
              ) : loadError && grants.length === 0 && !loading ? (
                /* Fetch failed with nothing loaded — an error, not emptiness. */
                <LoadFailed what="the grants directory" onRetry={() => void fetchGrants()} className="py-16" />
              ) : grants.length === 0 && !loading ? (
                <div className="text-center py-16">
                  <p className="font-mono text-[13px] uppercase tracking-[2px] text-[var(--text-muted)] mb-4">
                    {search || selectedTag !== 'all tags'
                      ? `no grants${search ? ` matching "${search}"` : ''}${selectedTag !== 'all tags' ? ` tagged ${selectedTag}` : ''}`
                      : 'no grants found'}
                  </p>
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    {(search || selectedTag !== 'all tags') && (
                      <button
                        onClick={() => { setSearch(''); setSelectedTag('all tags'); }}
                        className="font-mono text-[11px] uppercase tracking-[2px] text-ink/60 border border-ink/20 hover:border-ink/60 px-3 py-1.5 rounded-sm bg-transparent cursor-pointer transition"
                      >
                        clear filters
                      </button>
                    )}
                    <button
                      onClick={() => setSubmitOpen(true)}
                      className="font-mono text-[11px] uppercase tracking-[2px] text-ink/60 border border-ink/20 hover:border-ink/60 px-3 py-1.5 rounded-sm bg-transparent cursor-pointer transition"
                    >
                      + submit a grant
                    </button>
                  </div>
                </div>
              ) : (
                <div className={`space-y-3 transition-opacity duration-200 ${loading ? 'opacity-50' : 'opacity-100'}`}>
                  {sortedGrants.map((grant) => {
                    const amount = formatAmount(grant);
                    const tags = parseTags(grant.tags);
                    const closed = isGrantClosed(grant);
                    const inner = (
                      <div className="flex justify-between items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 mb-1.5">
                            <h3 className="font-mono text-[13px] uppercase font-bold text-ink group-hover:underline">
                              {grant.grantName}
                            </h3>
                            {closed ? (
                              <span className="px-2 py-0.5 rounded-sm font-mono text-[10px] uppercase font-bold tracking-wider flex-shrink-0 bg-[var(--orange)] text-obsidian">
                                closed
                              </span>
                            ) : (
                              amount && (
                                <span className="px-2 py-0.5 rounded-sm font-mono text-[10px] uppercase font-bold tracking-wider flex-shrink-0 bg-lime text-obsidian">
                                  {amount}
                                </span>
                              )
                            )}
                          </div>
                          {grant.shortDescription && (
                            <p className="font-zirkon text-[13px] text-ink/70 leading-relaxed mb-2">{grant.shortDescription}</p>
                          )}
                          <p className="font-mono text-[11px] uppercase tracking-wider text-[var(--text-muted)] mb-2.5">
                            {[grant.orgName, grant.region, grant.deadlineDate ? `deadline: ${grant.deadlineDate}` : null]
                              .filter(Boolean)
                              .join(' · ')}
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {tags.slice(0, 5).map((tag, idx) => (
                              <span
                                key={idx}
                                className="px-2 py-0.5 border border-ink/15 rounded-sm font-mono text-[10px] uppercase tracking-wider text-ink/60"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        </div>
                        <span className="flex-shrink-0 ml-2 font-mono text-[14px] text-[var(--accent-ink)] group-hover:translate-x-0.5 transition-transform" aria-hidden="true">
                          →
                        </span>
                      </div>
                    );
                    const cardCls = `block border border-ink/10 hover:border-[var(--accent-ink)]/40 rounded-lg p-4 md:p-5 transition group no-underline ${closed ? 'opacity-60' : ''}`;
                    return grant.link ? (
                      <a key={grant.id} href={grant.link} target="_blank" rel="noopener noreferrer" className={cardCls}>
                        {inner}
                      </a>
                    ) : (
                      <Link key={grant.id} href={`/resources/grants/${grant.slug}`} className={cardCls}>
                        {inner}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <SubmitGrantModal
        open={submitOpen}
        onClose={() => setSubmitOpen(false)}
        onSubmitted={() => fetchGrants()}
      />
    </div>
  );
}
