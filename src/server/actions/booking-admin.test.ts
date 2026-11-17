import { revalidatePath } from 'next/cache';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fail } from '@/lib/errors';
import { requireRole, type StaffContext } from '@/server/auth/guards';
import {
  getAddonNotes,
  getBookingDetail,
  getBookingParticipants,
  listBookingTimeline,
  revealBookingContact,
  revokeBookingTicket,
  saveAdminNotes,
  setAddonFulfillment,
} from '@/server/services/booking-admin-service';
import type { BookingDetail } from '@/types/booking-admin';

import {
  loadAddonNotesAction,
  loadBookingPreviewAction,
  loadBookingParticipantsAction,
  revealBookingContactAction,
  revokeTicketAction,
  saveAdminNotesAction,
  setAddonFulfillmentAction,
} from './booking-admin';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/headers', () => ({ headers: () => Promise.resolve(new Headers()) }));
vi.mock('@/server/auth/guards', () => ({ requireRole: vi.fn() }));
vi.mock('@/server/services/booking-admin-service', () => ({
  getAddonNotes: vi.fn(),
  getBookingDetail: vi.fn(),
  getBookingParticipants: vi.fn(),
  listBookingTimeline: vi.fn(),
  revealBookingContact: vi.fn(),
  revokeBookingTicket: vi.fn(),
  saveAdminNotes: vi.fn(),
  setAddonFulfillment: vi.fn(),
}));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  requestIdFrom: () => 'request-1',
}));

const OFFICER: StaffContext = {
  userId: 'user-1',
  isAal2: true,
  totpVerifiedAt: null,
  claimsVersion: 1,
  role: 'admin_rw',
  rwId: 5,
};
const BOOKING_ID = '0192f3a4-5b6c-7d8e-9f01-0000000000bb';
const ADDON_ID = '0192f3a4-5b6c-7d8e-9f01-0000000000cc';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireRole).mockResolvedValue({ ok: true, ctx: OFFICER });
});

describe('the booking detail actions', () => {
  it('reveal the contact to staff at AAL2 with their reason', async () => {
    const contact = { picName: 'Ani Lestari', picPhone: '+6281234567890', picEmail: null };
    vi.mocked(revealBookingContact).mockResolvedValue(contact);
    await expect(
      revealBookingContactAction({ bookingId: BOOKING_ID, reason: 'Konfirmasi jadwal' }),
    ).resolves.toEqual({ ok: true, data: contact });
    expect(requireRole).toHaveBeenCalledWith('superadmin', 'admin_rw');
  });

  it('refuse an AAL1 session and someone without a staff role before anything is read', async () => {
    vi.mocked(requireRole).mockResolvedValueOnce({ ok: true, ctx: { ...OFFICER, isAal2: false } });
    await expect(loadBookingParticipantsAction({ bookingId: BOOKING_ID })).resolves.toMatchObject({
      error: { code: 'FORBIDDEN' },
    });
    vi.mocked(requireRole).mockResolvedValueOnce(fail('UNAUTHENTICATED'));
    await expect(loadBookingParticipantsAction({ bookingId: BOOKING_ID })).resolves.toMatchObject({
      error: { code: 'UNAUTHENTICATED' },
    });
    expect(getBookingParticipants).not.toHaveBeenCalled();
  });

  it('save a note and a fulfilment step, then refresh the booking', async () => {
    const note = { bookingId: BOOKING_ID, adminNotes: 'Datang lebih pagi' };
    const step = { bookingId: BOOKING_ID, addonId: ADDON_ID, status: 'handed_over' };
    await expect(saveAdminNotesAction(note)).resolves.toEqual({ ok: true, data: null });
    await setAddonFulfillmentAction(step);
    expect(saveAdminNotes).toHaveBeenCalledWith(note);
    expect(setAddonFulfillment).toHaveBeenCalledWith(step);
    expect(revalidatePath).toHaveBeenCalledWith(`/dashboard/bookings/${BOOKING_ID}`);
  });

  it('load the add-on notes only on request, at AAL2', async () => {
    vi.mocked(getAddonNotes).mockResolvedValue({ [ADDON_ID]: 'Dibungkus' });
    await expect(loadAddonNotesAction({ bookingId: BOOKING_ID })).resolves.toEqual({
      ok: true,
      data: { [ADDON_ID]: 'Dibungkus' },
    });
    vi.mocked(requireRole).mockResolvedValueOnce({ ok: true, ctx: { ...OFFICER, isAal2: false } });
    await expect(loadAddonNotesAction({ bookingId: BOOKING_ID })).resolves.toMatchObject({
      error: { code: 'FORBIDDEN' },
    });
    expect(getAddonNotes).toHaveBeenCalledTimes(1);
  });

  it('refuse a reveal without a reason', async () => {
    await expect(
      revealBookingContactAction({ bookingId: BOOKING_ID, reason: '' }),
    ).resolves.toMatchObject({ error: { code: 'VALIDATION' } });
    expect(revealBookingContact).not.toHaveBeenCalled();
  });
});

