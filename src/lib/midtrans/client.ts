import 'server-only';

import { serverEnv } from '@/lib/env';
import { midtransApiBaseUrl, midtransSnapBaseUrl } from '@/lib/midtrans/environment';
import {
  midtransStatusSchema,
  snapTransactionSchema,
  type MidtransStatus,
} from '@/lib/midtrans/schemas';
import type { SnapPayload } from '@/lib/midtrans/snap';

// Task P3.7.01 (PAY-08, APP-14): the thin typed fetch wrapper around Midtrans, no SDK. Basic auth with the server key,
// a 10 s budget (5 s inside the webhook, which must answer within maxDuration), and one retry on a network error only:
// a timeout or any answer is final, so a request that did reach Midtrans is never sent twice by a slow line.
// MIDTRANS_LOCAL_STUB_URL, accepted only on a local or CI server (src/lib/env.ts), answers both hosts there.

const DEFAULT_TIMEOUT_MS = 10_000;
export const WEBHOOK_STATUS_TIMEOUT_MS = 5_000;
const MAX_TRIES = 2;
const UNKNOWN_ORDER_CODE = '404';
const EXPIRED_CODE = '407';

export class MidtransError extends Error {
  constructor(
    readonly reason: 'unreachable' | 'refused' | 'malformed',
    readonly httpStatus?: number,
  ) {
    super(`Midtrans ${reason}${httpStatus === undefined ? '' : ` (${String(httpStatus)})`}`);
    this.name = 'MidtransError';
  }
}

function hosts(): { api: string; snap: string } {
  const stub = serverEnv.MIDTRANS_LOCAL_STUB_URL;
  if (stub !== undefined) return { api: stub, snap: stub };
  return {
    api: midtransApiBaseUrl(serverEnv.MIDTRANS_IS_PRODUCTION),
    snap: midtransSnapBaseUrl(serverEnv.MIDTRANS_IS_PRODUCTION),
  };
}

function authorization(): string {
  return `Basic ${Buffer.from(`${serverEnv.MIDTRANS_SERVER_KEY}:`).toString('base64')}`;
}

function isTimeout(error: unknown): boolean {
  return error instanceof Error && error.name === 'TimeoutError';
}

async function send(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await fetch(url, {
        ...init,
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: authorization(),
        },
        cache: 'no-store',
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      if (isTimeout(error) || attempt >= MAX_TRIES) throw new MidtransError('unreachable');
    }
  }
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new MidtransError('malformed', response.status);
  }
}

// The hosted page of an attempt. Its address must be Snap's own, so a strange answer never becomes a redirect.
export async function createSnapTransaction(
  payload: SnapPayload,
): Promise<{ token: string; redirectUrl: string }> {
  const { snap } = hosts();
  const response = await send(
    `${snap}/snap/v1/transactions`,
    { method: 'POST', body: JSON.stringify(payload) },
    DEFAULT_TIMEOUT_MS,
  );
  if (!response.ok) throw new MidtransError('refused', response.status);
  const parsed = snapTransactionSchema.safeParse(await readJson(response));
  if (!parsed.success || !parsed.data.redirect_url.startsWith(`${snap}/`)) {
    throw new MidtransError('malformed', response.status);
  }
  return { token: parsed.data.token, redirectUrl: parsed.data.redirect_url };
}

// What Midtrans says of an order now. An order it never charged answers its own 404, which is an answer, not an
// outage; a refused key or a server error is not, and reaches the caller as an error (the webhook answers 503).
export async function getTransactionStatus(
  orderId: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<MidtransStatus> {
  const { api } = hosts();
  const response = await send(
    `${api}/v2/${encodeURIComponent(orderId)}/status`,
    { method: 'GET' },
    timeoutMs,
  );
  const parsed = midtransStatusSchema.safeParse(await readJson(response));
  if (!parsed.success) throw new MidtransError('malformed', response.status);
  if (!response.ok && parsed.data.status_code !== UNKNOWN_ORDER_CODE) {
    throw new MidtransError('refused', response.status);
  }
  return parsed.data;
}

export type ExpireOutcome = 'expired' | 'not_charged' | 'refused';

// docs/Security.md §3.2 (WH-16): an attempt is replaced only once Midtrans has ended its order. A Snap page that
// nobody paid from has no transaction yet, so Midtrans answers 404 and there is nothing left to end.
export async function expireTransaction(orderId: string): Promise<ExpireOutcome> {
  const { api } = hosts();
  const response = await send(
    `${api}/v2/${encodeURIComponent(orderId)}/expire`,
    { method: 'POST' },
    DEFAULT_TIMEOUT_MS,
  );
  const parsed = midtransStatusSchema.safeParse(await readJson(response));
  if (!parsed.success) return 'refused';
  if (parsed.data.status_code === UNKNOWN_ORDER_CODE) return 'not_charged';
  const isExpired =
    parsed.data.status_code === EXPIRED_CODE || parsed.data.transaction_status === 'expire';
  return isExpired ? 'expired' : 'refused';
}
