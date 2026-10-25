import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';

import { savePackage } from '@/db/rpc-catalog';

import { clientAnswering } from '../../tests/fixtures/postgrest-client';

const PACKAGE_ID = '0192f3a4-5b6c-7d8e-9f01-0000000000c1';
const TIER_ID = '0192f3a4-5b6c-7d8e-9f01-0000000000c2';

describe('savePackage', () => {
  it('sends the fields, the legs and the tiers, and reads the package id', async () => {
    const { client, requests } = clientAnswering(200, PACKAGE_ID);
    await expect(
      savePackage(client, {
        packageId: PACKAGE_ID,
        fields: { name: 'Kombo', status: 'draft' },
        legRwIds: [13, 5],
        tiers: [
          { id: TIER_ID, minPax: 1, maxPax: 20, pricePerPax: 30000 },
          { id: null, minPax: 21, maxPax: null, pricePerPax: 25000 },
        ],
      }),
    ).resolves.toBe(PACKAGE_ID);
    expect(requests[0]).toEqual({
      url: 'http://supabase.test/rest/v1/rpc/save_package',
      body: {
        p_package_id: PACKAGE_ID,
        p_package: { name: 'Kombo', status: 'draft' },
        p_leg_rw_ids: [13, 5],
        p_tiers: [
          { id: TIER_ID, min_pax: 1, max_pax: 20, price_per_pax: 30000 },
          { id: null, min_pax: 21, max_pax: null, price_per_pax: 25000 },
        ],
      },
    });
  });

  it('leaves out the id of a new package and the legs it keeps', async () => {
    const { client, requests } = clientAnswering(200, PACKAGE_ID);
    await savePackage(client, { packageId: null, fields: {}, legRwIds: null, tiers: [] });
    expect(requests[0]?.body).toEqual({ p_package: {}, p_tiers: [] });
  });

  it('refuses a reply that is no package id', async () => {
    const { client } = clientAnswering(200, 'bukan');
    await expect(
      savePackage(client, { packageId: null, fields: {}, legRwIds: null, tiers: [] }),
    ).rejects.toBeInstanceOf(ZodError);
  });
});
