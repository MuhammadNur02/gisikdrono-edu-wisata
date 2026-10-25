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
