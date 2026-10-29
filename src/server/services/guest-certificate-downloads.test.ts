import { beforeEach, describe, expect, it, vi } from 'vitest';

import { svcLogAudit } from '@/db/rpc';
import type { DatabaseClient } from '@/db/rpc-result';
import {
  certificateBundlePdf,
  certificatePdf,
  servableCertificatesOf,
} from '@/server/services/certificate-documents';
import type { CertificateRow } from '@/server/services/certificate-pages';
import { guestCertificateFile } from '@/server/services/guest-certificate-downloads';
import {
  certificateBookingOf,
  participantCertificateIdsOf,
} from '@/server/services/guest-certificate-reads';

vi.mock('server-only', () => ({}));
vi.mock('@/db/rpc', () => ({ svcLogAudit: vi.fn() }));
vi.mock('@/server/services/certificate-documents', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  certificateBundlePdf: vi.fn(),
  certificatePdf: vi.fn(),
  servableCertificatesOf: vi.fn(),
}));
vi.mock('@/server/services/guest-certificate-reads', () => ({
  certificateBookingOf: vi.fn(),
  participantCertificateIdsOf: vi.fn(),
  standingCertificatesOf: vi.fn(),
}));

const adminClient = {} as DatabaseClient;
const BOOKING_ID = '0192f3a4-5b6c-7d8e-9f01-0000000000bb';
const IP_HASH = 'a'.repeat(64);
const OPEN_BOOKING = { visitDateEnd: '2026-10-20', isPhoneProven: true, isPhoneBlocked: false };
const SINGLE = Buffer.from('%PDF-1.7 one');
const BUNDLE = Buffer.from('%PDF-1.7 class');

const row = (overrides: Partial<CertificateRow>): CertificateRow => ({
  id: '0192f3a4-5b6c-7d8e-9f01-000000000c01',
  bookingId: BOOKING_ID,
  kind: 'group',
  certificateNumber: 'SERT/GSK/2026/00031',
  status: 'issued',
  institutionName: 'SD Negeri Gisikdrono 01',
  releasedAt: '2026-10-20T03:00:00+00:00',
  purgedAt: null,
  pdfPath: null,
  ...overrides,
});
const GROUP = row({});
const ANI = row({
  id: '0192f3a4-5b6c-7d8e-9f01-000000000c02',
  kind: 'participant',
  certificateNumber: 'SERT/GSK/2026/00032',
});
const BUDI = row({
  id: '0192f3a4-5b6c-7d8e-9f01-000000000c03',
  kind: 'participant',
  certificateNumber: 'SERT/GSK/2026/00033',
});

const request = {
  bookingId: BOOKING_ID,
  bookingCode: 'GSK-7F3K9Q2M',
  slot: { kind: 'participant', position: 2 } as const,
  hasPhoneProof: true,
  today: '2026-11-01',
  siteUrl: 'https://example.test',
  ipHash: IP_HASH,
};
const CONTEXT = { siteUrl: 'https://example.test', readerId: null };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(certificateBookingOf).mockResolvedValue(OPEN_BOOKING);
  vi.mocked(servableCertificatesOf).mockResolvedValue([GROUP, ANI, BUDI]);
  vi.mocked(participantCertificateIdsOf).mockResolvedValue([ANI.id, BUDI.id]);
  vi.mocked(certificatePdf).mockResolvedValue(SINGLE);
  vi.mocked(certificateBundlePdf).mockResolvedValue(BUNDLE);
});

describe('guestCertificateFile (review of PR #94, M1, M2)', () => {
  it("hands out the n-th participant's certificate and audits it under the visitor", async () => {
    await expect(guestCertificateFile(adminClient, request)).resolves.toEqual({
      fileName: 'participant-SERT-GSK-2026-00033.pdf',
      pdf: SINGLE,
    });
    expect(certificatePdf).toHaveBeenCalledWith(adminClient, BUDI, CONTEXT);
    expect(svcLogAudit).toHaveBeenCalledWith(adminClient, {
      actorId: null,
      action: 'certificate.downloaded',
      entityType: 'certificates',
      entityId: BUDI.id,
      metadata: { booking_id: BOOKING_ID, kind: 'participant', ip_hash: IP_HASH },
    });
  });

  it("hands out an institution's group certificate without the step-up", async () => {
    await guestCertificateFile(adminClient, {
      ...request,
      slot: { kind: 'group' },
      hasPhoneProof: false,
    });
    expect(certificatePdf).toHaveBeenCalledWith(adminClient, GROUP, CONTEXT);
  });

  it('hands out the class as one PDF, audited once with every certificate it holds (M3)', async () => {
    await expect(
      guestCertificateFile(adminClient, { ...request, slot: { kind: 'all_participants' } }),
    ).resolves.toEqual({ fileName: 'participants-GSK-7F3K9Q2M.pdf', pdf: BUNDLE });
    expect(certificateBundlePdf).toHaveBeenCalledWith(adminClient, [ANI, BUDI], CONTEXT);
    expect(svcLogAudit).toHaveBeenCalledWith(adminClient, {
      actorId: null,
      action: 'certificate.bundle_downloaded',
      entityType: 'bookings',
      entityId: BOOKING_ID,
      metadata: { kind: 'participant', certificate_ids: [ANI.id, BUDI.id], ip_hash: IP_HASH },
    });
  });

  it('waits for the step-up before a name, and refuses one for good where the step-up cannot run', async () => {
    await expect(
      guestCertificateFile(adminClient, { ...request, hasPhoneProof: false }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    vi.mocked(certificateBookingOf).mockResolvedValueOnce({
      ...OPEN_BOOKING,
      isPhoneBlocked: true,
    });
    await expect(guestCertificateFile(adminClient, request)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    vi.mocked(certificateBookingOf).mockResolvedValueOnce({
      ...OPEN_BOOKING,
      isPhoneProven: false,
    });
    await expect(guestCertificateFile(adminClient, request)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(certificatePdf).not.toHaveBeenCalled();
    expect(svcLogAudit).not.toHaveBeenCalled();
  });

  it("keeps a participant's slot when a certificate before it is revoked, and leaves the revoked one's empty", async () => {
    vi.mocked(servableCertificatesOf).mockResolvedValue([GROUP, BUDI]);
    await expect(
      guestCertificateFile(adminClient, { ...request, slot: { kind: 'participant', position: 1 } }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await guestCertificateFile(adminClient, request);
    expect(certificatePdf).toHaveBeenCalledWith(adminClient, BUDI, CONTEXT);
    expect(certificatePdf).toHaveBeenCalledTimes(1);
  });

  it('refuses an empty slot, and everything after the 90 days (L6)', async () => {
    await expect(
      guestCertificateFile(adminClient, { ...request, slot: { kind: 'participant', position: 3 } }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    vi.mocked(servableCertificatesOf).mockResolvedValueOnce([GROUP]);
    await expect(
      guestCertificateFile(adminClient, { ...request, slot: { kind: 'all_participants' } }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(
      guestCertificateFile(adminClient, {
        ...request,
        slot: { kind: 'group' },
        today: '2027-01-19',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(svcLogAudit).not.toHaveBeenCalled();
  });
});
