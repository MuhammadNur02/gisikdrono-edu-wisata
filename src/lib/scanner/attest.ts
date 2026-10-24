import 'server-only';

import { createHmac } from 'node:crypto';

import type { ScanMode } from '@/types/scanner';

// The route's attestation of one scan (independent review of PR #54, M1; docs/Security.md §9.2). POST
// /api/tickets/verify makes it only after it checked the QR's HMAC against the ticket's own row, or after
// find_manual_ticket found the ticket, and public.scan_ticket checks it before it lets a ticket be scanned: without
// it, a ticket id read through RLS is not enough to check a group in. K = HMAC-SHA256(CRON_SECRET,
// 'gsk-scanner-attest-v1') on both sides, so no new secret is provisioned and rotating CRON_SECRET rotates K; the
// database side is internal.scanner_attestation (20261026090000_scanner_attestation.sql).

const KEY_LABEL = 'gsk-scanner-attest-v1';
const FIELD_SEPARATOR = '|';
const MS_PER_SECOND = 1000;
// scan_ticket refuses an attestation older than this, and one that claims to live past 120 s.
export const SCAN_ATTESTATION_TTL_SECONDS = 60;

export interface AttestedScan {
  officerId: string;
  ticketId: string;
  attemptId: string;
  mode: ScanMode;
  source: 'qr' | 'manual';
  // Seconds since the epoch.
  expiresAt: number;
}

function attestationKey(cronSecret: string): Buffer {
  return createHmac('sha256', cronSecret).update(KEY_LABEL).digest();
}

// Hex, as Postgres encode(..., 'hex') writes it.
export function attestScan(scan: AttestedScan, cronSecret: string): string {
  const message = [
    scan.officerId,
    scan.ticketId,
    scan.attemptId,
    scan.mode,
    scan.source,
    String(scan.expiresAt),
  ].join(FIELD_SEPARATOR);
  return createHmac('sha256', attestationKey(cronSecret)).update(message).digest('hex');
}

export function attestationExpiry(nowMs: number): number {
  return Math.floor(nowMs / MS_PER_SECOND) + SCAN_ATTESTATION_TTL_SECONDS;
}
