import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  accessTokenOf,
  claimsOf,
  lastAuditId,
  removeSignInTraces,
  signInDevAccount,
  userIdOf,
} from './helpers/staff-session';
import type { ApiClient } from './helpers/staff-session';

// docs/PRD.md §13.1 A30, docs/Security.md AZ-16: the Koperasi Merah Putih's admin through PostgREST with the real
// AAL2 token GoTrue mints for the development account admin-kopdes@dev.gisikdrono.test, beside rls-http.test.ts:
// its role without an RW, the UMKM catalogue of every RW, the three catalogue settings, and no package, booking,
// session, payment or staff row, the demo content of pnpm db:seed included.

const SLOW_TEST_MS = 60_000;
const CATALOGUE_KEYS = [
  'catalogue.show_product_prices',
  'contact.kopdes_address',
  'contact.kopdes_whatsapp_number',
];

async function rowsOf(
  client: ApiClient,
  table: 'bookings' | 'tour_packages' | 'visit_sessions' | 'payments',
) {
  const { data, error } = await client.from(table).select('id').limit(1);
  return error ? [] : data;
}

describe(
  'the Kopdes admin through PostgREST with a real token',
  () => {
    let auditIdBefore = 0;
    let kopdes: ApiClient;

    beforeAll(async () => {
      auditIdBefore = await lastAuditId();
      kopdes = await signInDevAccount('admin-kopdes@dev.gisikdrono.test');
    }, SLOW_TEST_MS);

    afterAll(async () => {
      await removeSignInTraces(auditIdBefore);
    }, SLOW_TEST_MS);

    it('carries admin_kopdes at AAL2 and no RW', async () => {
      expect(claimsOf(await accessTokenOf(kopdes))).toMatchObject({
        aal: 'aal2',
        app_role: 'admin_kopdes',
        app_rw_id: null,
      });
    });

    it('reads the UMKM catalogue of every RW and the RWs to file it under', async () => {
      const products = await kopdes.from('products_umkm').select('rw_id');
      expect(products.error).toBeNull();
      const vendors = await kopdes.from('umkm_vendors').select('id').limit(1);
      expect(vendors.error).toBeNull();
      const rws = await kopdes.from('rw_units').select('id');
      expect(rws.data?.length ?? 0).toBeGreaterThan(0);
    });

    it('reads of the settings the three catalogue keys alone, and of the profiles its own', async () => {
      const settings = await kopdes.from('site_settings').select('key').order('key');
      expect(settings.data?.map((row) => row.key)).toEqual(CATALOGUE_KEYS);
      const profiles = await kopdes.from('profiles').select('id');
      expect(profiles.data?.map((row) => row.id)).toEqual([await userIdOf(kopdes)]);
    });

    it('sees no package, booking, session or payment, and creates no package', async () => {
      for (const table of ['tour_packages', 'bookings', 'visit_sessions', 'payments'] as const) {
        expect(await rowsOf(kopdes, table)).toEqual([]);
      }
      const signer = await userIdOf(kopdes);
      const { error } = await kopdes.from('tour_packages').insert({
        created_by: signer,
        updated_by: signer,
        rw_id: 5,
        category: 'student',
        slug: 'uji-http-kopdes',
        name: 'Paket Kopdes',
        duration_minutes: 60,
        price_per_pax: 25000,
      });
      expect(error).not.toBeNull();
    });
  },
  SLOW_TEST_MS,
);
