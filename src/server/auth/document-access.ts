import 'server-only';

import { rpcGetParticipants } from '@/db/rpc';
import { fail } from '@/lib/errors';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireGuestToken, requireUser } from '@/server/auth/guards';
import type { ActionFailure } from '@/types/action-result';

// Who may read a booking's document (Task P3.6.04; docs/Security.md §10.3, DOC-01): the superadmin, at AAL2, whose
// RLS lets them see the row, or the visitor holding the booking's own link cookie with at least the view scope.
// Everything else is one NOT_FOUND, like every guest refusal. The documents print the whole snapshot (a combo's other
// RW, the add-ons, a discount), which 0005 withholds from an RW admin (STAFF-02), so an RW admin at AAL2 whose RLS
// shows the row reads the header-only copy alone (Task P4.3.02, decisions of 2026-10-23 on PR #33 and of 2026-10-26).

// `restricted`: an RW admin, who is shown the header-only copy of a quotation, invoice or receipt (Task P4.3.02,
// decision of 2026-10-26), never the full document.
export type DocumentReader =
  | { ok: true; reader: 'staff'; userId: string }
  | { ok: true; reader: 'restricted'; userId: string }
  | { ok: true; reader: 'guest' }
  | ActionFailure;

// A ticket file is the booking's own, read through the staff view of bookings (Task P3.11.05); a certificate is its
// own row (Task P4.5.02).
type DocumentTable = 'quotations' | 'invoices' | 'certificates' | 'v_bookings_staff';

// RLS answers the scope question: a row the staff member may not see is a row that does not exist for them.
async function staffSeesRow(table: DocumentTable, rowId: string): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { data, error } =
    table === 'v_bookings_staff'
      ? await supabase.from('v_bookings_staff').select('id').eq('id', rowId).maybeSingle()
      : await supabase.from(table).select('id').eq('id', rowId).maybeSingle();
  if (error) throw error;
  return data !== null;
}

// The kind of staff reader a role makes: the superadmin reads the document itself, an RW admin its header-only copy
// where the route allows that; anyone else is no staff reader here.
function staffReaderKind(role: string, allowsRestricted: boolean): 'staff' | 'restricted' | null {
  if (role === 'superadmin') return 'staff';
  return role === 'admin_rw' && allowsRestricted ? 'restricted' : null;
}

async function staffReaderOf(
  table: DocumentTable,
  rowId: string,
  allowsRestricted: boolean,
): Promise<DocumentReader | null> {
  const staff = await requireUser();
  if (!staff.ok || !staff.ctx.isAal2) return null;
  const reader = staffReaderKind(staff.ctx.role, allowsRestricted);
  if (reader === null || !(await staffSeesRow(table, rowId))) return null;
  return { ok: true, reader, userId: staff.ctx.userId };
}

// `allowsRestricted`: the booking documents, which an RW admin may read as their header-only copy; the e-ticket keeps
// its own rule (superadmin or the guest link).
export async function requireDocumentReader(
  table: DocumentTable,
  rowId: string,
  bookingCode: string,
  { allowsRestricted = false }: { allowsRestricted?: boolean } = {},
): Promise<DocumentReader> {
  const staffReader = await staffReaderOf(table, rowId, allowsRestricted);
  if (staffReader) return staffReader;
  const guest = await requireGuestToken(bookingCode, 'view');
  return guest.ok ? { ok: true, reader: 'guest' } : guest;
}

const INSUFFICIENT_PRIVILEGE = '42501';
const RAISED_EXCEPTION = 'P0001';

function isPersonalDataRefusal(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error)) return false;
  return error.code === INSUFFICIENT_PRIVILEGE || error.code === RAISED_EXCEPTION;
}

// rpc_get_participants is the one gate to a booking's names (0005, docs/StyleGuide.md §6.10): staff at AAL2, of the
// booking's RWs, from a week before to a month after the visit, each opening a pii_revealed event under the daily cap.
// The names it returns are not used; the PDF prints them from the certificate rows.
async function passesPersonalDataGate(bookingId: string): Promise<boolean> {
  try {
    await rpcGetParticipants(await createSupabaseServerClient(), bookingId);
    return true;
  } catch (error) {
    if (isPersonalDataRefusal(error)) return false;
    throw error;
  }
}

// Who may read a certificate (Task P4.5.02, docs/PRD.md FR-ADMIN-07; docs/Security.md §10.3, DOC-02): a staff member
// at AAL2 whose RLS shows them the certificate (certificates_staff_read: an officer of one of its RWs, or the
// superadmin), and for one that prints a person's name also the personal-data gate above. The visitor's certificate
// link with the last-4 step-up belongs to /reservasi/[bookingCode]/sertifikat (Task P4.5.03, guest half), so until
// then a visitor gets the same NOT_FOUND as everyone else.
export async function requireCertificateReader(
  certificateId: string,
  bookingId: string,
  printsAName: boolean,
): Promise<DocumentReader> {
  const staff = await requireUser();
  if (!staff.ok) return fail('NOT_FOUND');
  if (!staff.ctx.isAal2 || !(await staffSeesRow('certificates', certificateId))) {
    return fail('NOT_FOUND');
  }
  if (printsAName && !(await passesPersonalDataGate(bookingId))) return fail('NOT_FOUND');
  return { ok: true, reader: 'staff', userId: staff.ctx.userId };
}
