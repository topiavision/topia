'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import TypographicSphere from '../components/TypographicSphere';

const ROLES = [
  'Music', 'DJ', 'Visual Artist', 'Filmmaker', 'Photographer',
  'Writer', 'Poet', 'Dancer', 'Performer', 'Producer',
  'Designer', 'Illustrator', 'Game Designer', 'Architect',
  'Technologist', 'Curator', 'Educator', 'Community Builder',
  'Entrepreneur', 'Researcher',
];

type Step = 'landing' | 'name' | 'email' | 'roles' | 'submitting' | 'done';

const LIME = '#e4fe52';

export default function WaitlistPage() {
  const [mounted, setMounted] = useState(false);
  const [step, setStep] = useState<Step>('landing');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [roles, setRoles] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [stepVisible, setStepVisible] = useState(false);
  const [pendingStep, setPendingStep] = useState<Step | null>(null);

  // Drag state (desktop only)
  const [dragPos, setDragPos] = useState({ x: 0, y: 0 });
  const dragRef = useRef({ isDragging: false, startX: 0, startY: 0, origX: 0, origY: 0, baseX: 0, baseY: 0, elW: 0, elH: 0 });
  const contentRef = useRef<HTMLDivElement>(null);
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(pointer: fine)');
    setIsDesktop(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    // Don't drag when clicking interactive elements
    const tag = (e.target as HTMLElement).tagName.toLowerCase();
    if (['input', 'button', 'a', 'select', 'textarea'].includes(tag)) return;
    if ((e.target as HTMLElement).closest('button, a, input, select, textarea')) return;

    const el = contentRef.current;
    if (!el) return;

    // Capture base position (element position minus current drag offset) at drag start
    const rect = el.getBoundingClientRect();
    dragRef.current = {
      isDragging: true,
      startX: e.clientX,
      startY: e.clientY,
      origX: dragPos.x,
      origY: dragPos.y,
      baseX: rect.left - dragPos.x,
      baseY: rect.top - dragPos.y,
      elW: rect.width,
      elH: rect.height,
    };
    e.preventDefault();
  }, [dragPos]);

  useEffect(() => {
    if (!isDesktop) return;

    const handleMove = (e: MouseEvent) => {
      if (!dragRef.current.isDragging) return;

      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      let newX = dragRef.current.origX + dx;
      let newY = dragRef.current.origY + dy;

      // Clamp so the box stays within viewport (allow right up to 0px edges)
      const { baseX, baseY, elW, elH } = dragRef.current;
      const minX = -baseX;
      const maxX = window.innerWidth - elW - baseX;
      const minY = -baseY;
      const maxY = window.innerHeight - elH - baseY;

      newX = Math.max(minX, Math.min(maxX, newX));
      newY = Math.max(minY, Math.min(maxY, newY));

      setDragPos({ x: newX, y: newY });
    };

    const handleUp = () => {
      dragRef.current.isDragging = false;
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [isDesktop]);

  // Force dark mode on this page
  useEffect(() => {
    const prev = document.documentElement.getAttribute('data-theme');
    document.documentElement.setAttribute('data-theme', 'dark');
    const t = setTimeout(() => {
      setMounted(true);
      // Fade in the initial step after mount
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setStepVisible(true));
      });
    }, 100);
    return () => {
      clearTimeout(t);
      // Never drop the attribute entirely — an attribute-less <html> falls
      // back to the light CSS defaults, and the site defaults to dark.
      document.documentElement.setAttribute('data-theme', prev || 'dark');
    };
  }, []);

  const goToStep = useCallback((next: Step) => {
    // Fade out current step
    setStepVisible(false);
    setPendingStep(next);
  }, []);

  // When fade-out completes, swap step and fade in
  useEffect(() => {
    if (pendingStep === null) return;
    const t = setTimeout(() => {
      setStep(pendingStep);
      setPendingStep(null);
      // Fade in after DOM updates
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setStepVisible(true));
      });
    }, 400);
    return () => clearTimeout(t);
  }, [pendingStep]);

  const toggleRole = (r: string) => {
    setRoles((prev) =>
      prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]
    );
  };

  const handleSubmit = async () => {
    setError('');
    goToStep('submitting');

    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, roles }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Something went wrong');
      }

      setTimeout(() => goToStep('done'), 600);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      goToStep('roles');
    }
  };

  const stepContent = () => {
    switch (step) {
      case 'landing':
        return (
          <div className="text-center">
            <h1
              className="text-5xl sm:text-6xl md:text-7xl font-bold tracking-tight leading-[1.05] mb-5"
              style={{ fontFamily: "'Basement Grotesque', sans-serif" }}
            >
              <span style={{ color: '#e8e4dc' }}>BUILD </span>
              <span style={{ color: LIME }}>WORLDS</span>
              <br />
              <span style={{ color: '#e8e4dc' }}>WITH US.</span>
            </h1>
            <p className="font-mono text-[12px] sm:text-[13px] opacity-40 max-w-md mx-auto mb-8 leading-relaxed" style={{ color: '#e8e4dc' }}>
              TOPIA IS A NEW UNIVERSE IN THE MAKING.<br />
              A LIVING NETWORK FOR CREATIVE SOVEREIGNTY.
            </p>
            <button
              onClick={() => goToStep('name')}
              className="font-mono text-[13px] uppercase tracking-tight rounded-lg px-8 py-3 hover:brightness-90 transition-all"
              style={{ backgroundColor: LIME, color: '#111111', fontWeight: 700 }}
            >
              JOIN THE WAITLIST
            </button>
          </div>
        );

      case 'name':
        return (
          <div className="w-full max-w-md mx-auto">
            <p className="font-mono text-[11px] uppercase tracking-[0.15em] mb-2 opacity-40" style={{ color: '#e8e4dc' }}>
              Step 1 of 3
            </p>
            <h2
              className="text-2xl sm:text-3xl font-bold tracking-tight mb-6"
              style={{ color: '#e8e4dc', fontFamily: "'Basement Grotesque', sans-serif" }}
            >
              What&apos;s your name?
            </h2>
            <input
              autoFocus
              type="text"
              className="w-full bg-transparent border-b-2 pb-2 font-mono text-[18px] sm:text-[22px] outline-none placeholder:opacity-20"
              style={{ borderColor: LIME, color: '#e8e4dc' }}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Type your name..."
              onKeyDown={(e) => { if (e.key === 'Enter' && name.trim()) goToStep('email'); }}
            />
            <div className="flex items-center justify-between mt-8">
              <button
                onClick={() => goToStep('landing')}
                className="font-mono text-[12px] uppercase tracking-wide opacity-30 hover:opacity-60 transition"
                style={{ color: '#e8e4dc' }}
              >
                Back
              </button>
              <button
                onClick={() => goToStep('email')}
                disabled={!name.trim()}
                className="font-mono text-[13px] uppercase tracking-tight rounded-lg px-6 py-2.5 hover:brightness-90 transition-all disabled:opacity-30"
                style={{ backgroundColor: LIME, color: '#111111', fontWeight: 700 }}
              >
                Next &rarr;
              </button>
            </div>
          </div>
        );

      case 'email':
        return (
          <div className="w-full max-w-md mx-auto">
            <p className="font-mono text-[11px] uppercase tracking-[0.15em] mb-2 opacity-40" style={{ color: '#e8e4dc' }}>
              Step 2 of 3
            </p>
            <h2
              className="text-2xl sm:text-3xl font-bold tracking-tight mb-6"
              style={{ color: '#e8e4dc', fontFamily: "'Basement Grotesque', sans-serif" }}
            >
              What&apos;s your email?
            </h2>
            <input
              autoFocus
              type="email"
              className="w-full bg-transparent border-b-2 pb-2 font-mono text-[18px] sm:text-[22px] outline-none placeholder:opacity-20"
              style={{ borderColor: LIME, color: '#e8e4dc' }}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              onKeyDown={(e) => { if (e.key === 'Enter' && email.trim()) goToStep('roles'); }}
            />
            <div className="flex items-center justify-between mt-8">
              <button
                onClick={() => goToStep('name')}
                className="font-mono text-[12px] uppercase tracking-wide opacity-30 hover:opacity-60 transition"
                style={{ color: '#e8e4dc' }}
              >
                Back
              </button>
              <button
                onClick={() => goToStep('roles')}
                disabled={!email.trim()}
                className="font-mono text-[13px] uppercase tracking-tight rounded-lg px-6 py-2.5 hover:brightness-90 transition-all disabled:opacity-30"
                style={{ backgroundColor: LIME, color: '#111111', fontWeight: 700 }}
              >
                Next &rarr;
              </button>
            </div>
          </div>
        );

      case 'roles':
        return (
          <div className="w-full max-w-lg mx-auto">
            <p className="font-mono text-[11px] uppercase tracking-[0.15em] mb-2 opacity-40" style={{ color: '#e8e4dc' }}>
              Step 3 of 3
            </p>
            <h2
              className="text-2xl sm:text-3xl font-bold tracking-tight mb-2"
              style={{ color: '#e8e4dc', fontFamily: "'Basement Grotesque', sans-serif" }}
            >
              What do you do?
            </h2>
            <p className="font-mono text-[12px] opacity-30 mb-6" style={{ color: '#e8e4dc' }}>
              Select all that apply
            </p>
            <div className="flex flex-wrap gap-2 mb-8 max-h-[240px] overflow-y-auto">
              {ROLES.map((r) => {
                const selected = roles.includes(r);
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => toggleRole(r)}
                    className="font-mono text-[12px] uppercase tracking-tight rounded-full px-4 py-2 border transition-all duration-200"
                    style={{
                      borderColor: selected ? LIME : 'rgba(232, 228, 220, 0.15)',
                      backgroundColor: selected ? LIME : 'transparent',
                      color: selected ? '#111111' : '#e8e4dc',
                      fontWeight: selected ? 700 : 400,
                    }}
                  >
                    {r}
                  </button>
                );
              })}
            </div>
            {error && (
              <p className="font-mono text-[12px] text-red-400 mb-4">{error}</p>
            )}
            <div className="flex items-center justify-between">
              <button
                onClick={() => goToStep('email')}
                className="font-mono text-[12px] uppercase tracking-wide opacity-30 hover:opacity-60 transition"
                style={{ color: '#e8e4dc' }}
              >
                Back
              </button>
              <button
                onClick={handleSubmit}
                className="font-mono text-[13px] uppercase tracking-tight rounded-lg px-6 py-2.5 hover:brightness-90 transition-all"
                style={{ backgroundColor: LIME, color: '#111111', fontWeight: 700 }}
              >
                JOIN WAITLIST
              </button>
            </div>
          </div>
        );

      case 'submitting':
        return (
          <div className="text-center">
            <div
              className="w-10 h-10 rounded-full border-2 border-t-transparent animate-spin mx-auto"
              style={{ borderColor: LIME, borderTopColor: 'transparent' }}
            />
          </div>
        );

      case 'done':
        return (
          <div className="text-center">
            <div
              className="w-14 h-14 rounded-full mx-auto mb-5 flex items-center justify-center"
              style={{ backgroundColor: LIME }}
            >
              <svg width="24" height="24" viewBox="0 0 20 20" fill="none">
                <path d="M5 10l3.5 3.5L15 7" stroke="#111111" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h2
              className="text-2xl sm:text-3xl font-bold tracking-tight mb-2"
              style={{ color: '#e8e4dc', fontFamily: "'Basement Grotesque', sans-serif" }}
            >
              YOU&apos;RE IN.
            </h2>
            <p className="font-mono text-[13px] opacity-40" style={{ color: '#e8e4dc' }}>
              We&apos;ll be in touch soon, {name.split(' ')[0]}.
            </p>
          </div>
        );
    }
  };

  return (
    <div
      className="h-screen flex flex-col relative overflow-hidden"
      style={{ backgroundColor: '#111111' }}
    >
      {/* Globe background — bigger */}
      <div className="absolute inset-0 flex items-center justify-center opacity-20 pointer-events-none select-none scale-110">
        <TypographicSphere
          texts={['TOPIA', 'WORLD', 'BUILDERS']}
          speed={0.0006}
          fontSize={20}
          lineCount={36}
          showControls={false}
          skipLoading={true}
          color="#e8e4dc"
          bgColor="#111111"
        />
      </div>

      {/* Main content — centered */}
      <div className="relative z-10 flex-1 flex items-center justify-center px-4 sm:px-6">
        <div
          ref={contentRef}
          onMouseDown={isDesktop ? handleDragStart : undefined}
          className="w-full max-w-2xl rounded-2xl border p-8 sm:p-12 backdrop-blur-md"
          style={{
            opacity: mounted && stepVisible ? 1 : 0,
            transform: `translate(${dragPos.x}px, ${dragPos.y + (mounted && stepVisible ? 0 : 8)}px)`,
            transition: dragRef.current.isDragging
              ? 'opacity 0.5s cubic-bezier(0.4, 0, 0.2, 1)'
              : 'opacity 0.5s cubic-bezier(0.4, 0, 0.2, 1), transform 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
            backgroundColor: 'rgba(17, 17, 17, 0.35)',
            borderColor: 'rgba(232, 228, 220, 0.08)',
            cursor: isDesktop ? 'grab' : undefined,
            userSelect: isDesktop ? 'none' : undefined,
          }}
        >
          {stepContent()}
        </div>
      </div>

      {/* Compact footer */}
      <div
        className="relative z-10 flex items-center justify-between px-5 sm:px-8 py-4 border-t"
        style={{ borderColor: 'rgba(232, 228, 220, 0.1)' }}
      >
        <a
          href="/"
          className="font-mono text-[11px] uppercase tracking-tight opacity-40 hover:opacity-70 transition"
          style={{ color: '#e8e4dc', fontFamily: "'Basement Grotesque', sans-serif" }}
        >
          TOPIA
        </a>
        <div className="flex items-center gap-5">
          <a
            href="https://www.instagram.com/topia.vision"
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-[13px] sm:text-[11px] uppercase tracking-wide opacity-30 hover:opacity-60 transition"
            style={{ color: '#e8e4dc' }}
          >
            Instagram
          </a>
          <a
            href="https://x.com/TopiaTV"
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-[13px] sm:text-[11px] uppercase tracking-wide opacity-30 hover:opacity-60 transition"
            style={{ color: '#e8e4dc' }}
          >
            X
          </a>
          <a
            href="mailto:contact@topia.vision"
            className="font-mono text-[13px] sm:text-[11px] uppercase tracking-wide opacity-30 hover:opacity-60 transition"
            style={{ color: '#e8e4dc' }}
          >
            Contact
          </a>
        </div>
      </div>
    </div>
  );
}
