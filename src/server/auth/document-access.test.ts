import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireDocumentReader } from '@/server/auth/document-access';
import { requireGuestToken, requireUser } from '@/server/auth/guards';

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
