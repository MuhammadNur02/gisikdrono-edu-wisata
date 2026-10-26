import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppError, fail } from '@/lib/errors';
import { requireGuestToken } from '@/server/auth/guards';
import { hasCertificateProof, rememberCertificateProof } from '@/server/auth/guest-cookies';
import {
  guestCertificateUrl,
  stepUpGuestCertificates,
  withinDocumentLimits,
} from '@/server/services/document-service';

import { certificateDownloadAction, proveCertificatePhoneAction } from './guest-certificates';

vi.mock('next/headers', () => ({ headers: () => Promise.resolve(new Headers()) }));
vi.mock('@/server/auth/guards', () => ({ requireGuestToken: vi.fn() }));
vi.mock('@/server/auth/guest-cookies', () => ({
  hasCertificateProof: vi.fn(),
  rememberCertificateProof: vi.fn(),
}));
vi.mock('@/server/services/document-service', () => ({
  guestCertificateUrl: vi.fn(),
  stepUpGuestCertificates: vi.fn(),
  withinDocumentLimits: vi.fn(),
}));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  requestIdFrom: () => 'request-1',
}));

const CODE = 'GSK-7F3K9Q2M';
const BOOKING_ID = '0192f3a4-5b6c-7d8e-9f01-0000000000bb';
const CERTIFICATE_ID = '0192f3a4-5b6c-7d8e-9f01-0000000000cc';
const GUEST = { bookingId: BOOKING_ID, bookingCode: CODE, scope: 'certificate' as const };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireGuestToken).mockResolvedValue({ ok: true, guest: GUEST });
  vi.mocked(withinDocumentLimits).mockResolvedValue(true);
  vi.mocked(hasCertificateProof).mockResolvedValue(true);
});

describe('proveCertificatePhoneAction (Task P4.5.03)', () => {
  it('remembers the proof in this browser when the four digits match', async () => {
    vi.mocked(stepUpGuestCertificates).mockResolvedValue('verified');
    await expect(
      proveCertificatePhoneAction({ bookingCode: CODE, lastFour: '5678' }),
    ).resolves.toEqual({
      ok: true,
      data: null,
    });
    expect(requireGuestToken).toHaveBeenCalledWith(CODE, 'certificate');
    expect(stepUpGuestCertificates).toHaveBeenCalledWith(BOOKING_ID, '5678');
    expect(rememberCertificateProof).toHaveBeenCalledWith(CODE);
  });

  it.each([
    ['mismatch', 'VALIDATION'],
    ['locked', 'RATE_LIMITED'],
    ['unverified', 'STATE_INVALID'],
  ] as const)('answers %s with %s and remembers nothing', async (answer, code) => {
    vi.mocked(stepUpGuestCertificates).mockResolvedValue(answer);
    await expect(
      proveCertificatePhoneAction({ bookingCode: CODE, lastFour: '5678' }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code },
    });
    expect(rememberCertificateProof).not.toHaveBeenCalled();
  });

  it('takes four digits only, and nothing without the certificate link', async () => {
    await expect(
      proveCertificatePhoneAction({ bookingCode: CODE, lastFour: '+62812' }),
    ).resolves.toMatchObject({
      error: { code: 'VALIDATION' },
    });
    vi.mocked(requireGuestToken).mockResolvedValue(fail('NOT_FOUND'));
    await expect(
      proveCertificatePhoneAction({ bookingCode: CODE, lastFour: '5678' }),
    ).resolves.toMatchObject({
      error: { code: 'NOT_FOUND' },
    });
    expect(stepUpGuestCertificates).not.toHaveBeenCalled();
  });
});

describe('certificateDownloadAction (docs/Security.md §10.3)', () => {
  it('hands back the signed URL made for this request', async () => {
    vi.mocked(guestCertificateUrl).mockResolvedValue('https://storage.example.test/signed');
    await expect(
      certificateDownloadAction({ bookingCode: CODE, certificateId: CERTIFICATE_ID }),
    ).resolves.toEqual({ ok: true, data: { url: 'https://storage.example.test/signed' } });
    expect(guestCertificateUrl).toHaveBeenCalledWith({
      bookingId: BOOKING_ID,
      certificateId: CERTIFICATE_ID,
      hasPhoneProof: true,
    });
  });

  it('stops at the document limits and passes the service refusal on', async () => {
    vi.mocked(withinDocumentLimits).mockResolvedValueOnce(false);
    await expect(
      certificateDownloadAction({ bookingCode: CODE, certificateId: CERTIFICATE_ID }),
    ).resolves.toMatchObject({ error: { code: 'RATE_LIMITED' } });
    vi.mocked(guestCertificateUrl).mockRejectedValue(new AppError('FORBIDDEN', 'verifikasi dulu'));
    await expect(
      certificateDownloadAction({ bookingCode: CODE, certificateId: CERTIFICATE_ID }),
    ).resolves.toMatchObject({ error: { code: 'FORBIDDEN', message: 'verifikasi dulu' } });
  });
});
