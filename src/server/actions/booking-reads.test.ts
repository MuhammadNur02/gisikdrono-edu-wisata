import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withinGuestLimits } from '@/server/services/booking-service';
import { listBookableSessions, loadBookingWizard } from '@/server/services/booking-wizard-service';

import { listBookableSessionsAction, previewQuoteAction } from './booking';
import { comboWizard as WIZARD } from '../../../tests/fixtures/booking-wizard';

// The wizard's two reads (Task P3.5.01, P3.5.03): behind a per-IP limit, from the catalogue and v_session_availability,
// and writing nothing. createBookingAction is tested in booking.test.ts.

vi.mock('next/headers', () => ({
  headers: () => Promise.resolve(new Headers({ 'x-real-ip': '203.0.113.7' })),
}));
vi.mock('next/cache', () => ({ revalidateTag: vi.fn(), unstable_cache: (read: unknown) => read }));
vi.mock('next/server', () => ({ after: vi.fn() }));
vi.mock('@/lib/turnstile', () => ({ verifyTurnstile: vi.fn() }));
vi.mock('@/server/auth/guest-cookies', () => ({
  readPhoneProofCookie: vi.fn(),
  rememberGuestLink: vi.fn(),
  forgetPhoneProof: vi.fn(),
}));
vi.mock('@/server/services/notification-service', () => ({ kickNotificationWorker: vi.fn() }));
vi.mock('@/server/services/booking-service', () => ({
  createHold: vi.fn(),
  createQuotedBooking: vi.fn(),
  withinGuestLimits: vi.fn(),
}));
// The real quote, priced from the fixture's rows; only the reads are faked.
vi.mock('@/server/services/booking-wizard-service', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  loadBookingWizard: vi.fn(),
  listBookableSessions: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(loadBookingWizard).mockResolvedValue(WIZARD);
  vi.mocked(withinGuestLimits).mockResolvedValue(true);
});

describe('previewQuoteAction', () => {
  const PREVIEW = { packageSlug: 'paket-kombinasi', pax: 30, addons: [] };

  it('prices the choice on the server and hands out the summary hash', async () => {
    const answer = await previewQuoteAction(PREVIEW);
    if (!answer.ok || answer.data.kind !== 'quote') throw new Error('the quote should price');
    expect(answer.data.quote.total).toBe(30 * 50000);
    expect(answer.data.quoteHash).toMatch(/^[0-9a-f]{64}$/);
    expect(vi.mocked(withinGuestLimits).mock.calls[0]?.[0]).toEqual([
      { name: 'quote_preview:ip', subject: '203.0.113.7' },
    ]);
  });

  it('answers what the catalogue does not allow', async () => {
    await expect(previewQuoteAction({ ...PREVIEW, pax: 201 })).resolves.toEqual({
      ok: true,
      data: { kind: 'problem', problem: 'pax_out_of_range' },
    });
  });

  it('takes no price from the browser', async () => {
    const answer = await previewQuoteAction({ ...PREVIEW, total: 1 });
    expect(answer).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });
    expect(loadBookingWizard).not.toHaveBeenCalled();
  });

  it('refuses over its limit before reading anything', async () => {
    vi.mocked(withinGuestLimits).mockResolvedValue(false);
    await expect(previewQuoteAction(PREVIEW)).resolves.toMatchObject({
      ok: false,
      error: { code: 'RATE_LIMITED' },
    });
    expect(loadBookingWizard).not.toHaveBeenCalled();
  });
});

describe('listBookableSessionsAction', () => {
  it('reads the sessions each RW of the package can book now', async () => {
    const legs = [{ rw: WIZARD.package.rws[0], sessions: [] }];
    vi.mocked(listBookableSessions).mockResolvedValue(legs as never);
    await expect(listBookableSessionsAction({ packageSlug: 'paket-kombinasi' })).resolves.toEqual({
      ok: true,
      data: legs,
    });
    expect(vi.mocked(withinGuestLimits).mock.calls[0]?.[0]).toEqual([
      { name: 'session_availability:ip', subject: '203.0.113.7' },
    ]);
  });

  it('answers an unknown package as not found', async () => {
    vi.mocked(loadBookingWizard).mockResolvedValue(null);
    await expect(listBookableSessionsAction({ packageSlug: 'tidak-ada' })).resolves.toMatchObject({
      ok: false,
      error: { code: 'NOT_FOUND' },
    });
  });
});
