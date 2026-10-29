import { describe, expect, it, vi } from 'vitest';

import { readServiceHealth } from '@/server/services/notification-service';

import { GET } from './route';

vi.mock('next/headers', () => ({
  headers: () => Promise.resolve(new Headers({ 'x-forwarded-for': '203.0.113.7' })),
}));
vi.mock('@/server/services/notification-service', () => ({ readServiceHealth: vi.fn() }));

const CHECKS = {
  stalledJobs: 0,
  overdueMessages: 0,
  deadMessages: 0,
  maintenanceMode: false,
  placeholderSettings: 0,
  unknownQrKid: false,
  prelaunchSwitchOn: false,
};

describe('GET /api/health', () => {
  it('answers 200 while healthy with its status only, never cached', async () => {
    vi.mocked(readServiceHealth).mockResolvedValue({ status: 'ok', checks: CHECKS });
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    await expect(response.json()).resolves.toEqual({ status: 'ok' });
    expect(readServiceHealth).toHaveBeenCalledWith('203.0.113.7');
  });

  it('answers 503 when degraded, keeping the counts out of the body', async () => {
    vi.mocked(readServiceHealth).mockResolvedValueOnce({
      status: 'degraded',
      checks: { ...CHECKS, deadMessages: 2, maintenanceMode: true },
    });
    const response = await GET();
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ status: 'degraded' });
  });

  it('answers 429 to an IP that asks too often, and 503 when the database cannot be read', async () => {
    vi.mocked(readServiceHealth).mockResolvedValueOnce(null);
    expect((await GET()).status).toBe(429);
    vi.mocked(readServiceHealth).mockRejectedValueOnce(new Error('database down'));
    const down = await GET();
    expect(down.status).toBe(503);
    await expect(down.json()).resolves.toEqual({ status: 'down' });
  });
});
