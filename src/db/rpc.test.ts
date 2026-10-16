import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';

import type { Database } from '@/db/types';
import { mapError } from '@/lib/errors';

import {
  resetStaffMfa,
  setStaffRole,
  svcEnqueueNotification,
  svcLogAudit,
  svcRateLimitHit,
} from './rpc';

// A real typed client whose fetch records each request and answers with a canned PostgREST reply,
// so these tests see exactly what goes over the wire.
function clientAnswering(status: number, reply: unknown) {
  const requests: { url: string; body: unknown }[] = [];
  const fakeFetch: typeof fetch = (input, init) => {
    const url = input instanceof Request ? input.url : input.toString();
    const body: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : null;
    requests.push({ url, body });
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

const STAFF_ID = '00000000-0000-4000-8000-000000000002';

describe('rpc wrappers', () => {
  it('calls the RPC by name with p_ parameters', async () => {
    const { client, requests } = clientAnswering(200, true);
    await expect(
      svcRateLimitHit(client, { key: 'otp:abc', limit: 5, windowSeconds: 86400 }),
    ).resolves.toBe(true);
    expect(requests).toEqual([
      {
        url: 'http://supabase.test/rest/v1/rpc/svc_rate_limit_hit',
        body: { p_key: 'otp:abc', p_limit: 5, p_window_seconds: 86400 },
      },
    ]);
  });

  it('leaves out an RW for a role that has none, so the SQL default applies', async () => {
    const { client, requests } = clientAnswering(200, { stage: 'applied' });
    await expect(
      setStaffRole(client, { userId: STAFF_ID, role: 'none', rwId: null }),
    ).resolves.toEqual({ stage: 'applied' });
    expect(requests[0]?.body).toEqual({ p_user_id: STAFF_ID, p_role: 'none' });
  });

  it('logs a visitor event without an actor', async () => {
    const { client, requests } = clientAnswering(204, null);
    await svcLogAudit(client, {
      actorId: null,
      action: 'booking.access_link_resent',
      entityType: 'bookings',
      entityId: 'b1',
      metadata: {},
    });
    expect(requests[0]?.body).toEqual({
      p_action: 'booking.access_link_resent',
      p_entity_type: 'bookings',
      p_entity_id: 'b1',
      p_metadata: {},
    });
  });

  it('returns null for a message the outbox skipped', async () => {
    const { client } = clientAnswering(200, null);
    await expect(
      svcEnqueueNotification(client, {
        bookingId: 'b1',
        template: 'booking_created',
        channel: 'whatsapp',
        params: {},
      }),
    ).resolves.toBeNull();
  });

  it('turns a delayed staff change reply into camelCase', async () => {
    const { client } = clientAnswering(200, {
      stage: 'requested',
      completes_after: '2026-10-17T09:00:00+00:00',
      lapses_after: '2026-10-23T09:00:00+00:00',
    });
    await expect(resetStaffMfa(client, STAFF_ID)).resolves.toEqual({
      stage: 'requested',
      completesAfter: '2026-10-17T09:00:00+00:00',
      lapsesAfter: '2026-10-23T09:00:00+00:00',
    });
  });

  it('refuses a reply it does not recognise', async () => {
    const { client } = clientAnswering(200, { stage: 'pending' });
    await expect(resetStaffMfa(client, STAFF_ID)).rejects.toThrow();
  });

  it('throws the PostgREST error so mapError reads its hint', async () => {
    const { client } = clientAnswering(400, {
      code: 'P0001',
      hint: 'RATE_LIMITED',
      message: 'too many UI events this hour',
      details: null,
    });
    const failure = await svcRateLimitHit(client, { key: 'k', limit: 1, windowSeconds: 60 }).catch(
      (error: unknown) => error,
    );
    expect((await mapError(failure)).error.code).toBe('RATE_LIMITED');
  });
});
