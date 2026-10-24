'use client';

import { useEffect } from 'react';

import { crossesScannerBoundary } from '@/lib/utils/scanner-boundary';

const PRIMARY_BUTTON = 0;

// The link of a plain click that next/link would follow on the client, or null: a modified click, another window,
// a download or another origin is the browser's own business.
function isPlainClick(event: MouseEvent): boolean {
  if (event.defaultPrevented || event.button !== PRIMARY_BUTTON) return false;
  return !(event.metaKey || event.ctrlKey || event.shiftKey || event.altKey);
}

function sameOriginLinkOf(event: MouseEvent): URL | null {
  if (!isPlainClick(event)) return null;
  const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null;
  if (!(anchor instanceof HTMLAnchorElement) || anchor.hasAttribute('download')) return null;
  if (anchor.target !== '' && anchor.target !== '_self') return null;
  const url = new URL(anchor.href);
  return url.origin === window.location.origin ? url : null;
}

// CLAUDE.md §7.4 (review of PR #49): every link of the dashboard, the sidebar, the breadcrumb, the menus and the
// pages' own, loads a new document when it leads into or out of /dashboard/scanner, so the camera and WebAssembly
// policies never outlive the scanner's document or miss it. It listens in the capture phase on the document, before
// React's handlers, so next/link never sees such a click.
export function ScannerBoundary() {
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const url = sameOriginLinkOf(event);
      if (url === null || !crossesScannerBoundary(window.location.pathname, url.pathname)) return;
      event.preventDefault();
      event.stopPropagation();
      window.location.assign(url.href);
    };
    document.addEventListener('click', onClick, true);
    return () => {
      document.removeEventListener('click', onClick, true);
    };
  }, []);
  return null;
}
