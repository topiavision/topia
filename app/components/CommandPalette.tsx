'use client';

/* ⌘K — search and every action, everywhere.
 *
 * cmdk (the library behind Vercel's own palette) handles filtering, keyboard
 * navigation and aria; this file supplies Topia's commands, remote search and
 * skin. Design per the approved mockup: obsidian panel, lime selection rail,
 * mono group labels — deliberately the same in both themes, like a terminal.
 *
 * Three result sources, merged:
 *   1. commands from lib/commands.ts (filtered locally by cmdk, instant)
 *   2. remote /api/search across six entity types (200ms debounce)
 *   3. recents (localStorage) shown when the query is empty
 *
 * Mounted once in the root layout. ⌘K / Ctrl+K everywhere; Escape closes.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { usePrivy } from '@privy-io/react-auth';
import { Command } from 'cmdk';
import { useUserProfile } from '../hooks/useUserProfile';
import { buildCommands } from '@/lib/commands';

interface RemoteItem { title: string; subtitle: string | null; imageUrl: string | null; href: string }
interface RemoteResults {
  worlds: RemoteItem[]; events: RemoteItem[]; people: RemoteItem[];
  tools: RemoteItem[]; grants: RemoteItem[]; projects: RemoteItem[];
}
const EMPTY: RemoteResults = { worlds: [], events: [], people: [], tools: [], grants: [], projects: [] };

interface Recent { label: string; href: string }
const RECENTS_KEY = 'topia-cmdk-recents';

function readRecents(): Recent[] {
  try { return JSON.parse(localStorage.getItem(RECENTS_KEY) ?? '[]'); } catch { return []; }
}
function pushRecent(r: Recent) {
  try {
    const next = [r, ...readRecents().filter((x) => x.href !== r.href)].slice(0, 6);
    localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
  } catch { /* storage blocked — recents are a nicety */ }
}

const GROUP_LABELS: Record<keyof RemoteResults, string> = {
  worlds: 'Worlds', events: 'Events', people: 'People',
  tools: 'Tools', grants: 'Grants', projects: 'Projects',
};

