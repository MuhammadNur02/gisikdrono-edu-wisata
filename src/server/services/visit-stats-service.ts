import 'server-only';

import type { RwId } from '@/config/rw';
import { rpcVisitStats } from '@/db/rpc-stats';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { monthRanges, sumOf } from '@/lib/utils/kpi';

// The figures the dashboard takes from visit_stats (Task P4.2.03 on P4.2.01): summed in Postgres by a security
// definer aggregate, so an RW admin's month is whole even past the bookings RLS window, and no row leaves the database.

// "Produk terjual": the add-on units of the RW's paid visits this month by visit day, cancelled lines left out.
export async function readProductsSoldThisMonth(rw: RwId, now: Date = new Date()): Promise<number> {
  const supabase = await createSupabaseServerClient();
  const { current } = monthRanges(now);
  const buckets = await rpcVisitStats(supabase, {
    from: current.from,
    to: current.to,
    rwId: rw,
    granularity: 'month',
  });
  return sumOf(buckets, (bucket) => bucket.products_sold);
}
