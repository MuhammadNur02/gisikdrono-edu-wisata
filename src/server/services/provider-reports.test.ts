import { beforeEach, describe, expect, it, vi } from 'vitest';

import { svcRecordProviderStatus, svcRecordWebhookSignatureFailure } from '@/db/rpc-outbox';
import { withinRateLimits } from '@/lib/rate-limit';
import {
  recordProviderReports,
  recordSignatureFailure,
  withinWebhookLimit,
} from '@/server/services/provider-reports';

import { clientAnswering } from '../../../tests/fixtures/postgrest-client';

vi.mock('@/db/rpc-outbox', () => ({
  svcRecordProviderStatus: vi.fn(),
  svcRecordWebhookSignatureFailure: vi.fn(),
}));
vi.mock('@/lib/rate-limit', () => ({ withinRateLimits: vi.fn() }));

const { client } = clientAnswering(200, null);
const report = (id: string) => ({
  providerMessageId: id,
  status: 'delivered',
  errorCode: null,
  occurredAt: null,
});

describe('provider reports', () => {
  beforeEach(() => {
    vi.mocked(withinRateLimits).mockReset().mockResolvedValue(true);
    vi.mocked(svcRecordWebhookSignatureFailure).mockReset().mockResolvedValue(undefined);
    vi.mocked(svcRecordProviderStatus).mockReset();
  });

  it('counts each sender IP against its provider limit', async () => {
    await withinWebhookLimit(client, 'resend', '203.0.113.9');
    expect(withinRateLimits).toHaveBeenCalledWith(client, [
      { name: 'webhook_resend:ip', subject: '203.0.113.9' },
    ]);
  });

  it('records a signature failure while the IP is within its rejection limit only', async () => {
    await recordSignatureFailure(client, 'whatsapp', '203.0.113.9');
    expect(svcRecordWebhookSignatureFailure).toHaveBeenCalledWith(client, {
      provider: 'whatsapp',
      ipBucket: '203.0.113.9',
    });
    vi.mocked(withinRateLimits).mockResolvedValue(false);
    await recordSignatureFailure(client, 'whatsapp', '203.0.113.9');
    expect(svcRecordWebhookSignatureFailure).toHaveBeenCalledTimes(1);
  });

  it('records the reports in order on the provider channel and counts the outcomes', async () => {
    vi.mocked(svcRecordProviderStatus)
      .mockResolvedValueOnce('updated')
      .mockResolvedValueOnce('unchanged')
      .mockResolvedValueOnce('unknown');
    const counts = await recordProviderReports(client, 'resend', [
      report('a'),
      report('b'),
      report('c'),
    ]);
    expect(counts).toEqual({ updated: 1, unchanged: 1, unknown: 1 });
    expect(
      vi
        .mocked(svcRecordProviderStatus)
        .mock.calls.map((call) => [call[1], call[2].providerMessageId]),
    ).toEqual([
      ['email', 'a'],
      ['email', 'b'],
      ['email', 'c'],
    ]);
  });
});
