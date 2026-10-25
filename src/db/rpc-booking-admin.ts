import 'server-only';

import { resultOf, type DatabaseClient } from '@/db/rpc-result';

// The booking detail's staff RPCs (Task P4.3.02; 20261103102000_revoke_ticket.sql, 20261103102100_addon_notes_rpc.sql),
// called on the staff member's own session client so their AAL2, scope and window checks see who asks.

export function revokeTicket(
  client: DatabaseClient,
  revoke: { ticketId: string; reason: string },
): Promise<void> {
  return resultOf(
    client.rpc('revoke_ticket', { p_ticket_id: revoke.ticketId, p_reason: revoke.reason }),
  );
}

// The notes of the caller's own RW's add-on lines, by line id; each call is an audited read.
export async function rpcGetAddonNotes(
  client: DatabaseClient,
  bookingId: string,
): Promise<Map<string, string>> {
  const rows = await resultOf(client.rpc('rpc_get_addon_notes', { p_booking_id: bookingId }));
  return new Map(rows.map((row) => [row.addon_id, row.notes]));
}
