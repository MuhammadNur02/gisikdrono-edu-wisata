import { beforeEach, describe, expect, it, vi } from 'vitest';

import { svcCheckCertificatePhone, svcLockCertificatePhone } from '@/db/rpc-certificates';
import type { DatabaseClient } from '@/db/rpc-result';
import { isFirstRefusal, withinRateLimits } from '@/lib/rate-limit';
import {
  isServable,
  keptCertificatePath,
  loadCertificate,
  printsAPersonsName,
} from '@/server/services/certificate-documents';
import type { CertificateRow } from '@/server/services/certificate-pages';
import {
  certificateBookingOf,
  standingCertificatesOf,
  type StandingCertificate,
} from '@/server/services/guest-certificate-reads';
import {
  certificatesAvailableUntil,
  guestCertificatePath,
  loadGuestCertificates,
  stepUpCertificatePhone,
} from '@/server/services/guest-certificates';

vi.mock('server-only', () => ({}));
vi.mock('@/db/rpc-certificates', () => ({
  svcCheckCertificatePhone: vi.fn(),
  svcLockCertificatePhone: vi.fn(),
}));
vi.mock('@/lib/rate-limit', () => ({ isFirstRefusal: vi.fn(), withinRateLimits: vi.fn() }));
vi.mock('@/server/services/certificate-documents', () => ({
  isServable: vi.fn(),
  keptCertificatePath: vi.fn(),
  loadCertificate: vi.fn(),
  printsAPersonsName: vi.fn(),
}));
vi.mock('@/server/services/guest-certificate-reads', () => ({
  certificateBookingOf: vi.fn(),
  standingCertificatesOf: vi.fn(),
}));

// Every read and RPC is a mock, so the client is only passed along.
const adminClient = {} as DatabaseClient;
const BOOKING_ID = '0192f3a4-5b6c-7d8e-9f01-0000000000bb';
const CERTIFICATE_ID = '0192f3a4-5b6c-7d8e-9f01-0000000000cc';
const VISIT_END = '2026-10-20';
const WITHIN = '2027-01-18';
const AFTER = '2027-01-19';

function standing(overrides: Partial<StandingCertificate>): StandingCertificate {
  return {
    id: CERTIFICATE_ID,
    kind: 'group',
    certificate_number: 'SERT/GSK/2026/00001',
    institution_name: 'SD Uji',
    recipient_name: 'SD Uji',
    released_at: '2026-10-20T10:00:00Z',
    ...overrides,
  };
}

const PARTICIPANT = standing({
  id: '0192f3a4-5b6c-7d8e-9f01-0000000000dd',
  kind: 'participant',
  certificate_number: 'SERT/GSK/2026/00002',
  recipient_name: 'Ani',
});

const CERTIFICATE: CertificateRow = {
  id: CERTIFICATE_ID,
  bookingId: BOOKING_ID,
  kind: 'participant',
  certificateNumber: 'SERT/GSK/2026/00002',
  status: 'issued',
  institutionName: 'SD Uji',
  releasedAt: '2026-10-20T10:00:00Z',
  purgedAt: null,
  pdfPath: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(certificateBookingOf).mockResolvedValue({
    visitDateEnd: VISIT_END,
    isPhoneProven: true,
  });
  vi.mocked(standingCertificatesOf).mockResolvedValue([standing({}), PARTICIPANT]);
  vi.mocked(withinRateLimits).mockResolvedValue(true);
  vi.mocked(loadCertificate).mockResolvedValue(CERTIFICATE);
  vi.mocked(isServable).mockReturnValue(true);
  vi.mocked(printsAPersonsName).mockReturnValue(true);
  vi.mocked(keptCertificatePath).mockResolvedValue(`certificates/${BOOKING_ID}/participant.pdf`);
});

describe('certificatesAvailableUntil', () => {
  it('is 90 days after the last visit day, across a year end', () => {
    expect(certificatesAvailableUntil(VISIT_END)).toBe(WITHIN);
  });
});

