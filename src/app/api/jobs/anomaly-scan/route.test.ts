import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { svcRecordJobRun } from '@/db/rpc';
import { svcRunAnomalyScan, svcRunChainCheck } from '@/db/rpc-security';
import { serverEnv } from '@/lib/env';

import { POST } from './route';

vi.mock('@/lib/supabase/admin', () => ({ createSupabaseAdminClient: () => ({}) }));
vi.mock('@/db/rpc', () => ({ svcRecordJobRun: vi.fn() }));
vi.mock('@/db/rpc-security', () => ({ svcRunAnomalyScan: vi.fn(), svcRunChainCheck: vi.fn() }));

const JOB_URL = 'http://localhost/api/jobs/anomaly-scan';
const FIRST_RUN_OF_THE_HOUR = new Date('2026-10-25T03:02:00Z');
const LATER_RUN = new Date('2026-10-25T03:20:00Z');

function callJob(authorization?: string) {
  const headers = authorization === undefined ? undefined : { authorization };
  return POST(new Request(JOB_URL, { method: 'POST', headers }));
}

function callJobAt(now: Date) {
  vi.useFakeTimers({ now, toFake: ['Date'] });
  return callJob(`Bearer ${serverEnv.CRON_SECRET}`);
}

describe('POST /api/jobs/anomaly-scan', () => {
  beforeEach(() => {
    vi.mocked(svcRunAnomalyScan).mockReset().mockResolvedValue({ raised: 2 });
    vi.mocked(svcRunChainCheck).mockReset().mockResolvedValue({ raised: 0 });
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
    expect(svcRunChainCheck).not.toHaveBeenCalled();
  });

  it('runs the scan for pg_cron, reports what it raised and records the success', async () => {
    const response = await callJobAt(LATER_RUN);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      raised: 2,
      chainsChecked: false,
      chainsRaised: null,
    });
    expect(svcRunChainCheck).not.toHaveBeenCalled();
    expect(svcRecordJobRun).toHaveBeenCalledWith({}, { job: 'anomaly-scan', succeeded: true });
  });

  it('walks the chains in the first run of the hour', async () => {
    const response = await callJobAt(FIRST_RUN_OF_THE_HOUR);

    expect(await response.json()).toMatchObject({
      raised: 2,
      chainsChecked: true,
      chainsRaised: 0,
    });
    expect(svcRunChainCheck).toHaveBeenCalledWith({});
  });

  it('still walks the chains when the scan fails, and answers 503', async () => {
    vi.mocked(svcRunAnomalyScan).mockRejectedValue(new Error('down'));

    const response = await callJobAt(FIRST_RUN_OF_THE_HOUR);

    expect(response.status).toBe(503);
    expect(svcRunChainCheck).toHaveBeenCalled();
    expect(await response.json()).toMatchObject({ raised: null, chainsRaised: 0 });
    expect(svcRecordJobRun).toHaveBeenCalledWith(
      {},
      { job: 'anomaly-scan', succeeded: false, errorCode: 'run_failed' },
    );
  });

  it('answers 503 when the chain check fails, after the scan ran', async () => {
    vi.mocked(svcRunChainCheck).mockRejectedValue(new Error('down'));

    const response = await callJobAt(FIRST_RUN_OF_THE_HOUR);

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ raised: 2, chainsRaised: null });
  });

  it('still answers 503 when the failure cannot be recorded either', async () => {
    vi.mocked(svcRunAnomalyScan).mockRejectedValue(new Error('down'));
    vi.mocked(svcRecordJobRun).mockRejectedValue(new Error('down'));

    const response = await callJobAt(LATER_RUN);

    expect(response.status).toBe(503);
  });
});
