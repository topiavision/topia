'use client';

import { Suspense, useEffect, useReducer, useState, useCallback } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useRouter, useSearchParams } from 'next/navigation';
import { PATH_CONFIG, UserPath } from '../components/profile/pathConfig';
import WelcomeStep from './steps/WelcomeStep';
import IdentityStep from './steps/IdentityStep';
import AvatarStep from './steps/AvatarStep';
import DoneStep from './steps/DoneStep';

/* ── Wizard state ─────────────────────────────────────────────── */

export interface WizardData {
  name: string;
  username: string;
  avatarUrl: string;
  path: UserPath | '';
  roleTags: string[];
  bio: string;
  socialWebsite: string;
  socialTwitter: string;
  socialInstagram: string;
  socialSoundcloud: string;
  socialSpotify: string;
  socialLinkedin: string;
  socialSubstack: string;
  socialFarcaster: string;
  toolSlugs: string[];
}

const EMPTY_DATA: WizardData = {
  name: '',
  username: '',
  avatarUrl: '',
  path: 'catalyst', // default path for all new signups (the explicit path step is retired)
  roleTags: [],
  bio: '',
  socialWebsite: '',
  socialTwitter: '',
  socialInstagram: '',
  socialSoundcloud: '',
  socialSpotify: '',
  socialLinkedin: '',
  socialSubstack: '',
  socialFarcaster: '',
  toolSlugs: [],
};

type State = {
  step: number;
  data: WizardData;
  saving: boolean;
};

type Action =
  | { type: 'PATCH'; patch: Partial<WizardData> }
  | { type: 'GO'; step: number }
  | { type: 'NEXT' }
  | { type: 'BACK' }
  | { type: 'SAVING'; saving: boolean }
  | { type: 'HYDRATE'; data: Partial<WizardData>; step: number };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'PATCH':   return { ...state, data: { ...state.data, ...action.patch } };
    case 'GO':      return { ...state, step: action.step };
    case 'NEXT':    return { ...state, step: state.step + 1 };
    case 'BACK':    return { ...state, step: Math.max(0, state.step - 1) };
    case 'SAVING':  return { ...state, saving: action.saving };
    case 'HYDRATE': return { ...state, data: { ...state.data, ...action.data }, step: action.step };
    default:        return state;
  }
}

/* ── Step manifest ────────────────────────────────────────────── */

// Signup is deliberately minimal: identity (name + handle) and a photo.
// Everything else — craft tags, bio, socials, follows — is optional and
// collected later by the complete-your-profile prompt on /home, so a new
// member (especially one mid-RSVP) is through in seconds.
const STEPS = [
  'welcome',
  'identity',
  'avatar',
  'done',
] as const;

const TOTAL_STEPS = STEPS.length - 2; // welcome + done are bookends; "progress" runs over input steps

/* ── First-incomplete-step resume logic ───────────────────────── */

function firstIncompleteStep(data: Partial<WizardData>): number {
  if (!data.name || !data.username) return 1;
  // Photo is encouraged but optional — the generated fallback avatar is fine,
  // so a missing photo never traps returning users on the avatar step.
  return STEPS.length - 1;
}

/* ── Page component ───────────────────────────────────────────── */

function LoadingFrame() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--page-bg)] text-ink">
      <span className="font-mono text-[11px] uppercase tracking-[3px] text-ink/40">loading…</span>
    </div>
  );
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={<LoadingFrame />}>
      <OnboardingWizard />
    </Suspense>
  );
}

