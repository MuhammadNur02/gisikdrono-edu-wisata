import 'server-only';

import { createHmac } from 'node:crypto';

import { QR_KID_PATTERN } from '@/lib/qr/kid';

// Task P3.10.01 (CLAUDE.md §7.3; docs/Security.md §9.1; QR-01, QR-05): a ticket's QR token, the only place one is
// signed. 'GSK.' + kid + '.' + base64url(ticket id) + '.' + the first 22 characters of the base64url HMAC-SHA256 of
// 'GSK.' + kid + '.' + ticket id + '|' + rw_id + '|' + valid_on. The token carries no name, no phone and no booking
// code; the RW and the visit day it is bound to are checked against the ticket's own row. The key ring comes in from
// the caller (QR_SIGNING_KEYS), so this stays pure.

export const QR_TOKEN_PREFIX = 'GSK';
export const QR_SIGNATURE_LENGTH = 22;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// kid → the base64 of its 32-byte key, as QR_SIGNING_KEYS holds them.
export type QrKeyRing = Readonly<Record<string, string>>;

export interface SignedTicketFacts {
  ticketId: string;
  rwId: number;
  // The leg's visit day, 'YYYY-MM-DD'.
  validOn: string;
}

function keyOf(kid: string, keyRing: QrKeyRing): Buffer {
  const key = keyRing[kid];
  if (key === undefined) throw new RangeError(`QR_SIGNING_KEYS has no kid ${kid}`);
  return Buffer.from(key, 'base64');
}

export function ticketSignature(facts: SignedTicketFacts, kid: string, keyRing: QrKeyRing): string {
  const signed = `${QR_TOKEN_PREFIX}.${kid}.${facts.ticketId}|${String(facts.rwId)}|${facts.validOn}`;
  return createHmac('sha256', keyOf(kid, keyRing))
    .update(signed)
    .digest('base64url')
    .slice(0, QR_SIGNATURE_LENGTH);
}

// The ticket id travels as its 16 bytes, 22 characters, so the QR stays small enough to scan from a phone screen.
export function signTicket(facts: SignedTicketFacts, kid: string, keyRing: QrKeyRing): string {
  if (!QR_KID_PATTERN.test(kid)) throw new RangeError('A QR kid is lowercase letters and digits');
  if (!UUID_PATTERN.test(facts.ticketId)) throw new RangeError('A ticket id is a uuid');
  const ticketId = Buffer.from(facts.ticketId.replace(/-/g, ''), 'hex').toString('base64url');
  return `${QR_TOKEN_PREFIX}.${kid}.${ticketId}.${ticketSignature(facts, kid, keyRing)}`;
}