describe('loadGuestCertificates (Task P4.5.03)', () => {
  const request = { bookingId: BOOKING_ID, hasPhoneProof: false, today: WITHIN };

  it('shows the group by its institution and hides the names until the number is proven', async () => {
    await expect(loadGuestCertificates(adminClient, request)).resolves.toEqual({
      state: 'ready',
      availableUntil: WITHIN,
      hasPhoneProof: false,
      canProvePhone: true,
      certificates: [
        {
          id: CERTIFICATE_ID,
          kind: 'group',
          number: 'SERT/GSK/2026/00001',
          recipient: 'SD Uji',
          needsPhone: false,
        },
        {
          id: PARTICIPANT.id,
          kind: 'participant',
          number: 'SERT/GSK/2026/00002',
          recipient: null,
          needsPhone: true,
        },
      ],
    });
  });

  it('names the participants once the step-up was passed', async () => {
    const view = await loadGuestCertificates(adminClient, { ...request, hasPhoneProof: true });
    expect(view.state === 'ready' && view.certificates.map((row) => row.recipient)).toEqual([
      'SD Uji',
      'Ani',
    ]);
  });

  it('offers no named certificate for a number no WhatsApp code proved', async () => {
    vi.mocked(certificateBookingOf).mockResolvedValue({
      visitDateEnd: VISIT_END,
      isPhoneProven: false,
    });
    vi.mocked(standingCertificatesOf).mockResolvedValue([
      standing({ institution_name: null }),
      PARTICIPANT,
    ]);
    const view = await loadGuestCertificates(adminClient, { ...request, hasPhoneProof: true });
    expect(view).toMatchObject({
      state: 'ready',
      certificates: [],
      hasPhoneProof: false,
      canProvePhone: false,
    });
  });

  it('is expired after the 90 days, pending with no certificate, held while none is released', async () => {
    await expect(loadGuestCertificates(adminClient, { ...request, today: AFTER })).resolves.toEqual(
      {
        state: 'expired',
        availableUntil: WITHIN,
      },
    );
    vi.mocked(standingCertificatesOf).mockResolvedValue([]);
    await expect(loadGuestCertificates(adminClient, request)).resolves.toMatchObject({
      state: 'pending',
    });
    vi.mocked(standingCertificatesOf).mockResolvedValue([standing({ released_at: null })]);
    await expect(loadGuestCertificates(adminClient, request)).resolves.toMatchObject({
      state: 'held',
    });
  });
});

describe('stepUpCertificatePhone (docs/Security.md DOC-02)', () => {
  const check = { bookingId: BOOKING_ID, lastFour: '5678' };

  it('asks the database within the five tries', async () => {
    vi.mocked(svcCheckCertificatePhone).mockResolvedValue('verified');
    await expect(stepUpCertificatePhone(adminClient, check)).resolves.toBe('verified');
    expect(svcCheckCertificatePhone).toHaveBeenCalledWith(adminClient, check);
  });

  it('locks past them, raising the alert on the first refusal only', async () => {
    vi.mocked(withinRateLimits).mockResolvedValue(false);
    vi.mocked(isFirstRefusal).mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    await expect(stepUpCertificatePhone(adminClient, check)).resolves.toBe('locked');
    await expect(stepUpCertificatePhone(adminClient, check)).resolves.toBe('locked');
    expect(svcLockCertificatePhone).toHaveBeenCalledTimes(1);
    expect(svcCheckCertificatePhone).not.toHaveBeenCalled();
  });
});

describe('guestCertificatePath', () => {
  const request = {
    bookingId: BOOKING_ID,
    certificateId: CERTIFICATE_ID,
    hasPhoneProof: true,
    today: WITHIN,
    siteUrl: 'https://example.test',
  };

  it('hands out the kept file, rendered for the visitor', async () => {
    await expect(guestCertificatePath(adminClient, request)).resolves.toBe(
      `certificates/${BOOKING_ID}/participant.pdf`,
    );
    expect(keptCertificatePath).toHaveBeenCalledWith(adminClient, CERTIFICATE, {
      siteUrl: 'https://example.test',
      readerId: null,
    });
  });

  it('refuses after the 90 days, another booking, a certificate not standing, and a name without the step-up', async () => {
    await expect(
      guestCertificatePath(adminClient, { ...request, today: AFTER }),
    ).rejects.toMatchObject({
      code: 'STATE_INVALID',
    });
    vi.mocked(loadCertificate).mockResolvedValueOnce({ ...CERTIFICATE, bookingId: 'other' });
    await expect(guestCertificatePath(adminClient, request)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    vi.mocked(isServable).mockReturnValueOnce(false);
    await expect(guestCertificatePath(adminClient, request)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(
      guestCertificatePath(adminClient, { ...request, hasPhoneProof: false }),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    vi.mocked(certificateBookingOf).mockResolvedValue({
      visitDateEnd: VISIT_END,
      isPhoneProven: false,
    });
    await expect(guestCertificatePath(adminClient, request)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(keptCertificatePath).not.toHaveBeenCalled();
  });
});
