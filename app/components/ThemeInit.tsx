'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

// Site-wide theme guard. Dark is Topia's default: the inline <head> script in
// the root layout sets data-theme before first paint, and this component
// re-asserts it on every client-side navigation — so no page or flow can
// strand the site in light mode unless the user explicitly chose light via
// the theme toggle (stored as topia-theme = 'light').
export default function ThemeInit() {
  const pathname = usePathname();

  useEffect(() => {
    try {
      const saved = localStorage.getItem('topia-theme');
      const resolved = saved === 'light' ? 'light' : 'dark';
      if (document.documentElement.getAttribute('data-theme') !== resolved) {
        document.documentElement.setAttribute('data-theme', resolved);
      }
    } catch {
      document.documentElement.setAttribute('data-theme', 'dark');
    }
  }, [pathname]);

  return null;
}
