import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  svcIssuePhoneOtp,
  svcResendBookingLink,
  svcRevokeGuestLinks,
  svcSubmitReview,
  svcVerifyPhoneOtp,
} from '@/db/rpc-guest';
import { mintGuestLink } from '@/lib/links/mint';
import { otpBrowserHash, otpCodeHash } from '@/lib/otp';
import { withinRateLimits } from '@/lib/rate-limit';

import {
  issuePhoneOtp,
  resendBookingLink,
  revokeGuestLinks,
  submitReview,
  verifyGuestAccess,
  verifyPhoneOtp,
} from './booking-service';

const booking = vi.hoisted(() => ({
  row: null as { id: string; token_version: number } | null,
  reads: 0,
  review: null as { id: string } | null,
}));

vi.mock('@/lib/supabase/admin', () => {
  const query = {
    select: () => query,
    eq: () => query,
    maybeSingle: () => {
      booking.reads += 1;
      return Promise.resolve({ data: booking.row, error: null });
    },
  };
  const reviews = {
    select: () => reviews,
    eq: () => reviews,
    maybeSingle: () => Promise.resolve({ data: booking.review, error: null }),
  };
  return {
    createSupabaseAdminClient: () => ({
      from: (table: string) => (table === 'reviews' ? reviews : query),
    }),
  };
});
vi.mock('@/db/rpc-guest', () => ({
  svcIssuePhoneOtp: vi.fn(() => Promise.resolve({ status: 'sent', otpId: 'x', expiresAt: 'y' })),
  svcVerifyPhoneOtp: vi.fn(() => Promise.resolve({ status: 'invalid' })),
  svcResendBookingLink: vi.fn(() => Promise.resolve('no_match')),
  svcRevokeGuestLinks: vi.fn(() => Promise.resolve(2)),
  svcSubmitReview: vi.fn(() => Promise.resolve('review-1')),
}));
vi.mock('@/lib/rate-limit', () => ({ withinRateLimits: vi.fn(() => Promise.resolve(true)) }));

const NOW = 1_790_000_000;
const CODE = 'GSK-7F3K9Q2M';
const BOOKING_ID = '0192f3a4-5b6c-7d8e-9f01-23456789abcd';
const BROWSER_ID = 'b3J5Lb6Qf0x1Zr2kq9WmTA';

beforeEach(() => {
  vi.clearAllMocks();
  booking.row = { id: BOOKING_ID, token_version: 2 };
  booking.reads = 0;
  booking.review = null;
});

describe('issuePhoneOtp', () => {
  it('sends the keyed hash of a fresh six-digit code, never asking the database to keep the code itself', async () => {
    await issuePhoneOtp({
      channel: 'whatsapp',
      phone: '+6281234567890',
      email: null,
      clientIp: '203.0.113.9',
      browserId: BROWSER_ID,
    });
    const otp = vi.mocked(svcIssuePhoneOtp).mock.calls[0]?.[1];
    expect(otp).toMatchObject({
      purpose: 'booking_phone',
      channel: 'whatsapp',
      phone: '+6281234567890',
      email: null,
      ip: '203.0.113.9',
    });
    expect(otp?.code).toMatch(/^\d{6}$/);
    expect(otp?.codeHash).toBe(otpCodeHash(BROWSER_ID, otp?.code ?? ''));
  });

  it('ties the code to the keyed hash of the browser that asked, never to its raw id', async () => {
    await issuePhoneOtp({
      channel: 'whatsapp',
      phone: '+6281234567890',
      email: null,
      clientIp: '203.0.113.9',
      browserId: BROWSER_ID,
    });
    const otp = vi.mocked(svcIssuePhoneOtp).mock.calls[0]?.[1];
    expect(otp?.browserHash).toBe(otpBrowserHash(BROWSER_ID));
    expect(otp?.browserHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(otp)).not.toContain(BROWSER_ID);
  });

  it('targets the address alone for an email code, and counts an IPv6 visitor by their /64', async () => {
    await issuePhoneOtp({
      channel: 'email',
      phone: '+6281234567890',
      email: 'ani@example.test',
      clientIp: '2001:db8:1:2:3:4:5:6',
      browserId: BROWSER_ID,
    });
    expect(vi.mocked(svcIssuePhoneOtp).mock.calls[0]?.[1]).toMatchObject({
      channel: 'email',
      phone: null,
      email: 'ani@example.test',
      ip: '2001:db8:1:2::/64',
    });
  });

  it('leaves the IP out when the server saw none, as on a local dev server', async () => {
    await issuePhoneOtp({
      channel: 'whatsapp',
      phone: '+6281234567890',
      email: null,
      clientIp: 'unknown',
      browserId: BROWSER_ID,
    });
    expect(vi.mocked(svcIssuePhoneOtp).mock.calls[0]?.[1].ip).toBeNull();
  });
});

