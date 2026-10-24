import 'server-only';

import { SCAN_DEFAULT_SORT, SCAN_SORT_COLUMNS } from '@/config/attendance';
import type { RwId } from '@/config/rw';
import { DB_ENUMS } from '@/db/enums';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { scanWindowOf } from '@/lib/utils/attendance';
import {
  allowedValues,
  pageRange,
  parseSort,
  searchPattern,
  type ListQuery,
  type SortOrder,
} from '@/lib/utils/list-query';
import { collectAllRows, rowPageOf } from '@/lib/utils/paged-rows';
import type { AttendanceTicket, ScanHistoryRow, ScanSource } from '@/types/attendance';
import type { ListResult } from '@/types/data-table';

// /dashboard/attendance (Task P4.3.09, docs/PRD.md FR-ADMIN-06), read through the session client: RLS shows an RW
// admin their own RW's tickets and their own RW's scans, the superadmin everything, narrowed to the RW effectiveRw
// settles. v_attendance_today carries no contact column, and nothing here reads one (DATA-04). The scan history joins
// each scan to its ticket, so a scan that matched no ticket (a forged or unknown code) is left to the security
// screens; a scan by an officer of another RW, or by the superadmin, is RLS's to show or not.

type ServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

const TODAY_COLUMNS =
  'ticket_id, ticket_code, institution_name, pic_first_name, session_label, start_time, end_time, ticket_status, booked_pax, checked_in_pax, unpaid_pax, checked_in_at, is_manual';
const SCAN_COLUMNS =
  'id, scanned_at, scanned_by, phase, result, source, attendee_count, tickets_qr!inner(ticket_code, rw_id, pax_count, checked_in_pax, unpaid_pax, visit_sessions(label, start_time, end_time))';
const SCAN_SOURCES: readonly ScanSource[] = ['qr', 'manual', 'manual_backfill'];

// Today's tickets, every page of them; null when there are more than one overview may page through.
export async function listTodayAttendance(rw: RwId | null): Promise<AttendanceTicket[] | null> {
  const supabase = await createSupabaseServerClient();
  const result = await collectAllRows(async (from, to) => {
    let request = supabase.from('v_attendance_today').select(TODAY_COLUMNS, { count: 'exact' });
    if (rw !== null) request = request.eq('rw_id', rw);
    return rowPageOf(await request.order('start_time').order('ticket_code').range(from, to));
  });
  if (!result.complete) return null;
  return result.rows.flatMap((row) =>
    row.ticket_id && row.ticket_code && row.ticket_status
      ? [
          {
            ticketId: row.ticket_id,
            ticketCode: row.ticket_code,
            institutionName: row.institution_name,
            picFirstName: row.pic_first_name,
            sessionLabel: row.session_label,
            startTime: row.start_time,
            endTime: row.end_time,
            status: row.ticket_status,
            bookedPax: row.booked_pax ?? 0,
            checkedInPax: row.checked_in_pax ?? 0,
            unpaidPax: row.unpaid_pax ?? 0,
            checkedInAt: row.checked_in_at,
            isManual: row.is_manual ?? false,
          },
        ]
      : [],
  );
}

function scanOrderOf(query: ListQuery): SortOrder {
  return (
    parseSort(query.sort, SCAN_SORT_COLUMNS) ??
    parseSort(SCAN_DEFAULT_SORT, SCAN_SORT_COLUMNS) ?? { column: 'scanned_at', ascending: false }
  );
}

// The officers' names, as far as RLS shows their profiles; read apart so a hidden profile is a missing name, not a
// missing scan.
async function officerNamesOf(supabase: ServerClient, ids: readonly string[]) {
  if (ids.length === 0) return new Map<string, string>();
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name')
    .in('id', [...new Set(ids)]);
  if (error) throw error;
  return new Map(data.flatMap((row) => (row.full_name ? [[row.id, row.full_name] as const] : [])));
}

function sourceOf(source: string): ScanSource {
  return SCAN_SOURCES.find((known) => known === source) ?? 'qr';
}

export async function listScanHistory(
  query: ListQuery,
  rw: RwId | null,
  date: string,
): Promise<ListResult<ScanHistoryRow>> {
  const supabase = await createSupabaseServerClient();
  const { from, to } = pageRange(query.page, query.per);
  const window = scanWindowOf(date);
  const results = allowedValues(query.status, DB_ENUMS.scan_result);
  const pattern = searchPattern(query.q);
  const order = scanOrderOf(query);
  let request = supabase
    .from('ticket_scans')
    .select(SCAN_COLUMNS, { count: 'exact' })
    .gte('scanned_at', window.from)
    .lt('scanned_at', window.before);
  if (rw !== null) request = request.eq('tickets_qr.rw_id', rw);
  if (results.length > 0) request = request.in('result', results);
  if (pattern !== null) request = request.ilike('tickets_qr.ticket_code', pattern);
  const { data, error, count } = await request
    .order(order.column, { ascending: order.ascending })
    .order('id', { ascending: order.ascending })
    .range(from, to);
  if (error) throw error;
  const officers = await officerNamesOf(
    supabase,
    data.map((row) => row.scanned_by),
  );
  return { rows: data.map((row) => toScanRow(row, officers)), total: count ?? data.length };
}

type ScanRecord = {
  id: number;
  scanned_at: string;
  scanned_by: string;
  phase: ScanHistoryRow['phase'];
  result: ScanHistoryRow['result'];
  source: string;
  attendee_count: number | null;
  tickets_qr: {
    ticket_code: string;
    pax_count: number | null;
    checked_in_pax: number | null;
    unpaid_pax: number | null;
    visit_sessions: { label: string | null; start_time: string; end_time: string } | null;
  };
};

// The ticket's session, which RLS shows with the ticket; absent, the row simply shows no session.
function sessionOf(session: ScanRecord['tickets_qr']['visit_sessions']) {
  if (session === null) return { sessionLabel: null, startTime: null, endTime: null };
  return { sessionLabel: session.label, startTime: session.start_time, endTime: session.end_time };
}

function toScanRow(row: ScanRecord, officers: ReadonlyMap<string, string>): ScanHistoryRow {
  const ticket = row.tickets_qr;
  return {
    id: String(row.id),
    scannedAt: row.scanned_at,
    ticketCode: ticket.ticket_code,
    ...sessionOf(ticket.visit_sessions),
    phase: row.phase,
    result: row.result,
    source: sourceOf(row.source),
    attendeeCount: row.attendee_count,
    bookedPax: ticket.pax_count ?? 0,
    checkedInPax: ticket.checked_in_pax ?? 0,
    unpaidPax: ticket.unpaid_pax ?? 0,
    officerName: officers.get(row.scanned_by) ?? null,
  };
}
