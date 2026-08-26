import Link from 'next/link';
import PageShell from '../components/PageShell';
import { db, tools, grants } from '@/lib/db';
import { count, eq } from 'drizzle-orm';

export const revalidate = 3600;

/* Live directory counts — the old page hardcoded "70+ tools" / "67 grants",
 * which drifted stale. Best-effort: if the DB is unreachable (e.g. at build
 * time) we just omit the numbers rather than lie. */
async function getCounts(): Promise<{ tools: number | null; grants: number | null }> {
  try {
    const [[toolCount], [grantCount]] = await Promise.all([
      db.select({ value: count() }).from(tools).where(eq(tools.published, true)),
      db.select({ value: count() }).from(grants).where(eq(grants.published, true)),
    ]);
    return { tools: toolCount.value, grants: grantCount.value };
  } catch (error) {
    console.error('[resources] counts failed:', error);
    return { tools: null, grants: null };
  }
}

export default async function ResourcesPage() {
  const counts = await getCounts();

  return (
    <PageShell>
    <div className="min-h-screen" style={{ backgroundColor: 'var(--page-bg)', color: 'var(--page-text)' }}>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-6">
        <div className="container mx-auto max-w-4xl text-center">
          <h1 className="heading-display text-6xl md:text-8xl font-bold tracking-tight mb-6">
            RESOURCES
          </h1>
          <p className="text-xl md:text-2xl opacity-80 max-w-2xl mx-auto leading-relaxed">
            Tools, grants, and knowledge to support your creative practice.
          </p>
        </div>
      </section>

      {/* Resources Grid */}
      <section className="py-20 px-6 border-t" style={{ borderColor: 'var(--border-color)' }}>
        <div className="container mx-auto max-w-6xl">
          <div className="grid md:grid-cols-3 gap-8">
            {/* Tools */}
            <Link href="/resources/tools" className="border p-8 transition group no-underline hover:opacity-80" style={{ borderColor: 'var(--border-color)', color: 'var(--page-text)' }}>
              <div className="flex justify-between items-start mb-4">
                <h2 className="text-3xl font-bold">TOOLS</h2>
                <span className="text-2xl group-hover:translate-x-2 transition-transform">→</span>
              </div>
              <p className="opacity-60 mb-4">
                Curated database of software, platforms, and resources for creators.
              </p>
              <p className="text-sm opacity-40">{counts.tools !== null ? `${counts.tools} tools` : 'Browse the directory'}</p>
            </Link>

            {/* Grants */}
            <Link href="/resources/grants" className="border p-8 transition group no-underline hover:opacity-80" style={{ borderColor: 'var(--border-color)', color: 'var(--page-text)' }}>
              <div className="flex justify-between items-start mb-4">
                <h2 className="text-3xl font-bold">GRANTS</h2>
                <span className="text-2xl group-hover:translate-x-2 transition-transform">→</span>
              </div>
              <p className="opacity-60 mb-4">
                Funding opportunities, residencies, and fellowships for artists.
              </p>
              <p className="text-sm opacity-40">{counts.grants !== null ? `${counts.grants} grants` : 'Browse the directory'}</p>
            </Link>

            {/* Knowledge Base — honest "Soon" treatment: clearly inert, no
                arrow pretending to be a link. */}
            <div aria-disabled="true" className="border border-dashed p-8 opacity-50 select-none" style={{ borderColor: 'var(--border-color)' }}>
              <div className="flex justify-between items-start mb-4">
                <h2 className="text-3xl font-bold">KNOWLEDGE</h2>
                <span className="meta-text font-mono text-[10px] uppercase tracking-[2px] border rounded-full px-2 py-1" style={{ borderColor: 'var(--border-color)' }}>Soon</span>
              </div>
              <p className="opacity-60 mb-4">
                Guides, articles, and insights from the TOPIA community.
              </p>
              <p className="text-sm opacity-40">Coming soon</p>
            </div>
          </div>
        </div>
      </section>

      {/* Additional Info */}
      <section className="py-20 px-6 border-t" style={{ borderColor: 'var(--border-color)' }}>
        <div className="container mx-auto max-w-4xl text-center">
          <h2 className="text-3xl font-bold mb-6">Building a Creative Infrastructure</h2>
          <p className="opacity-80 leading-relaxed max-w-2xl mx-auto">
            These resources are carefully curated to support artists, creators, and cultural workers
            in sustaining their practice. We believe in depth before data, culture before tech.
          </p>
        </div>
      </section>
    </div>
    </PageShell>
  );
}
