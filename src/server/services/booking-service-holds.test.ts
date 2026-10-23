import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PRIVACY_NOTICE_VERSION } from '@/config/site';
import { svcCreateQuotation } from '@/db/rpc-documents';
import { svcCreateBooking, svcResendBookingLink, type BookingReply } from '@/db/rpc-guest';
import { AppError } from '@/lib/errors';
import { readGuestLink } from '@/lib/links/verify';
import { refundRateLimits, withinRateLimits } from '@/lib/rate-limit';
import { createBookingSchema } from '@/lib/validations/booking';

import { createHold, createQuotedBooking } from './booking-service';

// The hold and quotation side of booking-service.ts (Task P3.4.03): what it counts before the database is asked, what
// it hands internal.create_booking, and what the visitor is told. internal.create_booking itself is tested in
// supabase/tests/create_booking.sql and, end to end, in tests/integration/booking.test.ts.
// The one table read the service makes itself: the new booking's token_version, for its manage link.
const adminClient = vi.hoisted(() => {
  const bookingRow = { id: '0192f3a4-5b6c-7d8e-9f01-23456789abcd', token_version: 3 };
  const lookup = { maybeSingle: () => Promise.resolve({ data: bookingRow, error: null }) };
  return { from: () => ({ select: () => ({ eq: () => lookup }) }) };
});
vi.mock('@/lib/supabase/admin', () => ({ createSupabaseAdminClient: () => adminClient }));
vi.mock('@/db/rpc-guest', () => ({
  svcCreateBooking: vi.fn(),
  svcIssuePhoneOtp: vi.fn(),
  svcVerifyPhoneOtp: vi.fn(),
  svcResendBookingLink: vi.fn(() => Promise.resolve('queued')),
  svcRevokeGuestLinks: vi.fn(),
}));
vi.mock('@/db/rpc-documents', () => ({ svcCreateQuotation: vi.fn() }));
vi.mock('@/lib/rate-limit', () => ({
  withinRateLimits: vi.fn(() => Promise.resolve(true)),
  refundRateLimits: vi.fn(() => Promise.resolve()),
}));

