import { describe, expect, it } from 'vitest';

import {
  certificateDownloadPath,
  formatCertificateSlot,
  parseCertificateSlot,
} from '@/lib/utils/certificate-slots';

describe('certificate download slots (review of PR #94, M1)', () => {
  it.each([
    ['rombongan', { kind: 'group' }],
    ['peserta', { kind: 'all_participants' }],
    ['peserta-1', { kind: 'participant', position: 1 }],
    ['peserta-300', { kind: 'participant', position: 300 }],
  ] as const)('reads %s and writes it back the same', (text, slot) => {
    expect(parseCertificateSlot(text)).toEqual(slot);
    expect(formatCertificateSlot(slot)).toBe(text);
  });

  it.each(['', 'peserta-0', 'peserta-01', 'peserta-10000', 'peserta-1a', 'group', 'Rombongan'])(
    'refuses %j',
    (text) => {
      expect(parseCertificateSlot(text)).toBeNull();
    },
  );

  it("builds the download's address under the certificate page", () => {
    expect(certificateDownloadPath('GSK-7F3K9Q2M', { kind: 'participant', position: 2 })).toBe(
      '/reservasi/GSK-7F3K9Q2M/sertifikat/unduh/peserta-2',
    );
  });
});
