import { beforeEach, describe, expect, it, vi } from 'vitest';

import { financeCopy } from '@/lib/copy/finance';
import type { StaffContext } from '@/server/auth/guards';
import { storeFinanceEvidence } from '@/server/services/document-service';

import { settlePayout } from './revenue-share-service';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: vi.fn() }));
vi.mock('@/server/services/document-service', () => ({
  removeFinanceEvidence: vi.fn(),
  storeFinanceEvidence: vi.fn(),
}));

const SUPERADMIN: StaffContext = {
  userId: 'user-1',
  isAal2: true,
  totpVerifiedAt: null,
  claimsVersion: 1,
  role: 'superadmin',
  rwId: null,
};
const PAYOUT = {
  beneficiaryKey: 'rw:5',
  from: '2026-10-01',
  to: '2026-10-24',
  expectedTotal: 70000,
  transferredAmount: 70000,
  reference: 'TRF-RW5-001',
  accountDigits: '1234',
  proofUpload: 'kelurahan/0192f3a4-5b6c-7d8e-9f01-000000000004',
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('settlePayout (delta review of PR #80, L-e)', () => {
  it('refuses an amount typed off the transfer that is not the preview figure, before anything is stored', async () => {
    await expect(
      settlePayout(SUPERADMIN, { ...PAYOUT, transferredAmount: 69000 }),
    ).rejects.toMatchObject({
      code: 'VALIDATION',
      userMessage: financeCopy.payouts.errors.TRANSFER_MISMATCH,
    });
    expect(storeFinanceEvidence).not.toHaveBeenCalled();
  });
});
