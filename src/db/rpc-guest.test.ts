import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';

import {
  svcClaimNotifications,
  svcCompleteNotification,
  svcFailNotification,
} from '@/db/rpc-outbox';
import type { Database } from '@/db/types';

import {
  svcIssuePhoneOtp,
  svcResendBookingLink,
  svcRevokeGuestLinks,
  svcVerifyPhoneOtp,
} from './rpc-guest';

// A real typed client whose fetch records each request and answers with a canned PostgREST reply.
function clientAnswering(status: number, reply: unknown) {
  const requests: { url: string; body: unknown }[] = [];
  const fakeFetch: typeof fetch = (input, init) => {
    const url = input instanceof Request ? input.url : input.toString();
    requests.push({ url, body: typeof init?.body === 'string' ? JSON.parse(init.body) : null });
    const payload = status === 204 ? null : JSON.stringify(reply);
    return Promise.resolve(
      new Response(payload, { status, headers: { 'Content-Type': 'application/json' } }),
    );
  };
  const client = createClient<Database>('http://supabase.test', 'test-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: fakeFetch },
  });
  return { client, requests };
}

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
