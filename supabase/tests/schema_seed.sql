-- Reference data of 0008_seed (docs/PRD.md §8.6, assumption A4, Task P1.8.01) and the development seed guard
-- (Task P1.8.02). Vault secrets are written and removed inside the suite's own transaction.
begin;
select plan(15);

-- ===== RWs and settings =====
select is(
  (select string_agg(id || ':' || code || ':' || slug || ':' || is_active, ', ' order by id) from public.rw_units
   where id in (5, 8)),
  '5:RW05:rw-05-ecowastreme:true, 8:RW08:rw-08-kampung-seni-budaya:true',
  'both RWs exist in every environment'
);
select is(
  array(select key || ':' || is_public from public.site_settings order by key collate "C"),
  array['booking.hold_hours_institution:false', 'booking.hold_minutes_individual:false', 'booking.max_advance_days:true',
        'booking.max_pax:true', 'booking.min_lead_hours:true', 'booking.quotation_valid_days:false',
        'booking_enabled:true', 'certificate.template_version:false', 'checkin.grace_after_minutes:false',
        'checkin.grace_before_minutes:false', 'contact.email:true', 'contact.whatsapp_number:true',
        'email_enabled:false', 'finance.expected_payout_account_masked:false', 'kelurahan.address:true',
        'kelurahan.signatory_name:false', 'kelurahan.signatory_title:false', 'maintenance_mode:true',
        'pii_retention_months:false', 'pricing.min_price_per_pax:false', 'rate_limit_profile:false',
        'seo.default_description:true', 'whatsapp_enabled:false'],
  'every key of docs/PRD.md §8.6 is seeded, public exactly where the PRD says'
);
select is(
  (select string_agg(key || '=' || value, ', ' order by key)
   from public.site_settings
   where key in ('booking.max_advance_days', 'booking.quotation_valid_days', 'pii_retention_months',
                 'pricing.min_price_per_pax')),
  'booking.max_advance_days=180, booking.quotation_valid_days=14, pii_retention_months=24, pricing.min_price_per_pax=5000',
  'the settings functions read hold the PRD defaults'
);
select is(
  (select string_agg(key || '=' || value, ', ' order by key)
   from public.site_settings where key in ('booking_enabled', 'maintenance_mode', 'rate_limit_profile')),
  'booking_enabled=true, maintenance_mode=false, rate_limit_profile="normal"',
  'booking opens with the normal rate-limit profile and no maintenance notice'
);

-- ===== Revenue-share defaults (A4) =====
select is(
  (select string_agg(r.scope || '/' || coalesce(r.rw_id::text, 'combo') || ': ' || lines.split, ' | '
                     order by r.scope, r.rw_id nulls last)
   from public.revenue_share_rules r
   cross join lateral (
     select string_agg(l.beneficiary || coalesce('/' || l.rw_id, '') || '=' || l.pct, ' ' order by l.beneficiary, l.rw_id)
       as split
     from public.revenue_share_rule_lines l where l.rule_id = r.id
   ) as lines
   where r.package_id is null and r.product_id is null and r.is_active),
  'package_default/5: kelurahan=20.00 rw_treasury/5=80.00 | package_default/8: kelurahan=20.00 rw_treasury/8=80.00 | '
  || 'package_default/combo: kelurahan=20.00 rw_treasury/5=40.00 rw_treasury/8=40.00 | '
  || 'addon_default/5: rw_treasury/5=10.00 umkm_vendor=90.00 | addon_default/8: rw_treasury/8=10.00 umkm_vendor=90.00',
  'the default splits of assumption A4, the add-on share going to the product''s own vendor'
);

-- ===== Placeholders =====
select is(
  array(select internal.placeholder_site_settings()),
  array['contact.email', 'contact.whatsapp_number', 'finance.expected_payout_account_masked', 'kelurahan.signatory_name'],
  'the values the kelurahan still has to give are flagged as placeholders'
);
update public.site_settings set value = '"kelurahan.gisikdrono@semarangkota.go.id"' where key = 'contact.email';
update public.site_settings set value = '"+6281234567890"' where key = 'contact.whatsapp_number';
update public.site_settings set value = '"BRI ****4321"' where key = 'finance.expected_payout_account_masked';
update public.site_settings set value = '"Budi Santoso, S.Sos."' where key = 'kelurahan.signatory_name';
select is(array(select internal.placeholder_site_settings()), array[]::text[], 'real values clear them');
update public.site_settings set value = '"info@example.invalid"' where key = 'contact.email';
update public.site_settings set value = '"[isi alamat]"' where key = 'kelurahan.address';
select is(
  array(select internal.placeholder_site_settings()),
  array['contact.email', 'kelurahan.address'],
  'and any example.invalid address or bracketed fill-in text is caught again'
);
select is(
  array(
    select p.proname || ':' || r.role_name from pg_proc p
    cross join (values ('anon'), ('authenticated'), ('service_role')) as r(role_name)
    where p.proname in ('svc_placeholder_site_settings', 'placeholder_site_settings', 'require_development_database')
      and has_function_privilege(r.role_name, p.oid, 'execute')
    order by 1
  ),
  array['svc_placeholder_site_settings:service_role'],
  'production''s health check reads the list through its svc wrapper, the only door to it'
);
select is(array(select public.svc_placeholder_site_settings()), array['contact.email', 'kelurahan.address'],
  'and gets the same keys');

-- ===== Development seed guard =====
delete from vault.secrets where name = 'environment';
select lives_ok($$select internal.require_development_database()$$, 'a database that names no environment may be seeded');
select vault.create_secret('local', 'environment');
select lives_ok($$select internal.require_development_database()$$, 'so may a local one');
select vault.update_secret((select id from vault.secrets where name = 'environment'), 'staging');
select throws_ok($$select internal.require_development_database()$$, '42501',
  'supabase/seed.sql never runs on the staging database: it creates development accounts with known passwords',
  'a staging database refuses the development seed');
select vault.update_secret((select id from vault.secrets where name = 'environment'), 'production');
select throws_ok($$select internal.require_development_database()$$, '42501',
  'supabase/seed.sql never runs on the production database: it creates development accounts with known passwords',
  'and so does production');
select ok(
  (select count(*) from public.revenue_share_rules r where r.package_id is null and r.product_id is null
     and r.name like 'Bawaan %') = 5,
  'the seed wrote each default rule once'
);

select * from finish();
rollback;
