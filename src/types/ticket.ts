import type { EnumValue } from '@/db/enums';

// A guest's tickets and the public QR landing (Task P3.10.02, P3.10.03). Props for components, so dates travel as
// strings and the QR as the SVG path the server drew.

export type TicketStatus = EnumValue<'ticket_status'>;

export interface GuestTicket {
  ticketCode: string;
  rwName: string;
  // The leg's visit day, 'YYYY-MM-DD', and its session's times, 'HH:MM:SS'.
  validOn: string;
  startTime: string;
  endTime: string;
  paxCount: number;
  status: TicketStatus;
  // The QR of https://<site>/v/<token>; null when the ticket's kid has retired and no QR can be drawn for it.
  qr: { size: number; path: string } | null;
}

// What /v/[token] may say (docs/PRD.md FR-PUB-21): valid or not, and nothing about the ticket, its booking or its
// check-in.
export type TicketLanding = { kind: 'valid' } | { kind: 'invalid' } | { kind: 'rate_limited' };
