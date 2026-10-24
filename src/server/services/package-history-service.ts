import 'server-only';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { PriceHistoryEntry } from '@/types/package';

// package_price_history, written by the database on every price change of a package or its tiers (Task P4.3.05,
// REC-13); an RW admin reads their own packages' history (package_price_history_staff_read, 0005).
export async function listPriceHistory(packageId: string): Promise<PriceHistoryEntry[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('package_price_history')
    .select(
      'id, changed_at, tier_id, old_price_per_pax, new_price_per_pax, old_flat_price, new_flat_price',
    )
    .eq('package_id', packageId)
    .order('changed_at', { ascending: false });
  if (error) throw error;
  return data.map((row) => ({
    id: row.id,
    changedAt: row.changed_at,
    tierId: row.tier_id,
    oldPricePerPax: row.old_price_per_pax,
    newPricePerPax: row.new_price_per_pax,
    oldFlatPrice: row.old_flat_price,
    newFlatPrice: row.new_flat_price,
  }));
}
