import 'server-only';

import type { RwId } from '@/config/rw';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { BookingViewCounts, BookingViewKey } from '@/types/booking-admin';

// The counts on the bookings list's view tabs (Dasbor Gelap): read through v_bookings_staff with the session client, so
// an RW officer counts their own RW's bookings inside the view's window, as the list itself shows them.

type ServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

// One head count; a count that fails reads as null and its tab shows no number.
async function countView(
  supabase: ServerClient,
  view: BookingViewKey,
  rw: RwId | null,
  today: string,
): Promise<number | null> {
  let query = supabase.from('v_bookings_staff').select('id', { count: 'exact', head: true });
  if (rw !== null) query = query.contains('rw_ids', [rw]);
  if (view === 'under_review') query = query.eq('needs_review', true);
  else if (view === 'today') query = query.lte('visit_date', today).gte('visit_date_end', today);
  else if (view !== 'all') query = query.eq('status', view);
  const { count, error } = await query;
  return error ? null : count;
}

export async function countBookingViews(
  rw: RwId | null,
  today: string,
): Promise<BookingViewCounts> {
  const supabase = await createSupabaseServerClient();
  const count = (view: BookingViewKey) => countView(supabase, view, rw, today);
  const [all, underReview, todays, pendingPayment, paid, completed] = await Promise.all([
    count('all'),
    count('under_review'),
    count('today'),
    count('pending_payment'),
    count('paid'),
    count('completed'),
  ]);
  return {
    all,
    under_review: underReview,
    today: todays,
    pending_payment: pendingPayment,
    paid,
    completed,
  };
}
