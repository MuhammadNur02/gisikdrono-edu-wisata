import 'server-only';

import { randomUUID } from 'node:crypto';

import pino from 'pino';
import type { DestinationStream, Logger } from 'pino';

import { pepperedHash } from '@/lib/pepper';

// docs/Security.md §7.7: these never reach a log line, whatever object they arrive in.
export const REDACTED_PATHS = [
  'booking.pic_phone',
  'booking.pic_email',
  'booking.pic_name',
  'customer_details.*',
  'participants[*].full_name',
  'req.headers.authorization',
  'req.headers.cookie',
  'token',
  '*.token',
  'signature_key',
  '*.signature_key',
  'snap_token',
  '*.snap_token',
  // A Snap page's address opens the payment itself (review of PR #39, L4).
  'redirect_url',
  '*.redirect_url',
  'snap_redirect_url',
  '*.snap_redirect_url',
  'redirectUrl',
  '*.redirectUrl',
  // An outbox row's params hold the OTP code until it is sent (Task P3.2.01), and names besides.
  'params',
  '*.params',
  'code_hash',
  '*.code_hash',
  // The invite code a new officer types on /onboarding (Task P4.8.01).
  'inviteCode',
  '*.inviteCode',
  // A vendor's or an RW treasury's bank account number (review of PR #79, L-10), in each spelling it travels in.
  'accountNumber',
  '*.accountNumber',
  'account_number',
  '*.account_number',
  'p_account_number',
  '*.p_account_number',
];

// The only event names a log line may carry: the security_events types of docs/PRD.md §8.4.9 the app logs
// itself, plus the operational ones.
export const LOG_EVENTS = [
  'webhook_signature_invalid',
  'webhook_amount_mismatch',
  'status_disagreement',
  'login_failed',
  'login_locked',
  'mfa_failed',
  'mfa_enrolled',
  'scanner_invalid_signature',
  'scanner_lockout',
  'rate_limited',
  'turnstile_failed',
  'upload_rejected',
  'upload_sanitized',
  'role_changed',
  'staff_disabled',
  'key_rotated',
  'export_downloaded',
  'pii_revealed',
  'manual_checkin',
  'manual_backfill',
  'undo_check_in',
  'cron_failed',
  'notification_dead',
  'price_changed',
  'session_changed_with_bookings',
  'quota_pressure',
  'mfa_reset',
  'mfa_locked',
  'session_revoke_failed',
  'invite_claimed',
  'internal_error',
  'job_run',
  'payment_webhook',
  'provider_webhook',
  'health_degraded',
] as const;

export type LogEvent = (typeof LOG_EVENTS)[number];
export type LogFields = Record<string, unknown>;

const EMAIL_HASH_LENGTH = 12;
const LINK_TOKEN_IN_URL = /(\/v\/|[?&]t=)[^/?&#\s]+/g;
// Log fields are small objects; anything nested deeper than this is left as it is rather than walked.
const MAX_SCRUB_DEPTH = 6;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

// docs/Security.md §7.7: a guest link (?t=) or ticket URL (/v/) may be logged, its token never, in whatever field
// it arrives. Only strings in plain objects and arrays are rewritten; the app logs ids and names, never Error
// objects (src/lib/errors.ts), so nothing else needs walking.
function scrubLinkTokens(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') return redactLinkTokens(value);
  if (depth >= MAX_SCRUB_DEPTH) return value;
  if (Array.isArray(value)) return value.map((item: unknown) => scrubLinkTokens(item, depth + 1));
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, scrubLinkTokens(item, depth + 1)]),
  );
}

export function createRootLogger(destination?: DestinationStream): Logger {
  const options = {
    redact: { paths: REDACTED_PATHS, censor: '[redacted]' },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level: (label: string) => ({ level: label }),
      log: (fields: Record<string, unknown>) =>
        Object.fromEntries(
          Object.entries(fields).map(([key, value]) => [key, scrubLinkTokens(value)]),
        ),
    },
  };
  return destination ? pino(options, destination) : pino(options);
}

const stdoutLogger = createRootLogger();

export function requestIdFrom(headers: Headers): string {
  return headers.get('x-vercel-id') ?? randomUUID();
}

export function createLogger(requestId: string, root: Logger = stdoutLogger) {
  const child = root.child({ requestId });
  return {
    info: (event: LogEvent, fields: LogFields = {}) => {
      child.info({ ...fields, event });
    },
    warn: (event: LogEvent, fields: LogFields = {}) => {
      child.warn({ ...fields, event });
    },
    error: (event: LogEvent, fields: LogFields = {}) => {
      child.error({ ...fields, event });
    },
  };
}

// Lets two log lines about the same person be matched without the address itself being stored.
// Keyed with OTP_PEPPER because a plain sha256 of an email can be reversed by hashing guesses
// (docs/Security.md §7.4, §7.7).
export function hashEmailForLog(email: string): string {
  const normalised = email.trim().toLowerCase();
  return pepperedHash('gsk-log-email-v1', normalised).slice(0, EMAIL_HASH_LENGTH);
}

export function redactLinkTokens(url: string): string {
  return url.replace(LINK_TOKEN_IN_URL, '$1[token]');
}
