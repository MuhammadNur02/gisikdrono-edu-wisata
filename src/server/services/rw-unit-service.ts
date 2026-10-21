import 'server-only';

import { cache } from 'react';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import { RW_UNIT_SUMMARY_COLUMNS, toRwUnitSummary } from '@/lib/utils/rw-units';
import type { RwUnitSummary } from '@/types/rw-unit';

// Every RW as the dashboard knows it, offline ones included, so the superadmin can prepare an RW before it goes
// online. Read through the session client: rw_units_staff_read and the AAL2 policy decide (0005). The layout and the
// page of one request share a single read.
export const listRwUnitsForStaff = cache(async (): Promise<RwUnitSummary[]> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('rw_units')
    .select(RW_UNIT_SUMMARY_COLUMNS)
    .order('sort_order')
    .order('id');
  if (error) throw error;
  return data.map(toRwUnitSummary);
});

// docs/PRD.md FR-ADMIN-13: the RWs that run a performance schedule (rw_units.schedule_enabled).
export async function listScheduleRwIds(): Promise<number[]> {
  return (await listRwUnitsForStaff())
    .filter((unit) => unit.scheduleEnabled)
    .map((unit) => unit.id);
}