function OnboardingWizard() {
  const { ready, authenticated, user } = usePrivy();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [state, dispatch] = useReducer(reducer, { step: 0, data: EMPTY_DATA, saving: false });
  const [hydrated, setHydrated] = useState(false);

  /* Not logged in (e.g. arriving from a "complete your profile" email): send to
   * the enter/login screen, but remember where to return so login lands the user
   * back here instead of /home. We stash it in sessionStorage (survives Privy's
   * full-page OAuth redirect, which drops the URL query) and also pass ?next as a
   * visible fallback for modal logins. */
  useEffect(() => {
    if (ready && !authenticated) {
      const here = window.location.pathname + window.location.search;
      try { sessionStorage.setItem('topia:postLogin', here); } catch { /* ignore */ }
      router.replace(`/?next=${encodeURIComponent(here)}`);
    }
  }, [ready, authenticated, router]);

  /* Hydrate from existing profile */
  useEffect(() => {
    if (!ready || !authenticated || !user) return;
    fetch(`/api/auth/profile?privyId=${encodeURIComponent(user.id)}`)
      .then((r) => r.json())
      .then(({ user: saved }) => {
        if (!saved) {
          setHydrated(true);
          return;
        }
        const partial: Partial<WizardData> = {
          name: saved.name ?? '',
          username: saved.username ?? '',
          avatarUrl: saved.avatarUrl ?? '',
          path: (saved.path || 'catalyst') as WizardData['path'],
          roleTags: saved.roleTags ? saved.roleTags.split(',').map((s: string) => s.trim()).filter(Boolean) : [],
          bio: saved.bio ?? '',
          socialWebsite: saved.socialWebsite ?? '',
          socialTwitter: saved.socialTwitter ?? '',
          socialInstagram: saved.socialInstagram ?? '',
          socialSoundcloud: saved.socialSoundcloud ?? '',
          socialSpotify: saved.socialSpotify ?? '',
          socialLinkedin: saved.socialLinkedin ?? '',
          socialSubstack: saved.socialSubstack ?? '',
          socialFarcaster: saved.socialFarcaster ?? '',
          toolSlugs: saved.toolSlugs ? saved.toolSlugs.split(',').map((s: string) => s.trim()).filter(Boolean) : [],
        };
        // ?from=profile means user clicked "Redo intro" — start at welcome no matter what
        const fromProfile = searchParams?.get('from') === 'profile';
        const initialStep = fromProfile ? 0 : firstIncompleteStep(partial);
        dispatch({ type: 'HYDRATE', data: partial, step: initialStep });
      })
      .catch(console.error)
      .finally(() => setHydrated(true));
  }, [ready, authenticated, user, searchParams]);

  /* Save partial diff to API */
  const saveDiff = useCallback(async (patch: Partial<WizardData>) => {
    if (!user) return;
    dispatch({ type: 'SAVING', saving: true });
    try {
      const body: Record<string, unknown> = { privyId: user.id };
      for (const [k, v] of Object.entries(patch)) {
        if (k === 'roleTags' || k === 'toolSlugs') {
          body[k] = (v as string[]).join(',') || null;
        } else {
          body[k] = v;
        }
      }
      await fetch('/api/auth/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } finally {
      dispatch({ type: 'SAVING', saving: false });
    }
  }, [user]);

  const advance = useCallback(async (patch: Partial<WizardData>) => {
    dispatch({ type: 'PATCH', patch });
    await saveDiff(patch);
    dispatch({ type: 'NEXT' });
  }, [saveDiff]);

  const back = useCallback(() => dispatch({ type: 'BACK' }), []);

  /* Loading frame while we figure out where to send the user */
  if (!ready || !authenticated || !hydrated) {
    return <LoadingFrame />;
  }

  const current = STEPS[state.step];
  const config = state.data.path ? PATH_CONFIG[state.data.path as UserPath] : null;
  const stepNumber = state.step; // 0 welcome · 1 identity · 2 avatar · 3 done
  const inputStepNumber = Math.max(0, Math.min(stepNumber, TOTAL_STEPS));

  /* Step routing */
  return (
    <div key={current} className="min-h-screen bg-[var(--page-bg)]">
      {current === 'welcome' && (
        <WelcomeStep
          onAdvance={() => dispatch({ type: 'NEXT' })}
          name={user?.email?.address ?? user?.google?.name ?? 'creator'}
        />
      )}
      {current === 'identity' && (
        <IdentityStep
          step={inputStepNumber}
          total={TOTAL_STEPS}
          config={config}
          privyId={user?.id ?? ''}
          initialName={state.data.name}
          initialUsername={state.data.username}
          onBack={back}
          onAdvance={(patch) => advance(patch)}
        />
      )}
      {current === 'avatar' && (
        <AvatarStep
          step={inputStepNumber}
          total={TOTAL_STEPS}
          config={config}
          initialValue={state.data.avatarUrl}
          fallbackName={state.data.name || 'You'}
          onBack={back}
          onAdvance={(avatarUrl) => advance(avatarUrl ? { avatarUrl } : {})}
        />
      )}
      {current === 'done' && (
        <DoneStep
          config={config}
          name={state.data.name}
          username={state.data.username}
          avatarUrl={state.data.avatarUrl}
          roleTags={state.data.roleTags}
          path={state.data.path}
        />
      )}
    </div>
  );
}
