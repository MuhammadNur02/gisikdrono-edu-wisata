import { describe, expect, it, vi } from 'vitest';

import { svcJobHealth, svcPlaceholderSiteSettings } from '@/db/rpc-health';
import type { DatabaseClient } from '@/db/rpc-result';

import { checkServiceHealth } from './service-health';

vi.mock('@/db/rpc-health', () => ({ svcJobHealth: vi.fn(), svcPlaceholderSiteSettings: vi.fn() }));

// The two table reads of the check: overdue outbox messages (a count) and the maintenance switch.
function clientWith({
  overdue = 0,
  maintenance = false,
}: {
  overdue?: number;
  maintenance?: boolean;
}) {
  const counted = { eq: () => counted, lt: () => Promise.resolve({ count: overdue, error: null }) };
  const setting = {
    eq: () => setting,
    maybeSingle: () => Promise.resolve({ data: { value: maintenance }, error: null }),
  };
  return {
    from: (table: string) => ({ select: () => (table === 'notifications' ? counted : setting) }),
  } as unknown as DatabaseClient;
}

describe('checkServiceHealth', () => {
  it('is ok while every job keeps its heartbeat, nothing waits and the site is open', async () => {
    vi.mocked(svcJobHealth).mockResolvedValue([{ job: 'process-notifications', isStalled: false }]);
    await expect(checkServiceHealth(clientWith({}), false)).resolves.toEqual({
      status: 'ok',
      checks: {
        stalledJobs: 0,
        overdueMessages: 0,
        maintenanceMode: false,
        placeholderSettings: 0,
      },
    });
    expect(svcPlaceholderSiteSettings).not.toHaveBeenCalled();
  });

  it('is degraded by a stalled job, an overdue message or maintenance, counting and never naming', async () => {
    vi.mocked(svcJobHealth).mockResolvedValue([
      { job: 'payments-poll', isStalled: true },
      { job: 'expire_stale_bookings', isStalled: false },
    ]);
    const report = await checkServiceHealth(clientWith({ overdue: 3, maintenance: true }), false);
    expect(report).toEqual({
      status: 'degraded',
      checks: { stalledJobs: 1, overdueMessages: 3, maintenanceMode: true, placeholderSettings: 0 },
    });
    expect(JSON.stringify(report)).not.toContain('payments-poll');
  });

  it('in production also by a setting still holding its placeholder', async () => {
    vi.mocked(svcJobHealth).mockResolvedValue([]);
    vi.mocked(svcPlaceholderSiteSettings).mockResolvedValue(['contact.email']);
    await expect(checkServiceHealth(clientWith({}), true)).resolves.toMatchObject({
      status: 'degraded',
      checks: { placeholderSettings: 1 },
    });
  });
});
