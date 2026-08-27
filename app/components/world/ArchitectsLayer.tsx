'use client';

import Link from 'next/link';
import { WorldConfig } from './worldConfig';

export interface ArchitectMember {
  userId: string;
  role: string;
  userName: string | null;
  userUsername: string | null;
  userAvatarUrl: string | null;
}

const PUBLIC_ROLE: Record<string, string> = {
  owner: 'Lead worldbuilder',
  world_builder: 'Worldbuilder',
  collaborator: 'Collaborator',
};

const roleLabel = (role: string) => PUBLIC_ROLE[role] ?? role.replaceAll('_', ' ');

function MemberCard({ member }: { member: ArchitectMember }) {
  const inner = (
    <div className="flex items-center gap-3 p-3 rounded-lg border border-ink/[0.08] bg-[var(--page-bg)] transition-colors hover:border-ink/25">
      {member.userAvatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={member.userAvatarUrl} alt={member.userName || ''} className="w-10 h-10 rounded-full object-cover border border-ink/10" />
      ) : (
        <div className="w-10 h-10 rounded-full flex items-center justify-center font-mono text-[13px] font-bold bg-ink/10 text-ink">
          {(member.userName || member.userUsername || '?')[0]?.toUpperCase()}
        </div>
      )}
      <div className="min-w-0">
        <p className="font-mono text-[13px] font-bold leading-tight text-ink truncate uppercase">{member.userName || member.userUsername || 'Unknown'}</p>
        {member.userUsername && <p className="font-mono text-[11px] text-ink/40 leading-tight truncate">@{member.userUsername}</p>}
        <span className="font-mono text-[9px] uppercase tracking-[2px] text-ink/40 mt-1 block">{roleLabel(member.role)}</span>
      </div>
    </div>
  );
  if (member.userUsername) return <Link href={`/profile/${member.userUsername}`} className="block no-underline">{inner}</Link>;
  return <div>{inner}</div>;
}

export interface GhostCredit {
  invitationId: string;
  name: string | null;
  role: string;
}

// A credited person who hasn't claimed their Topia profile yet — name shows
// immediately (dashed avatar, no profile link) until their email invite is
// accepted, at which point they become a real MemberCard.
function GhostCard({ ghost }: { ghost: GhostCredit }) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border border-dashed border-ink/20 bg-[var(--page-bg)] opacity-80">
      <div className="w-10 h-10 rounded-full flex items-center justify-center font-mono text-[13px] font-bold border-2 border-dashed border-ink/25 text-ink/50">
        {(ghost.name || '?')[0]?.toUpperCase()}
      </div>
      <div className="min-w-0">
        <p className="font-mono text-[13px] font-bold leading-tight text-ink/80 truncate uppercase">{ghost.name || 'Invited'}</p>
        <span className="font-mono text-[9px] uppercase tracking-[2px] text-ink/30 mt-1 block">
          {roleLabel(ghost.role)} · invited
        </span>
      </div>
    </div>
  );
}

export default function ArchitectsLayer({
  builders,
  collaborators,
  ghosts = [],
}: {
  config: WorldConfig;
  builders: ArchitectMember[];
  collaborators: ArchitectMember[];
  ghosts?: GhostCredit[];
}) {
  const total = builders.length + collaborators.length + ghosts.length;
  return (
    <div className="bg-[var(--page-bg)] flex flex-col h-full">
      {total === 0 ? (
        <div className="flex-1 flex items-center justify-center py-10">
          <span className="font-mono text-[11px] text-ink/40 uppercase tracking-wider">No builders yet</span>
        </div>
      ) : (
        <div className="p-4 space-y-5">
          {builders.length > 0 && (
            <div>
              <span className="font-mono text-[9px] uppercase tracking-[2px] text-ink/45 block mb-2">Worldbuilders</span>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {builders.map((b) => <MemberCard key={b.userId} member={b} />)}
              </div>
            </div>
          )}
          {(collaborators.length > 0 || ghosts.length > 0) && (
            <div>
              <span className="font-mono text-[9px] uppercase tracking-[2px] text-ink/30 block mb-2">Collaborators</span>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {collaborators.map((c) => <MemberCard key={c.userId} member={c} />)}
                {ghosts.map((g) => <GhostCard key={g.invitationId} ghost={g} />)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