export default function CommandPalette() {
  const router = useRouter();
  const { authenticated } = usePrivy();
  const { profile, features } = useUserProfile();

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [remote, setRemote] = useState<RemoteResults>(EMPTY);
  const [recents, setRecents] = useState<Recent[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Global shortcut. ⌘K is the muscle-memory standard; don't add more.
  // The nav's visible search trigger opens it via a CustomEvent so the two
  // components stay decoupled.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    const onOpen = () => setOpen(true);
    document.addEventListener('keydown', onKey);
    window.addEventListener('topia:open-cmdk', onOpen);
    return () => {
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('topia:open-cmdk', onOpen);
    };
  }, []);

  useEffect(() => {
    if (open) { setRecents(readRecents()); setQuery(''); setRemote(EMPTY); }
  }, [open]);

  // Remote search, debounced. Local commands filter instantly regardless.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length < 2) { setRemote(EMPTY); return; }
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`);
        if (res.ok) setRemote(await res.json());
      } catch { /* stale results simply persist; never break typing */ }
    }, 200);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  const commands = useMemo(
    () => buildCommands({ authenticated, username: profile?.username, features }),
    [authenticated, profile?.username, features],
  );

  const go = useCallback((href: string, label: string) => {
    pushRecent({ label, href });
    setOpen(false);
    router.push(href);
  }, [router]);

  if (!open) return null;

  const itemCls =
    'flex items-center gap-3 px-4 py-2.5 text-[14px] cursor-pointer ' +
    'text-[rgba(232,228,220,0.85)] data-[selected=true]:bg-[rgba(228,254,82,0.12)] ' +
    'data-[selected=true]:text-[#e8e4dc] border-l-2 border-transparent ' +
    'data-[selected=true]:border-[#e4fe52]';
  const groupCls =
    '[&_[cmdk-group-heading]]:px-4 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:pb-1 ' +
    '[&_[cmdk-group-heading]]:font-mono [&_[cmdk-group-heading]]:text-[10px] ' +
    '[&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[2px] ' +
    '[&_[cmdk-group-heading]]:text-[rgba(232,228,220,0.35)]';

  return (
    <div
      className="fixed inset-0 z-[3000] flex items-stretch sm:items-start justify-center sm:px-4 sm:pt-[12vh]"
      style={{ backgroundColor: 'rgba(10,10,10,0.55)' }}
      onClick={() => setOpen(false)}
    >
      {/* Phones get a full-height sheet (lvh — the keyboard breaks vh), not a
          floating card the keyboard shoves around; sm+ keeps the centered
          panel. Same rules every overlay here follows. */}
      <div className="w-full sm:max-w-[560px] h-[100lvh] sm:h-auto" onClick={(e) => e.stopPropagation()}>
        <Command
          label="Search Topia"
          className="h-full sm:h-auto sm:rounded-[14px] overflow-hidden bg-obsidian text-bone border-0 sm:border flex flex-col"
          style={{ borderColor: 'rgba(228,254,82,0.28)' }}
          // cmdk's default scoring already handles fuzzy label + keyword match.
        >
          <div className="flex items-center gap-2.5 px-4 border-b" style={{ borderColor: 'rgba(232,228,220,0.1)' }}>
            <span className="text-[15px]" style={{ color: 'rgba(232,228,220,0.4)' }}>⌕</span>
            <Command.Input
              autoFocus
              value={query}
              onValueChange={setQuery}
              placeholder="Search worlds, events, people — or type an action…"
              className="flex-1 bg-transparent border-none outline-none py-3.5 text-[16px] text-[#e8e4dc] placeholder:text-[rgba(232,228,220,0.35)]"
            />
            <kbd className="hidden sm:inline font-mono text-[10px] tracking-[1px] px-1.5 py-0.5 rounded border" style={{ color: 'rgba(232,228,220,0.35)', borderColor: 'rgba(232,228,220,0.15)' }}>ESC</kbd>
            <button onClick={() => setOpen(false)} aria-label="Close search" className="sm:hidden bg-transparent border-none cursor-pointer text-[20px] leading-none p-1" style={{ color: 'rgba(232,228,220,0.5)' }}>×</button>
          </div>

          <Command.List className={`flex-1 sm:flex-none sm:max-h-[52vh] overflow-y-auto pb-2 ${groupCls}`}>
            <Command.Empty className="px-4 py-8 text-center font-mono text-[12px] text-[rgba(232,228,220,0.4)]">
              Nothing for “{query}” — try a world, event, or person.
            </Command.Empty>

            {query.trim() === '' && recents.length > 0 && (
              <Command.Group heading="Recent">
                {recents.map((r) => (
                  <Command.Item key={`r-${r.href}`} value={`recent ${r.label}`} onSelect={() => go(r.href, r.label)} className={itemCls}>
                    <span className="w-[26px] h-[26px] rounded-md border inline-flex items-center justify-center text-[11px]" style={{ borderColor: 'rgba(232,228,220,0.18)', color: 'rgba(232,228,220,0.5)' }}>↩</span>
                    <span className="flex-1 truncate">{r.label}</span>
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            <Command.Group heading="Actions">
              {commands.filter((c) => c.group === 'Actions').map((c) => (
                <Command.Item
                  key={c.id}
                  value={`${c.label} ${c.keywords ?? ''}`}
                  onSelect={() => {
                    if (c.run) { c.run(); setOpen(false); }
                    else if (c.href) go(c.href, c.label);
                  }}
                  className={itemCls}
                >
                  <span className="w-[26px] h-[26px] rounded-md inline-flex items-center justify-center text-[13px] font-bold bg-lime text-obsidian">{c.glyph}</span>
                  <span className="flex-1 truncate">{c.label}</span>
                </Command.Item>
              ))}
            </Command.Group>

            <Command.Group heading="Go to">
              {commands.filter((c) => c.group === 'Go to').map((c) => (
                <Command.Item key={c.id} value={`${c.label} ${c.keywords ?? ''}`} onSelect={() => go(c.href!, c.label)} className={itemCls}>
                  <span className="w-[26px] h-[26px] rounded-md border inline-flex items-center justify-center text-[12px]" style={{ borderColor: 'rgba(232,228,220,0.18)', color: 'rgba(232,228,220,0.6)' }}>{c.glyph}</span>
                  <span className="flex-1 truncate">{c.label}</span>
                </Command.Item>
              ))}
            </Command.Group>

            {(Object.keys(GROUP_LABELS) as (keyof RemoteResults)[]).map((k) =>
              remote[k].length === 0 ? null : (
                <Command.Group key={k} heading={GROUP_LABELS[k]}>
                  {remote[k].map((item) => (
                    <Command.Item
                      key={`${k}-${item.href}`}
                      // Remote rows already matched the query server-side;
                      // include the raw query so cmdk's filter keeps them.
                      value={`${item.title} ${item.subtitle ?? ''} ${query}`}
                      onSelect={() => go(item.href, item.title)}
                      className={itemCls}
                    >
                      {item.imageUrl ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img src={item.imageUrl} alt="" width={26} height={26} loading="lazy" decoding="async" className="w-[26px] h-[26px] rounded-md object-cover" />
                      ) : (
                        <span className="w-[26px] h-[26px] rounded-md border inline-flex items-center justify-center text-[11px]" style={{ borderColor: 'rgba(232,228,220,0.18)', color: 'rgba(232,228,220,0.5)' }}>·</span>
                      )}
                      <span className="flex-1 truncate">{item.title}</span>
                      {item.subtitle && <span className="font-mono text-[10px] text-[rgba(232,228,220,0.35)] truncate max-w-[160px]">{item.subtitle}</span>}
                    </Command.Item>
                  ))}
                </Command.Group>
              ),
            )}
          </Command.List>

          <div className="flex items-center justify-between px-4 py-2.5 border-t font-mono text-[10px]" style={{ borderColor: 'rgba(232,228,220,0.1)', color: 'rgba(232,228,220,0.4)' }}>
            {/* Keyboard hints mean nothing on a phone — say what it is instead. */}
            <span className="hidden sm:inline">↑↓ navigate · ↵ open</span>
            <span className="sm:hidden">Search all of Topia</span>
            <span className="tracking-[1px]">TOPIA<span className="hidden sm:inline"> <span style={{ color: '#e4fe52' }}>⌘K</span></span></span>
          </div>
        </Command>
      </div>
    </div>
  );
}
