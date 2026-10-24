'use client';

import { useEffect } from 'react';

import { HEADER_ID, HEADER_SENTINEL_ID } from '@/components/layout/header-ids';

// DESIGN-SPEC §4 (Global, header transparent to solid): one IntersectionObserver on the sentinel flips the header's
// data-scrolled attribute, and CSS does the rest (.site-header in src/styles/globals.css). No scroll listener, no
// React state, so scrolling never renders anything.
export function HeaderScrollObserver() {
  useEffect(() => {
    const header = document.getElementById(HEADER_ID);
    const sentinel = document.getElementById(HEADER_SENTINEL_ID);
    if (!header || !sentinel) return;
    const observer = new IntersectionObserver(([entry]) => {
      header.toggleAttribute('data-scrolled', entry?.isIntersecting === false);
    });
    observer.observe(sentinel);
    return () => {
      observer.disconnect();
    };
  }, []);
  return null;
}
