import { randomInt } from 'node:crypto';

import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import type { Database } from '@/db/types';
import type { NotificationProviders, OutgoingMessage } from '@/lib/notifications/types';
import {
  issuePhoneOtp,
  resendBookingLink,
  revokeGuestLinks,
  verifyGuestAccess,
  verifyPhoneOtp,
} from '@/server/services/booking-service';
import { processNotifications } from '@/server/services/notification-service';

import { localStack, runSql, sqlText } from '../../scripts/local-stack';

// The guest identity flow against the real database of the local stack (Task P3.2, P3.3): a code issued through
// booking-service, delivered by the outbox worker to a recording provider, checked once; and a lookup that sends a
// link the worker mints, which opens the booking until its links are revoked.
vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient: () =>
    createClient<Database>(localStack().apiUrl, localStack().serviceRoleKey, {
      auth: { persistSession: false },
    }),
}));

const PACKAGE_ID = '00000000-0000-4000-9000-0000000e0001';
const BOOKING_ID = '00000000-0000-4000-9000-0000000e0002';
const BOOKING_CODE = 'GSK-1NTEGRA7';
// A fresh number per run, so the daily cap of five codes never carries over from an earlier run.
const OTP_PHONE = `+62812${String(randomInt(1_000_000, 9_999_999))}`;
const BOOKING_PHONE = `+62813${String(randomInt(1_000_000, 9_999_999))}`;
const CLIENT_IP = '203.0.113.50';

function adminClient() {
  return createClient<Database>(localStack().apiUrl, localStack().serviceRoleKey, {
    auth: { persistSession: false },
  });
}

function recordingProviders() {
  const sent: OutgoingMessage[] = [];
  const provider = {
    send: (message: OutgoingMessage) => {
      sent.push(message);
      return Promise.resolve({
        ok: true as const,
        providerMessageId: `test-${message.notificationId}`,
      });
    },
  };
  const providers: NotificationProviders = { whatsapp: provider, email: provider };
  return { providers, sent };
}

const nowSeconds = () => Math.floor(Date.now() / 1000);

beforeAll(async () => {
  await runSql(`update public.site_settings set value = 'true' where key in ('whatsapp_enabled', 'email_enabled');
    insert into public.tour_packages (id, rw_id, category, slug, name, tagline, duration_minutes, price_per_pax, status)
    values ('${PACKAGE_ID}', 5, 'student', 'uji-integrasi-tamu', 'Paket Uji Tamu', 'Uji', 120, 25000, 'published')
    on conflict (id) do nothing;
    insert into public.bookings (id, booking_code, status, package_id, package_snapshot, rw_ids, booker_type, pic_name,
      pic_phone, pic_email, phone_verified_at, pax_count, visit_date, visit_date_end, subtotal_package, total_amount,
      consent_version, consented_at)
    values ('${BOOKING_ID}', '${BOOKING_CODE}', 'quoted', '${PACKAGE_ID}', '{}', '{5}', 'school', 'Ani Lestari',
      ${sqlText(BOOKING_PHONE)}, 'ani.integrasi@example.test', now(), 10, public.today_jkt() + 30,
      public.today_jkt() + 30, 250000, 250000, 'v1', now());`);
});

afterAll(async () => {
  await runSql(`select set_config('app.purge', 'on', true);
    delete from public.notifications where booking_id = '${BOOKING_ID}'
      or recipient in (${sqlText(OTP_PHONE)}, ${sqlText(BOOKING_PHONE)});
    delete from public.guest_otps where phone = ${sqlText(OTP_PHONE)};
    delete from public.audit_logs where entity_id = '${BOOKING_ID}';
    delete from public.bookings where id = '${BOOKING_ID}';
    delete from public.tour_packages where id = '${PACKAGE_ID}';`);
});

describe('a WhatsApp code, end to end', () => {
  it('is delivered once with its code, leaves the outbox without it, and opens once', async () => {
    const issued = await issuePhoneOtp({
      channel: 'whatsapp',
      phone: OTP_PHONE,
      email: null,
      clientIp: CLIENT_IP,
    });
    if (issued.status !== 'sent') throw new Error(`expected a code, got ${issued.status}`);

    const { providers, sent } = recordingProviders();
    await processNotifications(adminClient(), providers);
    const message = sent.find((candidate) => candidate.recipient === OTP_PHONE);
    const code = String(message?.bodyParams.code ?? '');
    expect(code).toMatch(/^\d{6}$/);

    const { data: row } = await adminClient()
      .from('notifications')
      .select('status, params')
      .eq('dedupe_key', `otp:${issued.otpId}`)
      .single();
    expect(row).toEqual({ status: 'sent', params: {} });

    const wrongCode = code === '000000' ? '000001' : '000000';
    expect(await verifyPhoneOtp({ otpId: issued.otpId, code: wrongCode })).toEqual({
      status: 'wrong_code',
      attemptsLeft: 4,
    });
    expect(await verifyPhoneOtp({ otpId: issued.otpId, code })).toEqual({
      status: 'verified',
      phone: OTP_PHONE,
      email: null,
    });
    expect(await verifyPhoneOtp({ otpId: issued.otpId, code })).toEqual({ status: 'invalid' });
  });

  it('refuses a second code for the same number within the minute', async () => {
    const again = await issuePhoneOtp({
      channel: 'whatsapp',
      phone: OTP_PHONE,
      email: null,
      clientIp: CLIENT_IP,
    });
    expect(again.status).toBe('cooldown');
  });
});

describe('a link sent again from /reservasi/cari', () => {
  let token = '';

  it('goes only to the matching booking’s verified number, as a manage link', async () => {
    expect(await resendBookingLink({ bookingCode: BOOKING_CODE, contact: '+6281299999999' })).toBe(
      'no_match',
    );
    expect(await resendBookingLink({ bookingCode: BOOKING_CODE, contact: BOOKING_PHONE })).toBe(
      'queued',
    );

    const { providers, sent } = recordingProviders();
    await processNotifications(adminClient(), providers);
    const message = sent.find((candidate) => candidate.recipient === BOOKING_PHONE);
    expect(message?.template).toBe('booking_link');
    expect(message?.bodyParams).toEqual({ name: 'Ani', booking_code: BOOKING_CODE });
    token = message?.link?.buttonSuffix.split('?t=')[1] ?? '';
    expect(token).not.toBe('');
    expect(message?.link?.url).not.toContain(BOOKING_ID);
  });

  it('opens the booking for the scopes a manage link grants', async () => {
    const access = await verifyGuestAccess({
      bookingCode: BOOKING_CODE,
      token,
      required: 'view',
      clientIp: CLIENT_IP,
      nowSeconds: nowSeconds(),
    });
    expect(access).toEqual({ bookingId: BOOKING_ID, bookingCode: BOOKING_CODE, scope: 'manage' });
  });

  it('stops opening it once the links are revoked', async () => {
    await revokeGuestLinks(BOOKING_ID);
    await expect(
      verifyGuestAccess({
        bookingCode: BOOKING_CODE,
        token,
        required: 'view',
        clientIp: CLIENT_IP,
        nowSeconds: nowSeconds(),
      }),
    ).resolves.toBeNull();
  });
});
