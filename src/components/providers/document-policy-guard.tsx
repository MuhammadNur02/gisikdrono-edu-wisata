'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';

import { crossesScannerBoundary } from '@/lib/utils/scanner-boundary';

// The safety net under the links and helpers that already load the scanner as a document of its own (review of
// PR #49): any client navigation that still crosses into or out of /dashboard/scanner, such as a Server Action or
// middleware redirect after a session expired, is loaded again as a document, so the page never runs under another
// page's camera and WebAssembly policies. Mounted in the root layout; a few hundred bytes on every page.
export function DocumentPolicyGuard() {
  const pathname = usePathname();
  const documentPath = useRef<string | null>(null);
  useEffect(() => {
    if (documentPath.current === null) {
      documentPath.current = pathname;
      return;
    }
    if (crossesScannerBoundary(documentPath.current, pathname)) window.location.reload();
  }, [pathname]);
  return null;
}
