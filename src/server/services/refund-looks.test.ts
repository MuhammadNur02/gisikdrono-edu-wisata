import { beforeEach, describe, expect, it, vi } from 'vitest';

import { svcRecordRefundLook } from '@/db/rpc-refunds';
import type { DatabaseClient } from '@/db/rpc-result';
import { AppError } from '@/lib/errors';
import { lookAtOrder } from '@/server/services/payment-poll';
import { refundOrderOf } from '@/server/services/payment-reads';
import { lookAtRefundRequest } from '@/server/services/refund-looks';

vi.mock('server-only', () => ({}));
vi.mock('@/db/rpc-refunds', () => ({ svcRecordRefundLook: vi.fn() }));
vi.mock('@/server/services/payment-poll', () => ({ lookAtOrder: vi.fn() }));
vi.mock('@/server/services/payment-reads', () => ({ refundOrderOf: vi.fn() }));

// Every read and RPC is a mock, so the client is only passed along.
const adminClient = {} as DatabaseClient;
const REQUEST_ID = '3f1c2a6e-5b7d-4e8f-9a0b-1c2d3e4f5a6b';
const ORDER_ID = 'GSK-7F3K9Q2M-01';

beforeEach(() => {
  vi.mocked(lookAtOrder).mockReset();
  vi.mocked(refundOrderOf).mockReset();
  vi.mocked(refundOrderOf).mockResolvedValue(ORDER_ID);
  vi.mocked(svcRecordRefundLook).mockReset();
  vi.mocked(svcRecordRefundLook).mockResolvedValue(true);
});

describe('lookAtRefundRequest (re-review of PR #69, M-3)', () => {
  it("asks Midtrans about the request's own order and stores that look with it", async () => {
    vi.mocked(lookAtOrder).mockResolvedValue({ eventId: 41, isBooked: false });

    await expect(lookAtRefundRequest(adminClient, REQUEST_ID)).resolves.toBe(41);
    expect(refundOrderOf).toHaveBeenCalledWith(adminClient, REQUEST_ID);
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

  it('passes on NOT_FOUND for a request that does not exist', async () => {
    vi.mocked(refundOrderOf).mockRejectedValue(new AppError('NOT_FOUND'));

    await expect(lookAtRefundRequest(adminClient, REQUEST_ID)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(lookAtOrder).not.toHaveBeenCalled();
  });
});