const NOW = 1_790_000_000;
const CODE = 'GSK-7F3K9Q2M';
const BOOKING_ID = '0192f3a4-5b6c-7d8e-9f01-23456789abcd';
// The UUID the wizard draws once per mount; in capitals, to see the schema store it lower-cased.
const WIZARD_MOUNT = '7D444840-9DC0-11D1-B245-5FFDCE74FAD2';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('createHold and createQuotedBooking', () => {
  const SESSION_ID = '0192f3a4-5b6c-7d8e-9f01-000000000005';
  const PRODUCT_ID = '0192f3a4-5b6c-7d8e-9f01-0000000000a1';
  const OTP_ID = '0192f3a4-5b6c-7d8e-9f01-0000000000aa';
  const request = {
    values: createBookingSchema(500).parse({
      packageId: '0192f3a4-5b6c-7d8e-9f01-000000000001',
      visitSessionIds: [SESSION_ID],
      visitDate: '2026-11-12',
      pax: 30,
      bookerType: 'school',
      institutionName: 'SD Negeri Gisikdrono 01',
      picName: 'Ani Lestari',
      picEmail: 'Ani@Sekolah.sch.id',
      notes: '',
      addons: [{ productId: PRODUCT_ID, qty: 30 }],
      participants: [{ fullName: 'Budi Santoso', groupLabel: '5A', roleLabel: 'student' }],
      guardianConsent: true,
      privacyAccepted: true,
      idempotencyKey: WIZARD_MOUNT,
      quoteHash: 'f'.repeat(64),
      turnstileToken: 'XXXX.DUMMY.TOKEN.XXXX',
    }),
    proof: {
      channel: 'whatsapp' as const,
      phone: '+6281234567890',
      email: null,
      otpId: OTP_ID,
      expiresAt: NOW + 600,
    },
    clientIp: '203.0.113.9',
    userAgent: 'Mozilla/5.0',
  };
  const created = {
    result: 'created' as const,
    bookingId: BOOKING_ID,
    bookingCode: CODE,
    status: 'pending_payment' as const,
    expiresAt: '2026-10-23T08:00:00+00:00',
    visitDate: '2026-11-12',
    visitDateEnd: '2026-11-12',
  };
  const DAILY_LIMITS = [
    { name: 'booking:phone', subject: '+6281234567890' },
    { name: 'booking:ip+ua', subject: '203.0.113.9|Mozilla/5.0' },
  ];

  it("counts the day's bookings per phone and per IP and browser before asking the database", async () => {
    vi.mocked(svcCreateBooking).mockResolvedValue(created);
    await createHold(request);
    expect(vi.mocked(withinRateLimits).mock.calls[0]?.[1]).toEqual(DAILY_LIMITS);
  });

  it('refuses over the daily caps without booking anything', async () => {
    vi.mocked(withinRateLimits).mockResolvedValueOnce(false);
    await expect(createHold(request)).rejects.toEqual(new AppError('RATE_LIMITED'));
    expect(svcCreateBooking).not.toHaveBeenCalled();
  });

  // Review of PR #27: the privacy notice is the one this server shows (M2), the guardian's consent goes with the list
  // (L4), and the visit days come back from the database (L3).
  it("books with the phone and code of the verified cookie, the form's ids and quantities, and the summary's hash", async () => {
    vi.mocked(svcCreateBooking).mockResolvedValue(created);
    await expect(createHold(request)).resolves.toEqual({
      kind: 'created',
      replayed: false,
      bookingId: BOOKING_ID,
      bookingCode: CODE,
      status: 'pending_payment',
      expiresAt: '2026-10-23T08:00:00+00:00',
      visitDate: '2026-11-12',
      visitDateEnd: '2026-11-12',
      manageToken: expect.any(String) as unknown,
    });
    expect(vi.mocked(svcCreateBooking).mock.calls[0]?.[1]).toEqual({
      packageId: '0192f3a4-5b6c-7d8e-9f01-000000000001',
      sessionIds: [SESSION_ID],
      pax: 30,
      booker: {
        bookerType: 'school',
        institutionName: 'SD Negeri Gisikdrono 01',
        picName: 'Ani Lestari',
        picPhone: '+6281234567890',
        picEmail: 'ani@sekolah.sch.id',
        notes: null,
      },
      addons: [{ productId: PRODUCT_ID, qty: 30, notes: null }],
      participants: [{ fullName: 'Budi Santoso', groupLabel: '5A', roleLabel: 'student' }],
      mode: 'pay',
      idempotencyKey: WIZARD_MOUNT.toLowerCase(),
      otpId: OTP_ID,
      consent: { version: PRIVACY_NOTICE_VERSION, guardianConsent: true },
      clientIp: '203.0.113.9',
      userAgent: 'Mozilla/5.0',
      quoteHash: 'f'.repeat(64),
    });
  });

  it('records no IP for a request seen through no proxy', async () => {
    vi.mocked(svcCreateBooking).mockResolvedValue(created);
    await createHold({ ...request, clientIp: 'unknown' });
    expect(vi.mocked(svcCreateBooking).mock.calls[0]?.[1].clientIp).toBeNull();
  });

  // Decision of 2026-10-22 on P3.5, Q1 (docs/Security.md §3.2): the browser that proved the contact and made the
  // booking gets its manage link at once, for the bk_<code> cookie createBookingAction sets.
  it('hands back a manage link for the new booking, minted at its token_version', async () => {
    vi.mocked(svcCreateBooking).mockResolvedValue(created);
    const outcome = await createHold(request);
    if (outcome.kind !== 'created') throw new Error('the hold should be created');
    const reading = await readGuestLink(outcome.manageToken, {
      bookingCode: CODE,
      nowSeconds: Math.floor(Date.now() / 1000),
    });
    expect(reading).toMatchObject({ ok: true, link: { s: 'manage', v: 3 } });
    expect(
      (await readGuestLink(outcome.manageToken, { bookingCode: 'GSK-AAAAAAAA', nowSeconds: NOW }))
        .ok,
    ).toBe(false);
  });

  it('answers a repeat of the same form with the booking it made', async () => {
    vi.mocked(svcCreateBooking).mockResolvedValue({ ...created, result: 'existing' });
    await expect(createHold(request)).resolves.toMatchObject({
      kind: 'created',
      bookingCode: CODE,
    });
  });

  it("sends the existing hold's link again for a duplicate and never returns its code", async () => {
    vi.mocked(svcCreateBooking).mockResolvedValue({ ...created, result: 'duplicate' });
    const outcome = await createHold(request);
    expect(outcome).toEqual({ kind: 'resent' });
    expect(vi.mocked(svcResendBookingLink).mock.calls[0]?.[1]).toEqual({
      bookingCode: CODE,
      phone: '+6281234567890',
      email: null,
    });
  });

  it('passes a hold beyond half the session on as pay to confirm', async () => {
    vi.mocked(svcCreateBooking).mockResolvedValue({ result: 'pay_to_confirm' });
    await expect(createHold(request)).resolves.toEqual({ kind: 'pay_to_confirm' });
  });

  it('tries once more when the database broke a deadlock, and no more than once (independent review of PR #26, M1)', async () => {
    const deadlock = { code: '40P01', message: 'deadlock detected' };
    vi.mocked(svcCreateBooking).mockRejectedValueOnce(deadlock).mockResolvedValueOnce(created);
    await expect(createHold(request)).resolves.toMatchObject({ kind: 'created' });
    expect(svcCreateBooking).toHaveBeenCalledTimes(2);

    vi.mocked(svcCreateBooking).mockReset().mockRejectedValue(deadlock);
    await expect(createHold(request)).rejects.toBe(deadlock);
    expect(svcCreateBooking).toHaveBeenCalledTimes(2);
  });

  it('never tries a business refusal twice', async () => {
    const full = { code: 'P0001', hint: 'QUOTA_UNAVAILABLE', message: 'no room' };
    vi.mocked(svcCreateBooking).mockRejectedValue(full);
    await expect(createHold(request)).rejects.toBe(full);
    expect(svcCreateBooking).toHaveBeenCalledTimes(1);
  });

  it('counts an email proof by the address it proved, never the typed number (independent review of PR #26, M2)', async () => {
    const emailProof = {
      ...request,
      proof: { ...request.proof, channel: 'email' as const, email: 'ani@sekolah.sch.id' },
    };
    vi.mocked(svcCreateBooking).mockResolvedValue({ ...created, result: 'duplicate' });
    await expect(createHold(emailProof)).resolves.toEqual({ kind: 'resent' });
    expect(vi.mocked(withinRateLimits).mock.calls[0]?.[1]).toEqual([
      { name: 'booking:email', subject: 'ani@sekolah.sch.id' },
      { name: 'booking:ip+ua', subject: '203.0.113.9|Mozilla/5.0' },
    ]);
    expect(vi.mocked(svcResendBookingLink).mock.calls[0]?.[1]).toEqual({
      bookingCode: CODE,
      phone: null,
      email: 'ani@sekolah.sch.id',
    });
  });

  it('books an email proof under the address the code proved, not the one typed (review of PR #27, M1)', async () => {
    vi.mocked(svcCreateBooking).mockResolvedValue(created);
    await createHold({
      ...request,
      values: { ...request.values, picEmail: 'lain@contoh.test' },
      proof: { ...request.proof, channel: 'email' as const, email: 'ani@sekolah.sch.id' },
    });
    expect(vi.mocked(svcCreateBooking).mock.calls[0]?.[1].booker.picEmail).toBe(
      'ani@sekolah.sch.id',
    );
  });

  it('asks for a new code when the database finds the contact unproven (review of PR #27, M1)', async () => {
    vi.mocked(svcCreateBooking).mockRejectedValue({
      code: 'P0001',
      hint: 'CONTACT_UNVERIFIED',
      message: 'the PIC is not verified',
    });
    await expect(createHold(request)).resolves.toEqual({ kind: 'reverify' });
  });

  // Task P3.6.06: the quoted booking gets its Surat Penawaran at once; a repeat of the form issues no second one.
  it('asks for a quotation booking in quote mode and issues its quotation', async () => {
    vi.mocked(svcCreateBooking).mockResolvedValue({
      ...created,
      status: 'quoted',
      expiresAt: null,
    });
    await expect(createQuotedBooking(request)).resolves.toMatchObject({
      kind: 'created',
      status: 'quoted',
    });
    expect(vi.mocked(svcCreateBooking).mock.calls[0]?.[1].mode).toBe('quote');
    expect(vi.mocked(svcCreateQuotation).mock.calls[0]?.[1]).toBe(BOOKING_ID);
  });

  it('issues no quotation for a repeat of the same form, nor for a hold', async () => {
    vi.mocked(svcCreateBooking).mockResolvedValue({
      ...created,
      result: 'existing',
      status: 'quoted',
      expiresAt: null,
    });
    await createQuotedBooking(request);
    vi.mocked(svcCreateBooking).mockResolvedValue(created);
    await createHold(request);
    expect(svcCreateQuotation).not.toHaveBeenCalled();
  });

  // Review of PR #27, L2: a school retrying from one computer is not locked out for the day by refusals it could not
  // have avoided; whatever it could have avoided, or what looks like abuse, still counts.
  describe('the daily limits', () => {
    it.each<[string, BookingReply]>([
      ['a duplicate hold', { ...created, result: 'duplicate' }],
      ['a repeat of the same form', { ...created, result: 'existing' }],
      ['a hold beyond half the session', { result: 'pay_to_confirm' }],
    ])('give their hits back for %s', async (_case, reply) => {
      vi.mocked(svcCreateBooking).mockResolvedValue(reply);
      await createHold(request);
      expect(refundRateLimits).toHaveBeenCalledWith(adminClient, DAILY_LIMITS);
    });

    it('give them back for a session that filled meanwhile, which the visitor still hears', async () => {
      const full = { code: 'P0001', hint: 'QUOTA_UNAVAILABLE', message: 'no room' };
      vi.mocked(svcCreateBooking).mockRejectedValue(full);
      await expect(createHold(request)).rejects.toBe(full);
      expect(refundRateLimits).toHaveBeenCalledWith(adminClient, DAILY_LIMITS);
    });

    it('keep them for a new booking', async () => {
      vi.mocked(svcCreateBooking).mockResolvedValue(created);
      await createHold(request);
      expect(refundRateLimits).not.toHaveBeenCalled();
    });

    it.each(['PRICE_MISMATCH', 'STATE_INVALID', 'RATE_LIMITED', 'CONTACT_UNVERIFIED'])(
      'keep them for a refusal hinted %s',
      async (hint) => {
        vi.mocked(svcCreateBooking).mockRejectedValue({ code: 'P0001', hint, message: 'x' });
        await createHold(request).catch(() => undefined);
        expect(refundRateLimits).not.toHaveBeenCalled();
      },
    );
  });
});
