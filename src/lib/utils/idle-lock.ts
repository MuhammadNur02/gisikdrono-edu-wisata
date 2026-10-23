// The one place the dashboard's idle lock (docs/Security.md AUTH-11) is written and read in the browser: the lock
// overlay sets it, the Ctrl+K and Ctrl+B handlers ask it, and a reload finds it again in sessionStorage so the lock
// cannot be escaped by refreshing (review of PR #31, item 2).

export const DASHBOARD_SHELL_ID = 'dashboard-shell';
const LOCKED_ATTRIBUTE = 'data-locked';
const LOCKED_STORAGE_KEY = 'gsk-idle-locked';
const LOCKED_VALUE = 'true';

export function isDashboardLocked(): boolean {
  if (typeof document === 'undefined') return false;
  return document.documentElement.getAttribute(LOCKED_ATTRIBUTE) === LOCKED_VALUE;
}

// Whether the last page of this tab was locked when it was left or reloaded.
export function readPersistedLock(): boolean {
  try {
    return window.sessionStorage.getItem(LOCKED_STORAGE_KEY) === LOCKED_VALUE;
  } catch {
    return false;
  }
}

// Marks the document, makes the shell inert so nothing behind the overlay takes focus or clicks, and remembers the
// state for a reload.
export function setDashboardLocked(locked: boolean): void {
  const root = document.documentElement;
  if (locked) root.setAttribute(LOCKED_ATTRIBUTE, LOCKED_VALUE);
  else root.removeAttribute(LOCKED_ATTRIBUTE);
  document.getElementById(DASHBOARD_SHELL_ID)?.toggleAttribute('inert', locked);
  try {
    if (locked) window.sessionStorage.setItem(LOCKED_STORAGE_KEY, LOCKED_VALUE);
    else window.sessionStorage.removeItem(LOCKED_STORAGE_KEY);
  } catch {
    // Private windows may refuse storage; the lock still holds for this page.
  }
}
