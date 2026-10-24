'use client';

import { useEffect } from 'react';

import { SCANNER_SERVICE_WORKER } from '@/config/scanner';

// Task P4.4.03: the scanner PWA's service worker (src/app/sw.ts, built by @serwist/next), registered from the scanner
// page alone and scoped to it, so no public visitor and no other dashboard page ever installs it. A development
// server builds no worker; the failed registration there is expected and ignored.
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker
      .register(SCANNER_SERVICE_WORKER.url, { scope: SCANNER_SERVICE_WORKER.scope })
      .catch(() => undefined);
  }, []);
  return null;
}
