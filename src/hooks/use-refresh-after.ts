'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

// Re-reads the page after a Server Action changed it, outside the action's own transition: a router.refresh() inside
// it keeps the transition, and so the button's spinner, pending until the whole page has streamed again, which on a
// slow render left the hub's buttons spinning (review of PR #69, e2e). The returned function asks for one refresh.
export function useRefreshAfter(): () => void {
  const router = useRouter();
  const [asked, setAsked] = useState(0);
  useEffect(() => {
    if (asked > 0) router.refresh();
  }, [asked, router]);
  return useCallback(() => {
    setAsked((count) => count + 1);
  }, []);
}
