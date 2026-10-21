import { beforeEach, describe, expect, it, vi } from 'vitest';

import { svcRecordJobRun } from '@/db/rpc';
import { serverEnv } from '@/lib/env';
import { processNotifications } from '@/server/services/notification-service';

import { POST } from './route';

vi.mock('@/lib/supabase/admin', () => ({ createSupabaseAdminClient: () => ({}) }));
vi.mock('@/server/services/notification-service', () => ({ processNotifications: vi.fn() }));
vi.mock('@/db/rpc', () => ({ svcRecordJobRun: vi.fn() }));

const JOB_URL = 'http://localhost/api/jobs/process-notifications';

function callJob(authorization?: string) {
  const headers = authorization === undefined ? undefined : { authorization };
  return POST(new Request(JOB_URL, { method: 'POST', headers, body: '{}' }));
}

describe('POST /api/jobs/process-notifications', () => {
  beforeEach(() => {
    vi.mocked(processNotifications).mockReset();
    vi.mocked(svcRecordJobRun).mockReset().mockResolvedValue(undefined);
  });

  it.each([
    ['without a token', undefined],
    ['with the wrong token', 'Bearer not-the-cron-secret'],
  ])('answers 401 %s and sends nothing', async (_case, authorization) => {
    expect((await callJob(authorization)).status).toBe(401);
    expect(processNotifications).not.toHaveBeenCalled();
  });

  it('works one batch of the outbox for pg_cron and records the run', async () => {
    vi.mocked(processNotifications).mockResolvedValue({ processed: 4, failed: 1 });
    const response = await callJob(`Bearer ${serverEnv.CRON_SECRET}`);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ processed: 4, failed: 1 });
    expect(svcRecordJobRun).toHaveBeenCalledWith(
      {},
      { job: 'process-notifications', succeeded: true },
    );
  });

  it('answers 503 when the outbox cannot be worked, so pg_cron tries again, and records the failure', async () => {
    vi.mocked(processNotifications).mockRejectedValue(new Error('database down'));
    expect((await callJob(`Bearer ${serverEnv.CRON_SECRET}`)).status).toBe(503);
    expect(svcRecordJobRun).toHaveBeenCalledWith(
      {},
      { job: 'process-notifications', succeeded: false, errorCode: 'run_failed' },
    );
    vi.mocked(svcRecordJobRun).mockRejectedValueOnce(new Error('still down'));
    expect((await callJob(`Bearer ${serverEnv.CRON_SECRET}`)).status).toBe(503);
  });
});
