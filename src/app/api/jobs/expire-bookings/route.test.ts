import { beforeEach, describe, expect, it, vi } from 'vitest';

import { svcExpireStaleBookings, svcRecordJobRun } from '@/db/rpc';
import { serverEnv } from '@/lib/env';

import { GET } from './route';

vi.mock('@/lib/supabase/admin', () => ({ createSupabaseAdminClient: () => ({}) }));
vi.mock('@/db/rpc', () => ({ svcExpireStaleBookings: vi.fn(), svcRecordJobRun: vi.fn() }));

const JOB_URL = 'http://localhost/api/jobs/expire-bookings';

function callJob(authorization?: string) {
  const headers = authorization === undefined ? undefined : { authorization };
  return GET(new Request(JOB_URL, { headers }));
}

describe('GET /api/jobs/expire-bookings', () => {
  beforeEach(() => {
    vi.mocked(svcExpireStaleBookings).mockReset();
  });

  it.each([
    ['without a token', undefined],
    ['with the wrong token', 'Bearer not-the-cron-secret'],
  ])('answers 401 %s and expires nothing', async (_case, authorization) => {
    const response = await callJob(authorization);
    expect(response.status).toBe(401);
    expect(svcExpireStaleBookings).not.toHaveBeenCalled();
  });

  it('expires the lapsed holds and reports how many', async () => {
    vi.mocked(svcExpireStaleBookings).mockResolvedValue(3);

    const response = await callJob(`Bearer ${serverEnv.CRON_SECRET}`);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ processed: 3 });
    expect(svcExpireStaleBookings).toHaveBeenCalledTimes(1);
  });

  it('records no heartbeat, which belongs to the pg_cron job it backs up', async () => {
    vi.mocked(svcExpireStaleBookings).mockResolvedValue(0);

    await callJob(`Bearer ${serverEnv.CRON_SECRET}`);

    expect(svcRecordJobRun).not.toHaveBeenCalled();
  });

  it('answers 503 when the run fails, so the caller tries again', async () => {
    vi.mocked(svcExpireStaleBookings).mockRejectedValue(new Error('database down'));

    const response = await callJob(`Bearer ${serverEnv.CRON_SECRET}`);

    expect(response.status).toBe(503);
  });
});
