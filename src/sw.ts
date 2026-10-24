/// <reference lib="webworker" />
import {
  ExpirationPlugin,
  NetworkOnly,
  Serwist,
  StaleWhileRevalidate,
  type PrecacheEntry,
  type RouteMatchCallbackOptions,
  type SerwistGlobalConfig,
} from 'serwist';

// Relative, not @/: the worker is bundled by Serwist's own child compiler.
import { SCANNER_OFFLINE_PATH } from './config/scanner';

// The scanner PWA's service worker (Task P4.4.03, docs/PRD.md FR-SCAN-01), built by @serwist/next into public/sw.js and
// registered from /dashboard/scanner only, with that scope. It precaches the build's static assets (the shell) and
// the static offline page, never a dashboard page: those carry a staff member's name and a CSP nonce. /api/* and every
// page of this site go to the network alone, so no ticket, booking or scan result is ever stored on the phone (CLAUDE.md §7.4:
// online only, no queue, no cached whitelist).

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const API_PREFIX = '/api/';
const ICONS_PREFIX = '/icons/';
const ICON_CACHE = { name: 'scanner-icons', maxEntries: 32 } as const;

// Another origin's request gets no route at all, so the browser sends it itself and the worker never fetches anything
// under its own CSP (review of PR #49).
function isApiRequest({ url, sameOrigin }: RouteMatchCallbackOptions): boolean {
  return sameOrigin && url.pathname.startsWith(API_PREFIX);
}

function isAppIcon({ url, sameOrigin, request }: RouteMatchCallbackOptions): boolean {
  return sameOrigin && request.destination === 'image' && url.pathname.startsWith(ICONS_PREFIX);
}

function isPage({ request }: RouteMatchCallbackOptions): boolean {
  return request.mode === 'navigate';
}

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: false,
  runtimeCaching: [
    { matcher: isApiRequest, handler: new NetworkOnly() },
    {
      matcher: isAppIcon,
      handler: new StaleWhileRevalidate({
        cacheName: ICON_CACHE.name,
        plugins: [new ExpirationPlugin({ maxEntries: ICON_CACHE.maxEntries })],
      }),
    },
    { matcher: isPage, handler: new NetworkOnly() },
  ],
  // A page that cannot reach the network shows `Tidak ada sinyal` (FR-SCAN-01).
  fallbacks: {
    entries: [
      { url: SCANNER_OFFLINE_PATH, matcher: ({ request }) => request.destination === 'document' },
    ],
  },
});

serwist.addEventListeners();
