import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';

import {
  svcClaimNotifications,
  svcCompleteNotification,
  svcFailNotification,
} from '@/db/rpc-outbox';

import {
  svcCreateBooking,
  svcIssuePhoneOtp,
  svcResendBookingLink,
  svcRevokeGuestLinks,
  svcVerifyPhoneOtp,
} from './rpc-guest';
import { clientAnswering } from '../../tests/fixtures/postgrest-client';

const OTP_ID = '0192f3a4-5b6c-7d8e-9f01-0000000000aa';
const OTP = {
  otpId: OTP_ID,
  purpose: 'booking_phone' as const,
  channel: 'whatsapp' as const,
  browserHash: '1'.repeat(64),
  codeHash: 'a'.repeat(64),
  code: '482913',
  phone: '+6281234567890',
  email: null,
  ip: null,
};

describe('svcIssuePhoneOtp', () => {
  it('leaves out the targets and IP it has not got, so the SQL defaults apply', async () => {
    const { client, requests } = clientAnswering(200, {
      result: 'sent',
      otp_id: OTP_ID,
      expires_at: 'later',
    });
    await expect(svcIssuePhoneOtp(client, OTP)).resolves.toEqual({
      status: 'sent',
      otpId: OTP_ID,
      expiresAt: 'later',
    });
    expect(requests[0]).toEqual({
      url: 'http://supabase.test/rest/v1/rpc/svc_issue_phone_otp',
      body: {
        p_otp_id: OTP_ID,
        p_purpose: 'booking_phone',
        p_channel: 'whatsapp',
        p_browser_hash: '1'.repeat(64),
        p_code_hash: 'a'.repeat(64),
        p_code: '482913',
        p_phone: '+6281234567890',
      },
    });
  });

  it.each([
    [
      { result: 'cooldown', retry_after: 42 },
      { status: 'cooldown', retryAfterSeconds: 42 },
    ],
    [{ result: 'degraded' }, { status: 'degraded' }],
    [{ result: 'limited' }, { status: 'limited' }],
  ])('reads %j', async (reply, expected) => {
    const { client } = clientAnswering(200, reply);
    await expect(svcIssuePhoneOtp(client, OTP)).resolves.toEqual(expected);
  });

  it('refuses a reply of another shape', async () => {
    const { client } = clientAnswering(200, {
      result: 'sent',
      otp_id: 'not-a-uuid',
      expires_at: 'x',
    });
    await expect(svcIssuePhoneOtp(client, OTP)).rejects.toBeInstanceOf(ZodError);
  });
});

describe('svcVerifyPhoneOtp', () => {
  const CHECK = {
    purpose: 'booking_phone' as const,
    channel: 'whatsapp' as const,
    browserHash: '1'.repeat(64),
    codeHash: 'b'.repeat(64),
    phone: '+6281234567890',
    email: null,
  };

  it.each([
    [
      {
        result: 'verified',
        otp_id: OTP_ID,
        purpose: 'dsr_identity',
        phone: '+6281234567890',
        email: null,
      },
      {
        status: 'verified',
        otpId: OTP_ID,
        purpose: 'dsr_identity',
        phone: '+6281234567890',
        email: null,
      },
    ],
    [
      { result: 'wrong_code', attempts_left: 2 },
      { status: 'wrong_code', attemptsLeft: 2 },
    ],
    [{ result: 'locked' }, { status: 'locked' }],
  ])('reads %j', async (reply, expected) => {
    const { client, requests } = clientAnswering(200, reply);
    await expect(svcVerifyPhoneOtp(client, CHECK)).resolves.toEqual(expected);
    expect(requests[0]?.body).toEqual({
      p_purpose: 'booking_phone',
      p_channel: 'whatsapp',
      p_browser_hash: '1'.repeat(64),
      p_code_hash: 'b'.repeat(64),
      p_phone: '+6281234567890',
    });
  });
});

describe('guest link and outbox wrappers', () => {
  it('sends the lookup with only the contact given', async () => {
    const { client, requests } = clientAnswering(200, 'queued');
    await expect(
      svcResendBookingLink(client, {
        bookingCode: 'GSK-7F3K9Q2M',
        phone: null,
        email: 'ani@example.test',
      }),
    ).resolves.toBe('queued');
    expect(requests[0]?.body).toEqual({
      p_booking_code: 'GSK-7F3K9Q2M',
      p_email: 'ani@example.test',
    });
  });

  it('revokes, claims, completes and fails through their svc_ functions', async () => {
    const revoke = clientAnswering(200, 3);
    await expect(svcRevokeGuestLinks(revoke.client, 'b-1')).resolves.toBe(3);
    const claim = clientAnswering(200, []);
    await expect(
      svcClaimNotifications(claim.client, { limit: 20, templates: ['phone_otp'] }),
    ).resolves.toEqual([]);
    expect(claim.requests[0]?.body).toEqual({ p_limit: 20, p_templates: ['phone_otp'] });
    const done = clientAnswering(204, null);
    await svcCompleteNotification(done.client, { id: 'n-1', providerMessageId: 'wamid.1' });
    await svcFailNotification(done.client, {
      id: 'n-1',
      errorCode: 'network',
      error: 'x',
      isPermanent: false,
    });
    expect(done.requests.map((request) => request.url)).toEqual([
      'http://supabase.test/rest/v1/rpc/svc_complete_notification',
      'http://supabase.test/rest/v1/rpc/svc_fail_notification',
    ]);
  });
});

