import { describe, expect, it } from 'vitest';

import { DEV_ONLY_PASSWORD, DEV_ONLY_TOTP_SECRET } from '../../scripts/dev-accounts';
import { devSeedSql } from '../../scripts/dev-seed-sql';
import { runSql, sqlText } from '../../scripts/local-stack';

// pnpm db:seed on a database seeded before Task P2.10.03, whose arts demo still belongs to RW 08, ends where a fresh
// seed ends: the demo under RW 13 and a combo of RW 05 and RW 13 (independent review of PR #23, 3). The test puts the
// local database into that older shape, runs the seed as scripts/seed-dev.ts does, and leaves it seeded again.

const SLOW_TEST_MS = 120_000;
const seedSql = devSeedSql();
const COMBO = '0de00000-0000-4000-8000-0000000000c9';
const ARTS_PACKAGE_BEFORE = '0de00000-0000-4000-8000-0000000000c8';
const ARTS_VENDOR_BEFORE = '0de00000-0000-4000-8000-0000000000a8';
const ARTS_PACKAGE = '0de00000-0000-4000-8000-000000000c13';
const ARTS_VENDOR = '0de00000-0000-4000-8000-000000000a13';

async function runSeed(): Promise<void> {
  await runSql(`select set_config('dev_seed.password', ${sqlText(DEV_ONLY_PASSWORD)}, true),
                       set_config('dev_seed.totp_secret', ${sqlText(DEV_ONLY_TOTP_SECRET)}, true);
${seedSql}`);
}

// The arts demo moved back to RW 08, row for row as the seed wrote it before Task P2.10.03.
async function seedArtsDemoUnderRw08(): Promise<void> {
  await runSql(`select set_config('app.purge', 'on', true);
update public.tour_packages set status = 'draft' where id = '${COMBO}';
delete from public.tour_package_legs where package_id = '${COMBO}' and rw_id in (8, 13);
delete from public.tour_packages where id in ('${ARTS_PACKAGE}', '${ARTS_PACKAGE_BEFORE}');
delete from public.products_umkm where slug = 'gantungan-kunci-batik';
delete from public.umkm_vendors where id in ('${ARTS_VENDOR}', '${ARTS_VENDOR_BEFORE}');
delete from public.visit_sessions s using public.session_templates t
where s.template_id = t.id and t.rw_id in (8, 13) and s.reserved_pax = 0;
delete from public.session_templates where rw_id in (8, 13);
select set_config('app.purge', 'off', true);

insert into public.umkm_vendors (id, rw_id, slug, name, description_md, is_active)
values ('${ARTS_VENDOR_BEFORE}', 8, 'kriya-sanggar-kampung', 'Kriya Sanggar Kampung',
        'Kerajinan tangan anggota sanggar RW 08.', true);
insert into public.products_umkm (rw_id, vendor_id, slug, name, category, description_md, price, unit_label,
  is_addon_eligible, status, is_featured)
values (8, '${ARTS_VENDOR_BEFORE}', 'gantungan-kunci-batik', 'Gantungan Kunci Batik', 'souvenir',
        'Gantungan kunci kain batik buatan anak sanggar.', 20000, 'buah', false, 'published', true);
insert into public.tour_packages (id, rw_id, category, slug, name, tagline, duration_minutes, price_per_pax, status,
  is_featured)
values ('${ARTS_PACKAGE_BEFORE}', 8, 'student', 'paket-eduwisata-seni-budaya', 'Eduwisata Seni Budaya',
        'Menari, membatik dan bermain dolanan', 120, 40000, 'published', true);
insert into public.tour_package_legs (package_id, rw_id, leg_order) values ('${COMBO}', 8, 2);
update public.tour_packages set status = 'published' where id = '${COMBO}';
insert into public.session_templates (rw_id, weekday, label, start_time, end_time, capacity)
select 8, weekday, label, start_time::time, end_time::time, 40
from generate_series(2, 6) as weekday
cross join (values ('Sesi Pagi', '08:30', '10:30'), ('Sesi Siang', '13:30', '15:30')) as slot(label, start_time, end_time);
select internal.run_scheduled_job('generate_visit_sessions');`);
}

async function oneValue(query: string): Promise<unknown> {
  const [row] = await runSql(query);
  return row === undefined ? undefined : Object.values(row as Record<string, unknown>)[0];
}

async function demoShape(): Promise<Record<string, unknown>> {
  return {
    combo:
      await oneValue(`select (select string_agg(rw_id::text, ',' order by leg_order) from public.tour_package_legs
                                   where package_id = '${COMBO}') || ':' || status from public.tour_packages
                           where id = '${COMBO}'`),
    artsPackage: await oneValue(`select rw_id || ':' || status from public.tour_packages
                                 where slug = 'paket-eduwisata-seni-budaya'`),
    artsProduct: await oneValue(`select rw_id || ':' || status from public.products_umkm
                                 where slug = 'gantungan-kunci-batik'`),
    artsVendor: await oneValue(
      `select rw_id::text from public.umkm_vendors where slug = 'kriya-sanggar-kampung'`,
    ),
    rw08Templates: await oneValue(
      `select count(*)::int from public.session_templates where rw_id = 8`,
    ),
    rw08SessionsAhead: await oneValue(`select count(*)::int from public.visit_sessions
                                       where rw_id = 8 and session_date >= public.today_jkt()`),
    rw13Templates: await oneValue(
      `select count(*)::int from public.session_templates where rw_id = 13`,
    ),
  };
}

const THREE_RW_DEMO = {
  combo: '5,13:published',
  artsPackage: '13:published',
  artsProduct: '13:published',
  artsVendor: '13',
  rw08Templates: 0,
  rw08SessionsAhead: 0,
  rw13Templates: 10,
};

describe('pnpm db:seed on a database seeded before RW 13 existed', () => {
  it(
    'moves the arts demo from RW 08 to RW 13 and the combo to RW 05 + RW 13',
    async () => {
      await seedArtsDemoUnderRw08();
      expect(await demoShape()).toMatchObject({
        combo: '5,8:published',
        artsPackage: '8:published',
        rw08Templates: 10,
      });

      await runSeed();
      expect(await demoShape()).toEqual(THREE_RW_DEMO);
    },
    SLOW_TEST_MS,
  );

  it(
    'changes nothing when run again',
    async () => {
      await runSeed();
      expect(await demoShape()).toEqual(THREE_RW_DEMO);
    },
    SLOW_TEST_MS,
  );
});
