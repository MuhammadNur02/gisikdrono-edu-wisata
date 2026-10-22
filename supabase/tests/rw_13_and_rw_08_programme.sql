-- RW 13 and RW 08's new programme (decision of 2026-10-21, Task P2.10.03, 20261022080000_rw_13_and_rw_08_programme.sql):
-- RW 13 has the arts programme's name, look, schedule and tagline, its default revenue-share rules and is online;
-- RW 08 is Kampung Inklusif & Ramah Anak, a profile page with its own default rules; the RWs read 05, 13, 08.
begin;
select plan(14);

-- ===== RW 13 =====
select is(
  (select concat_ws(' | ', code, slug, name, short_name, theme_label, tagline, accent_key, icon_key, schedule_enabled::text,
                    products_heading, is_active::text)
   from public.rw_units where id = 13),
  'RW13 | rw-13-kampung-budaya-seni | RW 13 Kampung Budaya & Seni | Kampung Budaya & Seni | Seni & Budaya | '
  || 'Menari, bermain dolanan dan berkarya di sanggar kampung | terracotta | drama | true | Suvenir dan produk UMKM | true',
  'RW 13 carries the arts programme: its name, tagline, colour, icon, schedule and product heading, online'
);
select is(
  (select string_agg(r.scope || ': ' || lines.split, ' | ' order by r.scope)
   from public.revenue_share_rules r
   cross join lateral (
     select string_agg(l.beneficiary || coalesce('/' || l.rw_id, '') || '=' || l.pct, ' ' order by l.beneficiary) as split
     from public.revenue_share_rule_lines l where l.rule_id = r.id
   ) as lines
   where r.rw_id = 13 and r.package_id is null and r.product_id is null and r.is_active),
  'package_default: kelurahan=20.00 rw_treasury/13=80.00 | addon_default: rw_treasury/13=10.00 umkm_vendor=90.00',
  'RW 13 has the default splits of assumption A4, paying its own treasury'
);
select ok(
  (select bool_and(r.effective_from <= public.today_jkt() and r.effective_to is null)
   from public.revenue_share_rules r where r.rw_id = 13 and r.scope in ('package_default', 'addon_default')),
  'both rules hold today, as set_rw_unit_status asks of an RW before it goes online'
);
select is(internal.media_owner(13::smallint), 'rw-13', 'RW 13''s files live under rw-13/');

-- ===== RW 08 =====
select is(
  (select concat_ws(' | ', code, slug, name, short_name, theme_label, accent_key, icon_key, schedule_enabled::text,
                    coalesce(products_heading, '-'), is_active::text)
   from public.rw_units where id = 8),
  'RW08 | rw-08-inklusif-ramah-anak | RW 08 Kampung Inklusif & Ramah Anak | Kampung Inklusif & Ramah Anak | '
  || 'Inklusif & Ramah Anak | mulberry | heart_handshake | false | - | true',
  'RW 08 is Kampung Inklusif & Ramah Anak: mulberry, no schedule and no product heading'
);
-- What RW 08 says about itself is the kelurahan's to write (pnpm db:seed gives a local database one); the arts line is gone.
select ok(
  (select tagline is distinct from 'Menari, bermain dolanan dan berkarya di sanggar kampung' from public.rw_units where id = 8),
  'RW 08 no longer carries the arts tagline'
);
select is(
  (select count(*)::int from public.revenue_share_rules r
   where r.rw_id = 8 and r.scope in ('package_default', 'addon_default') and r.is_active),
  2,
  'RW 08 keeps its default rules, so it may take packages later'
);
select is(
  (select string_agg(l.beneficiary || coalesce('/' || l.rw_id, '') || '=' || l.pct, ' ' order by l.beneficiary)
   from public.revenue_share_rules r join public.revenue_share_rule_lines l on l.rule_id = r.id
   where r.rw_id = 8 and r.scope = 'package_default'),
  'kelurahan=20.00 rw_treasury/8=80.00',
  'and they still pay RW 08''s own treasury'
);

-- ===== Order, the public view and the meta description =====
select is(
  (select string_agg(id::text, ',' order by sort_order, id) from public.rw_units where id in (5, 8, 13)),
  '5,13,8',
  'the RWs read 05, 13, 08 in the menu and every list'
);
select is(
  (select string_agg(id::text, ',' order by sort_order) from public.rw_units where sort_order in (1, 2, 3)),
  '5,13,8',
  'each with a place of its own'
);
set local role anon;
select is(
  (select string_agg(slug, ',' order by sort_order) from public.rw_units where id in (5, 8, 13)),
  'rw-05-ecowastreme,rw-13-kampung-budaya-seni,rw-08-inklusif-ramah-anak',
  'a visitor reads all three RWs'
);
select is(
  (select short_name || ':' || accent_key || ':' || icon_key || ':' || schedule_enabled from public.rw_units where id = 13),
  'Kampung Budaya & Seni:terracotta:drama:true',
  'with RW 13''s look and schedule'
);
reset role;
select is(
  (select value #>> '{}' from public.site_settings where key = 'seo.default_description'),
  'Wisata edukasi di Kelurahan Gisikdrono, Semarang Barat: kampung tanpa sampah di RW 05, seni budaya di RW 13, dan '
  || 'kampung inklusif ramah anak di RW 08.',
  'the default meta description names the three programmes'
);
select ok(
  not exists (select 1 from internal.placeholder_site_settings() as key where key = 'seo.default_description'),
  'and is no placeholder'
);

select * from finish();
rollback;
