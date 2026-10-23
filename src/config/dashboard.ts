import type { RwId } from '@/config/rw';

// docs/StyleGuide.md §6.1: the superadmin's RwSwitcher keeps its choice in this cookie. An RW officer has none; their
// scope is fixed by app_rw_id, and every query re-checks it on the server whatever the cookie says.
export const RW_SCOPE_COOKIE = 'rw_scope';
export const RW_SCOPE_ALL = 'all';
export type RwScope = typeof RW_SCOPE_ALL | RwId;
export const RW_SCOPE_MAX_AGE_SECONDS = 2_592_000;

// The shadcn Sidebar remembers whether it is expanded or the icon rail (docs/StyleGuide.md §6.1). The browser writes
// it; the layout reads it so the next page opens as the last one was left.
export const SIDEBAR_STATE_COOKIE = 'sidebar_state';

export const PROFILE_PATH = '/dashboard/profile';
export const SCANNER_PATH = '/dashboard/scanner';
export const SESSIONS_PATH = '/dashboard/sessions';
export const BOOKINGS_PATH = '/dashboard/bookings';

// profiles.full_name as staff type it on /dashboard/profile.
export const FULL_NAME_MAX_LENGTH = 100;

// docs/Security.md AUTH-11: the dashboard locks its screen after this long without a pointer or a key, and the
// staff member unlocks it with a code from their authenticator.
export const IDLE_LOCK_MS = 600_000;
// How often the idle clock is checked, so a lock lands within a few seconds of the deadline.
export const IDLE_CHECK_MS = 5_000;

// docs/StyleGuide.md §6.4: the page sizes a DataTable offers, and how much of a search box reaches the database.
export const LIST_PAGE_SIZES = [25, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 25;
export const SEARCH_MAX_LENGTH = 80;
// Search keystrokes reach the URL and the server this long after the last one.
export const SEARCH_DEBOUNCE_MS = 300;
