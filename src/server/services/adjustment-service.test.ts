import { createClient } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Database } from '@/db/types';
import { adjustmentsCopy } from '@/lib/copy/finance-adjustments';
import { copy } from '@/lib/copy/id';
import { AppError, mapError } from '@/lib/errors';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { StaffContext } from '@/server/auth/guards';
import { apply } from '@/server/services/adjustment-service';
import { endOpenOrderBeforeTransfer, expireClosedOrders } from '@/server/services/payment-service';

vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: vi.fn() }));
vi.mock('@/lib/env', () => ({ serverEnv: { QR_SIGNING_ACTIVE_KID: 'k1' } }));
vi.mock('@/server/services/document-service', () => ({
  removeFinanceEvidence: vi.fn(),
  storeFinanceEvidence: vi.fn(),
}));
vi.mock('@/server/services/payment-service', () => ({
  endOpenOrderBeforeTransfer: vi.fn(),
  expireClosedOrders: vi.fn(),
}));

const ADJUSTMENT_ID = '0192f3a4-5b6c-7d8e-9f01-0000000000a1';
const BOOKING_ID = '0192f3a4-5b6c-7d8e-9f01-0000000000b1';
const SUPERADMIN: StaffContext = {
  userId: '0192f3a4-5b6c-7d8e-9f01-0000000000c1',
  isAal2: true,
  totpVerifiedAt: null,
  claimsVersion: 1,
  role: 'superadmin',
  rwId: null,
};
const APPLIED = {
  id: ADJUSTMENT_ID,
  status: 'applied',
  apply_not_before: null,
  transfer: { result: 'applied', order_id: 'GSK-7F3K9Q2M-02', close_orders: ['GSK-7F3K9Q2M-01'] },
};

function refusal(hint: string): Response {
  return Response.json({ code: 'P0001', message: 'refused', hint, details: null }, { status: 400 });
}

// The superadmin's session client: apply_adjustment answers each call with the next of `applyAnswers`, and the
// adjustment row names the booking of a transfer (or none, for another type).
function sessionAnswering(applyAnswers: (() => Response)[], transferBookingId: string | null) {
  const applyCalls: string[] = [];
  const client = createClient<Database>('http://supabase.test', 'test-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input) => {
        const url = new URL(input instanceof Request ? input.url : input.toString());
        if (url.pathname.endsWith('/rpc/apply_adjustment')) {
          const answer = applyAnswers[applyCalls.length] ?? (() => Response.json(APPLIED));
          applyCalls.push(url.pathname);
          return Promise.resolve(answer());
        }
        return Promise.resolve(
          Response.json(transferBookingId === null ? [] : [{ booking_id: transferBookingId }]),
        );
      },
    },
  });
  vi.mocked(createSupabaseServerClient).mockResolvedValue(client);
  return applyCalls;
}

// resetAllMocks, not clearAllMocks: a test's mockRejectedValue must not reach the next test.
beforeEach(() => {
  vi.resetAllMocks();
});

describe('apply (follow-up of PR #102, 2: the open order ends only once nothing else refuses)', () => {
  it('applies at once when the PIC has no order open, ending nothing first', async () => {
    const applyCalls = sessionAnswering([() => Response.json(APPLIED)], BOOKING_ID);
    await expect(apply(SUPERADMIN, ADJUSTMENT_ID)).resolves.toEqual({
      id: ADJUSTMENT_ID,
      status: 'applied',
      applyNotBefore: null,
    });
    expect(applyCalls).toHaveLength(1);
    expect(endOpenOrderBeforeTransfer).not.toHaveBeenCalled();
    expect(expireClosedOrders).toHaveBeenCalledWith(['GSK-7F3K9Q2M-01']);
  });

  it('ends the open order and applies again when the transfer is refused only for it', async () => {
    const applyCalls = sessionAnswering(
      [() => refusal('PAYMENT_OPEN'), () => Response.json(APPLIED)],
      BOOKING_ID,
    );
    await expect(apply(SUPERADMIN, ADJUSTMENT_ID)).resolves.toMatchObject({ status: 'applied' });
    expect(endOpenOrderBeforeTransfer).toHaveBeenCalledWith(BOOKING_ID, SUPERADMIN.userId);
    expect(applyCalls).toHaveLength(2);
  });

  // mapError answers the first two itself; the finance refusals become their sentences here.
  it.each([
    ['STATE_INVALID', { hint: 'STATE_INVALID' }],
    ['PRICE_MISMATCH', { hint: 'PRICE_MISMATCH' }],
    ['QR_KEY_UNKNOWN', { userMessage: adjustmentsCopy.errors.QR_KEY_UNKNOWN }],
    ['APPLY_TOO_EARLY', { userMessage: adjustmentsCopy.errors.APPLY_TOO_EARLY }],
  ])('leaves the order open when apply_adjustment refuses with %s', async (hint, refused) => {
    const applyCalls = sessionAnswering([() => refusal(hint)], BOOKING_ID);
    await expect(apply(SUPERADMIN, ADJUSTMENT_ID)).rejects.toMatchObject(refused);
    expect(endOpenOrderBeforeTransfer).not.toHaveBeenCalled();
    expect(applyCalls).toHaveLength(1);
  });

  it('ends nothing for PAYMENT_OPEN of an adjustment that is not a transfer', async () => {
    sessionAnswering([() => refusal('PAYMENT_OPEN')], null);
    await expect(apply(SUPERADMIN, ADJUSTMENT_ID)).rejects.toMatchObject({
      code: 'STATE_INVALID',
      userMessage: adjustmentsCopy.errors.PAYMENT_OPEN,
    });
    expect(endOpenOrderBeforeTransfer).not.toHaveBeenCalled();
  });

  it('applies nothing when Midtrans would not end the order', async () => {
    const applyCalls = sessionAnswering([() => refusal('PAYMENT_OPEN')], BOOKING_ID);
    vi.mocked(endOpenOrderBeforeTransfer).mockRejectedValue(new AppError('PAYMENT'));
    await expect(apply(SUPERADMIN, ADJUSTMENT_ID)).rejects.toMatchObject({ code: 'PAYMENT' });
    expect(applyCalls).toHaveLength(1);
    expect(expireClosedOrders).not.toHaveBeenCalled();
  });

  it('answers the second refusal readably when the transfer is refused again after the order ended', async () => {
    const applyCalls = sessionAnswering(
      [() => refusal('PAYMENT_OPEN'), () => refusal('STATE_INVALID')],
      BOOKING_ID,
    );
    const refused: unknown = await apply(SUPERADMIN, ADJUSTMENT_ID).catch(
      (error: unknown) => error,
    );
    expect(endOpenOrderBeforeTransfer).toHaveBeenCalledTimes(1);
    expect(applyCalls).toHaveLength(2);
    await expect(mapError(refused)).resolves.toEqual({
      ok: false,
      error: { code: 'STATE_INVALID', message: copy.errors.STATE_INVALID },
    });
  });
});
