import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';

import { svcRunAnomalyScan } from '@/db/rpc-security';

import { clientAnswering } from '../../tests/fixtures/postgrest-client';

describe('svcRunAnomalyScan', () => {
  it('says whether to walk the chains and reads what the run raised', async () => {
    const { client, requests } = clientAnswering(200, { raised: 3, chains_checked: true });
    await expect(svcRunAnomalyScan(client, { checkChains: true })).resolves.toEqual({
      raised: 3,
      chainsChecked: true,
    });
    expect(requests[0]).toEqual({
      url: 'http://supabase.test/rest/v1/rpc/svc_run_anomaly_scan',
      body: { p_check_chains: true },
    });
  });

  it('refuses a report of another shape', async () => {
    const { client } = clientAnswering(200, { raised: -1, chains_checked: true });
    await expect(svcRunAnomalyScan(client, { checkChains: false })).rejects.toBeInstanceOf(
      ZodError,
    );
  });
});
