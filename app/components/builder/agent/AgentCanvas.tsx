'use client';

import Link from 'next/link';
import { CAPABILITIES, type AgentEntity } from '@/lib/builder/agent';

/* The agent's preview pane — stateful, generative-UI style: capability
 * cards when idle or asked for help, tappable result cards after a
 * discovery query, a routing card while handing off to a builder. */

const ORANGE = 'var(--orange, #FF5C34)';
const orangeMix = (pct: number) => `color-mix(in srgb, var(--orange) ${pct}%, transparent)`;

export interface ResultItem { title: string; subtitle: string | null; imageUrl: string | null; href: string }

export type AgentView =
  | { view: 'capabilities' }
  | { view: 'results'; entity: AgentEntity; query: string; items: ResultItem[] }
  | { view: 'routing'; title: string; blurb: string };

const ENTITY_GLYPH: Record<AgentEntity, string> = {
  people: '✦', tools: '⚒', worlds: '◍', events: '◷', grants: '$', projects: '▣',
};
const ENTITY_LABEL: Record<AgentEntity, string> = {
  people: 'Creators', tools: 'Tools', worlds: 'Worlds', events: 'Events', grants: 'Grants', projects: 'Projects',
};

export function AgentCanvas({ state }: { state: AgentView }) {
  if (state.view === 'routing') {
    return (
      <div className="ipb-canvas-bg min-h-full flex items-center justify-center p-8">
        <div className="ipb-materialize text-center max-w-sm">
          <span className="ipb-orb text-[36px] block" style={{ color: ORANGE }}>✦</span>
          <p className="font-basement font-black uppercase text-ink text-[20px] mt-3">{state.title}</p>
          <p className="font-mono text-[12px] text-ink/55 mt-2">{state.blurb}</p>
        </div>
      </div>
    );
  }

  if (state.view === 'results') {
    return (
      <div className="ipb-canvas-bg min-h-full p-4 sm:p-6">
        <p className="ipb-enter font-mono text-[10px] font-bold uppercase tracking-[2px] mb-3" style={{ color: ORANGE }}>
          {ENTITY_LABEL[state.entity]}{state.query ? ` · “${state.query}”` : ''}
        </p>
        {state.items.length === 0 ? (
          <p className="font-mono text-[12px] text-ink/45">Nothing yet — try different words, or browse the directory instead.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {state.items.map((item, i) => (
              <Link
                key={item.href}
                href={item.href}
                className="ipb-enter no-underline rounded-lg border border-ink/10 hover:border-ink/40 hover:-translate-y-0.5 transition-all p-3 flex items-center gap-3 bg-[var(--page-bg)]/70"
                style={{ ['--d' as string]: `${Math.min(i, 8) * 55}ms` }}
              >
                {item.imageUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={item.imageUrl} alt="" className="w-10 h-10 rounded-md object-cover shrink-0" />
                ) : (
                  <span className="w-10 h-10 rounded-md bg-lime text-obsidian inline-flex items-center justify-center text-[16px] shrink-0">
                    {ENTITY_GLYPH[state.entity]}
                  </span>
                )}
                <span className="min-w-0">
                  <span className="block font-mono text-[13px] font-bold text-ink truncate">{item.title}</span>
                  {item.subtitle && <span className="block font-mono text-[10.5px] text-ink/45 truncate">{item.subtitle}</span>}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="ipb-canvas-bg min-h-full p-4 sm:p-6">
      <p className="ipb-enter font-mono text-[10px] font-bold uppercase tracking-[2px] mb-3" style={{ color: ORANGE }}>
        What you can do here
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {CAPABILITIES.map((c, i) => (
          <Link
            key={c.title}
            href={c.href}
            className="ipb-enter no-underline rounded-lg border border-ink/10 hover:-translate-y-0.5 transition-all p-3.5 flex items-start gap-3 bg-[var(--page-bg)]/70"
            style={{ ['--d' as string]: `${i * 50}ms`, borderColor: undefined }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = orangeMix(55); }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = ''; }}
          >
            <span className="w-9 h-9 rounded-md bg-lime text-obsidian inline-flex items-center justify-center text-[15px] shrink-0">{c.glyph}</span>
            <span className="min-w-0">
              <span className="block font-mono text-[12.5px] font-bold text-ink">{c.title}</span>
              <span className="block font-mono text-[10.5px] text-ink/50 leading-snug mt-0.5">{c.blurb}</span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
