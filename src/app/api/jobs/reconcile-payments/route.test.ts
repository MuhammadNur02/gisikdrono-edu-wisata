import { beforeEach, describe, expect, it, vi } from 'vitest';

import { isPrelaunch } from '@/config/launch';
import { svcRecordJobRun } from '@/db/rpc';
import { reconcilePayments } from '@/server/services/payment-reconciliation';

import { POST } from './route';
import { sandboxEnv } from '../../../../../tests/fixtures/env';

vi.mock('@/lib/supabase/admin', () => ({ createSupabaseAdminClient: () => ({}) }));
vi.mock('@/db/rpc', () => ({ svcRecordJobRun: vi.fn() }));
vi.mock('@/server/services/payment-reconciliation', () => ({ reconcilePayments: vi.fn() }));
vi.mock('@/config/launch', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  isPrelaunch: vi.fn(() => false),
}));

const REPORT = {
  reconciliationRunId: '00000000-0000-4000-8000-00000000a001',
  paymentsChecked: 4,
  ordersUnanswered: 0,
  ordersWaiting: 3,
  issuesFound: 1,
  issuesAlreadyOpen: 2,
  ledgerChainOk: true,
  auditChainOk: true,
};

function post(authorization?: string): Promise<Response> {
  const headers = authorization ? { authorization } : undefined;
  return POST(
    new Request('http://127.0.0.1:3000/api/jobs/reconcile-payments', { method: 'POST', headers }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(isPrelaunch).mockReturnValue(false);
  vi.mocked(reconcilePayments).mockResolvedValue(REPORT);
  vi.mocked(svcRecordJobRun).mockResolvedValue(undefined);
});

describe('POST /api/jobs/reconcile-payments', () => {
  it('answers 401 without the cron secret, reconciling nothing', async () => {
    expect((await post()).status).toBe(401);
    expect((await post('Bearer wrong')).status).toBe(401);
    expect(reconcilePayments).not.toHaveBeenCalled();
    expect(svcRecordJobRun).not.toHaveBeenCalled();
  });

  it('records a successful run in the heartbeat, orders still waiting their turn included', async () => {
    const response = await post(`Bearer ${sandboxEnv.CRON_SECRET}`);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject(REPORT);
    expect(svcRecordJobRun).toHaveBeenCalledWith(expect.anything(), {
      job: 'reconcile-payments',
      succeeded: true,
    });
  });

  it('records a run with an unanswered order as failed and answers 503', async () => {
    vi.mocked(reconcilePayments).mockResolvedValue({ ...REPORT, ordersUnanswered: 2 });
    expect((await post(`Bearer ${sandboxEnv.CRON_SECRET}`)).status).toBe(503);
    expect(svcRecordJobRun).toHaveBeenCalledWith(expect.anything(), {
      job: 'reconcile-payments',
      succeeded: false,
      errorCode: 'orders_not_checked',
    });
  });

  it('records a run that had no time left for the chains as failed', async () => {
    vi.mocked(reconcilePayments).mockResolvedValue({
      ...REPORT,
      ledgerChainOk: null,
      auditChainOk: null,
    });
    expect((await post(`Bearer ${sandboxEnv.CRON_SECRET}`)).status).toBe(503);
    expect(svcRecordJobRun).toHaveBeenCalledWith(expect.anything(), {
      job: 'reconcile-payments',
      succeeded: false,
      errorCode: 'chains_not_checked',
    });
  });

  it('answers 503 and records a failed run when the run itself fails', async () => {
    vi.mocked(reconcilePayments).mockRejectedValue(new Error('database down'));
    const response = await post(`Bearer ${sandboxEnv.CRON_SECRET}`);
    expect(response.status).toBe(503);
    expect(svcRecordJobRun).toHaveBeenCalledWith(expect.anything(), {
      job: 'reconcile-payments',
      succeeded: false,
      errorCode: 'run_failed',
    });
  });

  it('still answers 503 when the failed run cannot be recorded either', async () => {
    vi.mocked(reconcilePayments).mockRejectedValue(new Error('database down'));
    vi.mocked(svcRecordJobRun).mockRejectedValue(new Error('database down'));
    expect((await post(`Bearer ${sandboxEnv.CRON_SECRET}`)).status).toBe(503);
  });
});

// docs/Security.md §8.9: no Midtrans before launch, so the run is skipped, behind the same Bearer check, and its
// heartbeat still moves so /api/health stays 200.
describe('POST /api/jobs/reconcile-payments in a pre-launch build', () => {
  beforeEach(() => {
    vi.mocked(isPrelaunch).mockReturnValue(true);
  });

  it('still answers 401 without the cron secret, recording nothing', async () => {
    expect((await post()).status).toBe(401);
    expect(svcRecordJobRun).not.toHaveBeenCalled();
  });

  it('skips the run with 200 and records it as a success, asking Midtrans nothing', async () => {
    const response = await post(`Bearer ${sandboxEnv.CRON_SECRET}`);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ skipped: 'prelaunch' });
    expect(reconcilePayments).not.toHaveBeenCalled();
    expect(svcRecordJobRun).toHaveBeenCalledWith(expect.anything(), {
      job: 'reconcile-payments',
      succeeded: true,
    });
  });

  it('answers 503 when even the heartbeat cannot be written', async () => {
    vi.mocked(svcRecordJobRun).mockRejectedValue(new Error('database down'));
    expect((await post(`Bearer ${sandboxEnv.CRON_SECRET}`)).status).toBe(503);
    expect(reconcilePayments).not.toHaveBeenCalled();
  });
});
