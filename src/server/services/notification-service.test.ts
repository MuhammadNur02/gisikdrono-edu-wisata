import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { OutboxRow } from '@/db/rpc-outbox';
import type { DatabaseClient } from '@/db/rpc-result';
import { readGuestLink } from '@/lib/links/verify';
import type { NotificationProviders, OutgoingMessage, SendResult } from '@/lib/notifications/types';

import { processNotifications } from './notification-service';

const outbox = vi.hoisted(() => ({
  claimed: [] as unknown[],
  completed: [] as unknown[],
  failed: [] as unknown[],
}));

vi.mock('@/lib/supabase/admin', () => ({ createSupabaseAdminClient: () => ({}) }));

vi.mock('@/db/rpc-outbox', () => ({
  svcClaimNotifications: vi.fn(() => Promise.resolve(outbox.claimed)),
  svcCompleteNotification: vi.fn((_client: unknown, sent: unknown) => {
    outbox.completed.push(sent);
    return Promise.resolve();
  }),
  svcFailNotification: vi.fn((_client: unknown, failure: unknown) => {
    outbox.failed.push(failure);
    return Promise.resolve();
  }),
}));

const NOW = 1_790_000_000;
const BOOKING_ID = '0192f3a4-5b6c-7d8e-9f01-23456789abcd';

