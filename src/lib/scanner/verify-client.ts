import { VERIFY_TIMEOUT_MS } from '@/config/scanner';
import { verifyTicketResponseSchema } from '@/lib/validations/scanner';
import type { ManualCheckInRequest, VerifyOutcome, VerifyTicketRequest } from '@/types/scanner';

// The scanner's one way to the server: POST /api/tickets/verify (Task P4.4.02), the stable JSON contract of
// CLAUDE.md §7.4. Online only, with no queue and no cache (the service worker sends /api/* to the network alone);
// every way a request can end comes back as a VerifyOutcome, so the hook never sees an exception. Unit tests of the
// scan flow replace this function; the Playwright run answers the route itself until Task P4.4.02 builds it.

const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;
const HTTP_TOO_MANY = 429;
// The route answers 404 or 405 only while it does not exist yet (Task P4.4.02 comes after the DB lane's RPCs).
const HTTP_NOT_FOUND = 404;
const HTTP_METHOD_NOT_ALLOWED = 405;
const HTTP_NOT_IMPLEMENTED = 501;
const MISSING_ROUTE_STATUSES = new Set([
  HTTP_NOT_FOUND,
  HTTP_METHOD_NOT_ALLOWED,
  HTTP_NOT_IMPLEMENTED,
]);

export interface SendScanOptions {
  timeoutMs?: number;
  // navigator.onLine, injectable for tests.
  isOnline?: () => boolean;
}

function retryAfterOf(response: Response): number | null {
  const seconds = Number(response.headers.get('Retry-After'));
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
}

async function outcomeOf(response: Response): Promise<VerifyOutcome> {
  if (response.status === HTTP_UNAUTHORIZED || response.status === HTTP_FORBIDDEN) {
    return { kind: 'signed_out' };
  }
  if (response.status === HTTP_TOO_MANY) {
    return { kind: 'rate_limited', retryAfterSeconds: retryAfterOf(response) };
  }
  if (MISSING_ROUTE_STATUSES.has(response.status)) return { kind: 'unavailable' };
  if (!response.ok) return { kind: 'failed' };
  const parsed = verifyTicketResponseSchema.safeParse(await response.json().catch(() => null));
  return parsed.success ? { kind: 'answered', response: parsed.data } : { kind: 'failed' };
}

function isAbort(error: unknown): boolean {
  return (
    error instanceof DOMException && (error.name === 'AbortError' || error.name === 'TimeoutError')
  );
}

export async function sendScan(
  request: VerifyTicketRequest | ManualCheckInRequest,
  { timeoutMs = VERIFY_TIMEOUT_MS, isOnline = () => navigator.onLine }: SendScanOptions = {},
): Promise<VerifyOutcome> {
  if (!isOnline()) return { kind: 'offline' };
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  try {
    const response = await fetch('/api/tickets/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      credentials: 'same-origin',
      cache: 'no-store',
      signal: controller.signal,
    });
    return await outcomeOf(response);
  } catch (error) {
    if (isAbort(error)) return { kind: 'timeout' };
    // fetch rejects with a TypeError when the network is gone, also behind a captive portal that navigator.onLine
    // calls online.
    return { kind: 'offline' };
  } finally {
    clearTimeout(timer);
  }
}
