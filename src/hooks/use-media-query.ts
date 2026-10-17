'use client';

import { useSyncExternalStore } from 'react';

// Tailwind's md breakpoint (48rem): dialogs replace drawers and toasts move to the bottom-right from here.
export const MEDIA_MD_UP = '(min-width: 48rem)';

function subscribe(query: string, onChange: () => void): () => void {
  const list = window.matchMedia(query);
  list.addEventListener('change', onChange);
  return () => {
    list.removeEventListener('change', onChange);
  };
}

// The server has no viewport, so it renders the mobile layout first; the browser corrects it on hydration.
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => subscribe(query, onChange),
    () => window.matchMedia(query).matches,
    () => false,
  );
}
