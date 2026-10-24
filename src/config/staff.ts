// /dashboard/users and the staff RPCs it calls (Task P4.8.02, P4.8.03, docs/Security.md §5.1, §5.3, §5.6).

export const USERS_PATH = '/dashboard/users';
export const AUDIT_LOGS_PATH = '/dashboard/audit-logs';
export const SECURITY_ALERTS_PATH = '/dashboard/security-alerts';

// docs/Security.md §5.3: inviting staff and changing a role or a status need a TOTP check from the last five minutes,
// which the staff RPCs and the restrictive fresh_totp() policies of staff_invites check again in the database.
export const STAFF_STEP_UP_MAX_AGE_SECONDS = 300;

// docs/Security.md §5.1: 20 random Crockford base32 characters, shown once and handed over in person or by voice.
export const INVITE_CODE_LENGTH = 20;
// Shown in groups of five so it can be read out without losing the place.
export const INVITE_CODE_GROUP_LENGTH = 5;

// staff_invites_expiry_72h: an invite lives at most 72 hours after created_at, which the database sets with its own
// clock. The server's clock may run a little ahead, so its expiry stays a minute short of the limit.
const INVITE_LIFETIME_SECONDS = 72 * 60 * 60;
const CLOCK_SKEW_MARGIN_SECONDS = 60;
export const INVITE_EXPIRY_SECONDS = INVITE_LIFETIME_SECONDS - CLOCK_SKEW_MARGIN_SECONDS;

// docs/Security.md §5.6 step 2: a deactivated account is banned in Supabase Auth for 100 years; 'none' lifts it.
export const STAFF_BAN_DURATION = '876600h';
export const STAFF_UNBAN_DURATION = 'none';

// set_staff_status takes a reason of 3 to 300 characters for the audit log.
export const STATUS_REASON_MIN_LENGTH = 3;
export const STATUS_REASON_MAX_LENGTH = 300;

// The kelurahan has a handful of staff; the list reads every profile at once and filters on the server.
export const STAFF_LIST_MAX_ROWS = 500;
// One page of Supabase Auth users when the list looks up factors and the last sign-in (auth.admin.listUsers).
export const AUTH_USERS_PAGE_SIZE = 1000;

// /dashboard/audit-logs and /dashboard/security-alerts read one page at a time, newest first.
export const SECURITY_LIST_PAGE_SIZE = 50;
