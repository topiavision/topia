'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import PageShell from '../../../components/PageShell';
import { LoadFailed } from '../../../components/AsyncStates';
import ToolDetail, { ToolDetailData } from '../ToolDetail';

export default function ToolFullPageClient({ slug }: { slug: string }) {
  const router = useRouter();

  const [data, setData] = useState<ToolDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  // Non-404 failures used to fall through to a silent blank page (data null,
  // notFound false). Track them so the viewer gets an error + retry instead.
  const [loadError, setLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    setLoading(true);
    setNotFound(false);
    setLoadError(false);
    fetch(`/api/tools/${encodeURIComponent(slug)}`)
      .then(async (r) => {
        if (r.status === 404) { if (!cancelled) setNotFound(true); return; }
        if (!r.ok) throw new Error(`tool fetch failed (${r.status})`);
        const d = await r.json();
        if (cancelled) return;
        if (d?.tool) setData(d as ToolDetailData);
        else setNotFound(true);
      })
      .catch((err) => {
        console.error('[tools] load failed', err);
        if (!cancelled) setLoadError(true);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [slug, loadAttempt]);

  return (
    <PageShell>
      <section className="min-h-screen bg-[var(--page-bg)] px-4 md:px-6 py-4 md:py-8">
        <div className="max-w-4xl mx-auto">
          <div className="mb-4 flex items-center justify-between">
            <button
              onClick={() => router.back()}
              className="font-mono text-[11px] uppercase tracking-[2px] text-ink/40 hover:text-ink bg-transparent border-none cursor-pointer"
            >
              ← back
            </button>
            <Link
              href="/resources/tools"
              className="font-mono text-[11px] uppercase tracking-[2px] text-ink/40 hover:text-ink no-underline"
            >
              all tools
            </Link>
          </div>

          {loading && (
            <div className="text-center py-16">
              <span className="font-mono text-[11px] uppercase tracking-[3px] text-ink/40">loading…</span>
            </div>
          )}
          {loadError && !loading && (
            <div className="py-8">
              <LoadFailed
                what="this tool"
                onRetry={() => setLoadAttempt((n) => n + 1)}
              />
              <div className="text-center">
                <Link
                  href="/resources/tools"
                  className="inline-block font-mono text-[11px] uppercase tracking-[2px] text-ink/40 hover:text-ink no-underline"
                >
                  ← back to tools
                </Link>
              </div>
            </div>
          )}
          {notFound && !loading && (
            <div className="text-center py-16">
              <p className="font-mono text-[12px] uppercase tracking-[2px] text-ink/40">Tool not found.</p>
              <Link
                href="/resources/tools"
                className="inline-block mt-3 font-mono text-[11px] uppercase tracking-[2px] text-[var(--accent-ink)] hover:opacity-80 no-underline"
              >
                ← back to tools
              </Link>
            </div>
          )}
          {data && !loading && <ToolDetail data={data} fullPage />}
        </div>
      </section>
    </PageShell>
  );
}
