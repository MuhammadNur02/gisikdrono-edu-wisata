import { after } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DatabaseClient } from '@/db/rpc-result';
import { svcFlagCancellationForSuperadmin, svcRefundPreview } from '@/db/rpc-terms';
import { statusHubDataOf } from '@/server/services/booking-hub-data';
import { manageRightsOf, statusHubOf } from '@/server/services/booking-hub-reads';
import { weatherStateOf } from '@/server/services/booking-weather-reads';
import type { StatusHubView, WeatherState } from '@/types/booking-hub';

vi.mock('server-only', () => ({}));
vi.mock('next/server', () => ({ after: vi.fn() }));
vi.mock('@/db/rpc-terms', () => ({
  svcFlagCancellationForSuperadmin: vi.fn(),
  svcRefundPreview: vi.fn(),
}));
vi.mock('@/server/services/booking-hub-reads', () => ({
  manageRightsOf: vi.fn(),
  statusHubOf: vi.fn(),
}));
vi.mock('@/server/services/booking-weather-reads', () => ({ weatherStateOf: vi.fn() }));

const adminClient = {} as DatabaseClient;
const BOOKING_ID = '00000000-0000-4000-8000-000000000a01';
const view = { booking: { status: 'paid', needsReview: false } } as StatusHubView;
const WEATHER: WeatherState = { openUntil: '2026-11-01T03:00:00.000Z', reason: null, legs: [] };
const mintPayLink = vi.fn(() => Promise.resolve('token'));

function hubData() {
  return statusHubDataOf(adminClient, { bookingId: BOOKING_ID, scope: 'manage' }, mintPayLink);
}

beforeEach(() => {
  vi.mocked(after).mockReset();
  vi.mocked(after).mockImplementation((task) => {
    if (typeof task === 'function') void task();
  });
  vi.mocked(svcFlagCancellationForSuperadmin).mockReset();
  vi.mocked(svcFlagCancellationForSuperadmin).mockResolvedValue(undefined);
  vi.mocked(svcRefundPreview).mockReset();
  vi.mocked(statusHubOf).mockResolvedValue(view);
  vi.mocked(manageRightsOf).mockReturnValue({
    canCancelPaid: true,
    hasWeather: false,
    canPassPayLink: false,
  });
});

describe('statusHubDataOf', () => {
  // Re-review of PR #69, M-1: the hub shows no cancel button for such a booking, so the alert is raised from here.
  it('flags a cancellation the shares cannot fund for the superadmin, after the answer', async () => {
    vi.mocked(svcRefundPreview).mockRejectedValue({
      code: 'P0001',
      hint: 'CANCEL_NEEDS_SUPERADMIN',
    });

    const data = await hubData();

    expect(data.cancellation).toBeNull();
    expect(data.cancellationNeedsSuperadmin).toBe(true);
    expect(after).toHaveBeenCalledTimes(1);
    expect(svcFlagCancellationForSuperadmin).toHaveBeenCalledWith(adminClient, BOOKING_ID);
  });

  it('raises nothing for a refund the terms simply do not give', async () => {
    vi.mocked(svcRefundPreview).mockRejectedValue({ code: 'P0001', hint: 'STATE_INVALID' });

    const data = await hubData();

    expect(data.cancellationNeedsSuperadmin).toBe(false);
    expect(after).not.toHaveBeenCalled();
    expect(svcFlagCancellationForSuperadmin).not.toHaveBeenCalled();
  });

  it('keeps the page when the alert cannot be raised', async () => {
    vi.mocked(svcRefundPreview).mockRejectedValue({
      code: 'P0001',
      hint: 'CANCEL_NEEDS_SUPERADMIN',
    });
    vi.mocked(svcFlagCancellationForSuperadmin).mockRejectedValue(new Error('down'));

    await expect(hubData()).resolves.toMatchObject({ cancellationNeedsSuperadmin: true });
  });

  // Second delta review of PR #69, L-a: a weather refund only the superadmin can make is said so, and flagged.
  it('says so of a weather refund the shares cannot fund, and flags it', async () => {
    vi.mocked(manageRightsOf).mockReturnValue({
      canCancelPaid: false,
      hasWeather: true,
      canPassPayLink: false,
    });
    vi.mocked(weatherStateOf).mockResolvedValue(WEATHER);
    vi.mocked(svcRefundPreview).mockRejectedValue({
      code: 'P0001',
      hint: 'CANCEL_NEEDS_SUPERADMIN',
    });

    const data = await hubData();

    expect(data.weatherRefund).toBeNull();
    expect(data.weatherRefundNeedsSuperadmin).toBe(true);
    expect(svcFlagCancellationForSuperadmin).toHaveBeenCalledWith(adminClient, BOOKING_ID);
  });
});