function row(overrides: Partial<OutboxRow>): OutboxRow {
  return {
    id: 'n-1',
    booking_id: null,
    channel: 'whatsapp',
    template: 'phone_otp',
    recipient: '+6281234567890',
    recipient_name: null,
    params: { code: '482913' },
    status: 'sending',
    attempts: 1,
    max_attempts: 8,
    dedupe_key: 'otp:x',
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

// The one read the worker makes besides the outbox: the booking a guest message names, as outbox-messages.ts selects
// it. A test names only what it cares about.
const BOOKING_ROW = {
  booking_code: 'GSK-7F3K9Q2M',
  token_version: 1,
  email_verified_at: null,
  package_snapshot: { name: 'Eduwisata Ecowastreme' },
  visit_date: '2026-11-12',
  pax_count: 20,
  total_amount: 600000,
  expires_at: '2026-10-25T03:00:00+00:00',
  institution_name: 'SD Negeri 1',
  booking_legs: [
    {
      leg_order: 1,
      status: 'reserved',
      rw_units: { name: 'RW 05 Ecowastreme' },
      visit_sessions: {
        session_date: '2026-11-12',
        start_time: '09:05:00',
        end_time: '10:05:00',
        weather_notices: null,
      },
    },
  ],
  quotations: [],
  payments: [{ refunded_amount: 0 }],
};

function adminClientWith(booking: Partial<typeof BOOKING_ROW> | null) {
  const single = () =>
    Promise.resolve(
      booking
        ? { data: { ...BOOKING_ROW, ...booking }, error: null }
        : { data: null, error: { code: 'PGRST116' } },
    );
  const query = { select: () => query, eq: () => query, single };
  return { from: () => query } as unknown as DatabaseClient;
}

function recordingProviders(answer: SendResult = { ok: true, providerMessageId: 'wamid.1' }) {
  const sent: OutgoingMessage[] = [];
  const provider = {
    send: (message: OutgoingMessage) => {
      sent.push(message);
      return Promise.resolve(answer);
    },
  };
  const providers: NotificationProviders = { whatsapp: provider, email: provider };
  return { providers, sent };
}

describe('processNotifications', () => {
  beforeEach(() => {
    outbox.claimed = [];
    outbox.completed = [];
    outbox.failed = [];
  });

  it('sends an OTP with its code and marks it sent', async () => {
    outbox.claimed = [row({})];
    const { providers, sent } = recordingProviders();
    await expect(processNotifications(adminClientWith(null), providers, NOW)).resolves.toEqual({
      processed: 1,
      failed: 0,
    });
    expect(sent[0]).toMatchObject({
      template: 'phone_otp',
      bodyParams: { code: '482913' },
      link: null,
    });
    expect(outbox.completed).toEqual([{ id: 'n-1', providerMessageId: 'wamid.1' }]);
  });

  it('mints the link a booking_link carries from the booking code, scope and current token_version', async () => {
    outbox.claimed = [
      row({
        id: 'n-2',
        template: 'booking_link',
        booking_id: BOOKING_ID,
        recipient_name: 'Ani',
        params: { link_scope: 'manage' },
      }),
    ];
    const { providers, sent } = recordingProviders();
    await processNotifications(
      adminClientWith({ booking_code: 'GSK-7F3K9Q2M', token_version: 4 }),
      providers,
      NOW,
    );
    const message = sent[0];
    expect(message?.bodyParams).toEqual({ name: 'Ani', booking_code: 'GSK-7F3K9Q2M' });
    expect(message?.link?.url).toMatch(/^http:\/\/127\.0\.0\.1:3000\/reservasi\/GSK-7F3K9Q2M\?t=/);
    const token = (message?.link?.buttonSuffix ?? '').split('?t=')[1] ?? '';
    await expect(
      readGuestLink(token, { bookingCode: 'GSK-7F3K9Q2M', nowSeconds: NOW }),
    ).resolves.toMatchObject({
      ok: true,
      link: { s: 'manage', v: 4 },
    });
  });

  it('greets a name the template refuses as Bapak/Ibu rather than not at all', async () => {
    outbox.claimed = [
      row({
        template: 'booking_link',
        booking_id: BOOKING_ID,
        recipient_name: 'cek 08123456789',
        params: { link_scope: 'view' },
      }),
    ];
    const { providers, sent } = recordingProviders();
    await processNotifications(
      adminClientWith({ booking_code: 'GSK-7F3K9Q2M', token_version: 1 }),
      providers,
      NOW,
    );
    expect(sent[0]?.bodyParams.name).toBe('Bapak/Ibu');
  });

  it('records a provider refusal with the provider’s verdict on retrying', async () => {
    outbox.claimed = [row({})];
    const refusal: SendResult = {
      ok: false,
      errorCode: 'meta_131026',
      error: 'refused',
      isPermanent: true,
    };
    const { providers } = recordingProviders(refusal);
    await expect(processNotifications(adminClientWith(null), providers, NOW)).resolves.toEqual({
      processed: 1,
      failed: 1,
    });
    expect(outbox.failed).toEqual([
      { id: 'n-1', errorCode: 'meta_131026', error: 'refused', isPermanent: true },
    ]);
  });

  it('gives up at once on a message it cannot fill', async () => {
    outbox.claimed = [
      row({ id: 'no-code', params: {} }),
      row({ id: 'no-scope', template: 'booking_link', booking_id: BOOKING_ID, params: {} }),
      row({ id: 'no-booking', template: 'review_invite', params: { link_scope: 'review' } }),
    ];
    const { providers, sent } = recordingProviders();
    await processNotifications(adminClientWith({}), providers, NOW);
    expect(sent).toEqual([]);
    // The batch is sent concurrently, so the failures arrive in any order.
    expect(outbox.failed).toEqual(
      expect.arrayContaining(
        ['no-code', 'no-scope', 'no-booking'].map((id): unknown =>
          expect.objectContaining({ id, errorCode: 'bad_params', isPermanent: true }),
        ),
      ),
    );
    expect(outbox.failed).toHaveLength(3);
  });

  it('hands a reminder of a day no longer visited to the outbox as stale_day, which cancels it', async () => {
    outbox.claimed = [
      row({
        template: 'visit_reminder_d1',
        booking_id: BOOKING_ID,
        channel: 'email',
        params: { link_scope: 'view', session_date: '2026-11-13' },
      }),
    ];
    const { providers, sent } = recordingProviders();
    await processNotifications(adminClientWith({}), providers, NOW);
    expect(sent).toEqual([]);
    expect(outbox.failed).toEqual([expect.objectContaining({ errorCode: 'stale_day' })]);
  });

  it('retries a message whose booking could not be read', async () => {
    outbox.claimed = [
      row({ template: 'booking_link', booking_id: BOOKING_ID, params: { link_scope: 'view' } }),
    ];
    const { providers, sent } = recordingProviders();
    await processNotifications(adminClientWith(null), providers, NOW);
    expect(sent).toEqual([]);
    expect(outbox.failed).toEqual([
      expect.objectContaining({ errorCode: 'compose_failed', isPermanent: false }),
    ]);
  });
});
