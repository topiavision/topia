'use client';

import Link from 'next/link';
import WorldGlobe from '../../../components/WorldGlobe';
import { ReadOnlyBanner } from '../../_components/ReadOnlyBanner';
import { useWorldDashboard } from './layout';

export default function WorldOverviewPage() {
  const { projects, members, pendingInvites, isBuilder, slug } = useWorldDashboard();

  const stats = [
    { label: 'Projects', value: projects.length, href: `/dashboard/worlds/${slug}/projects` },
    { label: 'Members', value: members.length, href: `/dashboard/worlds/${slug}/members` },
    { label: 'Pending invites', value: pendingInvites.length, href: `/dashboard/worlds/${slug}/members` },
  ];

  return (
    <div>
      {!isBuilder && <ReadOnlyBanner />}

      {/* Stats — click through to the section they count */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {stats.map((s) => (
          <Link
            key={s.label}
            href={s.href}
            className="border border-ink/[0.08] rounded-lg bg-[var(--page-bg)] p-4 no-underline hover:border-ink/25 transition"
          >
            <p className="font-mono text-[24px] md:text-[28px] font-bold leading-none text-ink">{s.value}</p>
            <p className="font-mono text-[10px] uppercase tracking-[2px] text-ink/40 mt-1.5">{s.label}</p>
          </Link>
        ))}
      </div>

      {/* Quick actions — or just tell the assistant above — builders only */}
      {isBuilder && (
        <div className="border border-ink/[0.08] rounded-lg overflow-hidden mb-6">
          <div className="bg-[var(--page-bg)] border-b border-ink/[0.06] px-4 py-2">
            <span className="font-mono text-[11px] uppercase tracking-[2px] text-ink/40">Quick actions</span>
          </div>
          <div className="bg-[var(--page-bg)] p-4 flex flex-wrap gap-2">
            <Link
              href={`/dashboard/worlds/${slug}/projects`}
              className="font-mono text-[11px] uppercase tracking-[2px] bg-lime text-obsidian font-bold px-3 py-1.5 rounded-sm hover:opacity-90 transition no-underline"
            >
              + Project
            </Link>
            <Link
              href={`/dashboard/worlds/${slug}/members`}
              className="font-mono text-[11px] uppercase tracking-[2px] text-ink/60 border border-ink/15 hover:border-ink/40 hover:text-ink px-3 py-1.5 rounded-sm transition no-underline"
            >
              + Invite member
            </Link>
            <Link
              href={`/dashboard/worlds/${slug}/details`}
              className="font-mono text-[11px] uppercase tracking-[2px] text-ink/60 border border-ink/15 hover:border-ink/40 hover:text-ink px-3 py-1.5 rounded-sm transition no-underline"
            >
              Edit details
            </Link>
          </div>
        </div>
      )}

      {/* Globe preview */}
      {projects.length > 0 && (
        <div className="border border-ink/[0.08] rounded-lg overflow-hidden relative" style={{ height: '320px' }}>
          <div className="absolute inset-0">
            <WorldGlobe projects={projects} />
          </div>
        </div>
      )}
    </div>
  );
}
