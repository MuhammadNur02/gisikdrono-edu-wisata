import { beforeEach, describe, expect, it, vi } from 'vitest';

import { rpcGetParticipants } from '@/db/rpc';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireCertificateReader, requireDocumentReader } from '@/server/auth/document-access';
import { requireGuestToken, requireUser } from '@/server/auth/guards';

vi.mock('@/db/rpc', () => ({ rpcGetParticipants: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: vi.fn() }));
vi.mock('@/server/auth/guards', () => ({ requireUser: vi.fn(), requireGuestToken: vi.fn() }));

const ROW_ID = '0192f3a4-5b6c-7d8e-9f01-0000000000cc';
const CODE = 'GSK-7F3K9Q2M';
const SUPERADMIN = {
  ok: true as const,
  ctx: {
    userId: '0192f3a4-5b6c-7d8e-9f01-0000000000ee',
    role: 'superadmin' as const,
    rwId: null,
    isAal2: true,
    totpVerifiedAt: null,
    claimsVersion: 1,
  },
};
const STAFF = {
  ok: true as const,
  ctx: {
    userId: '0192f3a4-5b6c-7d8e-9f01-0000000000dd',
    role: 'admin_rw' as const,
    rwId: 5,
    isAal2: true,
    totpVerifiedAt: null,
    claimsVersion: 1,
  },
};
const NOBODY = { ok: false as const, error: { code: 'UNAUTHENTICATED' as const, message: 'x' } };
const NOT_FOUND = { ok: false as const, error: { code: 'NOT_FOUND' as const, message: 'x' } };
const GUEST = {
  ok: true as const,
  guest: {
    bookingId: '0192f3a4-5b6c-7d8e-9f01-0000000000bb',
    bookingCode: CODE,
    scope: 'view' as const,
  },
};

// The RLS read of the row: what the staff member's own session returns.
function serverClientSeeing(row: { id: string } | null) {
  const query = { maybeSingle: () => Promise.resolve({ data: row, error: null }) };
  const from = vi.fn(() => ({ select: () => ({ eq: () => query }) }));
  vi.mocked(createSupabaseServerClient).mockResolvedValue({ from } as never);
  return from;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireGuestToken).mockResolvedValue(NOT_FOUND);
});

describe('requireDocumentReader', () => {
  it('lets the superadmin read a row their RLS returns, as themselves, without the guest cookie', async () => {
    vi.mocked(requireUser).mockResolvedValue(SUPERADMIN);
    const from = serverClientSeeing({ id: ROW_ID });
    await expect(requireDocumentReader('quotations', ROW_ID, CODE)).resolves.toEqual({
      ok: true,
      reader: 'staff',
      userId: SUPERADMIN.ctx.userId,
    });
    expect(from).toHaveBeenCalledWith('quotations');
    expect(requireGuestToken).not.toHaveBeenCalled();
  });

  // Review of PR #33, finding 2 (decision of 2026-10-23): the documents print the whole snapshot, a combo's other RW
  // and its add-ons included, which 0005 withholds from an RW admin, so the staff path is the superadmin's alone.
  it('gives the RW 05 admin the same 404 for a 05 + 08 combo their RLS can see', async () => {
    vi.mocked(requireUser).mockResolvedValue(STAFF);
    serverClientSeeing({ id: ROW_ID });
    await expect(requireDocumentReader('invoices', ROW_ID, CODE)).resolves.toEqual(NOT_FOUND);
    expect(createSupabaseServerClient).not.toHaveBeenCalled();
  });

  it('gives a superadmin without TOTP the same 404', async () => {
    vi.mocked(requireUser).mockResolvedValue({
      ...SUPERADMIN,
      ctx: { ...SUPERADMIN.ctx, isAal2: false },
    });
    await expect(requireDocumentReader('quotations', ROW_ID, CODE)).resolves.toEqual(NOT_FOUND);
    expect(createSupabaseServerClient).not.toHaveBeenCalled();
  });

  it('falls back to the guest link when the row is outside the superadmin’s RLS', async () => {
    vi.mocked(requireUser).mockResolvedValue(SUPERADMIN);
    serverClientSeeing(null);
    vi.mocked(requireGuestToken).mockResolvedValue(GUEST);
    await expect(requireDocumentReader('invoices', ROW_ID, CODE)).resolves.toEqual({
      ok: true,
      reader: 'guest',
    });
    expect(requireGuestToken).toHaveBeenCalledWith(CODE, 'view');
  });

  it('answers the guest refusal as it is for a visitor without a session or a link', async () => {
    vi.mocked(requireUser).mockResolvedValue(NOBODY);
    await expect(requireDocumentReader('quotations', ROW_ID, CODE)).resolves.toEqual(NOT_FOUND);
    expect(createSupabaseServerClient).not.toHaveBeenCalled();
  });
});

