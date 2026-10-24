import type { EnumValue } from '@/db/enums';

// The stable JSON contract of POST /api/tickets/verify between the scanner PWA and the server (CLAUDE.md §7.4,
// docs/PRD.md FR-SCAN-03..07, Task P4.4.02). The PWA may be a deploy older than the server, so fields are only ever
// added, never renamed. src/lib/validations/scanner.ts holds the zod schemas that read both directions.

export type ScanResult = EnumValue<'scan_result'>;
export type ScanMode = 'preview' | 'commit';

// One decoded QR. attemptId is a uuid made by the client per scan and reused on the 8 s retry, so a late answer
// never checks a group in twice (ticket_scans.attempt_id is unique). overrideReason is honoured for a superadmin only.
export interface VerifyTicketRequest {
  token: string;
  attemptId: string;
  mode: ScanMode;
  attendeeCount?: number;
  overrideReason?: string;
}

// FR-SCAN-07: the unreadable QR. The server finds today's ticket of the officer's RW for the booking and checks the
// last four digits of its verified phone; the same preview and commit follow.
export interface ManualCheckInRequest {
  bookingCode: string;
  phoneLastDigits: string;
  attemptId: string;
  mode: ScanMode;
  attendeeCount?: number;
  overrideReason?: string;
}

// The group card of a preview (FR-SCAN-03): the PIC's first name only, never the phone, email or participants.
export interface ScanTicketCard {
  ticketCode: string;
  institutionName: string | null;
  picFirstName: string;
  packageName: string;
  // 'YYYY-MM-DD' and 'HH:MM:SS', in Semarang time.
  visitDate: string;
  sessionStart: string;
  sessionEnd: string;
  paxCount: number;
  participantCount: number;
  addons: { name: string; quantity: number }[];
}

// What the server answers for a scan it could read. `ticket` is null when the token named no ticket the officer may
// see (invalid_signature, not_found, forbidden).
export interface VerifyTicketResponse {
  result: ScanResult;
  mode: ScanMode;
  attemptId: string;
  ticket: ScanTicketCard | null;
  // already_used (FR-SCAN-04): when, and by which officer's display name.
  usedAt: string | null;
  usedBy: string | null;
  // A commit that let the group in: how many came, and how many of them above the booking (recorded as unpaid).
  checkedInPax: number | null;
  unpaidPax: number | null;
}

// Every way a request can end for the officer, the network included (online-only, no queue: CLAUDE.md §7.4).
export type VerifyOutcome =
  | { kind: 'answered'; response: VerifyTicketResponse }
  | { kind: 'offline' }
  | { kind: 'timeout' }
  | { kind: 'rate_limited'; retryAfterSeconds: number | null }
  | { kind: 'signed_out' }
  | { kind: 'unavailable' }
  | { kind: 'failed' };
