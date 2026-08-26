'use client';

import { useState } from 'react';
import Link from 'next/link';
import { PathConfig } from './pathConfig';
import ToolMiniCard from '../../resources/tools/ToolMiniCard';
import ToolModal from '../../resources/tools/ToolModal';

interface Tool {
  name: string;
  slug: string;
  category: string | null;
  url?: string | null;
}

interface Props {
  config: PathConfig;
  tools: Tool[];
  /** Profile owner's handle — enables the "open stack" link to /stacks/[username]. */
  username?: string | null;
  /** Viewer owns this profile — the empty state offers a door to profile settings. */
  isOwnProfile?: boolean;
}

export default function ToolkitLayer({ config, tools, username, isOwnProfile = false }: Props) {
  const [modalSlug, setModalSlug] = useState<string | null>(null);

  return (
    <div className="bg-[var(--page-bg)] flex flex-col h-full overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
      <div className={`${config.bg} px-4 py-2.5 flex items-center justify-between`}>
        <span className={`font-mono text-[11px] uppercase tracking-wider font-bold ${config.textOn}`}>Toolkit</span>
        <span className="flex items-center gap-3">
          {username && tools.length > 0 && (
            <Link href={`/stacks/${username}`} className={`font-mono text-[9px] uppercase tracking-[2px] ${config.textOn} opacity-60 hover:opacity-100 transition no-underline`}>
              open stack →
            </Link>
          )}
          <span className={`font-mono text-[9px] uppercase tracking-[2px] ${config.textOn} opacity-30`}>{tools.length} tools</span>
        </span>
      </div>

      {tools.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2.5 p-8 text-center">
          <span className="font-mono text-[11px] uppercase tracking-[2px] text-ink/25">no tools declared yet</span>
          {isOwnProfile && (
            <Link href="/profile" className="font-mono text-[11px] text-[var(--accent-ink)] no-underline hover:underline">
              add your stack from your profile settings →
            </Link>
          )}
        </div>
      ) : (
        <div className="p-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
          {tools.map((t) => (
            <ToolMiniCard key={t.slug} tool={t} onOpen={setModalSlug} />
          ))}
        </div>
      )}

      <ToolModal slug={modalSlug} onClose={() => setModalSlug(null)} />
    </div>
  );
}
