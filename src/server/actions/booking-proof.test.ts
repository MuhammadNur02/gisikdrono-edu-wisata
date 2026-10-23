import { beforeEach, describe, expect, it, vi } from 'vitest';

import { copy } from '@/lib/copy/id';
import { verifyTurnstile } from '@/lib/turnstile';
import { readPhoneProofCookie } from '@/server/auth/guest-cookies';
import {
  createHold,
  createQuotedBooking,
  withinGuestLimits,
} from '@/server/services/booking-service';
import { loadBookingWizard } from '@/server/services/booking-wizard-service';

import { createBookingAction, requestQuotationAction } from './booking';
import {
  bookingRequest as REQUEST,
  comboWizard as WIZARD,
  freshProof,
} from '../../../tests/fixtures/booking-wizard';

// createBookingAction and the gsk_phone proof (decision of 2026-10-22 on P3.5, Q2; review of PR #27, M1): the booking
// goes ahead only with a fresh proof of the contact the summary shows. The rest of the action is in booking.test.ts.

vi.mock('next/headers', () => ({
  headers: () =>
    Promise.resolve(new Headers({ 'x-real-ip': '203.0.113.7', 'user-agent': 'Mozilla/5.0' })),
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
vi.mock('@/server/services/booking-wizard-service', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  loadBookingWizard: vi.fn(),
  listBookableSessions: vi.fn(),
}));

const NOW_SECONDS = Math.floor(Date.now() / 1000);
const PROOF = freshProof(NOW_SECONDS);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(loadBookingWizard).mockResolvedValue(WIZARD);
  vi.mocked(verifyTurnstile).mockResolvedValue(true);
  vi.mocked(readPhoneProofCookie).mockResolvedValue(PROOF);
  vi.mocked(withinGuestLimits).mockResolvedValue(true);
  vi.mocked(createHold).mockResolvedValue({ kind: 'pay_to_confirm' });
});

describe('createBookingAction and the proof of the contact', () => {
  it('refuses a failed security check before reading the proof', async () => {
    vi.mocked(verifyTurnstile).mockResolvedValue(false);
    const answer = await createBookingAction(REQUEST);
    expect(answer).toMatchObject({
      ok: false,
      error: {
        code: 'VALIDATION',
        fieldErrors: { turnstileToken: [copy.booking.otp.captchaFailed] },
      },
    });
    expect(readPhoneProofCookie).not.toHaveBeenCalled();
    expect(createHold).not.toHaveBeenCalled();
  });

  it.each([
    ['no proof', null],
    ['a proof verified nine minutes ago', { ...PROOF, expiresAt: NOW_SECONDS + 21 * 60 }],
    // Review of PR #27, M1: another tab proved another contact since this one was shown.
    ['a proof of another number', { ...PROOF, phone: '+6289876543210' }],
    [
      'an email proof where WhatsApp is shown',
      { ...PROOF, channel: 'email' as const, email: 'ani@sekolah.sch.id' },
    ],
  ])('asks for the code again with %s (decision on P3.5, Q2)', async (_case, proof) => {
    vi.mocked(readPhoneProofCookie).mockResolvedValue(proof);
    await expect(createBookingAction(REQUEST)).resolves.toEqual({
      ok: true,
      data: { kind: 'reverify' },
    });
    expect(createHold).not.toHaveBeenCalled();
  });

  it('asks for the code again when the shown email proof is of another address (review of PR #27, M1)', async () => {
    vi.mocked(readPhoneProofCookie).mockResolvedValue({
      ...PROOF,
      channel: 'email',
      email: 'ani@sekolah.sch.id',
    });
    const shown = { channel: 'email', phone: '081234567890', email: 'Ani@Sekolah.sch.id' };
    await createBookingAction({ ...REQUEST, shownContact: shown });
    expect(createHold).toHaveBeenCalledTimes(1);
    vi.mocked(createHold).mockClear();

    const otherAddress = { ...shown, email: 'budi@sekolah.sch.id' };
    await expect(createBookingAction({ ...REQUEST, shownContact: otherAddress })).resolves.toEqual({
      ok: true,
      data: { kind: 'reverify' },
    });
    await expect(createBookingAction({ ...REQUEST, shownContact: null })).resolves.toEqual({
      ok: true,
      data: { kind: 'reverify' },
    });
    expect(createHold).not.toHaveBeenCalled();
  });
});

// Re-review of PR #33: while WhatsApp codes are degraded, an email proof cannot verify the number a Surat Penawaran
// needs, so the quotation is refused before the booking is made or the code spent, and the school pays with a hold.
describe('requestQuotationAction with an email proof', () => {
  it('refuses the quotation in its own words and books nothing', async () => {
    vi.mocked(readPhoneProofCookie).mockResolvedValue({
      ...PROOF,
      channel: 'email',
      email: 'ani@sekolah.sch.id',
    });
    const shown = { channel: 'email', phone: '081234567890', email: 'ani@sekolah.sch.id' };
    await expect(
      requestQuotationAction({ ...REQUEST, shownContact: shown }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: 'STATE_INVALID', message: copy.booking.wizard.quoteNeedsWhatsApp },
    });
    expect(createQuotedBooking).not.toHaveBeenCalled();
  });

  it('still lets the same visitor hold with "Konfirmasi & Bayar"', async () => {
    vi.mocked(readPhoneProofCookie).mockResolvedValue({
      ...PROOF,
      channel: 'email',
      email: 'ani@sekolah.sch.id',
    });
    const shown = { channel: 'email', phone: '081234567890', email: 'ani@sekolah.sch.id' };
    await createBookingAction({ ...REQUEST, shownContact: shown });
    expect(createHold).toHaveBeenCalledTimes(1);
  });
});
