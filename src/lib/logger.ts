import 'server-only';

import { createHmac, randomUUID } from 'node:crypto';

import pino from 'pino';
import type { DestinationStream, Logger } from 'pino';

import { serverEnv } from '@/lib/env';

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
];

// The only event names a log line may carry: the security_events types of docs/PRD.md §8.4.9 the app logs
// itself, plus the two operational ones.
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
  'internal_error',
  'job_run',
] as const;

export type LogEvent = (typeof LOG_EVENTS)[number];
export type LogFields = Record<string, unknown>;

const EMAIL_HASH_LENGTH = 12;
const LINK_TOKEN_IN_URL = /(\/v\/|[?&]t=)[^/?&#\s]+/g;

export function createRootLogger(destination?: DestinationStream): Logger {
  const options = {
    redact: { paths: REDACTED_PATHS, censor: '[redacted]' },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: { level: (label: string) => ({ level: label }) },
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
  return createHmac('sha256', serverEnv.OTP_PEPPER)
    .update(normalised)
    .digest('hex')
    .slice(0, EMAIL_HASH_LENGTH);
}

export function redactLinkTokens(url: string): string {
  return url.replace(LINK_TOKEN_IN_URL, '$1[token]');
}
