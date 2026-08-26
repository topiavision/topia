'use client';

import { useEffect, useRef, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { SocialIcon } from '../../components/SocialIcons';
import { ROLE_TAGS, ROLES_MAX } from '../../../lib/events/questions';
import { roleSlugToLabel } from '../../../lib/profile/roleTags';
import { useUsernameAvailability, sanitizeUsername } from '../../onboarding/usernameAvailability';
import { avatarColor, avatarTextColor, avatarInitial, isRealPhoto } from '../../../lib/avatar';
import { socialHandle } from '../../../lib/socials';
import { resizeAndUploadAvatar } from '../../../lib/uploadImage';
import TopiaLoader from '../../components/TopiaLoader';
import { InkStamp } from '../../components/elements/InkStamp';
import RoleTagPicker from '../../components/RoleTagPicker';

// Avatars resize + upload to Blob (was inline base64). See lib/uploadImage.
const resizeImage = resizeAndUploadAvatar;

interface Question {
  id: string;
  label: string;
  type: string; // short_text | long_text | single_select | multi_select | checkbox
  options: string[] | null;
  required: boolean;
}

type AnswerValue = string | string[] | boolean;

interface Props {
  eventId: string;
  slug: string;
  eventName: string;
  privyId: string;
  email?: string | null;
  name?: string | null;
  inviteToken?: string | null;
  approvalRequired?: boolean;
  ticketLink?: string | null;
  onClose: () => void;
  // Called on a successful submit — parent updates event state, modal stays open
  // on the success step (step 3).
  onRegistered: (status: string, alreadyRegistered?: boolean) => void;
  // Called when the user taps "Done" on the success step — parent closes the
  // form and (for "going") opens the card celebration.
  onDone: (status: string) => void;
}

const inputCls = 'w-full border px-4 py-3 font-mono text-[13px] rounded-xl outline-none transition focus:border-[var(--foreground)]';

// Registration modal: after a visitor verifies with Privy, one quick screen
// collects everything — name, verified email, a handle + photo (their TOPIA
// passport) and the host's required questions — then submits. Optional
// profile extras (craft tags, socials, bio) are deferred to the
// complete-your-profile prompt on /home so RSVP stays fast.
export default function RsvpModal({ eventId, slug, eventName, privyId, email, name, inviteToken, approvalRequired, ticketLink, onClose, onRegistered, onDone }: Props) {
  const [questions, setQuestions] = useState<Question[] | null>(null);
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  // The signed-in user's existing profile role tags (slugs) — used to prefill
  // any "What do you do?" (roles) question so it carries over from the profile.
  const [profileRoleSlugs, setProfileRoleSlugs] = useState<string[]>([]);
  // Consent: registering creates a Topia profile and lets us contact them.
  const [consent, setConsent] = useState(false);

  // Standard contact fields — auto-filled from the user's profile, editable.
  const [contactName, setContactName] = useState(name ?? '');
  const [contactEmail, setContactEmail] = useState(email ?? '');

  // Profile claim: a username (required) + a photo. The photo is a required
  // *choice*: upload a real one, or explicitly opt for the generated avatar.
  const [username, setUsername] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [photoChoice, setPhotoChoice] = useState<'upload' | 'generate' | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const previewColor = avatarColor(username || contactName || privyId);

  // What the profile already has — those fields are managed in profile settings,
  // not the RSVP form, so we lock them here.
  const [existingName, setExistingName] = useState(false);
  const [existingUsername, setExistingUsername] = useState(false);
  const [existingPhoto, setExistingPhoto] = useState(false);
  // A locked (existing) handle was already accepted when the profile was
  // created, so it never runs through availability again here — that check
  // is only for a handle the guest is actively choosing. Without this, a
  // legacy handle shorter than today's minimum (e.g. a 1-character handle)
  // would read as permanently "invalid" with no way to fix it, since the
  // field is locked and can't be retyped from this form.
  const availability = useUsernameAvailability(existingUsername ? '' : username, privyId);
  const effectiveAvailability = existingUsername ? 'available' : availability;
  // Returning guests who already completed their passport see a read-only
  // summary (imported from their profile) with an "Edit" button, instead of
  // the full form again. `editingPassport` lets them reopen it.
  const [editingPassport, setEditingPassport] = useState(false);
  const [profileSocials, setProfileSocials] = useState<{ instagram?: string; twitter?: string }>({});
  // True once the profile prefill fetch settles — gates the branded loader so
  // existing data shows up populated instead of popping in.
  const [profileLoaded, setProfileLoaded] = useState(false);
  // Changing an existing real photo updates the profile everywhere, so we ask
  // first. `photoUnlocked` flips once they confirm.
  const [photoUnlocked, setPhotoUnlocked] = useState(false);
  const [confirmPhotoOpen, setConfirmPhotoOpen] = useState(false);
  // Guard against accidental exits mid-form. On the success screen the RSVP is
  // already saved, so exiting just reveals the passport card.
  const [confirmExit, setConfirmExit] = useState(false);

  // Two-screen flow: one form (everything), then success (tickets · share · done).
  const [step, setStep] = useState<'form' | 'success'>('form');
  const [resultStatus, setResultStatus] = useState<string>('going');
  const [copied, setCopied] = useState(false);
  const eventUrl = typeof window !== 'undefined' ? `${window.location.origin}/events/${slug}` : '';

  // Draft persistence — a failed submit, accidental close, or refresh must not
  // cost the guest their answers. Restored on reopen (locked profile fields
  // still win — the profile prefill runs after this), cleared on success.
  const draftKey = `topia_rsvp_draft:${eventId}`;
  const draftRestored = useRef(false);
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(draftKey);
      if (raw) {
        const d = JSON.parse(raw) as Record<string, unknown>;
        if (typeof d.contactName === 'string' && d.contactName) setContactName((v) => v || (d.contactName as string));
        if (typeof d.username === 'string' && d.username) setUsername((v) => v || (d.username as string));
        if (d.answers && typeof d.answers === 'object') setAnswers((a) => ({ ...(d.answers as Record<string, AnswerValue>), ...a }));
        if (d.consent === true) setConsent(true);
      }
    } catch { /* corrupt draft — start fresh */ }
    draftRestored.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!draftRestored.current || step === 'success') return;
    try {
      sessionStorage.setItem(draftKey, JSON.stringify({ contactName, username, answers, consent }));
    } catch { /* storage full/blocked — non-fatal */ }
  }, [draftKey, contactName, username, answers, consent, step]);

  const copyLink = () => {
    navigator.clipboard.writeText(eventUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  const shareToX = () => {
    const text = `I'm going to ${eventName}!`;
    window.open(`https://x.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(eventUrl)}`, '_blank');
  };
  const shareViaEmail = () => {
    const subject = `Join me at ${eventName}`;
    const body = `I just RSVP'd to ${eventName}.\n\nCheck it out: ${eventUrl}`;
    window.open(`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`);
  };

  async function handleAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingAvatar(true); setError('');
    try { setAvatarUrl(await resizeImage(file, privyId)); setPhotoChoice('upload'); }
    catch { setError("Couldn't process that image — try another."); }
    finally { setUploadingAvatar(false); }
  }

  // Explicitly opt for the auto-generated avatar (the colored initial). Clears
  // any uploaded image so the server generates the fallback on submit. Only
  // offered when there's no existing real photo on the profile.
  function useGeneratedAvatar() {
    setAvatarUrl('');
    setPhotoChoice('generate');
    setError('');
  }

  // Privy-verified contact methods are locked (can't be edited); email can be
  // verified in-place via Privy, like the profile "connect" rows. A verified
  // phone rides along silently on submit — there's no phone field here, the
  // form stays lean.
  const { user, linkEmail, getAccessToken } = usePrivy();
  const linked = user?.linkedAccounts ?? [];
  const emailAcct = linked.find((a) => a.type === 'email') as { address: string } | undefined;
  const googleAcct = linked.find((a) => a.type === 'google_oauth') as { email?: string } | undefined;
  const phoneAcct = linked.find((a) => a.type === 'phone') as { number: string } | undefined;
  const verifiedEmail = emailAcct?.address || googleAcct?.email || null;
  const verifiedPhone = phoneAcct?.number || null;

  // Force the verified value into the field (and keep it in sync if the
  // guest verifies mid-flow).
  useEffect(() => { if (verifiedEmail) setContactEmail(verifiedEmail); }, [verifiedEmail]);

  useEffect(() => {
    fetch(`/api/events/questions?slug=${slug}`)
      .then((r) => r.json())
      .then((d) => setQuestions(d.questions ?? []))
      .catch(() => setQuestions([]));
  }, [slug]);

  // Lock background scroll while the modal is open (esp. mobile). The modal body
  // scrolls internally; the page behind stays put.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Prefill name / email / phone from the signed-in user's profile.
  useEffect(() => {
    fetch(`/api/auth/profile?privyId=${encodeURIComponent(privyId)}`)
      .then((r) => r.json())
      .then((d) => {
        const u = d.user;
        if (!u) return;
        setContactName((prev) => prev || u.name || '');
        setContactEmail((prev) => prev || u.email || '');
        setUsername((prev) => prev || u.username || '');
        if (isRealPhoto(u.avatarUrl)) { setAvatarUrl((prev) => prev || u.avatarUrl); setPhotoChoice((prev) => prev ?? 'upload'); }
        // Lock fields the profile already has — change them in profile settings.
        if (u.name) setExistingName(true);
        if (u.username) setExistingUsername(true);
        if (isRealPhoto(u.avatarUrl)) setExistingPhoto(true);
        if (u.roleTags) {
          setProfileRoleSlugs(String(u.roleTags).split(',').map((s: string) => s.trim()).filter(Boolean));
        }
        if (u.socialInstagram || u.socialTwitter) {
          setProfileSocials({ instagram: u.socialInstagram || undefined, twitter: u.socialTwitter || undefined });
        }
      })
      .catch(() => {})
      .finally(() => setProfileLoaded(true));
  }, [privyId]);

  // Open the file picker — but if they're replacing a photo that's already on
  // their Topia profile, confirm first (it changes everywhere).
  const onPhotoClick = () => {
    if (uploadingAvatar) return;
    if (existingPhoto && !photoUnlocked) { setConfirmPhotoOpen(true); return; }
    fileRef.current?.click();
  };

  // Any exit attempt routes through here. The form confirms first (nothing is
  // saved yet); the success screen's RSVP is already saved, so exiting reveals
  // the card.
  const handleExit = () => {
    if (step === 'success') { onDone(resultStatus); return; }
    setConfirmExit(true);
  };

  // Esc closes a sub-dialog first, otherwise attempts an exit.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (confirmExit) { setConfirmExit(false); return; }
      if (confirmPhotoOpen) { setConfirmPhotoOpen(false); return; }
      handleExit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Carry the user's saved craft into any "What do you do?" question — but only
  // seed empties, so we never stomp an answer the guest is actively editing.
  useEffect(() => {
    if (!questions || profileRoleSlugs.length === 0) return;
    const seed = profileRoleSlugs.map(roleSlugToLabel).slice(0, ROLES_MAX);
    if (seed.length === 0) return;
    setAnswers((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const q of questions) {
        if (q.type !== 'roles') continue;
        const cur = prev[q.id];
        if (Array.isArray(cur) && cur.length > 0) continue;
        next[q.id] = seed;
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [questions, profileRoleSlugs]);

  // Carry the user's saved Instagram/Twitter into any matching questions —
  // only seed empties, so we never stomp an answer the guest is actively
  // editing. These persist on the profile but aren't tied to any one event.
  useEffect(() => {
    if (!questions || (!profileSocials.instagram && !profileSocials.twitter)) return;
    setAnswers((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const q of questions) {
        // Stored values are usually full URLs — seed the input with the bare
        // handle the field asks for.
        const ig = socialHandle(profileSocials.instagram) || profileSocials.instagram;
        const tw = socialHandle(profileSocials.twitter) || profileSocials.twitter;
        if (q.type === 'instagram' && ig && !prev[q.id]) { next[q.id] = ig; changed = true; }
        if (q.type === 'twitter' && tw && !prev[q.id]) { next[q.id] = tw; changed = true; }
      }
      return changed ? next : prev;
    });
  }, [questions, profileSocials]);

  const set = (id: string, v: AnswerValue) => setAnswers((a) => ({ ...a, [id]: v }));
  const toggleMulti = (id: string, opt: string) =>
    setAnswers((a) => {
      const cur = Array.isArray(a[id]) ? (a[id] as string[]) : [];
      return { ...a, [id]: cur.includes(opt) ? cur.filter((x) => x !== opt) : [...cur, opt] };
    });

  const answered = (q: Question): boolean => {
    const v = answers[q.id];
    if (q.type === 'checkbox') return v === true;
    if (Array.isArray(v)) return v.length > 0;
    return !!(v && String(v).trim());
  };

  const submit = async () => {
    if (!contactName.trim()) { setError('Please add your name'); return; }
    if (!verifiedEmail) { setError('Please verify your email to register'); return; }
    if (!username.trim()) { setError('Pick a handle to claim your Topia profile'); return; }
    if (effectiveAvailability === 'invalid') { setError('Handle must be 3–30 chars: lowercase letters, numbers, underscores'); return; }
    if (effectiveAvailability === 'taken') { setError('That handle is taken — try another'); return; }
    if (effectiveAvailability === 'checking') { setError('Hang on — still checking that handle'); return; }
    if (!photoChoice) { setError('Add a profile photo, or choose the generated avatar'); return; }
    for (const q of questions ?? []) {
      if (q.required && !answered(q)) { setError(`Please answer: ${q.label}`); return; }
    }
    if (!consent) { setError('Please agree to continue'); return; }
    // No phone field — a Privy-verified phone (from login) rides along so the
    // host still gets it, without a form field slowing the RSVP down.
    const phone = verifiedPhone ?? null;
    setSubmitting(true);
    setError('');
    try {
      // Send the Privy access token so the server can independently confirm the
      // email is verified (the body alone is not trusted).
      const accessToken = await getAccessToken().catch(() => null);
      const res = await fetch('/api/events/rsvp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ privyId, eventId, answers, email: verifiedEmail, name: contactName.trim(), phone, username: username.trim(), avatarUrl: avatarUrl || undefined, inviteToken, accessToken }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to register');
      const status = data.status ?? 'going';
      setResultStatus(status);
      onRegistered(status, data.alreadyRegistered === true);
      try { sessionStorage.removeItem(draftKey); } catch {}
      setStep('success'); // tickets · share · done
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to register');
    } finally {
      setSubmitting(false);
    }
  };

  const renderField = (q: Question) => {
    const v = answers[q.id];
    switch (q.type) {
      case 'long_text':
        return (
          <textarea rows={3} value={(v as string) ?? ''} onChange={(e) => set(q.id, e.target.value)}
            className={inputCls} style={fieldStyle} />
        );
      case 'single_select':
        return (
          <div className="flex flex-col gap-1.5">
            {(q.options ?? []).map((opt) => (
              <label key={opt} className="flex items-center gap-2 cursor-pointer font-mono text-[13px]" style={{ color: 'var(--foreground)' }}>
                <input type="radio" name={q.id} checked={v === opt} onChange={() => set(q.id, opt)} style={{ accentColor: 'var(--foreground)' }} />
                {opt}
              </label>
            ))}
          </div>
        );
      case 'multi_select':
        return (
          <div className="flex flex-col gap-1.5">
            {(q.options ?? []).map((opt) => (
              <label key={opt} className="flex items-center gap-2 cursor-pointer font-mono text-[13px]" style={{ color: 'var(--foreground)' }}>
                <input type="checkbox" checked={Array.isArray(v) && v.includes(opt)} onChange={() => toggleMulti(q.id, opt)} style={{ accentColor: 'var(--foreground)' }} />
                {opt}
              </label>
            ))}
          </div>
        );
      case 'checkbox':
        return (
          <label className="flex items-center gap-2 cursor-pointer font-mono text-[13px]" style={{ color: 'var(--foreground)' }}>
            <input type="checkbox" checked={v === true} onChange={(e) => set(q.id, e.target.checked)} style={{ accentColor: 'var(--foreground)' }} />
            Yes
          </label>
        );
      case 'instagram':
      case 'twitter':
        return (
          <div className="flex items-center gap-2 border px-4 rounded-xl transition focus-within:border-[var(--foreground)]" style={fieldStyle}>
            <span className="shrink-0 inline-flex"><SocialIcon type={q.type} size={15} /></span>
            <span className="shrink-0 opacity-40 font-mono text-[13px]">@</span>
            <input
              type="text" inputMode="text" autoCapitalize="off" autoCorrect="off"
              value={(v as string) ?? ''}
              onChange={(e) => set(q.id, e.target.value.replace(/^@+/, '').trim())}
              className="min-w-0 flex-1 bg-transparent border-none outline-none font-mono text-[13px] py-3"
              style={{ color: 'var(--foreground)' }}
              placeholder={q.type === 'instagram' ? 'your IG handle' : 'your Twitter/X handle'}
            />
          </div>
        );
      case 'roles':
        return (
          <RoleTagPicker
            options={(q.options && q.options.length ? q.options : ROLE_TAGS)}
            value={Array.isArray(v) ? (v as string[]) : []}
            onChange={(next) => set(q.id, next)}
          />
        );
      default:
        return (
          <input type="text" value={(v as string) ?? ''} onChange={(e) => set(q.id, e.target.value)}
            className={inputCls} style={fieldStyle} />
        );
    }
  };

  // Passport identity fields — photo, handle, "what you do", socials — are the
  // ones carried over from the profile/a previous RSVP. Any other host
  // question is event-specific and always shown, edit mode or not.
  const rolesQuestion = (questions ?? []).find((q) => q.type === 'roles') ?? null;
  const socialQuestions = (questions ?? []).filter((q) => q.type === 'instagram' || q.type === 'twitter');
  const otherQuestions = (questions ?? []).filter((q) => q.type !== 'instagram' && q.type !== 'twitter' && q.type !== 'roles');
  // Only *required* passport-enrichment questions (roles / IG / X) block the
  // RSVP; optional ones are hidden here and picked up later by the
  // complete-your-profile prompt, keeping this form as short as possible.
  const shownRolesQuestion = rolesQuestion?.required ? rolesQuestion : null;
  const shownSocialQuestions = socialQuestions.filter((q) => q.required);
  const passportRequiredUnanswered = [shownRolesQuestion, ...shownSocialQuestions].some((q) => q && q.required && !answered(q));
  // Complete + not explicitly reopened → show the read-only summary instead
  // of the form. Anything still missing forces the editable form open.
  const showPassportSummary = existingUsername && !!photoChoice && !passportRequiredUnanswered && !editingPassport;

  return (
    <div className="fixed inset-0 z-[2100] flex items-end justify-center sm:items-center sm:p-4 backdrop-blur-sm overflow-hidden" style={{ backgroundColor: 'rgba(0,0,0,0.6)' }} onClick={handleExit}>
      <div className="w-full sm:max-w-lg h-[90dvh] sm:h-auto sm:max-h-[88vh] rounded-t-3xl sm:rounded-2xl border-0 sm:border flex flex-col overflow-hidden" style={{ backgroundColor: 'var(--background)', borderColor: 'var(--border-color)' }} onClick={(e) => e.stopPropagation()}>
        {/* drag handle (mobile bottom-sheet affordance) */}
        <div className="sm:hidden mx-auto mt-2.5 h-1 w-10 rounded-full shrink-0" style={{ backgroundColor: 'var(--foreground)', opacity: 0.2 }} />
        <div className="flex items-start justify-between px-6 pt-3 sm:pt-7 pb-3 shrink-0">
          <p className="font-mono text-[15px] font-bold uppercase tracking-tight" style={{ color: 'var(--foreground)' }}>
            {step === 'success' ? eventName : `Register · ${eventName}`}
          </p>
          <button onClick={handleExit} className="font-mono text-[18px] opacity-50 hover:opacity-100 bg-transparent border-none cursor-pointer" style={{ color: 'var(--foreground)' }} aria-label="Close">×</button>
        </div>

        {(questions === null || !profileLoaded) ? (
          <div className="flex-1 grid place-items-center pb-10"><TopiaLoader label="Loading your details…" /></div>
        ) : (
          <>
            {/* Scrollable body — keeps the footer button pinned (Partiful-style) */}
            <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain px-6 pt-1 pb-6">
            {/* ONE quick form — contact + passport + host questions, then done. */}
            {step === 'form' && (
            <>
            <p className="font-mono text-[13px] opacity-60 mb-5" style={{ color: 'var(--foreground)' }}>
              {approvalRequired
                ? "Let's get you on the list — the host reviews requests before confirming."
                : "Let's get you on the list — this takes less than a minute."}
            </p>

            <div className="space-y-5 mb-6">
              <div>
                <label className="flex items-center gap-2 font-mono text-[12px] uppercase tracking-[0.12em] mb-1.5 font-bold opacity-60" style={{ color: 'var(--foreground)' }}>
                  Name<span style={{ color: '#FF5C34' }}> *</span>
                  {existingName && <LockHint text="Your name is set on your TOPIA profile. To change it, edit your profile in settings." />}
                </label>
                <input
                  type="text" value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  readOnly={existingName} disabled={existingName}
                  className={`${inputCls}${existingName ? ' cursor-not-allowed opacity-80' : ''}`}
                  style={fieldStyle} placeholder="Your name"
                />
              </div>
              <div>
                <label className="flex items-center gap-2 font-mono text-[12px] uppercase tracking-[0.12em] mb-1.5 font-bold opacity-60" style={{ color: 'var(--foreground)' }}>
                  Email<span style={{ color: '#FF5C34' }}> *</span>
                  {verifiedEmail && <span className="inline-flex items-center gap-1 normal-case tracking-normal" style={{ color: '#00b36b', opacity: 1 }}>· verified ✓</span>}
                </label>
                {verifiedEmail ? (
                  <input type="email" value={contactEmail} readOnly disabled className={`${inputCls} cursor-not-allowed opacity-80`} style={fieldStyle} />
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => linkEmail()}
                      className="w-full px-4 py-3 font-mono text-[13px] rounded-xl cursor-pointer border text-left flex items-center justify-between gap-2 transition hover:border-[var(--foreground)]"
                      style={fieldStyle}
                    >
                      <span className="opacity-50">Verify your email…</span>
                      <span className="text-[11px] uppercase tracking-[0.12em]" style={{ color: 'var(--accent)' }}>Verify →</span>
                    </button>
                    <p className="mt-1.5 font-mono text-[11px] opacity-50" style={{ color: 'var(--foreground)' }}>
                      A verified email is required to register.
                    </p>
                  </>
                )}
              </div>
              {showPassportSummary ? (
                /* Returning guest — passport already complete. Show it read-only,
                   imported from their profile, with an Edit escape hatch. */
                <div className="rounded-xl border p-4 flex items-start gap-3.5" style={{ borderColor: 'var(--border-color)' }}>
                  <div className="w-14 h-14 rounded-full overflow-hidden shrink-0 border" style={{ borderColor: 'var(--border-color)' }}>
                    {avatarUrl ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="w-full h-full flex items-center justify-center font-basement font-black text-[20px]" style={{ backgroundColor: previewColor, color: avatarTextColor(previewColor) }}>
                        {avatarInitial(contactName || username)}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-[14px] font-bold truncate" style={{ color: 'var(--foreground)' }}>@{username}</p>
                    {profileRoleSlugs.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {profileRoleSlugs.slice(0, ROLES_MAX).map((slug) => (
                          <span key={slug} className="font-mono text-[10px] uppercase tracking-wider px-2 py-1 rounded-full border" style={{ borderColor: 'var(--border-color)', color: 'var(--foreground)', opacity: 0.65 }}>
                            {roleSlugToLabel(slug)}
                          </span>
                        ))}
                      </div>
                    )}
                    {(socialHandle(profileSocials.instagram) || socialHandle(profileSocials.twitter)) && (
                      <div className="flex flex-wrap gap-3 mt-2 font-mono text-[11px] opacity-60" style={{ color: 'var(--foreground)' }}>
                        {socialHandle(profileSocials.instagram) && <span>IG @{socialHandle(profileSocials.instagram)}</span>}
                        {socialHandle(profileSocials.twitter) && <span>X @{socialHandle(profileSocials.twitter)}</span>}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditingPassport(true)}
                    className="shrink-0 font-mono text-[11px] uppercase tracking-[0.12em] underline bg-transparent border-none cursor-pointer"
                    style={{ color: 'var(--accent)' }}
                  >
                    Edit
                  </button>
                </div>
              ) : (
              <>
              {/* Photo + handle, the passport identity, up top */}
              <div>
                <label className="flex items-center gap-2 font-mono text-[12px] uppercase tracking-[0.12em] mb-2 font-bold opacity-60" style={{ color: 'var(--foreground)' }}>
                  Profile photo<span style={{ color: '#FF5C34' }}> *</span>
                </label>
                <div className="relative inline-block ml-2 mt-1">
                  <span className="absolute -top-2 -left-2 w-3.5 h-3.5 z-20"><span className="absolute top-0 left-0 w-full h-px bg-[var(--foreground)]/25" /><span className="absolute top-0 left-0 h-full w-px bg-[var(--foreground)]/25" /></span>
                  <span className="absolute -top-2 -right-2 w-3.5 h-3.5 z-20"><span className="absolute top-0 right-0 w-full h-px bg-[var(--foreground)]/25" /><span className="absolute top-0 right-0 h-full w-px bg-[var(--foreground)]/25" /></span>
                  <span className="absolute -bottom-2 -left-2 w-3.5 h-3.5 z-20"><span className="absolute bottom-0 left-0 w-full h-px bg-[var(--foreground)]/25" /><span className="absolute bottom-0 left-0 h-full w-px bg-[var(--foreground)]/25" /></span>
                  <span className="absolute -bottom-2 -right-2 w-3.5 h-3.5 z-20"><span className="absolute bottom-0 right-0 w-full h-px bg-[var(--foreground)]/25" /><span className="absolute bottom-0 right-0 h-full w-px bg-[var(--foreground)]/25" /></span>
                  <button
                    type="button"
                    onClick={onPhotoClick}
                    disabled={uploadingAvatar}
                    className="relative w-20 h-20 rounded-full overflow-hidden border-2 group block cursor-pointer"
                    style={{ borderColor: photoChoice ? 'var(--accent)' : 'var(--border-color)' }}
                    aria-label={avatarUrl ? 'Change profile photo' : 'Upload profile photo'}
                  >
                    {avatarUrl ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="w-full h-full flex items-center justify-center font-basement font-black text-[30px]" style={{ backgroundColor: previewColor, color: avatarTextColor(previewColor) }}>
                        {avatarInitial(contactName || username)}
                      </span>
                    )}
                    <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: 'rgba(0,0,0,0.5)' }}>
                      {uploadingAvatar ? (
                        <span className="font-mono text-[9px] uppercase tracking-wider text-white">…</span>
                      ) : (
                        <>
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M12 20h9" />
                            <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
                          </svg>
                          <span className="font-mono text-[8px] uppercase tracking-wider text-white">{avatarUrl ? 'change' : 'add'}</span>
                        </>
                      )}
                    </span>
                  </button>
                </div>
                <input ref={fileRef} type="file" accept="image/*" onChange={handleAvatar} className="hidden" />
                <div className="mt-2.5 flex flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={onPhotoClick}
                      disabled={uploadingAvatar}
                      className="font-mono text-[11px] uppercase tracking-[0.12em] px-3 py-1.5 rounded-full border transition cursor-pointer disabled:opacity-40"
                      style={photoChoice === 'upload'
                        ? { backgroundColor: 'var(--accent)', color: 'var(--accent-text)', borderColor: 'var(--accent)' }
                        : { color: 'var(--foreground)', borderColor: 'var(--border-color)' }}
                    >
                      {uploadingAvatar ? 'Uploading…' : photoChoice === 'upload' ? (existingPhoto ? '✓ Change photo' : '✓ Photo added') : 'Upload photo'}
                    </button>
                    {!existingPhoto && (
                      <button
                        type="button"
                        onClick={useGeneratedAvatar}
                        disabled={uploadingAvatar}
                        className="font-mono text-[11px] uppercase tracking-[0.12em] px-3 py-1.5 rounded-full border transition cursor-pointer disabled:opacity-40"
                        style={photoChoice === 'generate'
                          ? { backgroundColor: 'var(--accent)', color: 'var(--accent-text)', borderColor: 'var(--accent)' }
                          : { color: 'var(--foreground)', borderColor: 'var(--border-color)' }}
                      >
                        {photoChoice === 'generate' ? '✓ Using generated' : 'Use generated'}
                      </button>
                    )}
                  </div>
                  {photoChoice === null && (
                    <span className="font-mono text-[10px] tracking-[0.08em] opacity-50" style={{ color: 'var(--foreground)' }}>
                      Upload a photo or use the generated avatar to continue.
                    </span>
                  )}
                </div>
              </div>

              <div>
                <label className="flex items-center gap-2 font-mono text-[12px] uppercase tracking-[0.12em] mb-1.5 font-bold opacity-60" style={{ color: 'var(--foreground)' }}>
                  Handle<span style={{ color: '#FF5C34' }}> *</span>
                  {existingUsername && <LockHint text="Your handle is set on your TOPIA profile. To change it, edit your profile in settings." />}
                </label>
                {existingUsername ? (
                  <div className="flex items-center gap-2 border px-4 rounded-xl cursor-not-allowed" style={{ ...fieldStyle, backgroundColor: 'var(--border-color)', opacity: 0.55 }}>
                    <span className="opacity-60 font-mono text-[13px]">@</span>
                    <span className="flex-1 font-mono text-[13px] py-3" style={{ color: 'var(--foreground)' }}>{username}</span>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 opacity-60" style={{ color: 'var(--foreground)' }} aria-hidden="true">
                      <rect x="4" y="11" width="16" height="10" rx="2" />
                      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                    </svg>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2 border px-4 rounded-xl transition focus-within:border-[var(--foreground)]" style={fieldStyle}>
                      <span className="opacity-40 font-mono text-[13px]">@</span>
                      <input
                        type="text" inputMode="text" autoCapitalize="off" autoCorrect="off" spellCheck={false}
                        value={username}
                        onChange={(e) => setUsername(sanitizeUsername(e.target.value))}
                        className="flex-1 bg-transparent border-none outline-none font-mono text-[13px] py-3"
                        style={{ color: 'var(--foreground)' }}
                        placeholder="yourhandle"
                      />
                      {username && (
                        <span
                          className="font-mono text-[10px] uppercase tracking-wider shrink-0"
                          style={{ color: availability === 'available' ? '#00b36b' : (availability === 'taken' || availability === 'invalid') ? '#FF5C34' : 'var(--foreground)', opacity: availability === 'checking' ? 0.5 : 1 }}
                        >
                          {availability === 'checking' ? '…' : availability === 'available' ? 'available ✓' : availability === 'taken' ? 'taken' : availability === 'invalid' ? 'invalid' : ''}
                        </span>
                      )}
                    </div>
                    <p className="mt-1.5 font-mono text-[11px] opacity-50" style={{ color: 'var(--foreground)' }}>
                      Claim your TOPIA handle — you can change it anytime.
                    </p>
                  </>
                )}
              </div>

              {/* What you do — only when the host requires it; otherwise the
                  complete-your-profile prompt collects it later. */}
              {shownRolesQuestion && (
                <div>
                  <label className="block font-mono text-[12px] uppercase tracking-[0.12em] mb-1.5 font-bold opacity-60" style={{ color: 'var(--foreground)' }}>
                    {shownRolesQuestion.label}<span style={{ color: '#FF5C34' }}> *</span>
                  </label>
                  {renderField(shownRolesQuestion)}
                </div>
              )}

              {/* Socials — only the ones the host requires */}
              {shownSocialQuestions.length > 0 && (
                <div>
                  <label className="block font-mono text-[12px] uppercase tracking-[0.12em] mb-1.5 font-bold opacity-60" style={{ color: 'var(--foreground)' }}>
                    What are your socials?<span style={{ color: '#FF5C34' }}> *</span>
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {shownSocialQuestions.map((q) => <div key={q.id}>{renderField(q)}</div>)}
                  </div>
                </div>
              )}
              </>
              )}

              {/* Any other host question — event-specific, always shown */}
              {otherQuestions.map((q) => (
                <div key={q.id}>
                  <label className="block font-mono text-[12px] uppercase tracking-[0.12em] mb-1.5 font-bold opacity-60" style={{ color: 'var(--foreground)' }}>
                    {q.label}{q.required && <span style={{ color: '#FF5C34' }}> *</span>}
                  </label>
                  {renderField(q)}
                </div>
              ))}

              {/* Consent: registering creates a Topia profile + lets us contact them */}
              <label className="flex items-start gap-2.5 pt-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                  className="mt-0.5 shrink-0"
                  style={{ accentColor: 'var(--foreground)' }}
                />
                <span className="font-mono text-[11px] leading-snug opacity-70" style={{ color: 'var(--foreground)' }}>
                  By continuing, I agree to TOPIA&rsquo;s{' '}
                  <a href="/legal/terms" target="_blank" rel="noopener noreferrer" className="underline" style={{ color: 'var(--foreground)' }}>Terms</a>{' '}
                  and{' '}
                  <a href="/legal/privacy" target="_blank" rel="noopener noreferrer" className="underline" style={{ color: 'var(--foreground)' }}>Privacy Policy</a>, to creating a TOPIA profile, and to receiving event updates from TOPIA and the host.
                </span>
              </label>
            </div>
            </>
            )}

            {/* SUCCESS — get tickets · share · done */}
            {step === 'success' && (
            <div>
              {resultStatus === 'going' ? (
                <>
                  <div className="flex justify-center mb-4">
                    <InkStamp lines={['ENTRY', 'GRANTED', new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase()]} />
                  </div>
                  <h3 className="font-basement text-[26px] font-black uppercase leading-none mb-1.5" style={{ color: 'var(--foreground)' }}>You&apos;re going!</h3>
                  <p className="font-mono text-[12px] opacity-50 mb-5" style={{ color: 'var(--foreground)' }}>You&apos;re on the list for {eventName}.</p>

                  {ticketLink && (
                    <div className="mb-3 rounded-xl border p-4 text-left" style={{ borderColor: 'var(--border-color)' }}>
                      <p className="font-mono text-[10px] uppercase tracking-[0.15em] opacity-40 mb-1.5" style={{ color: 'var(--foreground)' }}>One more thing</p>
                      <p className="font-mono text-[12px] leading-snug opacity-70 mb-3.5" style={{ color: 'var(--foreground)' }}>This event needs a ticket too. Grab one now, or come back and get it from the event page anytime.</p>
                      <a href={ticketLink.startsWith('http') ? ticketLink : `https://${ticketLink}`} target="_blank" rel="noopener noreferrer" className="w-full inline-flex items-center justify-center px-4 py-3 font-mono text-[13px] uppercase tracking-widest rounded-lg cursor-pointer text-center font-bold no-underline transition hover:opacity-90" style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-text)' }}>Get Tickets →</a>
                    </div>
                  )}
                </>
              ) : resultStatus === 'waitlisted' ? (
                <>
                  <h3 className="font-basement text-[26px] font-black uppercase leading-none mb-1.5" style={{ color: 'var(--foreground)' }}>You&apos;re on the waitlist</h3>
                  <p className="font-mono text-[12px] opacity-60 mb-5 leading-snug" style={{ color: 'var(--foreground)' }}>{eventName} is at capacity right now. Spots are promoted in join order — if one opens, you&apos;re in automatically and we&apos;ll let you know.</p>
                </>
              ) : (
                <>
                  <h3 className="font-basement text-[26px] font-black uppercase leading-none mb-1.5" style={{ color: 'var(--foreground)' }}>Request sent</h3>
                  <p className="font-mono text-[12px] opacity-60 mb-5 leading-snug" style={{ color: 'var(--foreground)' }}>The host will review your request for {eventName} — we&apos;ll email you the moment it&apos;s confirmed.</p>
                </>
              )}

              <button
                onClick={() => onDone(resultStatus)}
                className="w-full px-4 py-3 font-mono text-[12px] uppercase tracking-widest rounded-lg cursor-pointer font-bold transition hover:opacity-90"
                style={ticketLink && resultStatus === 'going'
                  ? { backgroundColor: 'transparent', color: 'var(--foreground)', border: '1px solid var(--border-color)' }
                  : { backgroundColor: 'var(--foreground)', color: 'var(--background)', border: 'none' }}
              >
                Done
              </button>

              {/* Share — minimal, last */}
              <div className="mt-5 pt-4 border-t flex items-center justify-center gap-4" style={{ borderColor: 'var(--border-color)' }}>
                <span className="font-mono text-[10px] uppercase tracking-[0.15em] opacity-40" style={{ color: 'var(--foreground)' }}>Share</span>
                <button onClick={copyLink} className="font-mono text-[10px] uppercase tracking-widest opacity-60 hover:opacity-100 transition cursor-pointer bg-transparent border-none" style={{ color: 'var(--foreground)' }}>{copied ? 'Copied!' : 'Copy link'}</button>
                <button onClick={shareToX} className="font-mono text-[10px] uppercase tracking-widest opacity-60 hover:opacity-100 transition cursor-pointer bg-transparent border-none" style={{ color: 'var(--foreground)' }}>X</button>
                <button onClick={shareViaEmail} className="font-mono text-[10px] uppercase tracking-widest opacity-60 hover:opacity-100 transition cursor-pointer bg-transparent border-none" style={{ color: 'var(--foreground)' }}>Email</button>
              </div>
            </div>
            )}
            </div>

            {step === 'form' && (
              <div className="shrink-0 px-6 py-4 border-t pb-[max(1rem,env(safe-area-inset-bottom))]" style={{ borderColor: 'var(--border-color)' }}>
                {error && <p className="font-mono text-[12px] mb-3" style={{ color: '#FF5C34' }}>{error}</p>}

                {/* One button — the label doubles as inline guidance on what's missing. */}
                <button
                  onClick={submit}
                  disabled={submitting || !contactName.trim() || !verifiedEmail || effectiveAvailability !== 'available' || !photoChoice || !consent}
                  className="w-full px-4 py-3 font-mono text-[12px] uppercase tracking-widest rounded-lg cursor-pointer border-none font-bold disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ backgroundColor: 'var(--foreground)', color: 'var(--background)' }}
                >
                  {submitting ? 'Submitting…'
                    : !contactName.trim() ? 'Add your name to continue'
                    : !verifiedEmail ? 'Verify email to continue'
                    : !username ? 'Pick a handle to continue'
                    : effectiveAvailability === 'invalid' ? 'Handle needs 3+ characters'
                    : effectiveAvailability === 'checking' ? 'Checking availability…'
                    : effectiveAvailability === 'taken' ? 'Handle already taken'
                    : effectiveAvailability !== 'available' ? 'Pick a handle to continue'
                    : !photoChoice ? 'Choose a profile photo'
                    : !consent ? 'Agree to continue'
                    : approvalRequired ? 'Send request' : 'Complete RSVP'}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Confirm before replacing a photo that's already on the Topia profile */}
      {confirmPhotoOpen && (
        <div className="absolute inset-0 z-[2200] flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.55)' }} onClick={(e) => { e.stopPropagation(); setConfirmPhotoOpen(false); }}>
          <div className="w-full max-w-xs rounded-2xl p-6 border text-center" style={{ backgroundColor: 'var(--background)', borderColor: 'var(--border-color)' }} onClick={(e) => e.stopPropagation()}>
            <h4 className="font-mono text-[14px] font-bold uppercase mb-2" style={{ color: 'var(--foreground)' }}>Update your TOPIA photo?</h4>
            <p className="font-mono text-[12px] opacity-60 mb-5 leading-snug" style={{ color: 'var(--foreground)' }}>
              This changes your profile photo everywhere on TOPIA. You can always update it later in settings.
            </p>
            <div className="flex items-center gap-2.5">
              <button onClick={() => setConfirmPhotoOpen(false)} className="flex-1 px-4 py-2.5 font-mono text-[12px] uppercase tracking-widest rounded-lg cursor-pointer border font-bold transition hover:opacity-80" style={{ backgroundColor: 'transparent', color: 'var(--foreground)', borderColor: 'var(--border-color)' }}>
                Cancel
              </button>
              <button onClick={() => { setPhotoUnlocked(true); setConfirmPhotoOpen(false); setTimeout(() => fileRef.current?.click(), 0); }} className="flex-1 px-4 py-2.5 font-mono text-[12px] uppercase tracking-widest rounded-lg cursor-pointer border-none font-bold transition hover:opacity-90" style={{ backgroundColor: 'var(--foreground)', color: 'var(--background)' }}>
                Update
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm before abandoning the form mid-way */}
      {confirmExit && (
        <div className="absolute inset-0 z-[2200] flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.55)' }} onClick={(e) => { e.stopPropagation(); setConfirmExit(false); }}>
          <div className="w-full max-w-xs rounded-2xl p-6 border text-center" style={{ backgroundColor: 'var(--background)', borderColor: 'var(--border-color)' }} onClick={(e) => e.stopPropagation()}>
            <h4 className="font-mono text-[14px] font-bold uppercase mb-2" style={{ color: 'var(--foreground)' }}>Leave without finishing?</h4>
            <p className="font-mono text-[12px] opacity-60 mb-5 leading-snug" style={{ color: 'var(--foreground)' }}>
              Your RSVP isn&rsquo;t saved yet. If you leave now, the details you entered won&rsquo;t be kept.
            </p>
            <div className="flex items-center gap-2.5">
              <button onClick={() => setConfirmExit(false)} className="flex-1 px-4 py-2.5 font-mono text-[12px] uppercase tracking-widest rounded-lg cursor-pointer border font-bold transition hover:opacity-80" style={{ backgroundColor: 'transparent', color: 'var(--foreground)', borderColor: 'var(--border-color)' }}>
                Keep going
              </button>
              <button onClick={() => { setConfirmExit(false); onClose(); }} className="flex-1 px-4 py-2.5 font-mono text-[12px] uppercase tracking-widest rounded-lg cursor-pointer border-none font-bold transition hover:opacity-90" style={{ backgroundColor: 'var(--foreground)', color: 'var(--background)' }}>
                Leave
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// A small "?" hint that explains why a field is locked — on hover or tap.
function LockHint({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex normal-case tracking-normal">
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); setOpen((o) => !o); }}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        className="inline-flex items-center justify-center w-4 h-4 rounded-full border text-[9px] font-bold leading-none cursor-help bg-transparent"
        style={{ borderColor: 'var(--foreground)', color: 'var(--foreground)', opacity: 0.55 }}
        aria-label="Why is this locked?"
      >
        ?
      </button>
      {open && (
        <span
          role="tooltip"
          className="absolute left-0 bottom-full mb-2 w-52 rounded-lg border p-2.5 font-mono text-[10px] leading-snug z-40 text-left"
          style={{ backgroundColor: 'var(--background)', borderColor: 'var(--border-color)', color: 'var(--foreground)', boxShadow: '0 10px 30px -10px rgba(0,0,0,0.6)' }}
        >
          {text}
        </span>
      )}
    </span>
  );
}

const fieldStyle: React.CSSProperties = {
  backgroundColor: 'var(--background)', color: 'var(--foreground)', borderColor: 'var(--border-color)',
};

