import 'server-only';

import { z } from 'zod';

import { DB_ENUMS } from '@/db/enums';
import { resultOf, type DatabaseClient } from '@/db/rpc-result';
import type { Json } from '@/db/types';
import type { ScanMode, ScanTicketCard, VerifyTicketResponse } from '@/types/scanner';

// The gate's staff RPCs (Task P4.4.02, 20261026080000_scanner_gate.sql). POST /api/tickets/verify calls them on the
// officer's own session client, never the service role (CLAUDE.md §7.4), so auth.uid(), the AAL2 check and RLS apply.

const turnSchema = z
  .object({ allowed: z.boolean(), retry_after_seconds: z.number().int().positive().nullable() })
  .strict();

export interface ScannerTurn {
  allowed: boolean;
  retryAfterSeconds: number | null;
}

// FR-SCAN-10: 120 requests a minute per officer and the slow-down past 30 distinct bad payloads.
export async function claimScannerTurn(client: DatabaseClient): Promise<ScannerTurn> {
  const turn = turnSchema.parse(await resultOf(client.rpc('claim_scanner_turn')));
  return { allowed: turn.allowed, retryAfterSeconds: turn.retry_after_seconds };
}

const manualLookupSchema = z
  .object({ ticket_id: z.uuid().nullable(), rate_limited: z.boolean() })
  .strict();

export interface ManualLookup {
  ticketId: string | null;
  rateLimited: boolean;
}

// FR-SCAN-07: today's ticket of the officer's RW for a booking code and the last four digits of its verified phone.
export async function findManualTicket(
  client: DatabaseClient,
  lookup: { bookingCode: string; phoneLastDigits: string },
): Promise<ManualLookup> {
  const reply = manualLookupSchema.parse(
    await resultOf(
      client.rpc('find_manual_ticket', {
        p_booking_code: lookup.bookingCode,
        p_phone_last_digits: lookup.phoneLastDigits,
      }),
    ),
  );
  return { ticketId: reply.ticket_id, rateLimited: reply.rate_limited };
}

const ticketCardSchema = z.object({
  ticket_code: z.string(),
  institution_name: z.string().nullable(),
  pic_first_name: z.string(),
  package_name: z.string().nullable(),
  visit_date: z.string(),
  session_start: z.string(),
  session_end: z.string(),
  pax_count: z.number().int(),
  participant_count: z.number().int(),
  addons: z.array(z.object({ name: z.string(), quantity: z.number().int() })),
});

const scanAnswerSchema = z.object({
  result: z.enum(DB_ENUMS.scan_result),
  ticket: ticketCardSchema.nullable(),
  used_at: z.string().nullable(),
  used_by: z.string().nullable(),
  checked_in_pax: z.number().int().nullable(),
  unpaid_pax: z.number().int().nullable(),
});

export interface ScanCall {
  mode: ScanMode;
  attemptId: string;
  source: 'qr' | 'manual';
  // The scanned text, whose hash ticket_scans keeps; a QR scan needs it (review of PR #53, L4).
  raw: string | null;
  device: Json;
  // null when the QR's signature failed or the manual lookup found nothing.
  ticketId: string | null;
  attendeeCount: number | null;
  overrideReason: string | null;
}

function cardOf(card: z.infer<typeof ticketCardSchema>): ScanTicketCard {
  return {
    ticketCode: card.ticket_code,
    institutionName: card.institution_name,
    picFirstName: card.pic_first_name,
    packageName: card.package_name ?? '',
    visitDate: card.visit_date,
    sessionStart: card.session_start,
    sessionEnd: card.session_end,
    paxCount: card.pax_count,
    participantCount: card.participant_count,
    addons: card.addons,
  };
}

// A preview goes to validate_ticket, a commit to check_in_ticket; the answer is the route's stable contract.
export async function scanTicket(
  client: DatabaseClient,
  scan: ScanCall,
): Promise<VerifyTicketResponse> {
  const reply = await resultOf(
    client.rpc('scan_ticket', {
      p_mode: scan.mode,
      p_attempt_id: scan.attemptId,
      p_source: scan.source,
      p_raw: scan.raw ?? undefined,
      p_device: scan.device,
      p_ticket_id: scan.ticketId ?? undefined,
      p_attendee_count: scan.attendeeCount ?? undefined,
      p_override_reason: scan.overrideReason ?? undefined,
    }),
  );
  const answer = scanAnswerSchema.parse(reply);
  return {
    result: answer.result,
    mode: scan.mode,
    attemptId: scan.attemptId,
    ticket: answer.ticket ? cardOf(answer.ticket) : null,
    usedAt: answer.used_at,
    usedBy: answer.used_by,
    checkedInPax: answer.checked_in_pax,
    unpaidPax: answer.unpaid_pax,
  };
}
