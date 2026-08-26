'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/* The legacy /search page duplicated the ⌘K palette with worse behavior
 * (and dead links for people without usernames). Old links now land on
 * /home with the palette open — same search, one surface. */
export default function SearchPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/home');
    // The palette lives in the root layout, so it survives the navigation.
    requestAnimationFrame(() => {
      window.dispatchEvent(new CustomEvent('topia:open-cmdk'));
    });
  }, [router]);

  return null;
}
