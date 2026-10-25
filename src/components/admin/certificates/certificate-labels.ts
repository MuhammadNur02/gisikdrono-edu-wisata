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
