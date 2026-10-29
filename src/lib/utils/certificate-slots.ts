import {
  CERTIFICATE_DOWNLOAD_SEGMENT,
  CERTIFICATE_PAGE,
  CERTIFICATE_SLOTS,
  GUEST_BOOKING_PATH,
} from '@/config/guest';

// The <slot> of /reservasi/<code>/sertifikat/unduh/<slot> (review of PR #94, M1): `rombongan` for the group's
// certificate, `peserta-<n>` for the n-th participant certificate the booking was ever issued (in issue order, whatever
// became of it since, so a revoked one leaves its slot empty), and `peserta` for every participant's as one PDF. No
// certificate id travels in the address (CLAUDE.md §7.5).

export type CertificateSlot =
  | { kind: 'group' }
  | { kind: 'participant'; position: number }
  | { kind: 'all_participants' };

const PARTICIPANT_SLOT = new RegExp(`^${CERTIFICATE_SLOTS.participant}-([1-9][0-9]{0,3})$`);

export function parseCertificateSlot(slot: string): CertificateSlot | null {
  if (slot === CERTIFICATE_SLOTS.group) return { kind: 'group' };
  if (slot === CERTIFICATE_SLOTS.participant) return { kind: 'all_participants' };
  const position = PARTICIPANT_SLOT.exec(slot)?.[1];
  return position === undefined ? null : { kind: 'participant', position: Number(position) };
}

export function formatCertificateSlot(slot: CertificateSlot): string {
  if (slot.kind === 'group') return CERTIFICATE_SLOTS.group;
  if (slot.kind === 'all_participants') return CERTIFICATE_SLOTS.participant;
  return `${CERTIFICATE_SLOTS.participant}-${String(slot.position)}`;
}

export function certificateDownloadPath(bookingCode: string, slot: CertificateSlot): string {
  return [
    GUEST_BOOKING_PATH,
    bookingCode,
    CERTIFICATE_PAGE,
    CERTIFICATE_DOWNLOAD_SEGMENT,
    formatCertificateSlot(slot),
  ].join('/');
}