describe('requireDocumentReader for an RW admin', () => {
  it('gives the restricted reader only where the route allows it and RLS shows the row', async () => {
    vi.mocked(requireUser).mockResolvedValue(STAFF);
    serverClientSeeing({ id: ROW_ID });
    await expect(
      requireDocumentReader('quotations', ROW_ID, CODE, { allowsRestricted: true }),
    ).resolves.toEqual({ ok: true, reader: 'restricted', userId: STAFF.ctx.userId });
    await expect(requireDocumentReader('v_bookings_staff', ROW_ID, CODE)).resolves.toEqual(
      NOT_FOUND,
    );
    serverClientSeeing(null);
    await expect(
      requireDocumentReader('invoices', ROW_ID, CODE, { allowsRestricted: true }),
    ).resolves.toEqual(NOT_FOUND);
  });

  it('never gives it to an RW admin at AAL1', async () => {
    vi.mocked(requireUser).mockResolvedValue({ ...STAFF, ctx: { ...STAFF.ctx, isAal2: false } });
    serverClientSeeing({ id: ROW_ID });
    await expect(
      requireDocumentReader('quotations', ROW_ID, CODE, { allowsRestricted: true }),
    ).resolves.toEqual(NOT_FOUND);
  });
});

describe('requireCertificateReader', () => {
  const BOOKING_ID = '0192f3a4-5b6c-7d8e-9f01-0000000000bb';

  it('lets an RW officer whose RLS shows the certificate read a group certificate without a reveal', async () => {
    vi.mocked(requireUser).mockResolvedValue(STAFF);
    const from = serverClientSeeing({ id: ROW_ID });
    await expect(requireCertificateReader(ROW_ID, BOOKING_ID, false)).resolves.toEqual({
      ok: true,
      reader: 'staff',
      userId: STAFF.ctx.userId,
    });
    expect(from).toHaveBeenCalledWith('certificates');
    expect(rpcGetParticipants).not.toHaveBeenCalled();
  });

  it('passes a named certificate only through the personal-data gate, whose refusal is a 404', async () => {
    vi.mocked(requireUser).mockResolvedValue(SUPERADMIN);
    serverClientSeeing({ id: ROW_ID });
    vi.mocked(rpcGetParticipants).mockResolvedValueOnce([]);
    await expect(requireCertificateReader(ROW_ID, BOOKING_ID, true)).resolves.toMatchObject({
      ok: true,
    });
    expect(rpcGetParticipants).toHaveBeenCalledWith(expect.anything(), BOOKING_ID);
    vi.mocked(rpcGetParticipants).mockRejectedValueOnce({ code: '42501' });
    await expect(requireCertificateReader(ROW_ID, BOOKING_ID, true)).resolves.toMatchObject({
      ok: false,
      error: { code: 'NOT_FOUND' },
    });
    vi.mocked(rpcGetParticipants).mockRejectedValueOnce({ code: 'P0001', hint: 'RATE_LIMITED' });
    await expect(requireCertificateReader(ROW_ID, BOOKING_ID, true)).resolves.toMatchObject({
      ok: false,
    });
  });

  it('answers NOT_FOUND to a visitor, an AAL1 session and a certificate RLS hides', async () => {
    vi.mocked(requireUser).mockResolvedValue(NOBODY);
    await expect(requireCertificateReader(ROW_ID, BOOKING_ID, false)).resolves.toMatchObject({
      ok: false,
    });
    vi.mocked(requireUser).mockResolvedValue({ ...STAFF, ctx: { ...STAFF.ctx, isAal2: false } });
    await expect(requireCertificateReader(ROW_ID, BOOKING_ID, false)).resolves.toMatchObject({
      ok: false,
    });
    vi.mocked(requireUser).mockResolvedValue(STAFF);
    serverClientSeeing(null);
    await expect(requireCertificateReader(ROW_ID, BOOKING_ID, false)).resolves.toMatchObject({
      ok: false,
    });
    expect(requireGuestToken).not.toHaveBeenCalled();
  });
});
