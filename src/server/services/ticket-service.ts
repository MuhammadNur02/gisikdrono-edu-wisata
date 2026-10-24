import 'server-only';

import { serverEnv } from '@/lib/env';
import { publicEnv } from '@/lib/public-env';
import { signTicket } from '@/lib/qr/sign';
import { isAuthenticTicket, readTicketToken } from '@/lib/qr/verify';
import { withinRateLimits } from '@/lib/rate-limit';
// Visitors have no session, so their tickets are read with the service role (CLAUDE.md §6.1): the ticket page is keyed
// by a booking id its verified guest link gave, and the QR landing by the ticket id inside a token whose signature is
// checked against that ticket's own row before anything is shown. Nothing here writes; tickets are issued only inside
// internal.apply_payment_event.
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { rateLimitIpBucket } from '@/lib/utils/client-ip';
import { qrSvgPath } from '@/lib/utils/qr-path';
import type { GuestTicket, TicketLanding } from '@/types/ticket';

// Task P3.10.02 and P3.10.03 (docs/Security.md §9.1; QR-01, QR-05, GUEST-04).

const TICKET_COLUMNS =
  'id, ticket_code, rw_id, valid_on, pax_count, status, key_id, rw_units(name), visit_sessions(start_time, end_time)';
// docs/Security.md §9.1: the landing calls a ticket valid while it may still be used or was used, and says nothing of
// which; a suspended, revoked or expired one is not valid.
const VALID_STATUSES: ReadonlySet<string> = new Set(['issued', 'used']);

// The QR of a ticket, signed with the kid its row names, so it stays the same on every visit to the page. Only a
// ticket the gate may still scan, or one used and kept for reference, has one: a suspended or revoked ticket shows a
// notice instead (re-review of PR #42). A kid QR_SIGNING_KEYS no longer holds has retired, and that ticket shows none.
function qrOf(ticket: {
  id: string;
  rw_id: number;
  valid_on: string;
  key_id: string;
  status: string;
}) {
  if (
    !VALID_STATUSES.has(ticket.status) ||
    !Object.hasOwn(serverEnv.QR_SIGNING_KEYS, ticket.key_id)
  )
    return null;
  const token = signTicket(
    { ticketId: ticket.id, rwId: ticket.rw_id, validOn: ticket.valid_on },
    ticket.key_id,
    serverEnv.QR_SIGNING_KEYS,
  );
  return qrSvgPath(new URL(`/v/${token}`, publicEnv.NEXT_PUBLIC_SITE_URL).toString());
}

export async function getTicketsForBooking(bookingId: string): Promise<GuestTicket[]> {
  const { data, error } = await createSupabaseAdminClient()
    .from('tickets_qr')
    .select(TICKET_COLUMNS)
    .eq('booking_id', bookingId)
    .order('ticket_code');
  if (error) throw error;
  return data.map((ticket) => ({
    ticketCode: ticket.ticket_code,
    rwName: ticket.rw_units.name,
    validOn: ticket.valid_on,
    startTime: ticket.visit_sessions.start_time,
    endTime: ticket.visit_sessions.end_time,
    paxCount: ticket.pax_count,
    status: ticket.status,
    qr: qrOf(ticket),
  }));
}

// /v/[token] (docs/PRD.md FR-PUB-21): valid or not, nothing more. Junk is refused by its grammar before it counts
// against the visitor's limit or reaches the database; then the signature is checked in Node against the ticket's own
// RW and day, and a token that names no ticket, a forged or retired one and a ticket no longer valid all read the
// same "tidak valid".
export async function readTicketLanding(token: string, clientIp: string): Promise<TicketLanding> {
  const read = readTicketToken(token);
  if (read === null) return { kind: 'invalid' };
  const adminClient = createSupabaseAdminClient();
  const ipBucket = rateLimitIpBucket(clientIp);
  if (!(await withinRateLimits(adminClient, [{ name: 'qr_landing:ip', subject: ipBucket }]))) {
    return { kind: 'rate_limited' };
  }
  const { data, error } = await adminClient
    .from('tickets_qr')
    .select('id, rw_id, valid_on, status')
    .eq('id', read.ticketId)
    .maybeSingle();
  if (error) throw error;
  if (data === null || !VALID_STATUSES.has(data.status)) return { kind: 'invalid' };
  const facts = { ticketId: data.id, rwId: data.rw_id, validOn: data.valid_on };
  if (!isAuthenticTicket(read, facts, serverEnv.QR_SIGNING_KEYS)) return { kind: 'invalid' };
  return { kind: 'valid' };
}
