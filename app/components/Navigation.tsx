'use client';

import { useState, useEffect, useCallback } from 'react';
import TopNav from './nav/TopNav';
import FrostedPill from './nav/FrostedPill';
import MobileMenu from './nav/MobileMenu';
import dynamic from 'next/dynamic';

// Heavy modals — load only when opened.
const MessagesModal = dynamic(() => import('./MessagesModal'), { ssr: false });
const AssistantTakeover = dynamic(() => import('./builder/agent/AssistantTakeover'), { ssr: false });
const TopiaCardModal = dynamic(() => import('./profile/TopiaCardModal'), { ssr: false });
// Live-event takeover — client-only (localStorage + live-now lookup decide
// whether it ever renders).
import BadgesProvider from './BadgesProvider';
import { OPEN_MESSAGES_EVENT } from '../../lib/openMessages';
import { OPEN_ASSISTANT_EVENT } from '../../lib/openAssistant';
import { useUserProfile } from '../hooks/useUserProfile';

export default function Navigation() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [msgOpen, setMsgOpen] = useState(false);
  const [cardOpen, setCardOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [initialConv, setInitialConv] = useState<string | null>(null);
  const [openKey, setOpenKey] = useState(0); // remount the modal fresh on each open
  const { profile, authenticated } = useUserProfile();

  const openMessages = useCallback((conversationId?: string | null) => {
    setInitialConv(conversationId ?? null);
    setOpenKey((k) => k + 1);
    setMsgOpen(true);
  }, []);

  // Let any client component (e.g. the profile Message button) pop the modal.
  useEffect(() => {
    const handler = (e: Event) => openMessages((e as CustomEvent).detail?.conversationId ?? null);
    window.addEventListener(OPEN_MESSAGES_EVENT, handler);
    return () => window.removeEventListener(OPEN_MESSAGES_EVENT, handler);
  }, [openMessages]);

  // The assistant takeover — logged-in only (house rule); signed-out
  // requests land on the /assistant page, whose wall has the login nav.
  useEffect(() => {
    const handler = () => {
      if (authenticated) setAssistantOpen(true);
      else window.location.assign('/assistant');
    };
    window.addEventListener(OPEN_ASSISTANT_EVENT, handler);
    return () => window.removeEventListener(OPEN_ASSISTANT_EVENT, handler);
  }, [authenticated]);

  return (
    <BadgesProvider>
      <TopNav onOpenMessages={() => openMessages()} />
      {/* Hide the mobile pill while the Messages modal or the assistant
          takeover is open so the keyboard can't reveal it behind the sheet. */}
      {!msgOpen && !assistantOpen && <FrostedPill onMenuToggle={() => setMenuOpen(true)} onOpenMessages={() => openMessages()} onOpenCard={() => setCardOpen(true)} />}
      {/* Once-a-day full-screen announcement when an event is live today */}
      {/* The full-screen live-event takeover is retired: the live chip in
          both navs is the door, without hijacking the first second of a
          session. */}
      <MobileMenu isOpen={menuOpen} onClose={() => setMenuOpen(false)} />
      {msgOpen && <MessagesModal key={openKey} initialConversationId={initialConv} onClose={() => setMsgOpen(false)} />}
      {assistantOpen && <AssistantTakeover onClose={() => setAssistantOpen(false)} />}
      {/* The viewer's own Topia card, with the connect-QR back face — the
          nav's quick "flash your pass" surface. */}
      {cardOpen && authenticated && profile && (
        <TopiaCardModal
          open
          onClose={() => setCardOpen(false)}
          name={profile.name || profile.username || 'Topian'}
          username={profile.username || ''}
          avatarUrl={profile.avatarUrl}
          roleTags={profile.roleTags ? profile.roleTags.split(',').map((s) => s.trim()).filter(Boolean) : []}
          path={profile.path}
          showConnectQr
        />
      )}
    </BadgesProvider>
  );
}