describe('verifyPhoneOtp and resendBookingLink', () => {
  it('checks a booking-phone code of this browser for this number, by the keyed hash of what was typed', async () => {
    await verifyPhoneOtp({
      channel: 'whatsapp',
      phone: '+6281234567890',
      email: null,
      code: '482913',
      browserId: BROWSER_ID,
    });
    expect(vi.mocked(svcVerifyPhoneOtp).mock.calls[0]?.[1]).toEqual({
      purpose: 'booking_phone',
      channel: 'whatsapp',
      browserHash: otpBrowserHash(BROWSER_ID),
      codeHash: otpCodeHash(BROWSER_ID, '482913'),
      phone: '+6281234567890',
      email: null,
    });
  });

  it('checks an email code by the address alone', async () => {
    await verifyPhoneOtp({
      channel: 'email',
      phone: '+6281234567890',
      email: 'ani@example.test',
      code: '482913',
      browserId: BROWSER_ID,
    });
    expect(vi.mocked(svcVerifyPhoneOtp).mock.calls[0]?.[1]).toMatchObject({
      channel: 'email',
      phone: null,
      email: 'ani@example.test',
    });
  });

  it('hands the database a phone or an address, never both', async () => {
    await resendBookingLink({ bookingCode: CODE, contact: '+6281234567890' });
    await resendBookingLink({ bookingCode: CODE, contact: 'ani@example.test' });
    expect(vi.mocked(svcResendBookingLink).mock.calls.map(([, lookup]) => lookup)).toEqual([
      { bookingCode: CODE, phone: '+6281234567890', email: null },
      { bookingCode: CODE, phone: null, email: 'ani@example.test' },
    ]);
  });

  it('revokes through the database function', async () => {
    await revokeGuestLinks(BOOKING_ID);
    expect(vi.mocked(svcRevokeGuestLinks).mock.calls[0]?.[1]).toBe(BOOKING_ID);
  });
});

describe('verifyGuestAccess', () => {
  const access = async (
    token: string | Promise<string>,
    required: 'view' | 'manage' | 'review' = 'view',
  ) =>
    verifyGuestAccess({
      bookingCode: CODE,
      token: await token,
      required,
      clientIp: '203.0.113.9',
      nowSeconds: NOW,
    });
  const minted = (scope: 'view' | 'manage' | 'review', tokenVersion = 2) =>
    mintGuestLink({ bookingCode: CODE, scope, tokenVersion, nowSeconds: NOW });

  it('opens a current link for the scopes it grants', async () => {
    await expect(access(minted('manage'))).resolves.toEqual({
      bookingId: BOOKING_ID,
      bookingCode: CODE,
      scope: 'manage',
    });
  });

  it('turns a forged link away before reading the booking', async () => {
    await expect(access(`${(await minted('manage')).slice(0, -3)}AAA`)).resolves.toBeNull();
    expect(booking.reads).toBe(0);
  });

  it('turns away a visitor over the link limit before anything else', async () => {
    vi.mocked(withinRateLimits).mockResolvedValueOnce(false);
    await expect(access(minted('manage'))).resolves.toBeNull();
    expect(booking.reads).toBe(0);
  });

  it('refuses a revoked link, a link too narrow for the page, and an unknown booking', async () => {
    await expect(access(minted('manage', 1))).resolves.toBeNull();
    await expect(access(minted('view'), 'manage')).resolves.toBeNull();
    booking.row = null;
    await expect(access(minted('manage'))).resolves.toBeNull();
  });
});

describe('reviews', () => {
  it('lets a review link through until the booking has its review, and no longer (FR-POST-05)', async () => {
    const link = await mintGuestLink({
      bookingCode: CODE,
      scope: 'review',
      tokenVersion: 2,
      nowSeconds: NOW,
    });
    const access = () =>
      verifyGuestAccess({
        bookingCode: CODE,
        token: link,
        required: 'review',
        clientIp: '203.0.113.9',
        nowSeconds: NOW,
      });
    await expect(access()).resolves.toMatchObject({ bookingId: BOOKING_ID, scope: 'review' });
    booking.review = { id: 'review-1' };
    await expect(access()).resolves.toBeNull();
  });

  it('leaves the other links of the booking alive once it has its review', async () => {
    booking.review = { id: 'review-1' };
    const link = await mintGuestLink({
      bookingCode: CODE,
      scope: 'manage',
      tokenVersion: 2,
      nowSeconds: NOW,
    });
    await expect(
      verifyGuestAccess({
        bookingCode: CODE,
        token: link,
        required: 'view',
        clientIp: '203.0.113.9',
        nowSeconds: NOW,
      }),
    ).resolves.toMatchObject({ scope: 'manage' });
  });

  it('hands the database the checked booking and the parsed form', async () => {
    await submitReview(BOOKING_ID, {
      bookingCode: CODE,
      rating: 4,
      title: null,
      body: 'Anak-anak belajar memilah sampah.',
      reviewerName: 'Bu Ani',
      isAnonymous: true,
      turnstileToken: 'turnstile-token',
    });
    expect(vi.mocked(svcSubmitReview).mock.calls[0]?.[1]).toEqual({
      bookingId: BOOKING_ID,
      rating: 4,
      title: null,
      body: 'Anak-anak belajar memilah sampah.',
      reviewerName: 'Bu Ani',
      isAnonymous: true,
    });
  });
});
