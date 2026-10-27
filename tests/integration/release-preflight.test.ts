import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { runSql } from '../../scripts/local-stack';

// The production release job's pre-flight (Task P5.7.02, scripts/release-preflight.sql) against the local database:
// it passes on a database every migration holds, and names each kind of row that would stop the checks of
// 20261104140000 and 20261104121000. Each bad case drops those checks and skips the triggers inside one transaction,
// which the pre-flight's own exception rolls back, so the local database is left as it was.

const PREFLIGHT = readFileSync(
  new URL('../../scripts/release-preflight.sql', import.meta.url),
  'utf8',
);
const RAW_WRITES = 'set local session_replication_role = replica;';

async function preflightAfter(setup: string): Promise<unknown> {
  return runSql(`${RAW_WRITES}\n${setup}\n${PREFLIGHT}`);
}

describe('scripts/release-preflight.sql', () => {
  it('passes on a database the migrations hold', async () => {
    await expect(runSql(PREFLIGHT)).resolves.toBeDefined();
  });

  it('stops on a staff profile without became_staff_at', async () => {
    await expect(
      preflightAfter(`alter table public.profiles drop constraint profiles_role_implies_became_staff,
                        drop constraint profiles_active_implies_became_staff;
        update public.profiles set became_staff_at = null
        where id = (select id from public.profiles where role <> 'none' order by id limit 1);`),
    ).rejects.toThrow(/1 profiles hold a role or are active without became_staff_at/);
  });

  it('stops on account numbers that are not 5 to 20 digits, counting each kind', async () => {
    await expect(
      preflightAfter(`alter table public.umkm_vendors drop constraint umkm_vendors_bank_account_number_ok;
        alter table public.rw_units drop constraint rw_units_treasury_account_number_ok;
        update public.umkm_vendors set bank_account_number = '12-34'
        where id = (select id from public.umkm_vendors order by id limit 1);
        update public.rw_units set treasury_account_number = '1234' where id = 5;`),
    ).rejects.toThrow(
      /1 UMKM vendors have an account number that is not 5 to 20 digits; 1 RW treasuries have/,
    );
  });
});
