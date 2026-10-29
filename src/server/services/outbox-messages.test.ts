import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { OutboxRow } from '@/db/rpc-outbox';
import type { DatabaseClient } from '@/db/rpc-result';
import { readGuestLink } from '@/lib/links/verify';
import type { OutgoingMessage } from '@/lib/notifications/types';
import { ticketWhatsAppDocument } from '@/server/services/document-service';

import { composeMessage } from './outbox-messages';

vi.mock('@/server/services/document-service', () => ({ ticketWhatsAppDocument: vi.fn() }));

const TICKET_DOCUMENT = {
  url: 'https://storage.example.test/signed/ticket.pdf?token=x',
  filename: 'ticket-GSK-7F3K9Q2M.pdf',
};

beforeEach(() => {
  vi.mocked(ticketWhatsAppDocument).mockReset().mockResolvedValue(TICKET_DOCUMENT);
});

const NOW = 1_790_000_000;
const SITE = 'http://127.0.0.1:3000';
const CODE = 'GSK-7F3K9Q2M';

const BOOKING = {
  booking_code: CODE,
  token_version: 3,
  email_verified_at: null as string | null,
  package_snapshot: { name: 'Eduwisata Ecowastreme' },
  visit_date: '2026-11-12',
  pax_count: 20,
  total_amount: 600000,
  expires_at: '2026-10-25T03:00:00+00:00',
  institution_name: 'SD Negeri 1' as string | null,
  booking_legs: [
    {
      leg_order: 1,
      status: 'reserved',
      rw_units: { name: 'RW 05 Ecowastreme' },
      visit_sessions: { session_date: '2026-11-12', start_time: '09:05:00', end_time: '10:05:00' },
    },
  ],
  quotations: [
    {
      quotation_number: 'SP/GSK/2026/10/0003',
      valid_until: '2026-11-01',
      issued_at: '2026-10-20T01:00:00Z',
    },
  ],
  payments: [{ refunded_amount: 100000 }, { refunded_amount: 50000 }],
};

// A combo's second leg, on the same day as the first.
const RW13_LEG = {
  leg_order: 2,
  status: 'reserved',
  rw_units: { name: 'RW 13 Kampung Budaya & Seni' },
  visit_sessions: { session_date: '2026-11-12', start_time: '13:00:00', end_time: '14:30:00' },
};

function clientWith(booking: Partial<typeof BOOKING> = {}) {
  const query = {
    select: () => query,
    eq: () => query,
    single: () => Promise.resolve({ data: { ...BOOKING, ...booking }, error: null }),
  };
  return { from: () => query } as unknown as DatabaseClient;
}

function row(overrides: Partial<OutboxRow>): OutboxRow {
  return {
    id: 'n-1',
    booking_id: '0192f3a4-5b6c-7d8e-9f01-23456789abcd',
    channel: 'whatsapp',
    template: 'booking_created',
    recipient: '+6281234567890',
    recipient_name: 'Ani',
    params: { link_scope: 'manage' },
    status: 'sending',
    attempts: 1,
    max_attempts: 8,
    dedupe_key: 'booking:x',
    document_path: null,
    next_attempt_at: '2026-10-21T00:00:00Z',
    locked_at: '2026-10-21T00:00:00Z',
    last_error_code: null,
    last_error: null,
    dead_at: null,
    provider_message_id: null,
    provider_status: null,
    sent_at: null,
    delivered_at: null,
    read_at: null,
    created_at: '2026-10-21T00:00:00Z',
    updated_at: '2026-10-21T00:00:00Z',
    ...overrides,
  };
}

async function messageFor(overrides: Partial<OutboxRow>, booking: Partial<typeof BOOKING> = {}) {
  const composed = await composeMessage(clientWith(booking), row(overrides), NOW);
  if (!composed.ok) throw new Error(`refused: ${composed.failure.errorCode}`);
  return composed.message;
}

async function scopeOf(message: OutgoingMessage) {
  const token = (message.link?.buttonSuffix ?? '').split('?t=')[1] ?? '';
  const reading = await readGuestLink(token, { bookingCode: CODE, nowSeconds: NOW });
  return reading.ok ? reading.link.s : null;
}

