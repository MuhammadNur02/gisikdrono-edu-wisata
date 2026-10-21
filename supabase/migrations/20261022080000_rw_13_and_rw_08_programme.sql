-- RW 13 and RW 08's new programme (decision of 2026-10-21, Task P2.10.03). The arts programme the site has called
-- "RW 08 Kampung Seni Budaya" runs in RW 13, Jl. Jatisari, so RW 13 takes over its name, colour, schedule and
-- tagline. RW 08 stays in the edu-tourism programme as "Kampung Inklusif & Ramah Anak": the public service centre
-- with Semar Cakep and the child-friendly Ketan Ronggolawe. It starts as a profile page; its packages come later
-- through the CMS, priced by the kelurahan.

-- Everything RW 8 owns so far was made for the arts programme. Content can be moved or rewritten in the CMS, but a
-- booking, ticket, payment or ledger row records what a visitor paid for, and renaming RW 8 under it would make
-- it say something else. No environment holds such a row today (staging was never migrated and production does
-- not exist yet); should one appear, this migration stops so someone moves it by hand first.
do $$
begin
  if exists (select 1 from public.bookings where 8 = any(rw_ids))
     or exists (select 1 from public.booking_legs where rw_id = 8)
     or exists (select 1 from public.tickets_qr where rw_id = 8)
     or exists (select 1 from public.payments p join public.bookings b on b.id = p.booking_id
                where 8 = any(b.rw_ids))
     or exists (select 1 from public.revenue_share_entries where rw_id = 8 or beneficiary_key = 'rw:8')
     or exists (select 1 from public.payout_batches where beneficiary_key = 'rw:8') then
    raise exception using
      message = 'RW 8 already has bookings, tickets, payments or ledger rows of the arts programme; move them to '
                || 'RW 13 by hand before RW 8 becomes Kampung Inklusif & Ramah Anak (Task P2.10.03)';
  end if;
end;
$$;

-- RW 13 starts offline like every new RW, gets the default rules every RW needs before it may go online
-- (set_rw_unit_status), and then goes online. The tagline and the product heading are the arts programme's from
-- 0008_seed and 20261021130000.
insert into public.rw_units (id, code, slug, name, short_name, theme_label, tagline, accent_key, icon_key,
  schedule_enabled, products_heading, is_active, sort_order)
values (13, 'RW13', 'rw-13-kampung-budaya-seni', 'RW 13 Kampung Budaya & Seni', 'Kampung Budaya & Seni',
  'Seni & Budaya', 'Menari, bermain dolanan dan berkarya di sanggar kampung', 'terracotta', 'drama',
  true, 'Suvenir dan produk UMKM', false, 2)
on conflict (id) do nothing;

-- Assumption A4, as for RW 05 and RW 08 in 0008_seed: a package pays 20 % to the kelurahan and 80 % to the RW's
-- treasury, an add-on 90 % to the product's vendor and 10 % to the RW's treasury.
with seeded_rules as (
  insert into public.revenue_share_rules (scope, rw_id, name)
  select scope::public.revenue_rule_scope, 13, name
  from (values
    ('package_default', 'Bawaan paket RW 13'),
    ('addon_default', 'Bawaan produk tambahan RW 13')
  ) as rule(scope, name)
  where not exists (select 1 from public.revenue_share_rules r where r.scope::text = rule.scope
                    and r.rw_id = 13 and r.package_id is null and r.product_id is null)
  returning id, scope
)
insert into public.revenue_share_rule_lines (rule_id, beneficiary, rw_id, pct)
select r.id, line.beneficiary::public.revenue_beneficiary, line.rw_id, line.pct
from seeded_rules r
join (values
  ('package_default', 'kelurahan', null::smallint, 20.00),
  ('package_default', 'rw_treasury', 13::smallint, 80.00),
  ('addon_default', 'umkm_vendor', null::smallint, 90.00),
  ('addon_default', 'rw_treasury', 13::smallint, 10.00)
) as line(scope, beneficiary, rw_id, pct)
  on line.scope = r.scope::text;

update public.rw_units set is_active = true where id = 13 and not is_active;

-- RW 08's new identity. The arts tagline and product heading move to RW 13 above, so RW 08 shows none until the
-- kelurahan writes its own (go-live checklist, Appendix C #22). Its location, contacts and treasury belong to the RW
-- itself and stay; so do its default revenue-share rules, which pay RW 08's own treasury.
update public.rw_units
set slug = 'rw-08-inklusif-ramah-anak',
    name = 'RW 08 Kampung Inklusif & Ramah Anak',
    short_name = 'Kampung Inklusif & Ramah Anak',
    theme_label = 'Inklusif & Ramah Anak',
    tagline = case when tagline = 'Menari, bermain dolanan dan berkarya di sanggar kampung' then null else tagline end,
    accent_key = 'mulberry',
    icon_key = 'heart_handshake',
    schedule_enabled = false,
    products_heading = null
where id = 8;

-- The order of the menu, the home page and every list of RWs: 05, 13, 08.
update public.rw_units set sort_order = 1 where id = 5;
update public.rw_units set sort_order = 2 where id = 13;
update public.rw_units set sort_order = 3 where id = 8;

-- The default meta description named the old pair. A description someone has already rewritten stays theirs.
update public.site_settings
set value = to_jsonb('Wisata edukasi di Kelurahan Gisikdrono, Semarang Barat: kampung tanpa sampah di RW 05, seni '
                     || 'budaya di RW 13, dan kampung inklusif ramah anak di RW 08.')
where key = 'seo.default_description'
  and value = to_jsonb('Edu Wisata Kelurahan Gisikdrono, Semarang Barat: wisata edukasi tanpa sampah di RW 05 '
                       || 'Ecowastreme dan seni budaya di RW 08 Kampung Seni Budaya.');

-- Not changed here: the combo default rule of 0008_seed (rw_id NULL) still pays 40 % to the treasuries of RW 05 and
-- RW 08. Nothing allocates revenue yet; Task P3.9.04 replaces that rule with the equal split over the RWs of a
-- booking's legs before allocation exists (Task P3.9.01).
