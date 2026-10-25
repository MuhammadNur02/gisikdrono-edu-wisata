import 'server-only';

import {
  BOOKING_CODE_SEARCH_PREFIX,
  BOOKING_DEFAULT_SORT,
  BOOKING_EVENT_ACTORS,
  BOOKING_SORT_COLUMNS,
} from '@/config/bookings';
import type { RwId } from '@/config/rw';
import { DB_ENUMS } from '@/db/enums';
import { rpcGetParticipants, rpcRevealBookingContact } from '@/db/rpc';
import { revokeTicket, rpcGetAddonNotes } from '@/db/rpc-booking-admin';
import { AppError, raisedHintOf } from '@/lib/errors';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import {
  allowedValues,
  pageRange,
  parseSort,
  searchPattern,
  type ListQuery,
} from '@/lib/utils/list-query';
import { rowPageOf } from '@/lib/utils/paged-rows';
import type {
  AddonFulfillmentValues,
  AdminNotesValues,
  RevealContactValues,
  RevokeTicketValues,
} from '@/lib/validations/booking-admin';
import { toBookingDetail, toBookingListRow } from '@/server/services/booking-admin-rows';
import type {
  BookingAddonLine,
  BookingDetail,
  BookingEventActor,
  BookingListRow,
  BookingTimelineEvent,
  ParticipantEntry,
  RevealedContact,
} from '@/types/booking-admin';
import type { ListResult } from '@/types/data-table';

// /dashboard/bookings (Task P4.3.02, docs/PRD.md FR-ADMIN-05; docs/Security.md STAFF-02, AZ-12, DATA-04), entirely
// through the staff member's session client, so 0005 decides every row: v_bookings_staff and v_booking_admin show
// the superadmin every booking and an RW admin the bookings visiting their RW from a week ago to a month ahead, the
// contact masked and a combo's money withheld from an RW admin; booking_addons shows each RW its own lines. The real
// contact and the participants leave the database only through rpc_reveal_booking_contact and rpc_get_participants,
// which check the window and AAL2 again and record every opening.

const LIST_COLUMNS =
  'id, booking_code, status, institution_name, pic_first_name, booker_type, package_name, rw_ids, pax_count, visit_date, visit_date_end, payment_status, needs_review, shows_amounts, total_amount, amount_paid, created_at';
const ADDON_COLUMNS =
  'id, rw_id, product_name_snapshot, qty, unit_price, line_total, fulfillment_status, created_at';
const EVENT_COLUMNS = 'id, from_status, to_status, actor_type, reason, occurred_at';

type ServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

const INSUFFICIENT_PRIVILEGE = '42501';
const NO_DATA_FOUND = 'P0002';
const INVALID_PARAMETER = '22023';

// The search box names one column: a booking code is looked up by its code, anything else by the institution.
function searchColumnOf(q: string): 'booking_code' | 'institution_name' {
  return q.trim().toUpperCase().startsWith(BOOKING_CODE_SEARCH_PREFIX)
    ? 'booking_code'
    : 'institution_name';
}

// One page of bookings from `?q=&sort=&page=&status=&rw=&date=`: `?rw=` is already settled by effectiveRw, and
// `?date=` keeps the bookings whose visit covers that day.
export async function listBookingsForStaff(
  query: ListQuery,
  rw: RwId | null,
  visitDate: string | null,
): Promise<ListResult<BookingListRow>> {
  const { from, to } = pageRange(query.page, query.per);
  const order =
    parseSort(query.sort, BOOKING_SORT_COLUMNS) ??
    parseSort(BOOKING_DEFAULT_SORT, BOOKING_SORT_COLUMNS);
  const pattern = searchPattern(query.q);
  const statuses = allowedValues(query.status, DB_ENUMS.booking_status);
  const supabase = await createSupabaseServerClient();
  let request = supabase.from('v_bookings_staff').select(LIST_COLUMNS, { count: 'exact' });
  if (rw !== null) request = request.contains('rw_ids', [rw]);
  if (pattern !== null) request = request.ilike(searchColumnOf(query.q), pattern);
  if (statuses.length > 0) request = request.in('status', statuses);
  if (visitDate !== null)
    request = request.lte('visit_date', visitDate).gte('visit_date_end', visitDate);
  if (order !== null) request = request.order(order.column, { ascending: order.ascending });
  // A `?page=` past the last row is an empty page, not PostgREST's 416 (review of PR #75, F-75-5).
  const page = rowPageOf(await request.order('id').range(from, to));
  const rows = page.rows.flatMap((row) => {
    const mapped = toBookingListRow(row);
    return mapped ? [mapped] : [];
  });
  return { rows, total: page.count ?? rows.length };
}

// One booking with its legs, payments, tickets and invoices; null when RLS does not show it to this staff member.
export async function getBookingDetail(bookingId: string): Promise<BookingDetail | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('v_booking_admin')
    .select('*')
    .eq('id', bookingId)
    .maybeSingle();
  if (error) throw error;
  return data === null ? null : toBookingDetail(data);
}

export async function listBookingAddons(bookingId: string): Promise<BookingAddonLine[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('booking_addons')
    .select(ADDON_COLUMNS)
    .eq('booking_id', bookingId)
    .order('created_at')
    .order('id');
  if (error) throw error;
  return data.map((line) => ({
    id: line.id,
    rwId: line.rw_id,
    productName: line.product_name_snapshot,
    qty: line.qty,
    unitPrice: line.unit_price,
    lineTotal: line.line_total,
    fulfillmentStatus: line.fulfillment_status,
  }));
}

