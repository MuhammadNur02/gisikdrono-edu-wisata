import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';

import {
  dsrClose,
  dsrOpen,
  dsrRecordExport,
  svcConfirmDsrIdentity,
  svcIssueDsrIdentityOtp,
} from '@/db/rpc-dsr';

import { clientAnswering } from '../../tests/fixtures/postgrest-client';

const BOOKING_ID = '0192f3a4-5b6c-7d8e-9f01-0000000000bb';
const REQUEST_ID = '0192f3a4-5b6c-7d8e-9f01-0000000000d5';
const RPC = 'http://supabase.test/rest/v1/rpc';

describe('dsrOpen', () => {
  it('sends the booking, the kind and the reason, never a phone number', async () => {
    const { client, requests } = clientAnswering(200, { request_id: REQUEST_ID, notified: true });
    await expect(
      dsrOpen(client, {
        bookingId: BOOKING_ID,
        requestType: 'access',
        reason: 'Diminta lewat telepon',
      }),
    ).resolves.toEqual({ requestId: REQUEST_ID, isGuestNotified: true });
    expect(requests[0]).toEqual({
      url: `${RPC}/dsr_open`,
      body: {
        p_booking_id: BOOKING_ID,
        p_request_type: 'access',
        p_reason: 'Diminta lewat telepon',
      },
    });
  });

  it('refuses a reply of another shape', async () => {
    const { client } = clientAnswering(200, {
      request_id: REQUEST_ID,
      notified: true,
      phone: '+62',
    });
    await expect(
      dsrOpen(client, {
        bookingId: BOOKING_ID,
        requestType: 'access',
        reason: 'Diminta lewat telepon',
      }),
    ).rejects.toBeInstanceOf(ZodError);
  });
});

describe('the finishing steps', () => {
  it('record the export by its two paths and read whether the guest was told', async () => {
    const { client, requests } = clientAnswering(200, { stage: 'completed', notified: false });
    const paths = { jsonPath: 'bookings/b/dsr/r.json', pdfPath: 'bookings/b/dsr/r.pdf' };
    await expect(
      dsrRecordExport(client, { requestId: REQUEST_ID, note: 'Dikirim lewat WhatsApp', ...paths }),
    ).resolves.toEqual({ isCompleted: true, isGuestNotified: false });
    expect(requests[0]?.body).toEqual({
      p_request_id: REQUEST_ID,
      p_json_path: paths.jsonPath,
      p_pdf_path: paths.pdfPath,
      p_note: 'Dikirim lewat WhatsApp',
    });
  });

  it('read a refusal as not completed', async () => {
    const { client } = clientAnswering(200, { stage: 'rejected', notified: true });
    await expect(
      dsrClose(client, {
        requestId: REQUEST_ID,
        outcome: 'rejected_other',
        note: 'Data tidak ditemukan',
      }),
    ).resolves.toEqual({ isCompleted: false, isGuestNotified: true });
  });
});

describe('the guest’s code', () => {
  const otp = {
    bookingId: BOOKING_ID,
    otpId: REQUEST_ID,
    browserHash: 'b'.repeat(64),
    codeHash: 'c'.repeat(64),
    code: '123456',
    ip: null,
  };

  it.each([
    ['sent', 'sent'],
    ['none', 'none'],
    ['degraded', 'unavailable'],
    ['unavailable', 'unavailable'],
    ['phone_limited', 'limited'],
  ])('reads issue_phone_otp’s %s as %s', async (result, expected) => {
    const { client } = clientAnswering(200, { result });
    await expect(svcIssueDsrIdentityOtp(client, otp)).resolves.toBe(expected);
  });

  it.each([
    ['verified', 'verified'],
    ['wrong_code', 'wrong_code'],
    ['locked', 'locked'],
    ['not_found', 'expired'],
  ])('reads a check’s %s as %s', async (result, expected) => {
    const { client } = clientAnswering(200, { result });
    await expect(
      svcConfirmDsrIdentity(client, { bookingId: BOOKING_ID, browserHash: 'b', codeHash: 'c' }),
    ).resolves.toBe(expected);
  });
});
