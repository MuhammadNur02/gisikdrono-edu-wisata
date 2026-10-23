import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireDocumentReader } from '@/server/auth/document-access';
import { requireGuestToken, requireUser } from '@/server/auth/guards';

vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: vi.fn() }));
vi.mock('@/server/auth/guards', () => ({ requireUser: vi.fn(), requireGuestToken: vi.fn() }));

const ROW_ID = '0192f3a4-5b6c-7d8e-9f01-0000000000cc';
const CODE = 'GSK-7F3K9Q2M';
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
  it('lets a staff member read a row their RLS returns, without touching the guest cookie', async () => {
    vi.mocked(requireUser).mockResolvedValue(STAFF);
    const from = serverClientSeeing({ id: ROW_ID });
    await expect(requireDocumentReader('quotations', ROW_ID, CODE)).resolves.toEqual({
      ok: true,
      reader: 'staff',
    });
    expect(from).toHaveBeenCalledWith('quotations');
    expect(requireGuestToken).not.toHaveBeenCalled();
  });

  it('falls back to the guest link when the row is outside the staff member’s scope', async () => {
    vi.mocked(requireUser).mockResolvedValue(STAFF);
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
