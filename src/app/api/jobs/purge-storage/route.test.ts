import { beforeEach, describe, expect, it, vi } from 'vitest';

import { svcRecordJobRun } from '@/db/rpc';
import { serverEnv } from '@/lib/env';
import { purgeMarkedFiles } from '@/server/services/storage-purge';

import { POST } from './route';

vi.mock('@/lib/supabase/admin', () => ({ createSupabaseAdminClient: () => ({}) }));
vi.mock('@/server/services/storage-purge', () => ({ purgeMarkedFiles: vi.fn() }));
vi.mock('@/db/rpc', () => ({ svcRecordJobRun: vi.fn() }));

const JOB_URL = 'http://localhost/api/jobs/purge-storage';

function callJob(authorization?: string) {
  const headers = authorization === undefined ? undefined : { authorization };
  return POST(new Request(JOB_URL, { method: 'POST', headers }));
}

describe('POST /api/jobs/purge-storage', () => {
  beforeEach(() => {
    vi.mocked(purgeMarkedFiles).mockReset();
    vi.mocked(svcRecordJobRun).mockReset().mockResolvedValue(undefined);
  });

  it.each([
    ['without a token', undefined],
    ['with the wrong token', 'Bearer not-the-cron-secret'],
  ])('answers 401 %s and deletes nothing', async (_case, authorization) => {
    const response = await callJob(authorization);
    expect(response.status).toBe(401);
    expect(purgeMarkedFiles).not.toHaveBeenCalled();
    expect(svcRecordJobRun).not.toHaveBeenCalled();
  });

  it('runs the purge for pg_cron, reports the counts and records the success', async () => {
    vi.mocked(purgeMarkedFiles).mockResolvedValue({ processed: 3, failed: 0 });

    const response = await callJob(`Bearer ${serverEnv.CRON_SECRET}`);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ processed: 3, failed: 0 });
    expect(purgeMarkedFiles).toHaveBeenCalledTimes(1);
    expect(svcRecordJobRun).toHaveBeenCalledWith({}, { job: 'purge-storage', succeeded: true });
  });

  it('records a run that left files behind as failed, so the alert fires while they wait for the next try', async () => {
    vi.mocked(purgeMarkedFiles).mockResolvedValue({ processed: 3, failed: 1 });

    const response = await callJob(`Bearer ${serverEnv.CRON_SECRET}`);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ processed: 3, failed: 1 });
    expect(svcRecordJobRun).toHaveBeenCalledWith(
      {},
      { job: 'purge-storage', succeeded: false, errorCode: 'files_not_deleted' },
    );
  });

  it('answers 503 when the run fails and records the failure, so the next call retries', async () => {
    vi.mocked(purgeMarkedFiles).mockRejectedValue(new Error('storage down'));

    const response = await callJob(`Bearer ${serverEnv.CRON_SECRET}`);

    expect(response.status).toBe(503);
    expect(svcRecordJobRun).toHaveBeenCalledWith(
      {},
      { job: 'purge-storage', succeeded: false, errorCode: 'run_failed' },
    );
  });

  it('still answers 503 when even the failure cannot be recorded', async () => {
    vi.mocked(purgeMarkedFiles).mockRejectedValue(new Error('database down'));
    vi.mocked(svcRecordJobRun).mockRejectedValue(new Error('database down'));

    const response = await callJob(`Bearer ${serverEnv.CRON_SECRET}`);

    expect(response.status).toBe(503);
  });
});
