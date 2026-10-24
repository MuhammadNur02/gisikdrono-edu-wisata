import 'server-only';

import type { DatabaseClient } from '@/db/rpc-result';
import { findManualTicket, scanTicket, type ScanCall, type ScanReply } from '@/db/rpc-scanner';
import type { Json } from '@/db/types';
import { serverEnv } from '@/lib/env';
import { AppError } from '@/lib/errors';
import { isAuthenticTicket, readTicketToken } from '@/lib/qr/verify';
import { attestationExpiry, attestScan } from '@/lib/scanner/attest';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { databaseErrorCode, isTransientDatabaseError } from '@/lib/utils/database-errors';
import type { ScanRequest } from '@/lib/validations/scanner';

// POST /api/tickets/verify (Task P4.4.02; CLAUDE.md §7.4; docs/Security.md §9.2, §9.3). Everything runs on the
// officer's own session client, never the service role. The QR's HMAC is checked here, where the signing keys live,
// against the ticket's own row, and the unreadable QR is looked up with find_manual_ticket; only then does the route
// attest the ticket (src/lib/scanner/attest.ts), and scan_ticket lets a ticket be scanned under that attestation only
// (independent review of PR #54, M1). scan_ticket takes the scanner's turn itself. A ticket the officer cannot read
// is attested unchecked: the database answers it wrong_rw or not_found without saying anything of it.

export type GateOutcome = ScanReply | { kind: 'unavailable' };

export interface ScanDevice {
  userAgent: string | null;
  ip: string;
}

interface GateContext {
  client: DatabaseClient;
  officerId: string;
  device: Json;
}

type ScanTarget = Pick<ScanCall, 'source' | 'raw' | 'ticketId'>;

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

// L4 of the review of PR #54: a manual commit scans the ticket its own preview found, so a check-in costs one lookup.
async function ticketOfManualPreview(
  context: GateContext,
  attemptId: string,
): Promise<string | null> {
  const { data, error } = await context.client
    .from('ticket_scans')
    .select('ticket_id')
    .eq('attempt_id', attemptId)
    .eq('phase', 'validate')
    .eq('source', 'manual')
    .eq('scanned_by', context.officerId)
    .maybeSingle();
  if (error) throw error;
  return data?.ticket_id ?? null;
}

function deviceOf(device: ScanDevice): Json {
  return device.userAgent === null
    ? { ip: device.ip }
    : { user_agent: device.userAgent, ip: device.ip };
}

function attestationOf(context: GateContext, scan: ScanRequest, target: ScanTarget) {
  if (target.ticketId === null) return null;
  const expiresAt = attestationExpiry(Date.now());
  const fields = {
    officerId: context.officerId,
    ticketId: target.ticketId,
    attemptId: scan.attemptId,
    mode: scan.mode,
    source: target.source,
    expiresAt,
  };
  return { value: attestScan(fields, serverEnv.CRON_SECRET), expiresAt };
}

function scanOf(context: GateContext, scan: ScanRequest, target: ScanTarget): Promise<ScanReply> {
  return scanTicket(context.client, {
    ...target,
    mode: scan.mode,
    attemptId: scan.attemptId,
    device: context.device,
    attestation: attestationOf(context, scan, target),
    attendeeCount: scan.mode === 'commit' ? (scan.attendeeCount ?? null) : null,
    overrideReason: scan.overrideReason ?? null,
  });
}

async function manualScanOf(
  context: GateContext,
  scan: Extract<ScanRequest, { bookingCode: string }>,
): Promise<ScanReply> {
  if (scan.mode === 'commit') {
    const ticketId = await ticketOfManualPreview(context, scan.attemptId);
    return scanOf(context, scan, { source: 'manual', raw: null, ticketId });
  }
  const found = await findManualTicket(context.client, {
    bookingCode: scan.bookingCode,
    phoneLastDigits: scan.phoneLastDigits,
  });
  if (found.rateLimited) return { kind: 'slowed', retryAfterSeconds: null };
  return scanOf(context, scan, { source: 'manual', raw: null, ticketId: found.ticketId });
}

async function outcomeOf(context: GateContext, scan: ScanRequest): Promise<ScanReply> {
  if ('token' in scan) {
    const ticketId = await ticketOfToken(context.client, scan.token);
    return scanOf(context, scan, { source: 'qr', raw: scan.token, ticketId });
  }
  return manualScanOf(context, scan);
}

export async function verifyScan(
  scan: ScanRequest,
  device: ScanDevice,
  officerId: string,
): Promise<GateOutcome> {
  try {
    const client = await createSupabaseServerClient();
    return await outcomeOf({ client, officerId, device: deviceOf(device) }, scan);
  } catch (error) {
    // An outage a retry may get past is the officer's to retry (review of PR #54, L3); the database's refusals of
    // the call itself are a count outside 1 to twice the booking, or a session that may not scan.
    if (isTransientDatabaseError(error)) return { kind: 'unavailable' };
    const code = databaseErrorCode(error);
    if (code === INVALID_PARAMETER) throw new AppError('VALIDATION');
    if (code === INSUFFICIENT_PRIVILEGE) throw new AppError('FORBIDDEN');
    throw error;
  }
}
