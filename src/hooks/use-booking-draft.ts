'use client';

import { useCallback, useMemo, useState, useSyncExternalStore } from 'react';

import { readDraft, type BookingDraft } from '@/lib/utils/booking-wizard';
import type { WizardPackage } from '@/types/booking';

// docs/PRD.md FR-BOOK-01, docs/StyleGuide.md §5.14: the wizard's draft lives in sessionStorage under the package's
// slug, so a refresh or the back button keeps what the visitor typed and closing the tab forgets it, as does two hours
// without a change (review of PR #27, L5). Storage can be blocked (a private window, a strict browser); the wizard
// then still works, and only forgets on a refresh.

const DRAFT_KEY_PREFIX = 'gsk-booking-draft:';
// Writes from this tab: the storage event only reports those of other tabs.
const DRAFT_CHANGED = 'gsk-booking-draft-changed';

function subscribe(onChange: () => void) {
  window.addEventListener(DRAFT_CHANGED, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(DRAFT_CHANGED, onChange);
    window.removeEventListener('storage', onChange);
  };
}

// The tab's own copy, for a browser whose storage refuses writes.
const memoryDrafts = new Map<string, string>();

function readStored(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key) ?? memoryDrafts.get(key) ?? null;
  } catch {
    return memoryDrafts.get(key) ?? null;
  }
}

function writeStored(key: string, value: string | null) {
  if (value === null) memoryDrafts.delete(key);
  else memoryDrafts.set(key, value);
  try {
    if (value === null) window.sessionStorage.removeItem(key);
    else window.sessionStorage.setItem(key, value);
  } catch {
    // The memory copy above stands in.
  }
  window.dispatchEvent(new Event(DRAFT_CHANGED));
}

// The server renders no draft: undefined until the browser has read its own.
const NOT_READ = undefined;

export function useBookingDraft(wizardPackage: WizardPackage) {
  const key = `${DRAFT_KEY_PREFIX}${wizardPackage.slug}`;
  // The two hours are counted when the wizard opens (a refresh, a tab brought back): a visitor who pauses while it
  // is open loses nothing to the clock, and each change saves the draft again.
  const [openedAt] = useState(() => Date.now());
  const stored = useSyncExternalStore(
    subscribe,
    () => readStored(key),
    () => NOT_READ,
  );
  const draft = useMemo(
    () => (stored === NOT_READ ? null : readDraft(stored, wizardPackage, openedAt)),
    [stored, wizardPackage, openedAt],
  );

  // The form key is drawn with the first change and kept until the booking is made (BOOK-06).
  const update = useCallback(
    (change: Partial<BookingDraft>) => {
      const current = readDraft(readStored(key), wizardPackage, openedAt);
      const next = { ...current, ...change, savedAt: Date.now() };
      if (next.idempotencyKey === '') next.idempotencyKey = crypto.randomUUID();
      writeStored(key, JSON.stringify(next));
    },
    [key, wizardPackage, openedAt],
  );

  // docs/StyleGuide.md §5.14: cleared once the booking is made, or once its hold already exists (review of PR #27, L5).
  const clear = useCallback(() => {
    writeStored(key, null);
  }, [key]);

  return { draft, update, clear };
}
