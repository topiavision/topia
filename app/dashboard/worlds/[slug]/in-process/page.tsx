'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ReadOnlyBanner } from '../../../_components/ReadOnlyBanner';
import InProcessLayer, { type EraView } from '../../../../components/world/InProcessLayer';
import { useWorldDashboard } from '../layout';

/* Dashboard mirror of the world page's Now tab — same component, same inline
 * editing, and the default landing page for managing a world. */

export default function WorldInProcessPage() {
  const { world, isBuilder, slug, projects } = useWorldDashboard();
  const [eras, setEras] = useState<EraView[] | null>(null);
  const worldId = world?.id;

  const load = useCallback(() => {
    if (!worldId) return;
    fetch(`/api/worlds/eras?worldId=${worldId}`)
      .then((r) => r.json())
      .then((d) => setEras(d.eras ?? []))
      .catch(() => setEras([]));
  }, [worldId]);
  useEffect(() => { load(); }, [load]);

  if (!world) return null;

  return (
    <div>
      {!isBuilder && <ReadOnlyBanner />}

      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h2 className="font-mono text-[13px] font-bold uppercase tracking-[2px] text-ink">Now · Roadmaps</h2>
          <p className="font-mono text-[11px] text-ink/40 mt-1 max-w-xl">
            Choose what is in motion, shape the horizontal roadmap, and share process updates as the work moves forward.
          </p>
        </div>
        <Link
          href={`/worlds/${slug}`}
          className="font-mono text-[10px] uppercase tracking-[1px] text-ink/50 hover:text-ink underline shrink-0 mt-1"
        >
          View public Now ↗
        </Link>
      </div>

      {eras === null ? (
        <p className="font-mono text-[12px] text-ink/40">Loading…</p>
      ) : (
        <div className="border border-ink/[0.08] rounded-lg overflow-hidden">
          <InProcessLayer
            eras={eras}
            worldId={world.id}
            slug={slug}
            projects={projects.map((p) => ({ id: p.id, name: p.name, slug: p.slug }))}
            canEdit={isBuilder}
            onChanged={load}
          />
        </div>
      )}
    </div>
  );
}
