import { describe, expect, it, vi } from 'vitest';

import { svcJobHealth, svcPlaceholderSiteSettings } from '@/db/rpc-health';
import type { DatabaseClient } from '@/db/rpc-result';

import { checkServiceHealth } from './service-health';

vi.mock('@/db/rpc-health', () => ({ svcJobHealth: vi.fn(), svcPlaceholderSiteSettings: vi.fn() }));

// The table reads of the check: overdue messages (.lt on next_attempt_at), messages given up on recently (.gt on
// dead_at), and the maintenance switch.
function clientWith({
  overdue = 0,
  dead = 0,
  maintenance = false,
}: {
  overdue?: number;
  dead?: number;
  maintenance?: boolean;
}) {
  const counted = {
    in: () => counted,
    is: () => counted,
    lt: () => Promise.resolve({ count: overdue, error: null }),
    gt: () => Promise.resolve({ count: dead, error: null }),
  };
  const setting = {
    eq: () => setting,
    maybeSingle: () => Promise.resolve({ data: { value: maintenance }, error: null }),
  };
  return {
    from: (table: string) => ({ select: () => (table === 'notifications' ? counted : setting) }),
  } as unknown as DatabaseClient;
}

const HEALTHY_CHECKS = {
  stalledJobs: 0,
  overdueMessages: 0,
  deadMessages: 0,
  maintenanceMode: false,
  placeholderSettings: 0,
};

describe('checkServiceHealth', () => {
  it('is ok while every job keeps its heartbeat, nothing waits or dies and the site is open', async () => {
    vi.mocked(svcJobHealth).mockResolvedValue([{ job: 'process-notifications', isStalled: false }]);
    await expect(checkServiceHealth(clientWith({}), false)).resolves.toEqual({
      status: 'ok',
      checks: HEALTHY_CHECKS,
    });
    expect(svcPlaceholderSiteSettings).not.toHaveBeenCalled();
  });

  it('is degraded by a stalled job, an overdue or failing message, or maintenance, counting and never naming', async () => {
    vi.mocked(svcJobHealth).mockResolvedValue([
      { job: 'payments-poll', isStalled: true },
      { job: 'expire_stale_bookings', isStalled: false },
    ]);
    const report = await checkServiceHealth(clientWith({ overdue: 3, maintenance: true }), false);
    expect(report).toEqual({
      status: 'degraded',
      checks: { ...HEALTHY_CHECKS, stalledJobs: 1, overdueMessages: 3, maintenanceMode: true },
    });
    expect(JSON.stringify(report)).not.toContain('payments-poll');
  });

  // Independent review of PR #50, M3: a provider refusing every message is a fault the monitor must see.
  it('is degraded by a message given up on within the hour', async () => {
    vi.mocked(svcJobHealth).mockResolvedValue([]);
    await expect(checkServiceHealth(clientWith({ dead: 1 }), false)).resolves.toMatchObject({
      status: 'degraded',
      checks: { deadMessages: 1 },
    });
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
