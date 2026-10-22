import { revalidateTag } from 'next/cache';
import { after } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { copy } from '@/lib/copy/id';
import { verifyTurnstile } from '@/lib/turnstile';
import {
  forgetPhoneProof,
  readPhoneProofCookie,
  rememberGuestLink,
} from '@/server/auth/guest-cookies';
import {
  createHold,
  createQuotedBooking,
  withinGuestLimits,
} from '@/server/services/booking-service';
import { loadBookingWizard } from '@/server/services/booking-wizard-service';

import { createBookingAction } from './booking';
import {
  bookingRequest as REQUEST,
  comboWizard as WIZARD,
  freshProof,
  PACKAGE_ID,
  schoolBooking as BOOKING,
} from '../../../tests/fixtures/booking-wizard';

vi.mock('next/headers', () => ({
  headers: () =>
    Promise.resolve(new Headers({ 'x-real-ip': '203.0.113.7', 'user-agent': 'Mozilla/5.0' })),
}));
// The wizard's public reads are cached in a running server; here each one runs as it is.
vi.mock('next/cache', () => ({
  revalidateTag: vi.fn(),
  unstable_cache: (read: unknown) => read,
}));
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

const text = copy.booking.wizard;
const CODE = 'GSK-7F3K9Q2M';
// A made-up manage link: payload.signature, as src/lib/links/mint.ts writes one.
const MANAGE_LINK = 'link-payload.link-signature';
const PROOF = freshProof(Math.floor(Date.now() / 1000));

const CREATED = {
  kind: 'created' as const,
  bookingCode: CODE,
  status: 'pending_payment' as const,
  expiresAt: '2026-10-23T08:00:00+00:00',
  visitDate: '2026-11-12',
  visitDateEnd: '2026-11-12',
  manageToken: MANAGE_LINK,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(loadBookingWizard).mockResolvedValue(WIZARD);
  vi.mocked(verifyTurnstile).mockResolvedValue(true);
  vi.mocked(readPhoneProofCookie).mockResolvedValue(PROOF);
  vi.mocked(withinGuestLimits).mockResolvedValue(true);
  vi.mocked(createHold).mockResolvedValue(CREATED);
  vi.mocked(createQuotedBooking).mockResolvedValue({
    ...CREATED,
    status: 'quoted',
    expiresAt: null,
  });
});