describe('composeMessage for a guest', () => {
  it('fills booking_created from the booking, shown the Indonesian way in the template order', async () => {
    const message = await messageFor({});
    expect(Object.keys(message.bodyParams)).toEqual([
      'name',
      'booking_code',
      'package',
      'date',
      'session',
      'pax',
      'total',
      'deadline',
    ]);
    expect(message.bodyParams).toMatchObject({
      name: 'Ani',
      package: 'Eduwisata Ecowastreme',
      date: 'Kamis, 12 November 2026',
      session: '09.05–10.05 WIB',
      pax: '20',
      deadline: '25 Okt 2026, 10.00 WIB',
    });
    expect(message.bodyParams.total).toMatch(/^Rp\s?600\.000$/);
  });

  it('sends the verified WhatsApp number a manage link to the pay page', async () => {
    const message = await messageFor({});
    expect(message.link?.url).toMatch(new RegExp(`^${SITE}/reservasi/${CODE}/bayar\\?t=`));
    expect(message.link?.buttonSuffix?.startsWith(`${CODE}/bayar?t=`)).toBe(true);
    await expect(scopeOf(message)).resolves.toBe('manage');
  });

  it('gives an email nobody confirmed a view link to the booking itself, never to pay or manage', async () => {
    const message = await messageFor({ channel: 'email', recipient: 'ani@contoh.test' });
    await expect(scopeOf(message)).resolves.toBe('view');
    expect(message.link?.url).toMatch(new RegExp(`^${SITE}/reservasi/${CODE}\\?t=`));
  });

  it('keeps the asked scope for a confirmed email', async () => {
    const message = await messageFor(
      { channel: 'email', recipient: 'ani@contoh.test' },
      { email_verified_at: '2026-10-20T01:00:00Z' },
    );
    await expect(scopeOf(message)).resolves.toBe('manage');
  });

  it('opens each message on its own page: the ticket, the review form', async () => {
    const ticket = await messageFor({
      template: 'payment_received_ticket',
      params: { link_scope: 'view' },
    });
    expect(ticket.link?.buttonSuffix?.startsWith(`${CODE}/tiket?t=`)).toBe(true);
    const review = await messageFor({
      template: 'review_invite',
      params: { link_scope: 'review' },
    });
    expect(review.link?.buttonSuffix?.startsWith(`${CODE}/ulasan?t=`)).toBe(true);
    await expect(scopeOf(review)).resolves.toBe('review');
  });

  it('carries the ticket PDF in the WhatsApp document header, signed as it is sent', async () => {
    const ticket = await messageFor({
      template: 'payment_received_ticket',
      params: { link_scope: 'view' },
    });
    expect(ticket.document).toEqual(TICKET_DOCUMENT);
    expect(ticketWhatsAppDocument).toHaveBeenCalledWith(
      expect.anything(),
      '0192f3a4-5b6c-7d8e-9f01-23456789abcd',
    );
  });

  it('sends the ticket email with its link only, never a file', async () => {
    const email = await messageFor({
      template: 'payment_received_ticket',
      channel: 'email',
      recipient: 'ani@contoh.test',
      params: { link_scope: 'view' },
    });
    expect(email.document).toBeUndefined();
    expect(ticketWhatsAppDocument).not.toHaveBeenCalled();
  });

  it('waits for the next try while the ticket file cannot be made', async () => {
    vi.mocked(ticketWhatsAppDocument).mockResolvedValue(null);
    const composed = await composeMessage(
      clientWith(),
      row({ template: 'payment_received_ticket', params: { link_scope: 'view' } }),
      NOW,
    );
    expect(composed).toMatchObject({
      ok: false,
      failure: { errorCode: 'ticket_pdf_unavailable', isPermanent: false },
    });
  });

  it('names each leg of a combo in its session, and the first RW as the gate', async () => {
    const message = await messageFor(
      { template: 'visit_reminder_d1', params: { link_scope: 'view' } },
      { booking_legs: [RW13_LEG, ...BOOKING.booking_legs] },
    );
    expect(message.bodyParams).toEqual({
      name: 'Ani',
      date: 'Kamis, 12 November 2026',
      session: 'RW 05 Ecowastreme 09.05–10.05 WIB, RW 13 Kampung Budaya & Seni 13.00–14.30 WIB',
      gate: 'RW 05 Ecowastreme',
    });
  });

  it('takes a quotation’s number from its row, and a refund’s amount from the payments', async () => {
    const quotation = await messageFor({
      template: 'quotation_ready',
      params: {
        link_scope: 'manage',
        quotation_number: 'SP/GSK/2026/10/0007',
        valid_until: '2026-11-03',
      },
    });
    expect(quotation.bodyParams).toMatchObject({
      quotation_number: 'SP/GSK/2026/10/0007',
      valid_until: 'Selasa, 3 November 2026',
    });
    const refund = await messageFor({ template: 'refund_processed', params: {} });
    expect(refund.bodyParams.amount).toMatch(/^Rp\s?150\.000$/);
    expect(refund.link).toBeNull();
  });

  it('says the amount of the one refund a message was queued for', async () => {
    const refund = await messageFor({
      template: 'refund_processed',
      params: { refund_amount: 40_000 },
    });
    expect(refund.bodyParams.amount).toMatch(/^Rp\s?40\.000$/);
  });

  it('points an expired booking at the catalogue, a fixed button with no suffix', async () => {
    const message = await messageFor({ template: 'booking_expired', params: {} });
    expect(message.link).toEqual({ url: `${SITE}/paket-wisata`, buttonSuffix: null });
  });

  it('refuses a message whose button has no link scope, or whose booking gives no valid parameters', async () => {
    await expect(
      composeMessage(clientWith(), row({ template: 'certificate_ready', params: {} }), NOW),
    ).resolves.toMatchObject({ ok: false, failure: { errorCode: 'bad_params' } });
    await expect(
      composeMessage(
        clientWith({ institution_name: null }),
        row({ template: 'checked_in_thanks', params: {} }),
        NOW,
      ),
    ).resolves.toMatchObject({ ok: false, failure: { errorCode: 'bad_params' } });
  });
});

