import type { EnumValue } from '@/db/enums';

// One certificate as /dashboard/certificates shows it (Task P4.5.03): its number and standing, never the name it
// carries or its verify code, which no API role reads (0005).
export interface CertificateSummary {
  id: string;
  number: string;
  status: EnumValue<'certificate_status'>;
  // Released: nobody came unpaid, or the superadmin waived that.
  isReleased: boolean;
  // Issued, released and not purged: api/documents/certificate/[id] hands it out.
  isDownloadable: boolean;
}

// A booking's certificates, one row of the list.
export interface CertificateBooking {
  // The booking's id.
  id: string;
  // null outside the window in which the staff member may read the booking itself.
  bookingCode: string | null;
  institutionName: string | null;
  visitDate: string;
  rwIds: number[];
  group: CertificateSummary;
  participants: CertificateSummary[];
  // The people the booking's tickets this staff member sees let in above the booking.
  unpaidPax: number;
}

// One certificate on the visitor's /reservasi/[bookingCode]/sertifikat (Task P4.5.03): the institution a group
// certificate names, a participant's name only once the PIC's number was proven (needsPhone), never a verify code.
// slot is the last segment of its download address (rombongan, peserta-<n>), never its id.
export interface GuestCertificate {
  id: string;
  kind: EnumValue<'certificate_kind'>;
  number: string;
  recipient: string | null;
  needsPhone: boolean;
  slot: string;
}

// The last-4 step-up: open, blocked for good after ten wrong tries over the window (review of PR #94, L1), or
// unverified when no WhatsApp code ever proved the PIC's number. Blocked and unverified both send the visitor to the
// kelurahan.
export type CertificatePhoneStepUp = 'open' | 'blocked' | 'unverified';

// What the page shows: nothing after 90 days from the last visit day (expired), nothing yet (pending), a booking held
// back for its unpaid visitors (held), or the certificates it may hand out (ready).
export type GuestCertificateView =
  | { state: 'expired' | 'pending' | 'held'; availableUntil: string }
  | {
      state: 'ready';
      availableUntil: string;
      certificates: GuestCertificate[];
      hasPhoneProof: boolean;
      phoneStepUp: CertificatePhoneStepUp;
    };
