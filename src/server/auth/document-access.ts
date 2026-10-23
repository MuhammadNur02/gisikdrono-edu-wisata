import 'server-only';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireGuestToken, requireUser } from '@/server/auth/guards';
import type { ActionFailure } from '@/types/action-result';

// Who may read a booking's document (Task P3.6.04; docs/Security.md §10.3, DOC-01): a staff member whose RLS lets
// them see the row (the booking in their scope, at AAL2), or the visitor holding the booking's own link cookie with
// at least the view scope. Everything else is one NOT_FOUND, like every guest refusal.

export type DocumentReader = { ok: true; reader: 'staff' | 'guest' } | ActionFailure;

type DocumentTable = 'quotations' | 'invoices';

// RLS answers the scope question: a row the staff member may not see is a row that does not exist for them.
async function staffSeesRow(table: DocumentTable, rowId: string): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from(table).select('id').eq('id', rowId).maybeSingle();
  if (error) throw error;
  return data !== null;
}

export async function requireDocumentReader(
  table: DocumentTable,
  rowId: string,
  bookingCode: string,
): Promise<DocumentReader> {
  const staff = await requireUser();
  if (staff.ok && (await staffSeesRow(table, rowId))) return { ok: true, reader: 'staff' };
  const guest = await requireGuestToken(bookingCode, 'view');
  return guest.ok ? { ok: true, reader: 'guest' } : guest;
}
