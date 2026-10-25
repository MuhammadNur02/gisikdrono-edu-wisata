import { describe, expect, it } from 'vitest';

import { unpaidCountShown } from '@/components/admin/certificates/certificate-labels';
import type { CertificateBooking } from '@/types/certificate';

const SUMMARY = {
  id: '0192f3a4-5b6c-7d8e-9f01-000000000c01',
  number: 'SERT/GSK/2026/00031',
  status: 'issued' as const,
  isReleased: false,
  isDownloadable: false,
};
const booking = (rwIds: number[], unpaidPax: number): CertificateBooking => ({
  id: '0192f3a4-5b6c-7d8e-9f01-0000000000bb',
  bookingCode: 'GSK-7F3K9Q2M',
  institutionName: 'SD Negeri Gisikdrono 01',
  visitDate: '2026-11-06',
  rwIds,
  group: SUMMARY,
  participants: [],
  unpaidPax,
});

describe('unpaidCountShown', () => {
  it('shows the count of a one-RW visit, and of a combo only to the superadmin', () => {
    expect(unpaidCountShown(booking([5], 2), false)).toBe(2);
    expect(unpaidCountShown(booking([5, 13], 2), false)).toBeNull();
    expect(unpaidCountShown(booking([5, 13], 3), true)).toBe(3);
    expect(unpaidCountShown(booking([5], 0), true)).toBeNull();
  });
});
