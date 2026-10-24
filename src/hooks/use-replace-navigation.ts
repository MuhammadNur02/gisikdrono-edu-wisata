'use client';

import { useTransition } from 'react';

import { useBoundaryNavigation } from '@/hooks/use-boundary-navigation';

// Moves on to the page a sign-in step returned, replacing the form in the history so Back does not resubmit it.
// isNavigating stays true until the next page has rendered, so the button keeps its spinner until then. A sign-in that
// leads to /dashboard/scanner (the installed scanner's start page) loads it as a document of its own.
export function useReplaceNavigation() {
  const replace = useBoundaryNavigation('replace');
  const [isNavigating, startNavigation] = useTransition();
  return {
    isNavigating,
    navigate: (path: string) => {
      startNavigation(() => {
        replace(path);
      });
    },
  };
}
