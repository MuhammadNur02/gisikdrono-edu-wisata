import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';

import { savePackage, saveProduct } from '@/db/rpc-catalog';

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

describe('saveProduct', () => {
  it('sends the fields and the variants in order, snake_case, and reads the product id', async () => {
    const { client, requests } = clientAnswering(200, PACKAGE_ID);
    await expect(
      saveProduct(client, {
        productId: PACKAGE_ID,
        fields: { name: 'Vest Perca', price: null },
        variants: [
          { label: 'Motif Kawung', imagePath: 'rw-05/products/x/a.webp', isAvailable: true },
          { label: 'Motif Parang', imagePath: null, isAvailable: false },
        ],
      }),
    ).resolves.toBe(PACKAGE_ID);
    expect(requests[0]).toEqual({
      url: 'http://supabase.test/rest/v1/rpc/save_product',
      body: {
        p_product_id: PACKAGE_ID,
        p_product: { name: 'Vest Perca', price: null },
        p_variants: [
          { label: 'Motif Kawung', image_path: 'rw-05/products/x/a.webp', is_available: true },
          { label: 'Motif Parang', image_path: null, is_available: false },
        ],
      },
    });
  });

  it('leaves out the id of a new product, and passes a refusal on', async () => {
    const created = clientAnswering(200, PACKAGE_ID);
    await saveProduct(created.client, { productId: null, fields: {}, variants: [] });
    expect(created.requests[0]?.body).toEqual({ p_product: {}, p_variants: [] });

    const refused = clientAnswering(403, { code: '42501', message: 'denied' });
    await expect(
      saveProduct(refused.client, { productId: null, fields: {}, variants: [] }),
    ).rejects.toMatchObject({ code: '42501' });
  });
});
