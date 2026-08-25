'use client';

import { useState } from 'react';
import { AssistantBar } from '../AssistantBar';
import { WorldManager } from './WorldManager';
import { ProjectBuilder } from '../project/ProjectBuilder';
import type { ProjectItem, ToolOption, SocialLinks } from '../../../dashboard/_components/types';

/* The world HQ's assistant dock: the ✦ bar that sits under the identity
 * header on every manage subpage, plus the bots it launches. Project intent
 * opens the Project Builder; everything else goes to the World Manager's
 * live-edit chat. Builders only. */

interface DockWorld {
  id: string;
  slug: string;
  title: string;
  shortDescription: string | null;
  description: string | null;
  imageUrl: string | null;
  headerImageUrl: string | null;
  tools: string | null;
  socialLinks: SocialLinks | null;
  members: { userId: string; role: string; userName: string | null; userUsername: string | null }[];
}

export function WorldAssistantDock({ world, allTools, privyId, isBuilder, setProjects, setImageUrl }: {
  world: DockWorld;
  allTools: ToolOption[];
  privyId: string;
  isBuilder: boolean;
  setProjects: (fn: (prev: ProjectItem[]) => ProjectItem[]) => void;
  setImageUrl: (url: string) => void;
}) {
  const [open, setOpen] = useState<null | { bot: 'manager' | 'project'; seed?: string }>(null);

  if (!isBuilder) return null;

  const launch = (seed: string) => {
    // Project intent opens the Project Builder directly, seeded.
    const isProject = /\b(?:add|new|create|start|make)\b.*\bproject\b/i.test(seed) || /^project\s*:/i.test(seed);
    setOpen({ bot: isProject ? 'project' : 'manager', seed });
  };

  return (
    <>
      <div className="mb-6">
        <AssistantBar
          id="tour-assistant"
          placeholder={`Tell me what to change in ${world.title} — or just ask…`}
          suggestions={['Swap the cover image', 'Add a project', 'Update the tagline']}
          onLaunch={launch}
        />
      </div>
      {open?.bot === 'manager' && (
        <WorldManager
          world={world}
          allTools={allTools}
          privyId={privyId}
          seedText={open.seed}
          onFieldSaved={(field, value) => {
            if (field === 'imageUrl' && typeof value === 'string') setImageUrl(value);
          }}
          onLaunchProject={(seed) => setOpen({ bot: 'project', seed })}
          onClose={() => setOpen(null)}
        />
      )}
      {open?.bot === 'project' && (
        <ProjectBuilder
          worldId={world.id}
          privyId={privyId}
          members={world.members}
          allTools={allTools}
          seedText={open.seed && !/^(?:add|new|create|start|make)?\s*(?:a\s+)?project\s*:?\s*$/i.test(open.seed.trim()) ? open.seed.replace(/^project\s*:\s*/i, '') : undefined}
          onExitToForm={() => setOpen(null)}
          onClose={() => setOpen(null)}
          onCreated={(p) => { setProjects((prev) => [...prev, p]); setOpen(null); }}
        />
      )}
    </>
  );
}
