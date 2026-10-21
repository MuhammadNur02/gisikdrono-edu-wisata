// Visitors have no accounts (CLAUDE.md §7.5, docs/Security.md §4.1 and §6.7): a booking code and a proven contact
// stand in for one. These are the fixed rules of that proof; the caps on codes live with the functions that count
// them (supabase/migrations/20261021100100_guest_otp_functions.sql).

export const GUEST_LINK_SCOPES = ['pay', 'manage', 'view', 'review', 'certificate'] as const;
export type GuestLinkScope = (typeof GUEST_LINK_SCOPES)[number];

const HOUR_SECONDS = 3600;
const DAY_SECONDS = 24 * HOUR_SECONDS;

export const GUEST_LINK_TTL_SECONDS = {
  pay: 24 * HOUR_SECONDS,
  manage: 72 * HOUR_SECONDS,
  view: 72 * HOUR_SECONDS,
  review: 14 * DAY_SECONDS,
  certificate: 90 * DAY_SECONDS,
} as const satisfies Record<GuestLinkScope, number>;

// What each link opens besides its own scope: the manage link (the verified WhatsApp number's) does everything the
// pay and view links do, and a pay link shows the status of what it pays for.
export const GUEST_LINK_GRANTS = {
  pay: ['pay', 'view'],
  manage: ['manage', 'pay', 'view'],
  view: ['view'],
  review: ['review'],
  certificate: ['certificate'],
} as const satisfies Record<GuestLinkScope, readonly GuestLinkScope[]>;

// A link is /reservasi/<booking_code>?t=<token>; src/middleware.ts moves the token into this cookie at once, so it
// never stays in the address bar or the history (docs/Security.md §6.7).
export const GUEST_LINK_PARAM = 't';
export const GUEST_LINK_COOKIE_PREFIX = 'bk_';
export const GUEST_BOOKING_PATH = '/reservasi';
export const GUEST_LOOKUP_PATH = '/reservasi/cari';

// Proof that this browser entered the code sent to the PIC's number (Task P3.2.03): the booking actions take the
// phone from this cookie only, never from the form.
export const PHONE_PROOF_COOKIE = 'gsk_phone';
export const PHONE_PROOF_TTL_SECONDS = 30 * 60;

export const OTP_CODE_LENGTH = 6;
// The wait between two codes for one number in one browser; internal.issue_phone_otp enforces it, the form counts it
// down.
export const OTP_RESEND_COOLDOWN_SECONDS = 60;

// A pending code belongs to the browser that asked for it (review of PR #20, M1): this cookie names the browser by a
// signed random id, so another browser can neither replace the code nor use up its daily codes. A day is as long as
// the daily caps look back.
export const OTP_BROWSER_COOKIE = 'gsk_otp_browser';
export const OTP_BROWSER_TTL_SECONDS = DAY_SECONDS;

// Review of PR #20, L4: a code request is answered the same, no sooner than this, whether the code went out, the
// browser is waiting out its minute or the number has used its codes, so neither words nor timing say that someone
// else has been asking for that number.
export const OTP_REQUEST_MIN_RESPONSE_MS = 1200;

// docs/Security.md GUEST-01: /reservasi/cari answers no sooner than this, whatever it found, so how long it takes
// says nothing about whether the code exists.
export const LOOKUP_MIN_RESPONSE_MS = 1200;

// The address the local Mailpit of `supabase start` listens on (supabase/config.toml [inbucket]). Only the local
// notification provider talks to it.
export const LOCAL_MAILPIT_URL = 'http://127.0.0.1:54324';
