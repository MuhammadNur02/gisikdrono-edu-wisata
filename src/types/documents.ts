import type { EnumValue } from '@/db/enums';

// What /verifikasi/[code] shows of a document (docs/PRD.md FR-PUB-20): its number, who it is for, its date and its
// status. A certificate names its recipient, as the certificate itself does, and its institution, date and status, but
// not its number (Task P4.5.03, docs/Security.md §10.4); nothing else of a booking is here.
export type VerifiedDocument =
  | {
      kind: 'quotation';
      number: string;
      institutionName: string | null;
      version: number;
      validUntil: string;
      status: EnumValue<'quotation_status'>;
    }
  | {
      kind: 'certificate';
      // null once the retention run removed the name.
      recipientName: string | null;
      institutionName: string | null;
      visitDate: string;
      status: EnumValue<'certificate_status'>;
    };
