import 'server-only';

import { timingSafeEqual } from 'node:crypto';

import { ticketSignature, type QrKeyRing, type SignedTicketFacts } from '@/lib/qr/sign';

// Task P3.10.01: the only place a QR token is checked. A token is read first (its grammar, its kid, the ticket id it
// names) and then checked against that ticket's own row, since the RW and the visit day it is bound to are not in it.
// A kid QR_SIGNING_KEYS no longer holds has retired (30 days after its last valid_on, docs/Security.md §9.1), so its
// tokens fail like forged ones.

const TOKEN_PATTERN = /^GSK\.([a-z0-9]+)\.([A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{22})$/;
const UUID_BYTES = 16;
const UUID_GROUPS = /^(.{8})(.{4})(.{4})(.{4})(.{12})$/;

export interface ReadTicketToken {
  kid: string;
  ticketId: string;
  signature: string;
}

function uuidOf(bytes: Buffer): string {
  return bytes.toString('hex').replace(UUID_GROUPS, '$1-$2-$3-$4-$5');
}

// null for anything that is not a ticket token: another grammar, a truncated signature, an id of another length.
export function readTicketToken(token: string): ReadTicketToken | null {
  const match = TOKEN_PATTERN.exec(token);
  if (!match) return null;
  const [, kid = '', encodedId = '', signature = ''] = match;
  const idBytes = Buffer.from(encodedId, 'base64url');
  if (idBytes.length !== UUID_BYTES || idBytes.toString('base64url') !== encodedId) return null;
  return { kid, ticketId: uuidOf(idBytes), signature };
}

// True only when the token was signed with a kid still in the ring, for exactly this ticket, its RW and its day.
// Compared in constant time.
export function isAuthenticTicket(
  read: ReadTicketToken,
  ticket: SignedTicketFacts,
  keyRing: QrKeyRing,
): boolean {
  if (!Object.hasOwn(keyRing, read.kid) || read.ticketId !== ticket.ticketId) return false;
  const expected = Buffer.from(ticketSignature(ticket, read.kid, keyRing));
  const received = Buffer.from(read.signature);
  return expected.length === received.length && timingSafeEqual(expected, received);
}
