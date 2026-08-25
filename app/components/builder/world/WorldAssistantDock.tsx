'use client';

import { useState } from 'react';
import { AssistantLauncher } from '../AssistantLauncher';
import { FloatingAssistant } from '../FloatingAssistant';
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

  return (
    <>
      <div className="mb-6">
        <AssistantLauncher
          id="tour-assistant"
          heading="The Assistant"
          prompts={[
            'punch up the tagline…',
            'add a project…',
            'swap the cover image…',
            'add the tool Figma…',
            'start a roadmap…',
          ]}
          onOpen={() => setOpen({ bot: 'manager' })}
        />
      </div>
      <FloatingAssistant onOpen={() => setOpen({ bot: 'manager' })} hidden={open !== null} />
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
