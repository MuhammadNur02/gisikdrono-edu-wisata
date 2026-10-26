import { revalidatePath, revalidateTag } from 'next/cache';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppError, fail } from '@/lib/errors';
import { getPublicSiteSettings } from '@/lib/queries/settings';
import { requireRole, requireRwAccess, type StaffContext } from '@/server/auth/guards';
import type { BookingWizard } from '@/server/services/booking-wizard-service';
import {
  createWalkInBooking,
  listWalkInSessions,
  loadWalkInPackage,
  quoteWalkIn,
} from '@/server/services/walk-in-service';

import {
  createAdminBookingAction,
  listWalkInSessionsAction,
  previewWalkInQuoteAction,
} from './walk-in';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock('@/lib/queries/settings', () => ({ getPublicSiteSettings: vi.fn() }));
vi.mock('@/server/auth/guards', () => ({
  requireRole: vi.fn(),
  requireRwAccess: vi.fn(),
}));
vi.mock('@/server/services/walk-in-service', () => ({
  createWalkInBooking: vi.fn(),
  listWalkInSessions: vi.fn(),
  loadWalkInPackage: vi.fn(),
  quoteWalkIn: vi.fn(),
}));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  requestIdFrom: () => 'request-1',
}));

const OFFICER: StaffContext = {
  userId: 'user-5',
  isAal2: true,
  totpVerifiedAt: null,
  claimsVersion: 1,
  role: 'admin_rw',
  rwId: 5,
};
const PACKAGE_ID = '0192f3a4-5b6c-7d8e-9f01-0000000000a1';
const BOOKING_ID = '0192f3a4-5b6c-7d8e-9f01-0000000000d1';
const RW05 = { id: 5, label: 'RW 05', accentKey: null };
const WIZARD = { package: { id: PACKAGE_ID, rws: [RW05] } } as unknown as BookingWizard;
const QUOTE = { ok: true, quote: { lines: [], total: 120000 }, quoteHash: 'a'.repeat(64) } as const;
const BOOKING = {
  packageId: PACKAGE_ID,
  visitSessionIds: ['0192f3a4-5b6c-7d8e-9f01-0000000000b1'],
  pax: 4,
  bookerType: 'individual',
  institutionName: '',
  picName: 'John Walker',
  picPhone: '+44 7700 900123',
  picEmail: 'john.walker@example.test',
  notes: '',
  isPhoneConfirmed: true,
  isCashOnTheSpot: true,
  consentAttested: true,
  idempotencyKey: '0192f3a4-5b6c-7d8e-9f01-0000000000c1',
  quoteHash: 'a'.repeat(64),
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireRole).mockResolvedValue({ ok: true, ctx: OFFICER });
  vi.mocked(requireRwAccess).mockResolvedValue({ ok: true, ctx: OFFICER });
  vi.mocked(getPublicSiteSettings).mockResolvedValue({ maxPax: 500 } as never);
  vi.mocked(loadWalkInPackage).mockResolvedValue(WIZARD);
  vi.mocked(quoteWalkIn).mockReturnValue(QUOTE as never);
});

describe('the reads', () => {
  it("list the package's sessions for an officer of its RW at AAL2", async () => {
    vi.mocked(listWalkInSessions).mockResolvedValue([{ rw: RW05, sessions: [] }]);
    await expect(listWalkInSessionsAction({ packageId: PACKAGE_ID })).resolves.toEqual({
      ok: true,
      data: [{ rw: RW05, sessions: [] }],
    });
    expect(requireRole).toHaveBeenCalledWith('superadmin', 'admin_rw');
    expect(requireRwAccess).toHaveBeenCalledWith(5);
  });

  it('refuse an AAL1 session, a package the officer may not book and another RW', async () => {
    vi.mocked(requireRole).mockResolvedValueOnce({ ok: true, ctx: { ...OFFICER, isAal2: false } });
    await expect(listWalkInSessionsAction({ packageId: PACKAGE_ID })).resolves.toMatchObject({
      error: { code: 'FORBIDDEN' },
    });
    vi.mocked(loadWalkInPackage).mockResolvedValueOnce(null);
    await expect(
      previewWalkInQuoteAction({ packageId: PACKAGE_ID, pax: 4 }),
    ).resolves.toMatchObject({
      error: { code: 'NOT_FOUND' },
    });
    vi.mocked(requireRwAccess).mockResolvedValueOnce(fail('FORBIDDEN'));
    await expect(
      previewWalkInQuoteAction({ packageId: PACKAGE_ID, pax: 4 }),
    ).resolves.toMatchObject({
      error: { code: 'FORBIDDEN' },
    });
  });

  it('quote the group from the catalogue, with its fingerprint', async () => {
    await expect(previewWalkInQuoteAction({ packageId: PACKAGE_ID, pax: 4 })).resolves.toEqual({
      ok: true,
      data: { kind: 'quote', quote: QUOTE.quote, quoteHash: QUOTE.quoteHash },
    });
    expect(quoteWalkIn).toHaveBeenCalledWith(WIZARD, 4);
  });
});

describe('createAdminBookingAction', () => {
  it("books through the officer's session and answers the total for the cash step", async () => {
    vi.mocked(createWalkInBooking).mockResolvedValue({
      isNew: true,
      bookingId: BOOKING_ID,
      bookingCode: 'GSK-7F3K9Q2M',
      expiresAt: null,
      visitDate: '2026-10-27',
      visitDateEnd: '2026-10-27',
      totalAmount: 120000,
    });
    await expect(createAdminBookingAction(BOOKING)).resolves.toEqual({
      ok: true,
      data: {
        bookingId: BOOKING_ID,
        bookingCode: 'GSK-7F3K9Q2M',
        totalAmount: 120000,
        isCashOnTheSpot: true,
      },
    });
    expect(createWalkInBooking).toHaveBeenCalledWith(
      expect.objectContaining({ picPhone: '+447700900123', isPhoneConfirmed: true }),
    );
    expect(revalidateTag).toHaveBeenCalledWith('sessions:5:2026-10');
    expect(revalidatePath).toHaveBeenCalledWith('/dashboard/bookings');
  });

  it('leaves the cash at the counter to the RW admin (A9)', async () => {
    const superadmin: StaffContext = { ...OFFICER, role: 'superadmin', rwId: null };
    vi.mocked(requireRole).mockResolvedValueOnce({ ok: true, ctx: superadmin });
    await expect(createAdminBookingAction(BOOKING)).resolves.toMatchObject({
      error: { code: 'FORBIDDEN' },
    });
    expect(createWalkInBooking).not.toHaveBeenCalled();
  });

  it('refuses a price from the browser before anything runs', async () => {
    await expect(createAdminBookingAction({ ...BOOKING, total: 1 })).resolves.toMatchObject({
      error: { code: 'VALIDATION' },
    });
    expect(loadWalkInPackage).not.toHaveBeenCalled();
    expect(createWalkInBooking).not.toHaveBeenCalled();
  });

  it('says what to do when the session is taken or the price moved', async () => {
    vi.mocked(createWalkInBooking).mockRejectedValueOnce(new AppError('STATE_INVALID'));
    const refused = await createAdminBookingAction(BOOKING);
    expect(refused).toMatchObject({ error: { code: 'STATE_INVALID' } });
    expect(refused.ok ? '' : refused.error.message).toContain('Pilih sesi lain');
    vi.mocked(createWalkInBooking).mockRejectedValueOnce(new AppError('PRICE_MISMATCH'));
    await expect(createAdminBookingAction(BOOKING)).resolves.toMatchObject({
      error: { code: 'PRICE_MISMATCH' },
    });
  });
});
