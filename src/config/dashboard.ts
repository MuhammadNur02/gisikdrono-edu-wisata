import type { RwId } from '@/config/rw';

// docs/StyleGuide.md §6.1: the superadmin's RwSwitcher keeps its choice in this cookie. An RW officer has none; their
// scope is fixed by app_rw_id, and every query re-checks it on the server whatever the cookie says.
export const RW_SCOPE_COOKIE = 'rw_scope';
export const RW_SCOPE_ALL = 'all';
export type RwScope = typeof RW_SCOPE_ALL | RwId;
export const RW_SCOPE_MAX_AGE_SECONDS = 2_592_000;

export const PROFILE_PATH = '/dashboard/profile';

// profiles.full_name as staff type it on /dashboard/profile.
export const FULL_NAME_MAX_LENGTH = 100;
