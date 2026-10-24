'use client';

import { useRouter } from 'next/navigation';
import { useCallback } from 'react';

import { crossesScannerBoundary } from '@/lib/utils/scanner-boundary';

type NavigationMode = 'push' | 'replace';

// The one way client code moves between pages (review of PR #49): router.push or router.replace, except into or out
// of /dashboard/scanner, which loads a new document so the camera and WebAssembly policies of the page are the ones
// its own response sent (src/lib/utils/scanner-boundary.ts). A replace stays a replace, so Back skips the form.
export function useBoundaryNavigation(mode: NavigationMode = 'push'): (href: string) => void {
  const router = useRouter();
  return useCallback(
    (href: string) => {
      const target = new URL(href, window.location.href);
      if (crossesScannerBoundary(window.location.pathname, target.pathname)) {
        if (mode === 'replace') window.location.replace(target.href);
        else window.location.assign(target.href);
        return;
      }
      if (mode === 'replace') router.replace(href);
      else router.push(href);
    },
    [mode, router],
  );
}