describe('revokeTicketAction', () => {
  const input = { bookingId: BOOKING_ID, ticketCode: 'GSK-7F3K9Q2M-05', reason: 'Salah cetak' };

  it('is for the superadmin alone, at AAL2', async () => {
    vi.mocked(requireRole).mockResolvedValueOnce(fail('FORBIDDEN'));
    await expect(revokeTicketAction(input)).resolves.toMatchObject({
      error: { code: 'FORBIDDEN' },
    });
    expect(requireRole).toHaveBeenCalledWith('superadmin');
    expect(revokeBookingTicket).not.toHaveBeenCalled();
  });

  it('revokes with the reason and refreshes the booking', async () => {
    vi.mocked(requireRole).mockResolvedValueOnce({
      ok: true,
      ctx: { ...OFFICER, role: 'superadmin', rwId: null },
    });
    await expect(revokeTicketAction(input)).resolves.toEqual({ ok: true, data: null });
    expect(revokeBookingTicket).toHaveBeenCalledWith(input);
    expect(revalidatePath).toHaveBeenCalledWith(`/dashboard/bookings/${BOOKING_ID}`);
  });

  it('refuses a code that is no ticket code', async () => {
    await expect(
      revokeTicketAction({ ...input, ticketCode: 'GSK-7F3K9Q2M' }),
    ).resolves.toMatchObject({
      error: { code: 'VALIDATION' },
    });
  });
});

const BOOKING: BookingDetail = {
  id: BOOKING_ID,
  bookingCode: 'GSK-7F3K9Q2M',
  status: 'paid',
  institutionName: 'SD Negeri Gisikdrono 02',
  picFirstName: 'Rina',
  bookerType: 'school',
  packageName: 'Eduwisata Ecowastreme',
  rwIds: [5],
  paxCount: 30,
  visitDate: '2026-11-20',
  visitDateEnd: '2026-11-20',
  paymentStatus: 'settled',
  needsReview: false,
  amounts: { total: 900000, paid: 900000 },
  createdAt: '2026-11-10T03:00:00Z',
  phoneMasked: '+62 812 •••• •471',
  emailMasked: null,
  isPhoneVerified: true,
  isEmailVerified: false,
  isAnonymised: false,
  channel: 'web',
  notes: null,
  adminNotes: null,
  reviewReason: null,
  cancelReason: null,
  expiresAt: null,
  legs: [],
  payments: [],
  tickets: [],
  invoices: [],
};

describe('loadBookingPreviewAction', () => {
  const event = (id: string) => ({
    id,
    fromStatus: null,
    toStatus: null,
    actorType: 'system' as const,
    reason: null,
    occurredAt: '2026-11-17T03:00:00Z',
  });

  it('reads the booking and its four newest events, newest first, at AAL2', async () => {
    vi.mocked(getBookingDetail).mockResolvedValue(BOOKING);
    vi.mocked(listBookingTimeline).mockResolvedValue(['e1', 'e2', 'e3', 'e4', 'e5'].map(event));
    const result = await loadBookingPreviewAction({ bookingId: BOOKING_ID });
    expect(result).toEqual({
      ok: true,
      data: { booking: BOOKING, events: ['e5', 'e4', 'e3', 'e2'].map(event) },
    });
  });

  it('answers NOT_FOUND for a booking outside the window of the staff member', async () => {
    vi.mocked(getBookingDetail).mockResolvedValue(null);
    vi.mocked(listBookingTimeline).mockResolvedValue([]);
    await expect(loadBookingPreviewAction({ bookingId: BOOKING_ID })).resolves.toMatchObject({
      error: { code: 'NOT_FOUND' },
    });
  });

  it('refuses an AAL1 session and a malformed id before reading', async () => {
    vi.mocked(requireRole).mockResolvedValueOnce({ ok: true, ctx: { ...OFFICER, isAal2: false } });
    await expect(loadBookingPreviewAction({ bookingId: BOOKING_ID })).resolves.toMatchObject({
      error: { code: 'FORBIDDEN' },
    });
    expect((await loadBookingPreviewAction({ bookingId: 'x' })).ok).toBe(false);
    expect(getBookingDetail).not.toHaveBeenCalled();
  });
});
