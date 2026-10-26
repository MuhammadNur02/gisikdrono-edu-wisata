import 'server-only';

import { z } from 'zod';

import { resultOf, type DatabaseClient } from '@/db/rpc-result';
import type { DsrCloseOutcome, DsrRequestType } from '@/types/dsr';

// The superadmin's data-request queue (Task P4.10.03, 20261104140100). The dsr_* calls run on the superadmin's session
// client, so auth.uid(), AAL2 and the fresh-code check apply; the svc_ calls are the guest's, on the service-role
// client of src/server/services/booking-service.ts, keyed by the booking of the verified guest link.

const openedSchema = z.strictObject({ request_id: z.uuid(), notified: z.boolean() });
const finishedSchema = z.object({
  stage: z.enum(['completed', 'rejected']),
  notified: z.boolean(),
  participants_deleted: z.int().nonnegative().optional(),
});
const otpIssueSchema = z.object({ result: z.string() });
const confirmSchema = z.object({ result: z.string(), confirmed: z.int().nonnegative().optional() });

export interface DsrFinish {
  isCompleted: boolean;
  isGuestNotified: boolean;
}

function finishOf(reply: unknown): DsrFinish {
  const finished = finishedSchema.parse(reply);
  return { isCompleted: finished.stage === 'completed', isGuestNotified: finished.notified };
}

export async function dsrOpen(
  client: DatabaseClient,
  request: { bookingId: string; requestType: DsrRequestType; reason: string },
): Promise<{ requestId: string; isGuestNotified: boolean }> {
  const reply = openedSchema.parse(
    await resultOf(
      client.rpc('dsr_open', {
        p_booking_id: request.bookingId,
        p_request_type: request.requestType,
        p_reason: request.reason,
      }),
    ),
  );
  return { requestId: reply.request_id, isGuestNotified: reply.notified };
}

export async function dsrAcknowledge(client: DatabaseClient, requestId: string): Promise<void> {
  await resultOf(client.rpc('dsr_acknowledge', { p_request_id: requestId }));
}

export async function dsrRecordExport(
  client: DatabaseClient,
  request: { requestId: string; jsonPath: string; pdfPath: string; note: string },
): Promise<DsrFinish> {
  return finishOf(
    await resultOf(
      client.rpc('dsr_record_export', {
        p_request_id: request.requestId,
        p_json_path: request.jsonPath,
        p_pdf_path: request.pdfPath,
        p_note: request.note,
      }),
    ),
  );
}

export async function dsrDeleteParticipants(
  client: DatabaseClient,
  request: { requestId: string; note: string },
): Promise<DsrFinish> {
  return finishOf(
    await resultOf(
      client.rpc('dsr_delete_participants', {
        p_request_id: request.requestId,
        p_note: request.note,
      }),
    ),
  );
}

export async function dsrAnonymiseBooking(
  client: DatabaseClient,
  request: { requestId: string; note: string },
): Promise<DsrFinish> {
  return finishOf(
    await resultOf(
      client.rpc('dsr_anonymise_booking', {
        p_request_id: request.requestId,
        p_note: request.note,
      }),
    ),
  );
}

export async function dsrClose(
  client: DatabaseClient,
  request: { requestId: string; outcome: DsrCloseOutcome; note: string },
): Promise<DsrFinish> {
  return finishOf(
    await resultOf(
      client.rpc('dsr_close', {
        p_request_id: request.requestId,
        p_outcome: request.outcome,
        p_note: request.note,
      }),
    ),
  );
}

export type DsrCodeIssue = 'sent' | 'none' | 'limited' | 'unavailable';

// issue_phone_otp's answers as the guest's page reads them: sent, nothing awaiting, or not now.
export async function svcIssueDsrIdentityOtp(
  adminClient: DatabaseClient,
  otp: {
    bookingId: string;
    otpId: string;
    browserHash: string;
    codeHash: string;
    code: string;
    ip: string | null;
  },
): Promise<DsrCodeIssue> {
  const { result } = otpIssueSchema.parse(
    await resultOf(
      adminClient.rpc('svc_issue_dsr_identity_otp', {
        p_booking_id: otp.bookingId,
        p_otp_id: otp.otpId,
        p_browser_hash: otp.browserHash,
        p_code_hash: otp.codeHash,
        p_code: otp.code,
        p_ip: otp.ip ?? undefined,
      }),
    ),
  );
  if (result === 'sent' || result === 'none') return result;
  return result === 'degraded' || result === 'unavailable' ? 'unavailable' : 'limited';
}

export type DsrIdentityCheck = 'verified' | 'wrong_code' | 'locked' | 'expired';

export async function svcConfirmDsrIdentity(
  adminClient: DatabaseClient,
  check: { bookingId: string; browserHash: string; codeHash: string },
): Promise<DsrIdentityCheck> {
  const { result } = confirmSchema.parse(
    await resultOf(
      adminClient.rpc('svc_confirm_dsr_identity', {
        p_booking_id: check.bookingId,
        p_browser_hash: check.browserHash,
        p_code_hash: check.codeHash,
      }),
    ),
  );
  if (result === 'verified' || result === 'wrong_code' || result === 'locked') return result;
  return 'expired';
}
