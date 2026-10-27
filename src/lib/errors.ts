import 'server-only';

import { randomUUID } from 'node:crypto';

import { headers } from 'next/headers';
import { ZodError, z } from 'zod';

import { copy } from '@/lib/copy/id';
import { createLogger, requestIdFrom } from '@/lib/logger';
import type { ActionErrorCode, ActionFailure, ActionResult } from '@/types/action-result';
import type { CleanedUp } from '@/types/cms';

const HTTP_STATUS_BY_CODE = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  VALIDATION: 400,
  NOT_FOUND: 404,
  CONFLICT: 409,
  QUOTA_EXCEEDED: 409,
  STATE_INVALID: 409,
  PRICE_MISMATCH: 409,
  RATE_LIMITED: 429,
  PAYMENT: 402,
  INTERNAL: 500,
} satisfies Record<ActionErrorCode, number>;

const HTTP_OK = 200;
const UNIQUE_VIOLATION = '23505';
const RAISED_EXCEPTION = 'P0001';
const INSUFFICIENT_PRIVILEGE = '42501';

// internal.* functions raise P0001 with one of these hints; each one is a business outcome, not a bug.
// CONTACT_UNVERIFIED is the booking's own (review of PR #27, M1): booking-service.ts answers it by asking for a new
// code, and anywhere else it reads as the state it was before it had a hint of its own.
const CODE_BY_POSTGRES_HINT: Record<string, ActionErrorCode> = {
  QUOTA_UNAVAILABLE: 'QUOTA_EXCEEDED',
  STATE_INVALID: 'STATE_INVALID',
  PRICE_MISMATCH: 'PRICE_MISMATCH',
  RATE_LIMITED: 'RATE_LIMITED',
  CONTACT_UNVERIFIED: 'STATE_INVALID',
};

export class AppError extends Error {
  readonly status: number;

  constructor(
    readonly code: ActionErrorCode,
    readonly userMessage: string = copy.errors[code],
  ) {
    super(code);
    this.name = 'AppError';
    this.status = HTTP_STATUS_BY_CODE[code];
  }
}

export function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

export function fail(
  code: ActionErrorCode,
  fieldErrors?: Record<string, string[]>,
  message: string = copy.errors[code],
): ActionFailure {
  const error = fieldErrors ? { code, message, fieldErrors } : { code, message };
  return { ok: false, error };
}

// A route handler answers with the same ActionResult a Server Action returns, under the matching HTTP status,
// and no cache keeps it (CLAUDE.md §5.4).
export function resultResponse<T>(result: ActionResult<T>): Response {
  const status = result.ok ? HTTP_OK : HTTP_STATUS_BY_CODE[result.error.code];
  return Response.json(result, { status, headers: { 'Cache-Control': 'private, no-store' } });
}

type PostgresError = { code: string; hint?: string | null };

function isPostgresError(error: unknown): error is PostgresError {
  return (
    typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string'
  );
}

// The SQLSTATE or PostgREST code of a failed read, for a log line that names why without the message.
export function postgresCodeOf(error: unknown): string | undefined {
  return isPostgresError(error) ? error.code : undefined;
}

// The hint of a P0001 an internal.* function raised, for a service that answers one refusal itself.
export function raisedHintOf(error: unknown): string | undefined {
  if (!isPostgresError(error) || error.code !== RAISED_EXCEPTION) return undefined;
  return error.hint ?? undefined;
}

// The hint of a 42501 a staff RPC raised (review of PR #76, F-76-7): why the caller may not, when it is not plainly
// their role (FRESH_TOTP, OUTSIDE_WINDOW).
export function privilegeHintOf(error: unknown): string | undefined {
  if (!isPostgresError(error) || error.code !== INSUFFICIENT_PRIVILEGE) return undefined;
  return error.hint ?? undefined;
}

function codeForPostgresError(error: PostgresError): ActionErrorCode | undefined {
  if (error.code === UNIQUE_VIOLATION) return 'CONFLICT';
  if (error.code === RAISED_EXCEPTION && error.hint) return CODE_BY_POSTGRES_HINT[error.hint];
  return undefined;
}

function fieldErrorsOf(error: ZodError): Record<string, string[]> {
  const { fieldErrors } = z.flattenError(error);
  return Object.fromEntries(
    Object.entries(fieldErrors).filter((entry): entry is [string, string[]] =>
      Array.isArray(entry[1]),
    ),
  );
}

async function currentRequestId(): Promise<string> {
  try {
    return requestIdFrom(await headers());
  } catch {
    // headers() only works inside a request; a cron job or script gets its own id instead.
    return randomUUID();
  }
}

// Turns anything thrown below an action into an ActionResult the UI can show (CLAUDE.md §5.3).
// Raw messages, SQL and stack traces never reach the client.
export async function mapError(error: unknown): Promise<ActionFailure> {
  if (error instanceof AppError) return fail(error.code, undefined, error.userMessage);
  if (error instanceof ZodError) return fail('VALIDATION', fieldErrorsOf(error));

  const businessCode = isPostgresError(error) ? codeForPostgresError(error) : undefined;
  if (businessCode) return fail(businessCode);

  // Only the error's type and Postgres code are logged: messages can quote the values that failed.
  createLogger(await currentRequestId()).error('internal_error', {
    errorName: error instanceof Error ? error.name : typeof error,
    postgresCode: isPostgresError(error) ? error.code : undefined,
  });
  return fail('INTERNAL');
}

// A write that went through but left a file it had to take out of public-media (docs/Security.md R34): the officer
// hears it, since a photo whose consent was withdrawn must really go.
export function okUnlessFilesLeft<T>(result: CleanedUp<T>): ActionResult<T> {
  return result.filesRemoved
    ? ok(result.value)
    : fail('INTERNAL', undefined, copy.cms.common.filesLeft);
}
