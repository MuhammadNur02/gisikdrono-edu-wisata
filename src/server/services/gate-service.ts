import 'server-only';

import type { DatabaseClient } from '@/db/rpc-result';
import { claimScannerTurn, findManualTicket, scanTicket, type ScanCall } from '@/db/rpc-scanner';
import type { Json } from '@/db/types';
import { serverEnv } from '@/lib/env';
import { AppError } from '@/lib/errors';
import { isAuthenticTicket, readTicketToken } from '@/lib/qr/verify';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { ScanRequest } from '@/lib/validations/scanner';
import type { VerifyTicketResponse } from '@/types/scanner';

// POST /api/tickets/verify (Task P4.4.02; CLAUDE.md §7.4; docs/Security.md §9.2, §9.3). Everything runs on the
// officer's own session client, never the service role: the turn and its limits, the manual lookup and the scan are
// staff RPCs that take the officer and their RW from auth.uid(). The QR's HMAC is checked here, where the signing keys
// live, against the ticket's own row; a ticket the officer cannot read is passed on unchecked, and the database answers
// it wrong_rw or not_found without saying anything of it.

export type GateOutcome =
  | { kind: 'answered'; response: VerifyTicketResponse }
  | { kind: 'slowed'; retryAfterSeconds: number | null };

export interface ScanDevice {
  userAgent: string | null;
  ip: string;
}

const INVALID_PARAMETER = '22023';
const INSUFFICIENT_PRIVILEGE = '42501';

// The ticket a QR names when its signature is genuine; null when it is not. A row RLS hides is passed on unchecked.
async function ticketOfToken(client: DatabaseClient, token: string): Promise<string | null> {
  const read = readTicketToken(token);
  if (read === null) return null;
  const { data, error } = await client
    .from('tickets_qr')
    .select('id, rw_id, valid_on')
    .eq('id', read.ticketId)
    .maybeSingle();
  if (error) throw error;
  if (data === null) return read.ticketId;
  const facts = { ticketId: data.id, rwId: data.rw_id, validOn: data.valid_on };
  return isAuthenticTicket(read, facts, serverEnv.QR_SIGNING_KEYS) ? data.id : null;
}

function deviceOf(device: ScanDevice): Json {
  return device.userAgent === null
    ? { ip: device.ip }
    : { user_agent: device.userAgent, ip: device.ip };
}

function scanCallOf(
  scan: ScanRequest,
  device: ScanDevice,
): Omit<ScanCall, 'source' | 'raw' | 'ticketId'> {
  return {
    mode: scan.mode,
    attemptId: scan.attemptId,
    device: deviceOf(device),
    attendeeCount: scan.mode === 'commit' ? (scan.attendeeCount ?? null) : null,
    overrideReason: scan.overrideReason ?? null,
  };
}

function postgresCodeOf(error: unknown): unknown {
  return typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
}

async function scanOf(
  client: DatabaseClient,
  scan: ScanRequest,
  device: ScanDevice,
): Promise<GateOutcome> {
  const call = scanCallOf(scan, device);
  if ('token' in scan) {
    const ticketId = await ticketOfToken(client, scan.token);
    const response = await scanTicket(client, { ...call, source: 'qr', raw: scan.token, ticketId });
    return { kind: 'answered', response };
  }
  const found = await findManualTicket(client, {
    bookingCode: scan.bookingCode,
    phoneLastDigits: scan.phoneLastDigits,
  });
  if (found.rateLimited) return { kind: 'slowed', retryAfterSeconds: null };
  const response = await scanTicket(client, {
    ...call,
    source: 'manual',
    raw: null,
    ticketId: found.ticketId,
  });
  return { kind: 'answered', response };
}

export async function verifyScan(scan: ScanRequest, device: ScanDevice): Promise<GateOutcome> {
  const client = await createSupabaseServerClient();
  try {
    const turn = await claimScannerTurn(client);
    if (!turn.allowed) return { kind: 'slowed', retryAfterSeconds: turn.retryAfterSeconds };
    return await scanOf(client, scan, device);
  } catch (error) {
    // The database's refusals of the call itself: a count outside 1 to twice the booking, or a session that may not
    // scan.
    const code = postgresCodeOf(error);
    if (code === INVALID_PARAMETER) throw new AppError('VALIDATION');
    if (code === INSUFFICIENT_PRIVILEGE) throw new AppError('FORBIDDEN');
    throw error;
  }
}
