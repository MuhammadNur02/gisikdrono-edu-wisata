import type { EnumValue } from '@/db/enums';

// What /verifikasi/[code] shows of a document (docs/PRD.md FR-PUB-20): its number, who it is for, its date and its
// status. A certificate names its recipient, as the certificate itself does; nothing else of a booking is here.
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
      number: string;
      recipientName: string;
      institutionName: string | null;
      visitDate: string;
      status: EnumValue<'certificate_status'>;
    };