describe('svcCreateBooking', () => {
  const BOOKING_ID = '0192f3a4-5b6c-7d8e-9f01-0000000000bb';
  // The UUID the wizard draws once per mount.
  const WIZARD_MOUNT = '7d444840-9dc0-11d1-b245-5ffdce74fad2';
  const REQUEST = {
    packageId: '0192f3a4-5b6c-7d8e-9f01-000000000001',
    sessionIds: ['0192f3a4-5b6c-7d8e-9f01-000000000005'],
    pax: 30,
    booker: {
      bookerType: 'school' as const,
      institutionName: 'SD Negeri Gisikdrono 01',
      picName: 'Ani Lestari',
      picPhone: '+6281234567890',
      picEmail: 'ani@sekolah.sch.id',
      notes: null,
    },
    addons: [{ productId: '0192f3a4-5b6c-7d8e-9f01-0000000000a1', qty: 30, notes: null }],
    participants: [{ fullName: 'Budi Santoso', groupLabel: '5A', roleLabel: 'student' as const }],
    mode: 'pay' as const,
    idempotencyKey: WIZARD_MOUNT,
    otpId: OTP_ID,
    consent: { version: '2026-10-18', guardianConsent: true },
    clientIp: '203.0.113.7',
    userAgent: 'Mozilla/5.0',
    quoteHash: 'f'.repeat(64),
  };

  it('sends the booking in the shape internal.create_booking takes, the PIC from the request', async () => {
    const { client, requests } = clientAnswering(200, {
      result: 'created',
      booking_id: BOOKING_ID,
      booking_code: 'GSK-7F3K9Q2M',
      status: 'pending_payment',
      expires_at: '2026-10-23T08:00:00+00:00',
      visit_date: '2026-11-12',
      visit_date_end: '2026-11-12',
    });
    await expect(svcCreateBooking(client, REQUEST)).resolves.toEqual({
      result: 'created',
      bookingId: BOOKING_ID,
      bookingCode: 'GSK-7F3K9Q2M',
      status: 'pending_payment',
      expiresAt: '2026-10-23T08:00:00+00:00',
      visitDate: '2026-11-12',
      visitDateEnd: '2026-11-12',
    });
    expect(requests[0]).toEqual({
      url: 'http://supabase.test/rest/v1/rpc/svc_create_booking',
      body: {
        p_package_id: REQUEST.packageId,
        p_session_ids: REQUEST.sessionIds,
        p_pax: 30,
        p_booker: {
          booker_type: 'school',
          institution_name: 'SD Negeri Gisikdrono 01',
          pic_name: 'Ani Lestari',
          pic_phone: '+6281234567890',
          pic_email: 'ani@sekolah.sch.id',
          notes: null,
        },
        p_addons: [{ product_id: '0192f3a4-5b6c-7d8e-9f01-0000000000a1', qty: 30, notes: null }],
        p_participants: [{ full_name: 'Budi Santoso', group_label: '5A', role_label: 'student' }],
        p_mode: 'pay',
        p_idempotency_key: REQUEST.idempotencyKey,
        p_otp_id: OTP_ID,
        // The guardian's consent goes with the participant list (review of PR #27, L4).
        p_consent: { version: '2026-10-18', guardian_consent: true },
        p_client_meta: { ip: '203.0.113.7', user_agent: 'Mozilla/5.0' },
        p_quote_hash: 'f'.repeat(64),
      },
    });
  });

  it('reads a quotation, a duplicate and a pay-to-confirm', async () => {
    const quoted = {
      result: 'existing',
      booking_id: BOOKING_ID,
      booking_code: 'GSK-7F3K9Q2M',
      status: 'quoted',
      expires_at: null,
      visit_date: '2026-11-12',
      visit_date_end: '2026-11-12',
    };
    await expect(
      svcCreateBooking(clientAnswering(200, quoted).client, REQUEST),
    ).resolves.toMatchObject({
      result: 'existing',
      status: 'quoted',
      expiresAt: null,
    });
    await expect(
      svcCreateBooking(clientAnswering(200, { ...quoted, result: 'duplicate' }).client, REQUEST),
    ).resolves.toMatchObject({ result: 'duplicate', bookingCode: 'GSK-7F3K9Q2M' });
    await expect(
      svcCreateBooking(clientAnswering(200, { result: 'pay_to_confirm' }).client, REQUEST),
    ).resolves.toEqual({ result: 'pay_to_confirm' });
  });

  it.each(['paid', 'expired', 'cancelled'])(
    'reads a replay of a booking that is %s by now, as it is (independent review of PR #26, L6)',
    async (status) => {
      const replay = {
        result: 'existing',
        booking_id: BOOKING_ID,
        booking_code: 'GSK-7F3K9Q2M',
        status,
        expires_at: null,
        visit_date: '2026-11-12',
        visit_date_end: '2026-11-12',
      };
      await expect(
        svcCreateBooking(clientAnswering(200, replay).client, REQUEST),
      ).resolves.toMatchObject({
        result: 'existing',
        status,
      });
    },
  );

  it('refuses a reply of another shape', async () => {
    const { client } = clientAnswering(200, { result: 'created', booking_code: 'GSK-1' });
    await expect(svcCreateBooking(client, REQUEST)).rejects.toBeInstanceOf(ZodError);
  });
});
