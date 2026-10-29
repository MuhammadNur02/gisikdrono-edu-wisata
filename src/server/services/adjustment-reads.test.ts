import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createSupabaseServerClient } from '@/lib/supabase/server';

import { blockedByKeyMismatch } from './adjustment-reads';
import { clientAnswering } from '../../../tests/fixtures/postgrest-client';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: vi.fn() }));

const A = '0192f3a4-5b6c-7d8e-9f01-0000000000a1';
const B = '0192f3a4-5b6c-7d8e-9f01-0000000000b2';
const C = '0192f3a4-5b6c-7d8e-9f01-0000000000c3';

const APPLIED_REFUND = { type: 'manual_refund', status: 'applied' } as const;

function answering(reply: unknown) {
  const answer = clientAnswering(200, reply);
  vi.mocked(createSupabaseServerClient).mockResolvedValue(answer.client);
  return answer.requests;
}

// Review of PR #103: the badge follows the database's own blocking state (refund_key_blocked_adjustments), so it goes
// away once a release or Midtrans' own figure lifts the block, however the alert was left.
describe('blockedByKeyMismatch', () => {
  beforeEach(() => {
    vi.mocked(createSupabaseServerClient).mockReset();
  });

  it('asks the database about the applied manual refunds only', async () => {
    const requests = answering([A]);
    const rows = [
      { id: A, ...APPLIED_REFUND },
      { id: B, type: 'manual_refund', status: 'approved' },
      { id: C, type: 'write_off', status: 'applied' },
    ] as const;
    await expect(blockedByKeyMismatch(rows)).resolves.toEqual(new Set([A]));
    expect(requests[0]?.url).toContain('/rest/v1/rpc/refund_key_blocked_adjustments');
    expect(requests[0]?.body).toEqual({ p_adjustment_ids: [A] });
  });

  it('shows no badge for a refund the database no longer blocks', async () => {
    answering([]);
    await expect(blockedByKeyMismatch([{ id: A, ...APPLIED_REFUND }])).resolves.toEqual(new Set());
  });

  it('asks nothing when no row is an applied manual refund', async () => {
    await expect(
      blockedByKeyMismatch([{ id: B, type: 'reclassify_share', status: 'applied' }]),
    ).resolves.toEqual(new Set());
    expect(createSupabaseServerClient).not.toHaveBeenCalled();
  });

  it('refuses an answer that is not a list of ids', async () => {
    answering(['not-an-id']);
    await expect(blockedByKeyMismatch([{ id: A, ...APPLIED_REFUND }])).rejects.toThrow();
  });
});
