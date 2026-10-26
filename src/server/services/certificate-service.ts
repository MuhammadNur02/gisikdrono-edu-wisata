import 'server-only';

import { CERTIFICATE_DEFAULT_SORT, CERTIFICATE_SORT_COLUMNS } from '@/config/certificates';
import type { RwId } from '@/config/rw';
import { DB_ENUMS, type EnumValue } from '@/db/enums';
import { issueCertificates, revokeCertificate } from '@/db/rpc-certificates';
import { staffCopy } from '@/lib/copy/staff';
import { AppError, privilegeHintOf, raisedHintOf } from '@/lib/errors';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import {
  allowedValues,
  pageRange,
  parseSort,
  searchPattern,
  type ListQuery,
} from '@/lib/utils/list-query';
import type {
  RevokeCertificateValues,
  WaiveCertificatesValues,
} from '@/lib/validations/certificate';
import type { CertificateBooking, CertificateSummary } from '@/types/certificate';
import type { ListResult } from '@/types/data-table';

// /dashboard/certificates (Task P4.5.03, docs/PRD.md FR-ADMIN-07) through the staff member's session client, so 0005
// decides what they see: certificates_staff_read shows the certificates of the bookings that visited their RWs (every
// one to the superadmin), without the recipient's name or the verify code. The staff RPCs check scope, AAL2 and the
// superadmin's own steps again. One row per booking: its group certificate, which every certified booking has, and
// its participants'.

const GROUP_COLUMNS =
  'id, booking_id, certificate_number, status, released_at, purged_at, institution_name, visit_date, rw_ids, bookings(booking_code)';
const PARTICIPANT_COLUMNS = 'id, booking_id, certificate_number, status, released_at, purged_at';

const INSUFFICIENT_PRIVILEGE = '42501';
const NO_DATA_FOUND = 'P0002';
const INVALID_PARAMETER = '22023';

interface SummaryRow {
  id: string;
  certificate_number: string;
  status: EnumValue<'certificate_status'>;
  released_at: string | null;
  purged_at: string | null;
}

function toSummary(row: SummaryRow): CertificateSummary {
  const isReleased = row.released_at !== null;
  return {
    id: row.id,
    number: row.certificate_number,
    status: row.status,
    isReleased,
    isDownloadable: row.status === 'issued' && isReleased && row.purged_at === null,
  };
}

async function listGroupCertificates(query: ListQuery, rw: RwId | null) {
  const { from, to } = pageRange(query.page, query.per);
  const order =
    parseSort(query.sort, CERTIFICATE_SORT_COLUMNS) ??
    parseSort(CERTIFICATE_DEFAULT_SORT, CERTIFICATE_SORT_COLUMNS);
  const pattern = searchPattern(query.q);
  const statuses = allowedValues(query.status, DB_ENUMS.certificate_status);
  const supabase = await createSupabaseServerClient();
  let request = supabase
    .from('certificates')
    .select(GROUP_COLUMNS, { count: 'exact' })
    .eq('kind', 'group');
  if (rw !== null) request = request.contains('rw_ids', [rw]);
  if (pattern !== null) request = request.ilike('institution_name', pattern);
  if (statuses.length > 0) request = request.in('status', statuses);
  if (order !== null) request = request.order(order.column, { ascending: order.ascending });
  const { data, error, count } = await request.order('id').range(from, to);
  if (error) throw error;
  return { rows: data, total: count ?? data.length };
}

async function participantsByBooking(bookingIds: readonly string[]) {
  const byBooking = new Map<string, CertificateSummary[]>();
  if (bookingIds.length === 0) return byBooking;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('certificates')
    .select(PARTICIPANT_COLUMNS)
    .eq('kind', 'participant')
    .in('booking_id', [...bookingIds])
    .order('certificate_number');
  if (error) throw error;
  for (const row of data) {
    byBooking.set(row.booking_id, [...(byBooking.get(row.booking_id) ?? []), toSummary(row)]);
  }
  return byBooking;
}