describe('composeMessage for staff', () => {
  it('writes the superadmin’s copy from what notify_staff stored, with its dashboard link', async () => {
    const message = await messageFor({
      booking_id: null,
      channel: 'email',
      template: 'admin_new_paid_booking',
      params: {
        booking_code: CODE,
        institution: 'SD Negeri 1',
        visit_date: '2026-11-12',
        pax: 20,
        total: 600000,
      },
    });
    expect(message.bodyParams).toMatchObject({
      booking_code: CODE,
      visit_date: 'Kamis, 12 November 2026',
    });
    expect(message.link).toEqual({ url: `${SITE}/dashboard`, buttonSuffix: null });
  });

  it('leaves the total out of an RW admin’s copy, which never had one', async () => {
    const message = await messageFor({
      booking_id: null,
      channel: 'email',
      template: 'admin_booking_needs_review',
      params: {
        booking_code: CODE,
        rw_name: 'RW 05 Ecowastreme',
        visit_date: '2026-11-12',
        pax: 20,
        reason: 'REVENUE_RULE_REFUSED',
      },
    });
    expect(Object.keys(message.bodyParams)).not.toContain('total');
    expect(message.bodyParams.reason).toBe('REVENUE_RULE_REFUSED');
  });

  it('fills a security alert from its row and refuses one it cannot read', async () => {
    const message = await messageFor({
      booking_id: null,
      channel: 'email',
      template: 'security_alert',
      params: { severity: 'high', rule: 'payment_review', time: '2026-10-24T03:00:00+00:00' },
    });
    expect(message.bodyParams).toEqual({
      severity: 'high',
      rule: 'payment_review',
      time: '24 Okt 2026, 10.00 WIB',
    });
    await expect(
      composeMessage(
        clientWith(),
        row({ booking_id: null, template: 'security_alert', params: {} }),
        NOW,
      ),
    ).resolves.toMatchObject({ ok: false, failure: { errorCode: 'bad_params' } });
  });
});
