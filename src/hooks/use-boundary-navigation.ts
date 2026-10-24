'use client';

import { useRouter } from 'next/navigation';
import { useCallback } from 'react';

import { crossesScannerBoundary } from '@/lib/utils/scanner-boundary';

// router.push for the dashboard, except into or out of /dashboard/scanner, which loads a new document so the camera
// and WebAssembly policies of the page are the ones its own response sent (src/lib/utils/scanner-boundary.ts).
export function useBoundaryNavigation(): (href: string) => void {
  const router = useRouter();
  return useCallback(
    (href: string) => {
      const target = new URL(href, window.location.href);
      if (crossesScannerBoundary(window.location.pathname, target.pathname)) {
        window.location.assign(target.href);
        return;
      }
      router.push(href);
    },
    [router],
  );
}