// The people let in above the booking at the gates this staff member sees (tickets_qr_staff_read: their own RW's).
async function unpaidByBooking(bookingIds: readonly string[]) {
  const byBooking = new Map<string, number>();
  if (bookingIds.length === 0) return byBooking;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('tickets_qr')
    .select('booking_id, unpaid_pax')
    .in('booking_id', [...bookingIds]);
  if (error) throw error;
  for (const row of data) {
    byBooking.set(row.booking_id, (byBooking.get(row.booking_id) ?? 0) + row.unpaid_pax);
  }
  return byBooking;
}

// The generated types call the embedded booking certain, since the foreign key is NOT NULL; bookings_staff_read hides
// a booking outside an RW officer's window, and PostgREST then embeds null.
function bookingCodeOf(booking: { booking_code: string } | null): string | null {
  return booking?.booking_code ?? null;
}

// One page of certified bookings from the URL's query: `?q=` searches the institution, `?status=` the group
// certificate's status, `?rw=` (already settled by effectiveRw) the bookings that visited that RW.
export async function listCertificateBookings(
  query: ListQuery,
  rw: RwId | null,
): Promise<ListResult<CertificateBooking>> {
  const groups = await listGroupCertificates(query, rw);
  const bookingIds = groups.rows.map((row) => row.booking_id);
  const [participants, unpaid] = await Promise.all([
    participantsByBooking(bookingIds),
    unpaidByBooking(bookingIds),
  ]);
  const rows = groups.rows.map((row) => ({
    id: row.booking_id,
    bookingCode: bookingCodeOf(row.bookings),
    institutionName: row.institution_name,
    visitDate: row.visit_date,
    rwIds: row.rw_ids,
    group: toSummary(row),
    participants: participants.get(row.booking_id) ?? [],
    unpaidPax: unpaid.get(row.booking_id) ?? 0,
  }));
  return { rows, total: groups.total };
}

// What a staff RPC's refusal means to the officer; anything else is thrown on for mapError to log.
function certificateRefusal(error: unknown): AppError | null {
  const code =
    typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
  // revoke_certificate asks for a fresh authenticator code (review of PR #76, F-76-2).
  if (code === INSUFFICIENT_PRIVILEGE) {
    return new AppError(
      'FORBIDDEN',
      privilegeHintOf(error) === 'FRESH_TOTP' ? staffCopy.notFresh : undefined,
    );
  }
  if (code === NO_DATA_FOUND) return new AppError('NOT_FOUND');
  if (code === INVALID_PARAMETER) return new AppError('VALIDATION');
  if (raisedHintOf(error) === 'STATE_INVALID') return new AppError('STATE_INVALID');
  return null;
}

async function asCertificateStep<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    throw certificateRefusal(error) ?? error;
  }
}

// issue_certificates writes what is missing (FR-POST-01, FR-POST-02) and returns how many it wrote.
export async function issueBookingCertificates(bookingId: string): Promise<number> {
  const supabase = await createSupabaseServerClient();
  return asCertificateStep(() => issueCertificates(supabase, { bookingId, waiverReason: null }));
}

// The superadmin's waiver of the unpaid-pax hold, audited with its reason; returns how many it wrote and released.
export async function waiveCertificateRelease(values: WaiveCertificatesValues): Promise<number> {
  const supabase = await createSupabaseServerClient();
  return asCertificateStep(() =>
    issueCertificates(supabase, { bookingId: values.bookingId, waiverReason: values.reason }),
  );
}

export async function revokeOneCertificate(values: RevokeCertificateValues): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await asCertificateStep(() =>
    revokeCertificate(supabase, { certificateId: values.certificateId, reason: values.reason }),
  );
}

// Before a re-render under the service role: RLS shows this staff member the booking's group certificate, which only
// an officer of one of its RWs or the superadmin may see.
export async function assertSeesBookingCertificates(bookingId: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('certificates')
    .select('id')
    .eq('booking_id', bookingId)
    .eq('kind', 'group')
    .maybeSingle();
  if (error) throw error;
  if (data === null) throw new AppError('NOT_FOUND');
}
