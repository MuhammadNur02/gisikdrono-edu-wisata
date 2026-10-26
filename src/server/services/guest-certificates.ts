import 'server-only';

import { CERTIFICATE_RETENTION_DAYS } from '@/config/guest';
import {
  svcCheckCertificatePhone,
  svcLockCertificatePhone,
  type CertificatePhoneCheck,
} from '@/db/rpc-certificates';
import type { DatabaseClient } from '@/db/rpc-result';
import { certificatesCopy } from '@/lib/copy/certificates';
import { AppError } from '@/lib/errors';
import { isFirstRefusal, withinRateLimits } from '@/lib/rate-limit';
import {
  isServable,
  keptCertificatePath,
  loadCertificate,
  printsAPersonsName,
} from '@/server/services/certificate-documents';
import {
  certificateBookingOf,
  standingCertificatesOf,
  type StandingCertificate,
} from '@/server/services/guest-certificate-reads';
import type { GuestCertificate, GuestCertificateView } from '@/types/certificate';

// The visitor's certificate page (Task P4.5.03; docs/PRD.md FR-POST-02; docs/Security.md §6.7, §10.3, DOC-02,
// GUEST-06), on the service-role client document-service.ts hands in, keyed by the booking id a verified certificate
// link gave. A certificate that prints a person's name (every participant's, and the group's of an individual visit)
// opens only after the last-4 step-up, and never for a booking whose number no WhatsApp code proved; everything
// stops 90 days after the last visit day, when internal.purge_participants removes the names and their files.

const text = certificatesCopy.guest;
const MS_PER_DAY = 86_400_000;
const ISO_DATE_LENGTH = 'YYYY-MM-DD'.length;

export type PhoneStepUp = CertificatePhoneCheck | 'locked';

// The last day the page answers: the last visit day plus the retention window, as a Jakarta calendar date.
export function certificatesAvailableUntil(visitDateEnd: string): string {
  const until = new Date(
    Date.parse(`${visitDateEnd}T00:00:00Z`) + CERTIFICATE_RETENTION_DAYS * MS_PER_DAY,
  );
  return until.toISOString().slice(0, ISO_DATE_LENGTH);
}

function toGuestCertificate(row: StandingCertificate, hasPhoneProof: boolean): GuestCertificate {
  const needsPhone = row.kind === 'participant' || row.institution_name === null;
  const recipient = needsPhone ? (hasPhoneProof ? row.recipient_name : null) : row.institution_name;
  return { id: row.id, kind: row.kind, number: row.certificate_number, recipient, needsPhone };
}

export async function loadGuestCertificates(
  adminClient: DatabaseClient,
  request: { bookingId: string; hasPhoneProof: boolean; today: string },
): Promise<GuestCertificateView> {
  const booking = await certificateBookingOf(adminClient, request.bookingId);
  const availableUntil = certificatesAvailableUntil(booking.visitDateEnd);
  if (request.today > availableUntil) return { state: 'expired', availableUntil };
  const rows = await standingCertificatesOf(adminClient, request.bookingId);
  if (rows.length === 0) return { state: 'pending', availableUntil };
  const released = rows.filter((row) => row.released_at !== null);
  if (released.length === 0) return { state: 'held', availableUntil };
  const hasPhoneProof = booking.isPhoneProven && request.hasPhoneProof;
  const certificates = released
    .map((row) => toGuestCertificate(row, hasPhoneProof))
    .filter((certificate) => booking.isPhoneProven || !certificate.needsPhone);
  return {
    state: 'ready',
    availableUntil,
    certificates,
    hasPhoneProof,
    canProvePhone: booking.isPhoneProven,
  };
}

// Five tries per booking a day (certificate_phone:booking); the first refusal raises the superadmin's alert.
export async function stepUpCertificatePhone(
  adminClient: DatabaseClient,
  check: { bookingId: string; lastFour: string },
): Promise<PhoneStepUp> {
  const limit = { name: 'certificate_phone:booking', subject: check.bookingId } as const;
  if (!(await withinRateLimits(adminClient, [limit]))) {
    if (await isFirstRefusal(adminClient, limit)) {
      await svcLockCertificatePhone(adminClient, check.bookingId);
    }
    return 'locked';
  }
  return svcCheckCertificatePhone(adminClient, check);
}

// Where the file of one of the booking's servable certificates is kept, after the page's own checks: the window, the
// booking, the standing, and the step-up for a certificate that prints a person's name. Rendered on first download.
export async function guestCertificatePath(
  adminClient: DatabaseClient,
  request: {
    bookingId: string;
    certificateId: string;
    hasPhoneProof: boolean;
    today: string;
    siteUrl: string;
  },
): Promise<string> {
  const booking = await certificateBookingOf(adminClient, request.bookingId);
  if (request.today > certificatesAvailableUntil(booking.visitDateEnd)) {
    throw new AppError('STATE_INVALID', text.expired);
  }
  const certificate = await loadCertificate(adminClient, request.certificateId);
  if (!certificate || certificate.bookingId !== request.bookingId || !isServable(certificate)) {
    throw new AppError('NOT_FOUND');
  }
  if (printsAPersonsName(certificate)) {
    if (!booking.isPhoneProven) throw new AppError('NOT_FOUND');
    if (!request.hasPhoneProof) throw new AppError('FORBIDDEN', text.needsPhone);
  }
  return keptCertificatePath(adminClient, certificate, {
    siteUrl: request.siteUrl,
    readerId: null,
  });
}
