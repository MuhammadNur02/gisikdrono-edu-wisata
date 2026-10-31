import { describe, expect, it } from 'vitest';

import type { MessageHistoryEntry } from '@/types/booking-staff';

import { resendOptionsFor } from './booking-resend-options';
import { officerBookingDetail } from '../../../tests/fixtures/booking-detail';

// The messages the "Kirim pesan" sheet offers, by request_notification_resend's rules (20261105175000).

const NOW = new Date('2026-10-30T05:00:00Z');
const PAY_LINK_SENT: MessageHistoryEntry = {
  template: 'booking_created',
  channel: 'email',
  status: 'sent',
  createdAt: '2026-10-29T03:01:00.000Z',
};
const webHold = { ...officerBookingDetail, channel: 'web' as const, bookerType: 'school' as const };

describe('resendOptionsFor', () => {
  it('offers a first payment reminder on both channels to a web hold that waits for its payment', () => {
    expect(resendOptionsFor(webHold, [], NOW)).toEqual([
      {
        template: 'payment_reminder',
        channels: [
          { channel: 'whatsapp', lastQueuedAt: null },
          { channel: 'email', lastQueuedAt: null },
        ],
      },
    ]);
  });

  it("offers an officer's hold no reminder before its pay link was sent", () => {
    const queuedOnly = { ...PAY_LINK_SENT, status: 'queued' as const };
    expect(resendOptionsFor(officerBookingDetail, [queuedOnly], NOW)).toEqual([
      {
        template: 'booking_created',
        channels: [{ channel: 'email', lastQueuedAt: queuedOnly.createdAt }],
      },
    ]);
  });

  it("offers the pay link again and a first reminder once an officer's pay link went out", () => {
    const options = resendOptionsFor(officerBookingDetail, [PAY_LINK_SENT], NOW);
    expect(options.map((option) => option.template)).toEqual([
      'booking_created',
      'payment_reminder',
    ]);
    expect(options[1]?.channels).toEqual([
      { channel: 'whatsapp', lastQueuedAt: null },
      { channel: 'email', lastQueuedAt: null },
    ]);
  });

  it('names the latest time a message was queued on each channel', () => {
    const reminders: MessageHistoryEntry[] = [
      {
        template: 'payment_reminder',
        channel: 'email',
        status: 'sent',
        createdAt: '2026-10-29T08:00:00.000Z',
      },
      {
        template: 'payment_reminder',
        channel: 'email',
        status: 'failed',
        createdAt: '2026-10-29T10:00:00.000Z',
      },
    ];
    expect(resendOptionsFor(webHold, reminders, NOW)).toEqual([
      {
        template: 'payment_reminder',
        channels: [
          { channel: 'whatsapp', lastQueuedAt: null },
          { channel: 'email', lastQueuedAt: '2026-10-29T10:00:00.000Z' },
        ],
      },
    ]);
  });

  it('offers no first reminder to a hold under review, past its deadline, or without a deadline', () => {
    expect(resendOptionsFor({ ...webHold, needsReview: true }, [], NOW)).toEqual([]);
    expect(
      resendOptionsFor({ ...webHold, expiresAt: '2026-10-30T05:00:00.000Z' }, [], NOW),
    ).toEqual([]);
    expect(resendOptionsFor({ ...webHold, expiresAt: null }, [], NOW)).toEqual([]);
  });

  it('still offers a reminder sent before, as the RPC sends it again', () => {
    const sent: MessageHistoryEntry = {
      template: 'payment_reminder',
      channel: 'email',
      status: 'sent',
      createdAt: '2026-10-29T08:00:00.000Z',
    };
    expect(resendOptionsFor({ ...webHold, needsReview: true }, [sent], NOW)).toEqual([
      {
        template: 'payment_reminder',
        channels: [{ channel: 'email', lastQueuedAt: sent.createdAt }],
      },
    ]);
  });

  it('offers only messages the booking had and still fits, never a first ticket', () => {
    const paid = { ...webHold, status: 'paid' as const };
    const history: MessageHistoryEntry[] = [
      { ...PAY_LINK_SENT },
      {
        template: 'payment_received_ticket',
        channel: 'whatsapp',
        status: 'read',
        createdAt: '2026-10-29T09:00:00.000Z',
      },
    ];
    expect(resendOptionsFor(paid, history, NOW)).toEqual([
      {
        template: 'payment_received_ticket',
        channels: [{ channel: 'whatsapp', lastQueuedAt: '2026-10-29T09:00:00.000Z' }],
      },
    ]);
  });

  it('leaves out WhatsApp for an unverified number and email for a booking without an address', () => {
    expect(resendOptionsFor({ ...webHold, isPhoneVerified: false }, [], NOW)[0]?.channels).toEqual([
      { channel: 'email', lastQueuedAt: null },
    ]);
    expect(
      resendOptionsFor({ ...webHold, isPhoneVerified: false, emailMasked: null }, [], NOW),
    ).toEqual([]);
  });
});
