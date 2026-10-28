import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fail } from '@/lib/errors';
import { requireGuestToken } from '@/server/auth/guards';
import { rememberCertificateProof } from '@/server/auth/guest-cookies';
import { stepUpGuestCertificates } from '@/server/services/document-service';

import { proveCertificatePhoneAction } from './guest-certificates';

vi.mock('next/headers', () => ({
  headers: () => Promise.resolve(new Headers({ 'x-real-ip': '203.0.113.7' })),
}));
vi.mock('@/server/auth/guards', () => ({ requireGuestToken: vi.fn() }));
vi.mock('@/server/auth/guest-cookies', () => ({ rememberCertificateProof: vi.fn() }));
vi.mock('@/server/services/document-service', () => ({ stepUpGuestCertificates: vi.fn() }));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  requestIdFrom: () => 'request-1',
}));

const CODE = 'GSK-7F3K9Q2M';
const BOOKING_ID = '0192f3a4-5b6c-7d8e-9f01-0000000000bb';
const GUEST = {
  bookingId: BOOKING_ID,
  bookingCode: CODE,
  scope: 'certificate' as const,
  tokenVersion: 3,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireGuestToken).mockResolvedValue({ ok: true, guest: GUEST });
});

describe('proveCertificatePhoneAction (Task P4.5.03)', () => {
  it('remembers the proof in this browser, bound to the link version, when the four digits match', async () => {
    vi.mocked(stepUpGuestCertificates).mockResolvedValue('verified');
    await expect(
      proveCertificatePhoneAction({ bookingCode: CODE, lastFour: '5678' }),
    ).resolves.toEqual({ ok: true, data: null });
    expect(requireGuestToken).toHaveBeenCalledWith(CODE, 'certificate');
    expect(stepUpGuestCertificates).toHaveBeenCalledWith({
      bookingId: BOOKING_ID,
      lastFour: '5678',
      clientIp: '203.0.113.7',
    });
    expect(rememberCertificateProof).toHaveBeenCalledWith(GUEST);
  });

  it.each([
    ['mismatch', 'VALIDATION'],
    ['locked', 'RATE_LIMITED'],
    ['blocked', 'FORBIDDEN'],
    ['unverified', 'STATE_INVALID'],
  ] as const)('answers %s with %s and remembers nothing', async (answer, code) => {
    vi.mocked(stepUpGuestCertificates).mockResolvedValue(answer);
    await expect(
      proveCertificatePhoneAction({ bookingCode: CODE, lastFour: '5678' }),
    ).resolves.toMatchObject({ ok: false, error: { code } });
    expect(rememberCertificateProof).not.toHaveBeenCalled();
  });

  it('takes four digits only, and nothing without the certificate link', async () => {
    await expect(
      proveCertificatePhoneAction({ bookingCode: CODE, lastFour: '+62812' }),
    ).resolves.toMatchObject({ error: { code: 'VALIDATION' } });
    vi.mocked(requireGuestToken).mockResolvedValue(fail('NOT_FOUND'));
    await expect(
      proveCertificatePhoneAction({ bookingCode: CODE, lastFour: '5678' }),
    ).resolves.toMatchObject({ error: { code: 'NOT_FOUND' } });
    expect(stepUpGuestCertificates).not.toHaveBeenCalled();
  });

  it('passes an outage on as the generic error', async () => {
    vi.mocked(stepUpGuestCertificates).mockRejectedValue(new Error('database down'));
    await expect(
      proveCertificatePhoneAction({ bookingCode: CODE, lastFour: '5678' }),
    ).resolves.toMatchObject({ ok: false, error: { code: 'INTERNAL' } });
  });
});