describe('createBookingAction', () => {
  it('holds the booking with the verified proof and answers the pay page, never the manage link', async () => {
    const answer = await createBookingAction(REQUEST);
    expect(answer).toEqual({
      ok: true,
      data: { kind: 'created', bookingCode: CODE, nextUrl: `/reservasi/${CODE}/bayar` },
    });
    expect(JSON.stringify(answer)).not.toContain(MANAGE_LINK);
    expect(verifyTurnstile).toHaveBeenCalledWith(
      'XXXX.DUMMY.TOKEN.XXXX',
      '203.0.113.7',
      'booking_create',
    );
    expect(vi.mocked(createHold).mock.calls[0]?.[0]).toMatchObject({
      values: { packageId: PACKAGE_ID, pax: 30, picEmail: 'ani@sekolah.sch.id' },
      proof: PROOF,
      clientIp: '203.0.113.7',
      userAgent: 'Mozilla/5.0',
    });
  });

  it('leaves the manage link in this browser and forgets the spent code (decision on P3.5, Q1)', async () => {
    await createBookingAction(REQUEST);
    expect(rememberGuestLink).toHaveBeenCalledWith(CODE, MANAGE_LINK);
    expect(forgetPhoneProof).toHaveBeenCalledTimes(1);
    expect(after).toHaveBeenCalledTimes(1);
  });

  it("revalidates the month's sessions of every RW the booking visits", async () => {
    await createBookingAction(REQUEST);
    expect(vi.mocked(revalidateTag).mock.calls).toEqual([
      ['sessions:5:2026-11'],
      ['sessions:13:2026-11'],
    ]);
  });

  // Review of PR #27, L3: the months come from the visit days the database booked, not from the form.
  it('revalidates the months of the visit days the database names', async () => {
    vi.mocked(createHold).mockResolvedValue({
      ...CREATED,
      visitDate: '2026-11-30',
      visitDateEnd: '2026-12-01',
    });
    await createBookingAction(REQUEST);
    expect(vi.mocked(revalidateTag).mock.calls).toEqual([
      ['sessions:5:2026-11'],
      ['sessions:5:2026-12'],
      ['sessions:13:2026-11'],
      ['sessions:13:2026-12'],
    ]);
  });

  it('asks for a quotation booking for an institution and answers its status page', async () => {
    const answer = await createBookingAction({ ...REQUEST, mode: 'quote' });
    expect(answer).toEqual({
      ok: true,
      data: { kind: 'created', bookingCode: CODE, nextUrl: `/reservasi/${CODE}` },
    });
    expect(createQuotedBooking).toHaveBeenCalledTimes(1);
    expect(createHold).not.toHaveBeenCalled();
  });

  it('refuses a quotation for an individual visitor, who pays at once', async () => {
    const individual = { ...BOOKING, bookerType: 'individual', institutionName: null };
    const answer = await createBookingAction({ ...REQUEST, mode: 'quote', booking: individual });
    expect(answer).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION', message: text.quoteForInstitutions },
    });
    expect(createQuotedBooking).not.toHaveBeenCalled();
  });

  it('refuses a malformed booking before anything is checked or asked', async () => {
    const answer = await createBookingAction({ ...REQUEST, booking: { ...BOOKING, total: 1 } });
    expect(answer).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });
    expect(withinGuestLimits).not.toHaveBeenCalled();
    expect(verifyTurnstile).not.toHaveBeenCalled();
    expect(createHold).not.toHaveBeenCalled();
  });

  it('refuses a privacy notice version from the browser (review of PR #27, M2)', async () => {
    const answer = await createBookingAction({
      ...REQUEST,
      booking: { ...BOOKING, consentVersion: '2020-01-01' },
    });
    expect(answer).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });
    expect(createHold).not.toHaveBeenCalled();
  });

  // Review of PR #27, L1: a burst of submits from one IP stops before Turnstile and the database are asked.
  it('counts the booking attempts of the IP before the security check', async () => {
    await createBookingAction(REQUEST);
    expect(withinGuestLimits).toHaveBeenCalledWith([
      { name: 'booking_create:ip', subject: '203.0.113.7' },
    ]);
  });

  it('refuses an IP over its booking attempts without the security check or a booking', async () => {
    vi.mocked(withinGuestLimits).mockResolvedValue(false);
    await expect(createBookingAction(REQUEST)).resolves.toMatchObject({
      ok: false,
      error: { code: 'RATE_LIMITED' },
    });
    expect(verifyTurnstile).not.toHaveBeenCalled();
    expect(createHold).not.toHaveBeenCalled();
  });

  it('refuses a booking above the package site limit of booking.max_pax', async () => {
    vi.mocked(loadBookingWizard).mockResolvedValue({
      ...WIZARD,
      rules: { ...WIZARD.rules, maxPax: 20 },
    });
    const answer = await createBookingAction(REQUEST);
    expect(answer).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });
  });

  it('refuses a package the slug does not name', async () => {
    const answer = await createBookingAction({
      ...REQUEST,
      booking: { ...BOOKING, packageId: '0192f3a4-5b6c-7d8e-9f01-0000000000ff' },
    });
    expect(answer).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });
    expect(createHold).not.toHaveBeenCalled();
  });

  it('answers a package that is not on sale, and a closed booking, without booking', async () => {
    vi.mocked(loadBookingWizard).mockResolvedValueOnce(null);
    await expect(createBookingAction(REQUEST)).resolves.toMatchObject({
      ok: false,
      error: { code: 'NOT_FOUND' },
    });
    vi.mocked(loadBookingWizard).mockResolvedValueOnce({ ...WIZARD, isOpen: false });
    await expect(createBookingAction(REQUEST)).resolves.toMatchObject({
      ok: false,
      error: { code: 'STATE_INVALID', message: text.closed },
    });
    expect(createHold).not.toHaveBeenCalled();
  });

  it.each([['pay_to_confirm' as const], ['resent' as const], ['reverify' as const]])(
    'answers %s as it is and keeps the unspent code',
    async (kind) => {
      vi.mocked(createHold).mockResolvedValue({ kind });
      await expect(createBookingAction(REQUEST)).resolves.toEqual({ ok: true, data: { kind } });
      expect(forgetPhoneProof).not.toHaveBeenCalled();
      expect(rememberGuestLink).not.toHaveBeenCalled();
    },
  );

  it('tells a full session in the words of QUOTA_EXCEEDED', async () => {
    vi.mocked(createHold).mockRejectedValue({
      code: 'P0001',
      hint: 'QUOTA_UNAVAILABLE',
      message: 'x',
    });
    await expect(createBookingAction(REQUEST)).resolves.toMatchObject({
      ok: false,
      error: { code: 'QUOTA_EXCEEDED', message: copy.errors.QUOTA_EXCEEDED },
    });
  });

  it('tells a choice that changed meanwhile in the words of the wizard', async () => {
    vi.mocked(createHold).mockRejectedValue({ code: 'P0001', hint: 'STATE_INVALID', message: 'x' });
    await expect(createBookingAction(REQUEST)).resolves.toMatchObject({
      ok: false,
      error: { code: 'STATE_INVALID', message: text.unavailableChoice },
    });
  });
});
