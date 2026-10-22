import { beforeEach, describe, expect, it, vi } from 'vitest';

import { svcCreateBooking, svcResendBookingLink } from '@/db/rpc-guest';
import { AppError } from '@/lib/errors';
import { withinRateLimits } from '@/lib/rate-limit';
import { createBookingSchema } from '@/lib/validations/booking';

import { createHold, createQuotedBooking } from './booking-service';

// The hold and quotation side of booking-service.ts (Task P3.4.03): what it counts before the database is asked, what
// it hands internal.create_booking, and what the visitor is told. internal.create_booking itself is tested in
// supabase/tests/create_booking.sql and, end to end, in tests/integration/booking.test.ts.
vi.mock('@/lib/supabase/admin', () => ({ createSupabaseAdminClient: () => ({}) }));
vi.mock('@/db/rpc-guest', () => ({
  svcCreateBooking: vi.fn(),
  svcIssuePhoneOtp: vi.fn(),
  svcVerifyPhoneOtp: vi.fn(),
  svcResendBookingLink: vi.fn(() => Promise.resolve('queued')),
  svcRevokeGuestLinks: vi.fn(),
}));
vi.mock('@/lib/rate-limit', () => ({ withinRateLimits: vi.fn(() => Promise.resolve(true)) }));

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
      consentVersion: '2026-10-18',
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
  };

  it("counts the day's bookings per phone and per IP and browser before asking the database", async () => {
    vi.mocked(svcCreateBooking).mockResolvedValue(created);
    await createHold(request);
    expect(vi.mocked(withinRateLimits).mock.calls[0]?.[1]).toEqual([
      { name: 'booking:phone', subject: '+6281234567890' },
      { name: 'booking:ip+ua', subject: '203.0.113.9|Mozilla/5.0' },
    ]);
  });

  it('refuses over the daily caps without booking anything', async () => {
    vi.mocked(withinRateLimits).mockResolvedValueOnce(false);
    await expect(createHold(request)).rejects.toEqual(new AppError('RATE_LIMITED'));
    expect(svcCreateBooking).not.toHaveBeenCalled();
  });

  it("books with the phone and code of the verified cookie, the form's ids and quantities, and the summary's hash", async () => {
    vi.mocked(svcCreateBooking).mockResolvedValue(created);
    await expect(createHold(request)).resolves.toEqual({
      kind: 'created',
      bookingCode: CODE,
      status: 'pending_payment',
      expiresAt: '2026-10-23T08:00:00+00:00',
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
      consentVersion: '2026-10-18',
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

  it('asks for a quotation booking in quote mode', async () => {
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
  });
});
