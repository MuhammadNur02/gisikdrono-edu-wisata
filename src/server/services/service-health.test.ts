import { describe, expect, it, vi } from 'vitest';

import { svcJobHealth, svcPlaceholderSiteSettings } from '@/db/rpc-health';
import type { DatabaseClient } from '@/db/rpc-result';

import { checkServiceHealth, SERVER_FAULT_ERRORS } from './service-health';

vi.mock('@/db/rpc-health', () => ({ svcJobHealth: vi.fn(), svcPlaceholderSiteSettings: vi.fn() }));

// The table reads of the check: overdue messages (.lt on next_attempt_at), messages given up on recently (.gt on
// dead_at), and the maintenance switch.
const filters: [string, unknown][] = [];

function clientWith({
  overdue = 0,
  dead = 0,
  maintenance = false,
  qrKids = ['k1'],
}: {
  overdue?: number;
  dead?: number;
  maintenance?: boolean;
  qrKids?: string[];
}) {
  const counted = {
    in: (column: string, values: unknown) => {
      filters.push([column, values]);
      return counted;
    },
    is: () => counted,
    lt: () => Promise.resolve({ count: overdue, error: null }),
    gt: () => Promise.resolve({ count: dead, error: null }),
  };
  const setting = {
    in: () =>
      Promise.resolve({
        data: [
          { key: 'maintenance_mode', value: maintenance },
          { key: 'qr.signing_kids', value: qrKids },
        ],
        error: null,
      }),
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
  unknownQrKid: false,
};

const STAGING = { isProduction: false, activeQrKid: 'k1' };
const PRODUCTION = { isProduction: true, activeQrKid: 'k1' };

describe('checkServiceHealth', () => {
  it('is ok while every job keeps its heartbeat, nothing waits or dies and the site is open', async () => {
    vi.mocked(svcJobHealth).mockResolvedValue([{ job: 'process-notifications', isStalled: false }]);
    await expect(checkServiceHealth(clientWith({}), STAGING)).resolves.toEqual({
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
    const report = await checkServiceHealth(clientWith({ overdue: 3, maintenance: true }), STAGING);
    expect(report).toEqual({
      status: 'degraded',
      checks: { ...HEALTHY_CHECKS, stalledJobs: 1, overdueMessages: 3, maintenanceMode: true },
    });
    expect(JSON.stringify(report)).not.toContain('payments-poll');
  });

  // Independent review of PR #50, M3: a provider refusing every message is a fault the monitor must see.
  it('is degraded by a message given up on within the hour for a fault of the server', async () => {
    vi.mocked(svcJobHealth).mockResolvedValue([]);
    await expect(checkServiceHealth(clientWith({ dead: 1 }), STAGING)).resolves.toMatchObject({
      status: 'degraded',
      checks: { deadMessages: 1 },
    });
  });

  it('counts only the server’s faults among dead messages, never a recipient’s, which anyone could cause', async () => {
    filters.length = 0;
    vi.mocked(svcJobHealth).mockResolvedValue([]);
    await checkServiceHealth(clientWith({}), STAGING);
    const asked = filters.find(([column]) => column === 'last_error_code')?.[1];
    expect(asked).toEqual([...SERVER_FAULT_ERRORS]);
    expect(asked).toEqual(
      expect.arrayContaining(['meta_190', 'http_401', 'compose_failed', 'stuck_sending']),
    );
    for (const recipientFault of ['meta_131026', 'meta_131047', 'bad_params', 'http_422']) {
      expect(asked).not.toContain(recipientFault);
    }
  });

  // Delta review of PR #91, L-4: tickets would be refused with a key id off the list.
  it('is degraded when QR_SIGNING_ACTIVE_KID is not in qr.signing_kids', async () => {
    vi.mocked(svcJobHealth).mockResolvedValue([]);
    await expect(
      checkServiceHealth(clientWith({ qrKids: ['k0'] }), STAGING),
    ).resolves.toMatchObject({
      status: 'degraded',
      checks: { unknownQrKid: true },
    });
  });

  it('in production also by a setting still holding its placeholder', async () => {
    vi.mocked(svcJobHealth).mockResolvedValue([]);
    vi.mocked(svcPlaceholderSiteSettings).mockResolvedValue(['contact.email']);
    await expect(checkServiceHealth(clientWith({}), PRODUCTION)).resolves.toMatchObject({
      status: 'degraded',
      checks: { placeholderSettings: 1 },
    });
  });
});
