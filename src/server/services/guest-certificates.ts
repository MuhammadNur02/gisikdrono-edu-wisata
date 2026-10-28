import 'server-only';

import { CERTIFICATE_RETENTION_DAYS } from '@/config/guest';
import {
  svcCheckCertificatePhone,
  svcLockCertificatePhone,
  type CertificatePhoneCheck,
} from '@/db/rpc-certificates';
import type { DatabaseClient } from '@/db/rpc-result';
import { isFirstRefusal, refundRateLimits, withinRateLimits } from '@/lib/rate-limit';
import { formatCertificateSlot } from '@/lib/utils/certificate-slots';
import {
  certificateBookingOf,
  participantCertificateIdsOf,
  standingCertificatesOf,
  type CertificateBooking,
  type StandingCertificate,
} from '@/server/services/guest-certificate-reads';
import type {
  CertificatePhoneStepUp,
  GuestCertificate,
  GuestCertificateView,
} from '@/types/certificate';

// The visitor's certificate page (Task P4.5.03; docs/PRD.md FR-POST-02; docs/Security.md §6.7, §10.3, DOC-02,
// GUEST-06), on the service-role client document-service.ts hands in, keyed by the booking id a verified certificate
// link gave. A certificate that prints a person's name (every participant's, and the group's of an individual visit)
// opens only after the last-4 step-up, never for a booking whose number no WhatsApp code proved, and never once ten
// wrong tries blocked the step-up; everything stops 90 days after the last visit day, when
// internal.purge_participants removes the names and their files. The downloads are guest-certificate-downloads.ts.

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

export function phoneStepUpOf(booking: CertificateBooking): CertificatePhoneStepUp {
  if (!booking.isPhoneProven) return 'unverified';
  return booking.isPhoneBlocked ? 'blocked' : 'open';
}

function toGuestCertificate(
  row: StandingCertificate,
  slot: string,
  hasPhoneProof: boolean,
): GuestCertificate {
  const needsPhone = row.kind === 'participant' || row.institution_name === null;
  const recipient = needsPhone ? (hasPhoneProof ? row.recipient_name : null) : row.institution_name;
  return {
    id: row.id,
    kind: row.kind,
    number: row.certificate_number,
    recipient,
    needsPhone,
    slot,
  };
}

// A participant's slot is its place among every participant certificate the booking was ever issued, never its place
// in this list, so a certificate revoked or held back since leaves a gap instead of handing its slot to the next person.
function slotOf(row: StandingCertificate, participantIds: readonly string[]): string | null {
  if (row.kind === 'group') return formatCertificateSlot({ kind: 'group' });
  const index = participantIds.indexOf(row.id);
  return index < 0 ? null : formatCertificateSlot({ kind: 'participant', position: index + 1 });
}

// The released certificates in the page's order, each with its download slot.
function listedCertificates(
  rows: readonly StandingCertificate[],
  participantIds: readonly string[],
  hasPhoneProof: boolean,
): GuestCertificate[] {
  return rows.flatMap((row) => {
    const slot = slotOf(row, participantIds);
    if (row.released_at === null || slot === null) return [];
    return [toGuestCertificate(row, slot, hasPhoneProof)];
  });
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
  if (rows.every((row) => row.released_at === null)) return { state: 'held', availableUntil };
  const phoneStepUp = phoneStepUpOf(booking);
  const hasPhoneProof = phoneStepUp === 'open' && request.hasPhoneProof;
  const participantIds = await participantCertificateIdsOf(adminClient, request.bookingId);
  const certificates = listedCertificates(rows, participantIds, hasPhoneProof).filter(
    (certificate) => phoneStepUp !== 'unverified' || !certificate.needsPhone,
  );
  return { state: 'ready', availableUntil, certificates, hasPhoneProof, phoneStepUp };
}

// Twenty tries per IP and five per booking a day; a right try is given back, so only wrong ones count (review of
// PR #94, M3). The first refusal of a booking raises the superadmin's alert; the database keeps the wrong tries of the
// whole window and answers blocked at the tenth (L1).
export async function stepUpCertificatePhone(
  adminClient: DatabaseClient,
  check: { bookingId: string; lastFour: string; ipBucket: string; ipHash: string },
): Promise<PhoneStepUp> {
  const perIp = { name: 'certificate_phone:ip', subject: check.ipBucket } as const;
  const perBooking = { name: 'certificate_phone:booking', subject: check.bookingId } as const;
  if (!(await withinRateLimits(adminClient, [perIp]))) return 'locked';
  if (!(await withinRateLimits(adminClient, [perBooking]))) {
    if (await isFirstRefusal(adminClient, perBooking)) {
      await svcLockCertificatePhone(adminClient, check.bookingId);
    }
    await refundRateLimits(adminClient, [perIp]);
    return 'locked';
  }
  const answer = await svcCheckCertificatePhone(adminClient, check);
  if (answer === 'verified') await refundRateLimits(adminClient, [perIp, perBooking]);
  return answer;
}
