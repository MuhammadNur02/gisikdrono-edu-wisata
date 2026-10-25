import { certificatesCopy } from '@/lib/copy/certificates';
import type { CertificateBooking, CertificateSummary } from '@/types/certificate';

// What the certificate list and its dialog both say of a booking, kept apart from the dialog so the list's first load
// carries none of the dialog's forms.

export function bookingTitle(booking: CertificateBooking): string {
  return booking.institutionName ?? certificatesCopy.dashboard.noInstitution;
}

// A held certificate is issued but waits for the release; one revoked or purged is never downloaded again.
export function isHeld(certificate: CertificateSummary): boolean {
  return certificate.status === 'issued' && !certificate.isReleased;
}

export function hasHeldCertificates(booking: CertificateBooking): boolean {
  return [booking.group, ...booking.participants].some(isHeld);
}

// The unpaid count is the gates this staff member sees: an RW admin sees one gate of a combo, so a combo's count is
// only the superadmin's to show (review of PR #71, L6).
export function unpaidCountShown(
  booking: CertificateBooking,
  isSuperadmin: boolean,
): number | null {
  if (booking.unpaidPax === 0) return null;
  return isSuperadmin || booking.rwIds.length <= 1 ? booking.unpaidPax : null;
}
