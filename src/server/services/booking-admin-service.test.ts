import { createClient } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Database } from '@/db/types';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { loadListQuery } from '@/lib/utils/list-query';
import {
  listBookingsForStaff,
  revealBookingContact,
  saveAdminNotes,
  setAddonFulfillment,
} from '@/server/services/booking-admin-service';

vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: vi.fn() }));

const BOOKING_ID = '0192f3a4-5b6c-7d8e-9f01-0000000000bb';
const ADDON_ID = '0192f3a4-5b6c-7d8e-9f01-0000000000cc';

interface RecordedCall {
  method: string;
  path: string;
  search: string;
  body?: string;
}

// The staff member's session client, played by a fetch that records every request and answers with `answer`.
function sessionAnswering(answer: () => Response): RecordedCall[] {
  const calls: RecordedCall[] = [];
  const client = createClient<Database>('http://supabase.test', 'test-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const url = new URL(input instanceof Request ? input.url : input.toString());
        const body = typeof init?.body === 'string' ? init.body : undefined;
        calls.push({
          method: init?.method ?? 'GET',
          path: url.pathname,
          search: decodeURIComponent(url.search),
          body,
        });
        return Promise.resolve(answer());
      },
    },
  });
  vi.mocked(createSupabaseServerClient).mockResolvedValue(client);
  return calls;
}

const query = (search: Record<string, string>) => loadListQuery(new URLSearchParams(search));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('listBookingsForStaff', () => {
  it('reads v_bookings_staff by booking code, status, RW and the day the visit covers', async () => {
    const calls = sessionAnswering(() => Response.json([]));
    await listBookingsForStaff(query({ q: 'gsk-7f3k', status: 'paid' }), 5, '2026-11-06');
    const [call] = calls;
    expect(call?.path).toBe('/rest/v1/v_bookings_staff');
    expect(call?.search).toContain('booking_code=ilike.%gsk-7f3k%');
    expect(call?.search).toContain('status=in.(paid)');
    expect(call?.search).toContain('rw_ids=cs.{5}');
    expect(call?.search).toContain('visit_date=lte.2026-11-06');
    expect(call?.search).toContain('visit_date_end=gte.2026-11-06');
    expect(call?.search).not.toContain('pic_phone');
  });

  it('searches the institution for anything that is not a booking code', async () => {
    const calls = sessionAnswering(() => Response.json([]));
    await listBookingsForStaff(query({ q: 'SD Negeri' }), null, null);
    expect(calls[0]?.search).toContain('institution_name=ilike.%SD+Negeri%');
    expect(calls[0]?.search).not.toContain('rw_ids=');
  });
});

describe('the staff writes', () => {
  it('store an empty note as null, and answer NOT_FOUND when RLS hides the booking', async () => {
    const calls = sessionAnswering(() => Response.json(null));
    await expect(saveAdminNotes({ bookingId: BOOKING_ID, adminNotes: '' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(calls[0]?.method).toBe('PATCH');
    expect(JSON.parse(calls[0]?.body ?? '{}')).toEqual({ admin_notes: null });
  });

  it('mark an add-on line only within the booking it names', async () => {
    const calls = sessionAnswering(() => Response.json({ id: ADDON_ID }));
    await setAddonFulfillment({ bookingId: BOOKING_ID, addonId: ADDON_ID, status: 'prepared' });
    expect(calls[0]?.search).toContain(`booking_id=eq.${BOOKING_ID}`);
    expect(JSON.parse(calls[0]?.body ?? '{}')).toEqual({ fulfillment_status: 'prepared' });
  });
});

describe('revealBookingContact', () => {
  const values = { bookingId: BOOKING_ID, reason: 'Konfirmasi jadwal' };

  it('turns the window refusal into FORBIDDEN and the daily cap into RATE_LIMITED', async () => {
    sessionAnswering(() => Response.json({ code: '42501', message: 'x' }, { status: 403 }));
    await expect(revealBookingContact(values)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    sessionAnswering(() =>
      Response.json({ code: 'P0001', hint: 'RATE_LIMITED', message: 'x' }, { status: 400 }),
    );
    await expect(revealBookingContact(values)).rejects.toMatchObject({ code: 'RATE_LIMITED' });
  });
});