function actorOf(value: string): BookingEventActor {
  return BOOKING_EVENT_ACTORS.find((actor) => actor === value) ?? 'system';
}

// The booking's status changes, oldest first: booking_events_staff_read shows them wherever the booking is shown.
export async function listBookingTimeline(bookingId: string): Promise<BookingTimelineEvent[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('booking_events')
    .select(EVENT_COLUMNS)
    .eq('booking_id', bookingId)
    .order('occurred_at')
    .order('id');
  if (error) throw error;
  return data.map((event) => ({
    id: String(event.id),
    fromStatus: event.from_status,
    toStatus: event.to_status,
    actorType: actorOf(event.actor_type),
    reason: event.reason,
    occurredAt: event.occurred_at,
  }));
}

// What a refusal of the staff RPCs means to the officer; anything else (STATE_INVALID among them) is thrown on for
// mapError.
function staffRpcRefusal(error: unknown): AppError | null {
  const code =
    typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
  if (code === INSUFFICIENT_PRIVILEGE) return new AppError('FORBIDDEN');
  if (code === NO_DATA_FOUND) return new AppError('NOT_FOUND');
  if (code === INVALID_PARAMETER) return new AppError('VALIDATION');
  if (raisedHintOf(error) === 'RATE_LIMITED') return new AppError('RATE_LIMITED');
  return null;
}

async function asStaffRpcStep<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    throw staffRpcRefusal(error) ?? error;
  }
}

// docs/StyleGuide.md §6.10: the real contact for this page view, with the staff member's reason, counted against the
// daily cap of 50.
export async function revealBookingContact(values: RevealContactValues): Promise<RevealedContact> {
  const supabase = await createSupabaseServerClient();
  return asStaffRpcStep(() =>
    rpcRevealBookingContact(supabase, { bookingId: values.bookingId, reason: values.reason }),
  );
}

export async function getBookingParticipants(bookingId: string): Promise<ParticipantEntry[]> {
  const supabase = await createSupabaseServerClient();
  const participants = await asStaffRpcStep(() => rpcGetParticipants(supabase, bookingId));
  return participants.map((participant) => ({
    seqNo: participant.seq_no,
    fullName: participant.full_name,
    groupLabel: participant.group_label,
    roleLabel: participant.role_label,
  }));
}

// An anonymised booking keeps no note and no kitchen step any more (review of PR #75, F-75-3): its contact and its
// free text went with the retention run. NOT_FOUND when RLS does not show the booking at all.
async function assertWritableBooking(supabase: ServerClient, bookingId: string): Promise<void> {
  const { data, error } = await supabase
    .from('v_bookings_staff')
    .select('id, is_anonymised')
    .eq('id', bookingId)
    .maybeSingle();
  if (error) throw error;
  if (data === null) throw new AppError('NOT_FOUND');
  if (data.is_anonymised === true) throw new AppError('STATE_INVALID');
}

// admin_notes is the one column staff write on a booking (0005, bookings_staff_notes). No row back means RLS hid it.
export async function saveAdminNotes(values: AdminNotesValues): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await assertWritableBooking(supabase, values.bookingId);
  const { data, error } = await supabase
    .from('bookings')
    .update({ admin_notes: values.adminNotes === '' ? null : values.adminNotes })
    .eq('id', values.bookingId)
    .select('id')
    .maybeSingle();
  if (error) throw error;
  if (data === null) throw new AppError('NOT_FOUND');
}

// The kitchen of the line's own RW marks it (booking_addons_staff_fulfil); the line must belong to the booking named.
// A cancelled line is never brought back from here (review of PR #75, F-75-2; addon_fulfillment_guard holds the same
// line in the database): no row back means the line was cancelled, or is not this staff member's.
export async function setAddonFulfillment(values: AddonFulfillmentValues): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await assertWritableBooking(supabase, values.bookingId);
  const { data, error } = await supabase
    .from('booking_addons')
    .update({ fulfillment_status: values.status })
    .eq('id', values.addonId)
    .eq('booking_id', values.bookingId)
    .neq('fulfillment_status', 'cancelled')
    .select('id')
    .maybeSingle();
  if (error) throw error;
  if (data === null) throw new AppError('STATE_INVALID');
}

// revoke_ticket (FR-ADMIN-26): the ticket of this booking with this code, as RLS shows it, then the superadmin's RPC,
// which checks their role, AAL2 and the ticket's state again. The booking's own status is left as it is.
export async function revokeBookingTicket(values: RevokeTicketValues): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('tickets_qr')
    .select('id')
    .eq('booking_id', values.bookingId)
    .eq('ticket_code', values.ticketCode)
    .maybeSingle();
  if (error) throw error;
  if (data === null) throw new AppError('NOT_FOUND');
  await asStaffRpcStep(() => revokeTicket(supabase, { ticketId: data.id, reason: values.reason }));
}

// The visitor's notes on the caller's own RW's add-on lines, by line id (rpc_get_addon_notes, audited). Outside the
// booking window the function refuses, and the lines are shown without their notes.
export async function listAddonNotes(bookingId: string): Promise<Map<string, string>> {
  const supabase = await createSupabaseServerClient();
  try {
    return await asStaffRpcStep(() => rpcGetAddonNotes(supabase, bookingId));
  } catch (error) {
    if (error instanceof AppError && error.code === 'FORBIDDEN') return new Map();
    throw error;
  }
}
