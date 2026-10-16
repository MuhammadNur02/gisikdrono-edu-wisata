import { beforeEach, describe, expect, it, vi } from 'vitest';

import { serverEnv } from '@/lib/env';
import { purgeMarkedFiles } from '@/server/services/document-service';

import { GET } from './route';

vi.mock('@/lib/supabase/admin', () => ({ createSupabaseAdminClient: () => ({}) }));
vi.mock('@/server/services/document-service', () => ({ purgeMarkedFiles: vi.fn() }));

const JOB_URL = 'http://localhost/api/jobs/purge-storage';

function callJob(authorization?: string) {
  const headers = authorization === undefined ? undefined : { authorization };
  return GET(new Request(JOB_URL, { headers }));
}

describe('GET /api/jobs/purge-storage', () => {
  beforeEach(() => {
    vi.mocked(purgeMarkedFiles).mockReset();
  });

  it.each([
    ['without a token', undefined],
    ['with the wrong token', 'Bearer not-the-cron-secret'],
  ])('answers 401 %s and deletes nothing', async (_case, authorization) => {
    const response = await callJob(authorization);
    expect(response.status).toBe(401);
    expect(purgeMarkedFiles).not.toHaveBeenCalled();
  });

  it('runs the purge for pg_cron and reports the counts', async () => {
    vi.mocked(purgeMarkedFiles).mockResolvedValue({ processed: 3, failed: 1 });

    const response = await callJob(`Bearer ${serverEnv.CRON_SECRET}`);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ processed: 3, failed: 1 });
    expect(purgeMarkedFiles).toHaveBeenCalledTimes(1);
  });

  it('answers 503 when the run fails, so the next scheduled call retries', async () => {
    vi.mocked(purgeMarkedFiles).mockRejectedValue(new Error('storage down'));

    const response = await callJob(`Bearer ${serverEnv.CRON_SECRET}`);

    expect(response.status).toBe(503);
  });
});
