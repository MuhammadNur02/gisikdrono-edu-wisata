import 'server-only';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireGuestToken, requireUser } from '@/server/auth/guards';
import type { ActionFailure } from '@/types/action-result';

// Who may read a booking's document (Task P3.6.04; docs/Security.md §10.3, DOC-01): the superadmin, at AAL2, whose
// RLS lets them see the row, or the visitor holding the booking's own link cookie with at least the view scope.
// Everything else is one NOT_FOUND, like every guest refusal. An RW admin is not a staff reader yet: the documents
// print the whole snapshot (a combo's other RW, the add-ons, a discount), which 0005 withholds from them (STAFF-02),
// so their redacted view comes with the booking detail of Task P4.3.02 (decision of 2026-10-23, review of PR #33).

export type DocumentReader =
  { ok: true; reader: 'staff'; userId: string } | { ok: true; reader: 'guest' } | ActionFailure;

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
  const isSuperadmin = staff.ok && staff.ctx.role === 'superadmin' && staff.ctx.isAal2;
  if (isSuperadmin && (await staffSeesRow(table, rowId))) {
    return { ok: true, reader: 'staff', userId: staff.ctx.userId };
  }
  const guest = await requireGuestToken(bookingCode, 'view');
  return guest.ok ? { ok: true, reader: 'guest' } : guest;
}
