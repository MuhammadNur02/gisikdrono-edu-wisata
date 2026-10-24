import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';

import { svcRunAnomalyScan, svcRunChainCheck } from '@/db/rpc-security';

import { clientAnswering } from '../../tests/fixtures/postgrest-client';

describe('svcRunAnomalyScan', () => {
  it('runs the scan and reads what it raised', async () => {
    const { client, requests } = clientAnswering(200, { raised: 3 });
    await expect(svcRunAnomalyScan(client)).resolves.toEqual({ raised: 3 });
    expect(requests[0]?.url).toBe('http://supabase.test/rest/v1/rpc/svc_run_anomaly_scan');
  });

  it('refuses a report of another shape', async () => {
    const { client } = clientAnswering(200, { raised: -1 });
    await expect(svcRunAnomalyScan(client)).rejects.toBeInstanceOf(ZodError);
  });
});

describe('svcRunChainCheck', () => {
  it('checks the chains on their own and reads what it raised', async () => {
    const { client, requests } = clientAnswering(200, { raised: 0 });
    await expect(svcRunChainCheck(client)).resolves.toEqual({ raised: 0 });
    expect(requests[0]?.url).toBe('http://supabase.test/rest/v1/rpc/svc_run_chain_check');
  });

  it('refuses a report of another shape', async () => {
    const { client } = clientAnswering(200, { raised: 1, chains_checked: true });
    await expect(svcRunChainCheck(client)).rejects.toBeInstanceOf(ZodError);
  });
});
