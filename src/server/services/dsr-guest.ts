import 'server-only';

import { randomUUID } from 'node:crypto';
import { isIP } from 'node:net';

import {
  svcConfirmDsrIdentity,
  svcIssueDsrIdentityOtp,
  type DsrCodeIssue,
  type DsrIdentityCheck,
} from '@/db/rpc-dsr';
import type { DatabaseClient } from '@/db/rpc-result';
import { drawOtpCode, otpBrowserHash, otpCodeHash } from '@/lib/otp';
import { rateLimitIpBucket } from '@/lib/utils/client-ip';
import { createDocumentSignedUrl } from '@/server/services/document-service';
import {
  DSR_OUTCOMES,
  DSR_REQUEST_TYPES,
  DSR_STATUSES,
  type DsrExportFormat,
  type GuestDsrRequest,
} from '@/types/dsr';

// The guest's side of a data request (Task P4.10.03): what /reservasi/<code>/privasi shows and where its export lies,
// read with the service-role client booking-service.ts hands in, keyed by the booking of a guest link that has passed
// requireGuestToken. The guest sees their own requests only; the number and the reason stay with the kelurahan.

const COLUMNS = `id, request_type, status, outcome, resolution_note, created_at, verified_at, fulfil_due_at,
  export_json_path, export_pdf_path`;

function oneOf<T extends string>(values: readonly T[], value: string | null): T | null {
  return values.find((candidate) => candidate === value) ?? null;
}

export async function readGuestDsrRequests(
  adminClient: DatabaseClient,
  bookingId: string,
): Promise<GuestDsrRequest[]> {
  const { data, error } = await adminClient
    .from('dsr_requests')
    .select(COLUMNS)
    .eq('booking_id', bookingId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data.flatMap((row) => {
    const requestType = oneOf(DSR_REQUEST_TYPES, row.request_type);
    const status = oneOf(DSR_STATUSES, row.status);
    if (requestType === null || status === null) return [];
    return [
      {
        id: row.id,
        requestType,
        status,
        outcome: oneOf(DSR_OUTCOMES, row.outcome),
        resolutionNote: row.resolution_note,
        createdAt: row.created_at,
        verifiedAt: row.verified_at,
        fulfilDueAt: row.fulfil_due_at,
        hasExport: row.export_json_path !== null,
      },
    ];
  });
}

export interface DsrCodeRequest {
  bookingId: string;
  // The gsk_otp_browser cookie's id: the code belongs to this browser, as a booking's code does.
  browserId: string;
  clientIp: string;
}

export interface DsrCodeCheck {
  bookingId: string;
  browserId: string;
  code: string;
}

export interface DsrDownload {
  bookingId: string;
  format: DsrExportFormat;
  fileName: string;
}

// The same caps as a booking's code (internal.issue_phone_otp): the IP's bucket, when the server knows one.
export function issueDsrCode(
  adminClient: DatabaseClient,
  request: DsrCodeRequest,
): Promise<DsrCodeIssue> {
  const code = drawOtpCode();
  return svcIssueDsrIdentityOtp(adminClient, {
    bookingId: request.bookingId,
    otpId: randomUUID(),
    browserHash: otpBrowserHash(request.browserId),
    codeHash: otpCodeHash(request.browserId, code),
    code,
    ip: isIP(request.clientIp) === 0 ? null : rateLimitIpBucket(request.clientIp),
  });
}

export function confirmDsrCode(
  adminClient: DatabaseClient,
  check: DsrCodeCheck,
): Promise<DsrIdentityCheck> {
  return svcConfirmDsrIdentity(adminClient, {
    bookingId: check.bookingId,
    browserHash: otpBrowserHash(check.browserId),
    codeHash: otpCodeHash(check.browserId, check.code),
  });
}

// A signed URL of 300 s to the booking's newest export in that format, or null when there is none.
export async function dsrDownloadUrl(
  adminClient: DatabaseClient,
  download: DsrDownload,
): Promise<string | null> {
  const path = await guestDsrExportPath(adminClient, download.bookingId, download.format);
  return path === null
    ? null
    : createDocumentSignedUrl(adminClient, path, 'dsr_export', download.fileName);
}

// The file of the booking's newest export in that format, or null; dsr_record_export put it under the booking's own
// folder, which createDocumentSignedUrl checks once more.
async function guestDsrExportPath(
  adminClient: DatabaseClient,
  bookingId: string,
  format: DsrExportFormat,
): Promise<string | null> {
  const { data, error } = await adminClient
    .from('dsr_requests')
    .select('export_json_path, export_pdf_path')
    .eq('booking_id', bookingId)
    .eq('outcome', 'exported')
    .not('export_json_path', 'is', null)
    .order('handled_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (data === null) return null;
  return format === 'json' ? data.export_json_path : data.export_pdf_path;
}
