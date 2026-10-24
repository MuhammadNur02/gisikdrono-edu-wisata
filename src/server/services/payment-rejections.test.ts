import { beforeEach, describe, expect, it, vi } from 'vitest';

import { svcRecordWebhookRejection } from '@/db/rpc-payments';
import { withinRateLimits } from '@/lib/rate-limit';
import { recordWebhookRejection } from '@/server/services/payment-service';

vi.mock('@/lib/supabase/admin', () => ({ createSupabaseAdminClient: () => ({}) }));
vi.mock('@/db/rpc-payments', () => ({ svcRecordWebhookRejection: vi.fn() }));
vi.mock('@/lib/rate-limit', () => ({ withinRateLimits: vi.fn() }));

// docs/Security.md §3.3 step 5: a refused notification leaves metadata only, at most twenty rows an hour per IP.
const REJECTION = {
  reason: 'signature_invalid' as const,
  orderId: 'GSK-7F3K9Q2M-02',
  statusCode: '200',
  bodySha256: 'b'.repeat(64),
  ip: '203.0.113.7',
  userAgent: null,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('recordWebhookRejection', () => {
  it('records the metadata while the sender is within its hourly cap', async () => {
    vi.mocked(withinRateLimits).mockResolvedValue(true);
    await recordWebhookRejection(REJECTION, '203.0.113.7');
    expect(withinRateLimits).toHaveBeenCalledWith(expect.anything(), [
      { name: 'webhook_rejection:ip', subject: '203.0.113.7' },
    ]);
    expect(svcRecordWebhookRejection).toHaveBeenCalledWith(expect.anything(), REJECTION);
  });

  it('stops recording past the cap', async () => {
    vi.mocked(withinRateLimits).mockResolvedValue(false);
    await recordWebhookRejection(REJECTION, '203.0.113.7');
    expect(svcRecordWebhookRejection).not.toHaveBeenCalled();
  });
});
