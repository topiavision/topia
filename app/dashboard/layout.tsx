'use client';

import { useState, useEffect } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useRouter } from 'next/navigation';
import Navigation from '../components/Navigation';
import LoadingBar from '../components/LoadingBar';
import ThemeToggle from '../components/ThemeToggle';
import { useUserProfile } from '../hooks/useUserProfile';
import { DashboardContext } from './_components/DashboardContext';
import type { HostedEvent } from './_components/DashboardContext';
import DashboardSidebar from './_components/DashboardSidebar';
import { DashboardOverviewProvider } from './_components/DashboardOverviewContext';
import { SidebarProvider, useSidebar } from './_components/SidebarContext';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { ready, authenticated } = usePrivy();
  const router = useRouter();
  const { profile, worldMemberships, features, loading } = useUserProfile();
  const [hostedEvents, setHostedEvents] = useState<HostedEvent[]>([]);

  // Redirect if not authenticated
  useEffect(() => {
    if (ready && !authenticated) {
      router.replace('/');
    }
  }, [ready, authenticated, router]);

  // Fetch hosted events — include archived (unpublished) ones so the owner
  // can see + restore them from the dashboard.
  const [eventsRefresh, setEventsRefresh] = useState(0);
  useEffect(() => {
    if (!profile?.id) return;
    fetch(`/api/events?hostUserId=${profile.id}&includeUnpublished=1`)
      .then((r) => r.json())
      .then((data) => setHostedEvents(data.events || []))
      .catch(console.error);
  }, [profile?.id, eventsRefresh]);

  if (!ready || loading) {
    return (
      <div className="min-h-screen bg-[var(--page-bg)] text-ink">
        <Navigation />
        <div className="flex items-center justify-center pt-40">
          <LoadingBar text="LOADING DASHBOARD" />
        </div>
      </div>
    );
  }

  if (!authenticated) {
    return null;
  }

  return (
    <DashboardContext.Provider value={{ profile, worldMemberships, features, hostedEvents, refreshEvents: () => setEventsRefresh((n) => n + 1) }}>
      <DashboardOverviewProvider>
        <SidebarProvider>
          <DashboardShell>{children}</DashboardShell>
        </SidebarProvider>
      </DashboardOverviewProvider>
    </DashboardContext.Provider>
  );
}

/**
 * The actual rendered shell. Lives below SidebarProvider so it can read the
 * collapsed state and slide <main>'s margin in lockstep with the sidebar's
 * width animation.
 *
 * Both transitions share the same duration (300ms) + easing (ease-out) so
 * the whole page feels like one smooth motion rather than two parts.
 *
 * Keyboard shortcut: ⌘\ / Ctrl+\ toggles collapse.
 */
function DashboardShell({ children }: { children: React.ReactNode }) {
  const { collapsed, toggle } = useSidebar();

  // ⌘\ keyboard shortcut
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === '\\') {
        e.preventDefault();
        toggle();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle]);

  return (
    <div className="min-h-screen overflow-x-hidden relative z-10 bg-[var(--page-bg)] text-ink">
      {/* Subtle texture overlays */}
      <div className="grain-overlay" />
      <div className="scanlines-overlay" />

      <Navigation />
      <DashboardSidebar />
      <main
        className={`pt-16 sm:pt-24 px-4 sm:px-8 pb-[var(--mobile-nav-clearance)] md:pb-8 transition-[margin-left] duration-300 ease-out ${
          collapsed ? 'sm:ml-14' : 'sm:ml-56'
        }`}
      >
        <div className="max-w-6xl">{children}</div>
      </main>
      <ThemeToggle />
    </div>
  );
}
