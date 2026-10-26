import { beforeEach, describe, expect, it, vi } from 'vitest';

import { svcRecordJobRun } from '@/db/rpc';
import { pollPayments } from '@/server/services/payment-poll';

import { POST } from './route';
import { sandboxEnv } from '../../../../../tests/fixtures/env';

vi.mock('@/lib/supabase/admin', () => ({ createSupabaseAdminClient: () => ({}) }));
vi.mock('@/db/rpc', () => ({ svcRecordJobRun: vi.fn() }));
vi.mock('@/server/services/payment-poll', () => ({ pollPayments: vi.fn() }));

const REPORT = {
  asked: 2,
  applied: 1,
  failed: 0,
  suspended: 0,
  reminded: 1,
  refundsRetried: 0,
  weatherRefunded: 0,
  weatherHeld: 0,
};

function post(authorization?: string): Promise<Response> {
  const headers = authorization ? { authorization } : undefined;
  return POST(
    new Request('http://127.0.0.1:3000/api/jobs/payments-poll', { method: 'POST', headers }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(pollPayments).mockResolvedValue(REPORT);
  vi.mocked(svcRecordJobRun).mockResolvedValue(undefined);
});

describe('POST /api/jobs/payments-poll', () => {
  it('answers 401 without the cron secret, polling nothing', async () => {
    expect((await post()).status).toBe(401);
    expect((await post('Bearer wrong')).status).toBe(401);
    expect(pollPayments).not.toHaveBeenCalled();
  });

  it('polls and records a successful run', async () => {
    const response = await post(`Bearer ${sandboxEnv.CRON_SECRET}`);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject(REPORT);
    expect(svcRecordJobRun).toHaveBeenCalledWith(expect.anything(), {
      job: 'payments-poll',
      succeeded: true,
    });
  });

  it('records a run with orders Midtrans did not answer as failed, so the job alerts', async () => {
    vi.mocked(pollPayments).mockResolvedValue({ ...REPORT, failed: 1 });
    await post(`Bearer ${sandboxEnv.CRON_SECRET}`);
    expect(svcRecordJobRun).toHaveBeenCalledWith(expect.anything(), {
      job: 'payments-poll',
      succeeded: false,
      errorCode: 'orders_not_checked',
    });
  });

  it('answers 503 when the run itself fails', async () => {
    vi.mocked(pollPayments).mockRejectedValue(new Error('database down'));
    expect((await post(`Bearer ${sandboxEnv.CRON_SECRET}`)).status).toBe(503);
    expect(svcRecordJobRun).toHaveBeenCalledWith(expect.anything(), {
      job: 'payments-poll',
      succeeded: false,
      errorCode: 'run_failed',
    });
  });
});
