import 'server-only';

import { z } from 'zod';

import { DB_ENUMS } from '@/db/enums';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { LedgerEntryLine } from '@/types/finance';

// The finance recap's newest ledger rows (Dasbor Gelap), read through the session client: revenue_share_entries'
// own policy gives the superadmin every row and an RW admin their treasury's and their RW's vendors' rows only.
const RECENT_LEDGER_ROWS = 5;

const entryRowSchema = z.object({
  id: z.number().int(),
  created_at: z.string(),
  entry_type: z.enum(DB_ENUMS.revenue_entry_type),
  beneficiary_key: z.string(),
  amount: z.number().int(),
});

export async function listRecentLedgerEntries(): Promise<LedgerEntryLine[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('revenue_share_entries')
    .select('id, created_at, entry_type, beneficiary_key, amount')
    .order('id', { ascending: false })
    .limit(RECENT_LEDGER_ROWS);
  if (error) throw error;
  return z
    .array(entryRowSchema)
    .parse(data)
    .map((row) => ({
      id: row.id,
      createdAt: row.created_at,
      entryType: row.entry_type,
      beneficiaryKey: row.beneficiary_key,
      amount: row.amount,
    }));
}
