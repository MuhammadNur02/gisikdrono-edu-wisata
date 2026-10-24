import { describe, expect, it, vi } from 'vitest';

import { readServiceHealth } from '@/server/services/notification-service';

import { GET } from './route';

vi.mock('@/server/services/notification-service', () => ({ readServiceHealth: vi.fn() }));

const CHECKS = {
  stalledJobs: 0,
  overdueMessages: 0,
  maintenanceMode: false,
  placeholderSettings: 0,
};

describe('GET /api/health', () => {
  it('answers 200 while healthy, never cached', async () => {
    vi.mocked(readServiceHealth).mockResolvedValue({ status: 'ok', checks: CHECKS });
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    await expect(response.json()).resolves.toEqual({ status: 'ok', checks: CHECKS });
  });

  it('answers 503 when degraded, and when the database cannot be read at all', async () => {
    vi.mocked(readServiceHealth).mockResolvedValueOnce({
      status: 'degraded',
      checks: { ...CHECKS, stalledJobs: 1 },
    });
    expect((await GET()).status).toBe(503);
    vi.mocked(readServiceHealth).mockRejectedValueOnce(new Error('database down'));
    const down = await GET();
    expect(down.status).toBe(503);
    await expect(down.json()).resolves.toEqual({ status: 'down' });
  });
});
