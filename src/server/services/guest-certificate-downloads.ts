import 'server-only';

import { svcLogAudit } from '@/db/rpc';
import type { DatabaseClient } from '@/db/rpc-result';
import { AppError } from '@/lib/errors';
import type { CertificateSlot } from '@/lib/utils/certificate-slots';
import {
  certificateBundlePdf,
  certificateFileName,
  certificatePdf,
  printsAPersonsName,
  servableCertificatesOf,
} from '@/server/services/certificate-documents';
import type { CertificateRow } from '@/server/services/certificate-pages';
import {
  certificateBookingOf,
  participantCertificateIdsOf,
} from '@/server/services/guest-certificate-reads';
import { certificatesAvailableUntil, phoneStepUpOf } from '@/server/services/guest-certificates';

// The guest certificate page's downloads (review of PR #94, M1, M2, M3): /reservasi/<code>/sertifikat/unduh/<slot>
// renders the PDF on this request when it has no kept file yet and streams it inline, private and no-store, so no
// signed URL or cached copy outlives the purge. The same checks as the page: the window, the booking, the standing,
// and the step-up for a certificate that prints a person's name; then every download is audited under the visitor.

export interface GuestCertificateRequest {
  bookingId: string;
  bookingCode: string;
  slot: CertificateSlot;
  hasPhoneProof: boolean;
  today: string;
  siteUrl: string;
  ipHash: string;
}

export interface GuestCertificateFile {
  fileName: string;
  pdf: Buffer;
}

// A participant's slot counts over every participant certificate the booking was ever issued
// (participantCertificateIdsOf), so the slot of one revoked or held back since is empty, never the next person's.
async function certificatesInSlot(
  adminClient: DatabaseClient,
  bookingId: string,
  slot: CertificateSlot,
): Promise<CertificateRow[]> {
  const servable = await servableCertificatesOf(adminClient, bookingId);
  if (slot.kind === 'group') return servable.filter((row) => row.kind === 'group').slice(0, 1);
  const participants = servable.filter((row) => row.kind === 'participant');
  if (slot.kind === 'all_participants') return participants;
  const chosenId = (await participantCertificateIdsOf(adminClient, bookingId))[slot.position - 1];
  return participants.filter((row) => row.id === chosenId);
}

// The certificates the slot opens for this visitor: NOT_FOUND for an empty slot, the window passed, a number no code
// proved or a step-up blocked for good; FORBIDDEN while a name waits for the step-up.
async function openedCertificates(
  adminClient: DatabaseClient,
  request: GuestCertificateRequest,
): Promise<CertificateRow[]> {
  const booking = await certificateBookingOf(adminClient, request.bookingId);
  if (request.today > certificatesAvailableUntil(booking.visitDateEnd)) {
    throw new AppError('NOT_FOUND');
  }
  const chosen = await certificatesInSlot(adminClient, request.bookingId, request.slot);
  if (chosen.length === 0) throw new AppError('NOT_FOUND');
  if (chosen.some(printsAPersonsName)) {
    if (phoneStepUpOf(booking) !== 'open') throw new AppError('NOT_FOUND');
    if (!request.hasPhoneProof) throw new AppError('FORBIDDEN');
  }
  return chosen;
}

// M2: who downloaded what, as the visitor (a null actor), with the hashed IP; never a name.
function auditDownload(
  adminClient: DatabaseClient,
  request: GuestCertificateRequest,
  certificates: readonly CertificateRow[],
): Promise<void> {
  const [only] = certificates;
  if (request.slot.kind !== 'all_participants' && only) {
    return svcLogAudit(adminClient, {
      actorId: null,
      action: 'certificate.downloaded',
      entityType: 'certificates',
      entityId: only.id,
      metadata: { booking_id: request.bookingId, kind: only.kind, ip_hash: request.ipHash },
    });
  }
  return svcLogAudit(adminClient, {
    actorId: null,
    action: 'certificate.bundle_downloaded',
    entityType: 'bookings',
    entityId: request.bookingId,
    metadata: {
      kind: 'participant',
      certificate_ids: certificates.map((certificate) => certificate.id),
      ip_hash: request.ipHash,
    },
  });
}

export async function guestCertificateFile(
  adminClient: DatabaseClient,
  request: GuestCertificateRequest,
): Promise<GuestCertificateFile> {
  const certificates = await openedCertificates(adminClient, request);
  const context = { siteUrl: request.siteUrl, readerId: null };
  const [only] = certificates;
  const file =
    request.slot.kind === 'all_participants' || !only
      ? {
          fileName: `participants-${request.bookingCode}.pdf`,
          pdf: await certificateBundlePdf(adminClient, certificates, context),
        }
      : {
          fileName: certificateFileName(only),
          pdf: await certificatePdf(adminClient, only, context),
        };
  await auditDownload(adminClient, request, certificates);
  return file;
}
