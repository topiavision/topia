'use client';

import { usePrivy } from '@privy-io/react-auth';
import PageShell from '../components/PageShell';
import { TopiaAgent } from '../components/builder/agent/TopiaAgent';

/* /assistant — the Topia agent. One prompt for anything: discovery, help,
 * and handoffs into every builder. Signed-in creators only. */

export default function AssistantPage() {
  const { ready, authenticated, user } = usePrivy();

  // Wait for Privy before deciding — early redirects bounce real users.
  if (!ready) return <div className="min-h-screen bg-[var(--page-bg)]" />;
  if (!authenticated || !user) {
    return (
      <PageShell>
        <div className="min-h-screen bg-[var(--page-bg)] flex flex-col items-center justify-center gap-4 px-6 text-center">
          <span className="ipb-orb text-[32px]" style={{ color: 'var(--orange, #FF5C34)' }}>✦</span>
          <p className="font-mono text-[13px] text-ink">Log in to use the assistant — the button&apos;s in the top bar.</p>
          <a href="/home" className="font-mono text-[11px] uppercase tracking-[2px] text-ink/50 hover:text-ink underline">← Back home</a>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-[calc(var(--nav-height)+16px)] pb-[var(--mobile-nav-clearance)] md:pb-8">
        <TopiaAgent privyId={user.id} />
      </div>
    </PageShell>
  );
}
