import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { svcRecordJobRun } from '@/db/rpc';
import { svcRunAnomalyScan } from '@/db/rpc-security';
import { serverEnv } from '@/lib/env';

import { POST } from './route';

vi.mock('@/lib/supabase/admin', () => ({ createSupabaseAdminClient: () => ({}) }));
vi.mock('@/db/rpc', () => ({ svcRecordJobRun: vi.fn() }));
vi.mock('@/db/rpc-security', () => ({ svcRunAnomalyScan: vi.fn() }));

const JOB_URL = 'http://localhost/api/jobs/anomaly-scan';

function callJob(authorization?: string) {
  const headers = authorization === undefined ? undefined : { authorization };
  return POST(new Request(JOB_URL, { method: 'POST', headers }));
}

describe('POST /api/jobs/anomaly-scan', () => {
  beforeEach(() => {
    vi.mocked(svcRunAnomalyScan).mockReset().mockResolvedValue({ raised: 2, chainsChecked: false });
    vi.mocked(svcRecordJobRun).mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    ['without a token', undefined],
    ['with the wrong token', 'Bearer not-the-cron-secret'],
  ])('answers 401 %s and scans nothing', async (_case, authorization) => {
    const response = await callJob(authorization);
    expect(response.status).toBe(401);
    expect(svcRunAnomalyScan).not.toHaveBeenCalled();
  });

  it('runs the scan for pg_cron, reports what it raised and records the success', async () => {
    vi.useFakeTimers({ now: new Date('2026-10-25T03:20:00Z'), toFake: ['Date'] });

    const response = await callJob(`Bearer ${serverEnv.CRON_SECRET}`);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ raised: 2, chainsChecked: false });
    expect(svcRunAnomalyScan).toHaveBeenCalledWith({}, { checkChains: false });
    expect(svcRecordJobRun).toHaveBeenCalledWith({}, { job: 'anomaly-scan', succeeded: true });
  });

  it('walks the chains in the first run of the hour', async () => {
    vi.useFakeTimers({ now: new Date('2026-10-25T03:02:00Z'), toFake: ['Date'] });

    await callJob(`Bearer ${serverEnv.CRON_SECRET}`);

    expect(svcRunAnomalyScan).toHaveBeenCalledWith({}, { checkChains: true });
  });

  it('answers 503 when the run fails and records the failure', async () => {
    vi.mocked(svcRunAnomalyScan).mockRejectedValue(new Error('down'));

    const response = await callJob(`Bearer ${serverEnv.CRON_SECRET}`);

    expect(response.status).toBe(503);
    expect(svcRecordJobRun).toHaveBeenCalledWith(
      {},
      { job: 'anomaly-scan', succeeded: false, errorCode: 'run_failed' },
    );
  });

  it('still answers 503 when the failure cannot be recorded either', async () => {
    vi.mocked(svcRunAnomalyScan).mockRejectedValue(new Error('down'));
    vi.mocked(svcRecordJobRun).mockRejectedValue(new Error('down'));

    const response = await callJob(`Bearer ${serverEnv.CRON_SECRET}`);

    expect(response.status).toBe(503);
  });
});
