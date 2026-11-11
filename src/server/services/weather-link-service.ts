import 'server-only';

import { z } from 'zod';

import { resolveWeatherLink } from '@/db/rpc-adjustments';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { ResolveWeatherLinkValues } from '@/lib/validations/weather-links';
import { asFinanceWrite } from '@/server/services/finance-errors';
import type { HeldWeatherLinks } from '@/types/weather-links';

// Task P4.7.06 (follow-ups of PR #69 and the review of PR #90): the weather links the sweep holds, which neither the
// visitor nor the automatic refund can close (docs/PRD.md §13.1 A24). They are read under RLS, where only the
// superadmin sees every RW's, and closed only through public.resolve_weather_link, which checks the fresh code itself.
// A refund by hand is a manual_refund adjustment naming the link (propose-form.tsx), which closes it when applied.

const HELD_LINKS_LIMIT = 100;

const heldLinkSchema = z.object({
  id: z.uuid(),
  rw_id: z.number(),
  open_until: z.string(),
  held_at: z.string(),
  held_reason: z.enum(['fee_unset', 'shares_short', 'payment_refunded']),
  bookings: z.object({ booking_code: z.string() }),
});

export async function listHeldWeatherLinks(): Promise<HeldWeatherLinks> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('weather_notice_bookings')
    .select('id, rw_id, open_until, held_at, held_reason, bookings!inner(booking_code)')
    .not('held_at', 'is', null)
    .is('resolved_at', null)
    .order('held_at', { ascending: true })
    .limit(HELD_LINKS_LIMIT + 1);
  if (error) throw error;
  const rows = z.array(heldLinkSchema).parse(data);
  return {
    hasMore: rows.length > HELD_LINKS_LIMIT,
    items: rows.slice(0, HELD_LINKS_LIMIT).map((row) => ({
      id: row.id,
      bookingCode: row.bookings.booking_code,
      rwId: row.rw_id,
      openUntil: row.open_until,
      heldAt: row.held_at,
      heldReason: row.held_reason,
    })),
  };
}

export async function resolveHeldWeatherLink(values: ResolveWeatherLinkValues): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await asFinanceWrite(() => resolveWeatherLink(supabase, values), 'resolve');
}
