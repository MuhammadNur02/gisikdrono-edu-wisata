'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

// Moves on to the page a sign-in step returned, replacing the form in the history so Back does not resubmit it.
// isNavigating stays true until the next page has rendered, so the button keeps its spinner until then.
export function useReplaceNavigation() {
  const router = useRouter();
  const [isNavigating, startNavigation] = useTransition();
  return {
    isNavigating,
    navigate: (path: string) => {
      startNavigation(() => {
        router.replace(path);
      });
    },
  };
}
