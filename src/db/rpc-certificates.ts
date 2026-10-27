import 'server-only';

import { z } from 'zod';

import { resultOf, type DatabaseClient } from '@/db/rpc-result';

// The certificate functions (Task P4.5; 20261025080000_certificate_rpcs.sql, 20261103100000_certificate_documents.sql).
// issue_certificates and revoke_certificate are staff RPCs, called on the staff member's own session client so their
// scope and AAL2 checks see who asks; the kept file is recorded through the service role by document-service.ts.

const writtenCountSchema = z.int().nonnegative();

// How many certificates the call wrote, brought back or released; never the rows, whose names and verify codes reach
// no API role.
export async function issueCertificates(
  client: DatabaseClient,
  issue: { bookingId: string; waiverReason: string | null },
): Promise<number> {
  return writtenCountSchema.parse(
    await resultOf(
      client.rpc('issue_certificates', {
        p_booking_id: issue.bookingId,
        p_waiver_reason: issue.waiverReason ?? undefined,
      }),
    ),
  );
}

export function revokeCertificate(
  client: DatabaseClient,
  revoke: { certificateId: string; reason: string },
): Promise<void> {
  return resultOf(
    client.rpc('revoke_certificate', {
      p_certificate_id: revoke.certificateId,
      p_reason: revoke.reason,
    }),
  );
}

// The file a rendered certificate was kept in, under the reader's name: the staff member who opened or re-rendered it,
// or null for the visitor.
export function svcRecordCertificatePdf(
  adminClient: DatabaseClient,
  kept: { certificateId: string; path: string; readerId: string | null },
): Promise<void> {
  return resultOf(
    adminClient.rpc('svc_record_document_pdf', {
      p_kind: 'certificate',
      p_document_id: kept.certificateId,
      p_path: kept.path,
      p_actor_id: kept.readerId ?? undefined,
    }),
  );
}

const phoneCheckSchema = z.enum(['verified', 'mismatch', 'blocked', 'unverified']);
export type CertificatePhoneCheck = z.infer<typeof phoneCheckSchema>;

// The guest certificate page's step-up (Task P4.5.03, 20261104210100): the four digits and the hashed IP go in, only
// the answer comes back; the PIC's number never leaves the database, which counts the wrong tries of the window and
// records a right one as a pii_revealed event.
export async function svcCheckCertificatePhone(
  adminClient: DatabaseClient,
  check: { bookingId: string; lastFour: string; ipHash: string },
): Promise<CertificatePhoneCheck> {
  return phoneCheckSchema.parse(
    await resultOf(
      adminClient.rpc('svc_check_certificate_phone', {
        p_booking_id: check.bookingId,
        p_last_four: check.lastFour,
        p_ip_hash: check.ipHash,
      }),
    ),
  );
}

// The five tries of a day are used up: one open high alert per booking.
export async function svcLockCertificatePhone(
  adminClient: DatabaseClient,
  bookingId: string,
): Promise<void> {
  await resultOf(adminClient.rpc('svc_lock_certificate_phone', { p_booking_id: bookingId }));
}
