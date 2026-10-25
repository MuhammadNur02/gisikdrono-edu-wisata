import { revalidatePath } from 'next/cache';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppError, fail } from '@/lib/errors';
import { requireRole, type StaffContext } from '@/server/auth/guards';
import {
  assertSeesBookingCertificates,
  issueBookingCertificates,
  revokeOneCertificate,
  waiveCertificateRelease,
} from '@/server/services/certificate-service';
import { rerenderCertificateFiles } from '@/server/services/document-service';

import {
  issueCertificatesAction,
  rerenderCertificatesAction,
  revokeCertificateAction,
  waiveCertificatesAction,
} from './certificates';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/headers', () => ({ headers: () => Promise.resolve(new Headers()) }));
vi.mock('@/server/auth/guards', () => ({ requireRole: vi.fn() }));
vi.mock('@/server/services/certificate-service', () => ({
  assertSeesBookingCertificates: vi.fn(),
  issueBookingCertificates: vi.fn(),
  revokeOneCertificate: vi.fn(),
  waiveCertificateRelease: vi.fn(),
}));
vi.mock('@/server/services/document-service', () => ({ rerenderCertificateFiles: vi.fn() }));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  requestIdFrom: () => 'request-1',
}));

const BASE = { userId: 'user-1', isAal2: true, totpVerifiedAt: null, claimsVersion: 1 };
const OFFICER: StaffContext = { ...BASE, role: 'admin_rw', rwId: 5 };
const BOOKING_ID = '0192f3a4-5b6c-7d8e-9f01-0000000000bb';
const CERTIFICATE_ID = '0192f3a4-5b6c-7d8e-9f01-000000000c02';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireRole).mockResolvedValue({ ok: true, ctx: OFFICER });
});

describe('issueCertificatesAction', () => {
  it('lets an RW officer issue what is missing and refreshes the list', async () => {
    vi.mocked(issueBookingCertificates).mockResolvedValue(2);
    await expect(issueCertificatesAction({ bookingId: BOOKING_ID })).resolves.toEqual({
      ok: true,
      data: 2,
    });
    expect(requireRole).toHaveBeenCalledWith('superadmin', 'admin_rw');
    expect(revalidatePath).toHaveBeenCalledWith('/dashboard/certificates');
  });

  it('refuses an AAL1 session and a booking of another RW', async () => {
    vi.mocked(requireRole).mockResolvedValueOnce({ ok: true, ctx: { ...OFFICER, isAal2: false } });
    await expect(issueCertificatesAction({ bookingId: BOOKING_ID })).resolves.toMatchObject({
      ok: false,
      error: { code: 'FORBIDDEN' },
    });
    vi.mocked(issueBookingCertificates).mockRejectedValueOnce(new AppError('FORBIDDEN'));
    await expect(issueCertificatesAction({ bookingId: BOOKING_ID })).resolves.toMatchObject({
      error: { code: 'FORBIDDEN' },
    });
  });
});

describe('the superadmin’s steps', () => {
  it('are refused to an RW officer before anything runs', async () => {
    vi.mocked(requireRole).mockResolvedValue(fail('FORBIDDEN'));
    await expect(
      revokeCertificateAction({ certificateId: CERTIFICATE_ID, reason: 'Nama salah' }),
    ).resolves.toMatchObject({ error: { code: 'FORBIDDEN' } });
    await expect(
      waiveCertificatesAction({ bookingId: BOOKING_ID, reason: 'Sudah bayar tunai' }),
    ).resolves.toMatchObject({ error: { code: 'FORBIDDEN' } });
    expect(requireRole).toHaveBeenCalledWith('superadmin');
    expect(revokeOneCertificate).not.toHaveBeenCalled();
    expect(waiveCertificateRelease).not.toHaveBeenCalled();
  });

  it('need a reason', async () => {
    await expect(
      revokeCertificateAction({ certificateId: CERTIFICATE_ID, reason: ' ' }),
    ).resolves.toMatchObject({ error: { code: 'VALIDATION' } });
    expect(requireRole).not.toHaveBeenCalled();
  });
});

describe('rerenderCertificatesAction', () => {
  it('checks the scope through the session first, then renders under the officer’s name', async () => {
    vi.mocked(rerenderCertificateFiles).mockResolvedValue(4);
    await expect(rerenderCertificatesAction({ bookingId: BOOKING_ID })).resolves.toEqual({
      ok: true,
      data: 4,
    });
    expect(assertSeesBookingCertificates).toHaveBeenCalledWith(BOOKING_ID);
    expect(rerenderCertificateFiles).toHaveBeenCalledWith(BOOKING_ID, 'user-1');
    vi.mocked(assertSeesBookingCertificates).mockRejectedValueOnce(new AppError('NOT_FOUND'));
    await expect(rerenderCertificatesAction({ bookingId: BOOKING_ID })).resolves.toMatchObject({
      error: { code: 'NOT_FOUND' },
    });
    expect(rerenderCertificateFiles).toHaveBeenCalledTimes(1);
  });
});
