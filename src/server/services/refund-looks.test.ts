import { beforeEach, describe, expect, it, vi } from 'vitest';

import { svcRecordRefundLook } from '@/db/rpc-refunds';
import type { DatabaseClient } from '@/db/rpc-result';
import { lookAtOrder } from '@/server/services/payment-poll';
import { lookAtRefundRequest } from '@/server/services/refund-looks';

vi.mock('server-only', () => ({}));
vi.mock('@/db/rpc-refunds', () => ({ svcRecordRefundLook: vi.fn() }));
vi.mock('@/server/services/payment-poll', () => ({ lookAtOrder: vi.fn() }));

const REQUEST_ID = '3f1c2a6e-5b7d-4e8f-9a0b-1c2d3e4f5a6b';
const ORDER_ID = 'GSK-7F3K9Q2M-01';

// refund_requests answers the payment id, payments the order id.
function clientWith(rows: { request: unknown; payment: unknown }): DatabaseClient {
  const query = (table: string) => {
    const row = table === 'refund_requests' ? rows.request : rows.payment;
    const chain = {
      select: () => chain,
      eq: () => chain,
      maybeSingle: () => Promise.resolve({ data: row, error: null }),
      single: () => Promise.resolve({ data: row, error: null }),
    };
    return chain;
  };
  return { from: query } as unknown as DatabaseClient;
}

const adminClient = clientWith({ request: { payment_id: 'p1' }, payment: { order_id: ORDER_ID } });

beforeEach(() => {
  vi.mocked(lookAtOrder).mockReset();
  vi.mocked(svcRecordRefundLook).mockReset();
  vi.mocked(svcRecordRefundLook).mockResolvedValue(true);
});

describe('lookAtRefundRequest (re-review of PR #69, M-3)', () => {
  it("asks Midtrans about the request's own order and stores that look with it", async () => {
    vi.mocked(lookAtOrder).mockResolvedValue({ eventId: 41, isBooked: false });

    await expect(lookAtRefundRequest(adminClient, REQUEST_ID)).resolves.toBe(41);
    expect(lookAtOrder).toHaveBeenCalledWith(adminClient, ORDER_ID);
    expect(svcRecordRefundLook).toHaveBeenCalledWith(adminClient, {
      requestId: REQUEST_ID,
      eventId: 41,
    });
  });

  it('leaves nothing to mark when the answer just booked the refund', async () => {
    vi.mocked(lookAtOrder).mockResolvedValue({ eventId: 41, isBooked: true });

    await expect(lookAtRefundRequest(adminClient, REQUEST_ID)).rejects.toMatchObject({
      code: 'STATE_INVALID',
    });
    expect(svcRecordRefundLook).not.toHaveBeenCalled();
  });

  it('never marks on an older answer when Midtrans does not answer', async () => {
    vi.mocked(lookAtOrder).mockRejectedValue(new Error('timeout'));

    await expect(lookAtRefundRequest(adminClient, REQUEST_ID)).rejects.toThrow('timeout');
    expect(svcRecordRefundLook).not.toHaveBeenCalled();
  });

  it('answers NOT_FOUND for a request that does not exist', async () => {
    const empty = clientWith({ request: null, payment: null });

    await expect(lookAtRefundRequest(empty, REQUEST_ID)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});
