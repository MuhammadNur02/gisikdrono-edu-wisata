-- The Koperasi Merah Putih's staff role, admin_kopdes (docs/PRD.md §13.1 A30, docs/Security.md AZ-16; migrations
-- 20261105180000 to 20261105180500). The matrix suites (rls_matrix_*.sql, rls_storage.sql) test it table by table
-- against their own fixtures; this suite holds what belongs to the role itself: the claims the access-token hook gives
-- it, the RW it never has, how the superadmin makes one, the helpers, a sweep over every table and view, the UMKM
-- writes and bank RPCs it may use and every staff RPC it may not, and its name in audit_logs. Also the follow-ups of
-- the review of PR #115: the price switch's lock (20261105180600) and save_product's required variants
-- (20261105180700).
begin;
select plan(54);
\ir helpers/rls_personas.psql

insert into public.umkm_vendors (id, rw_id, slug, name, is_active) values
  ('00000000-0000-4000-8000-0000000c1d13', 13, 'uji-kopdes-vendor-13', 'Vendor Kopdes 13', true);
insert into public.products_umkm (id, rw_id, vendor_id, slug, name, category, price, status) values
  ('00000000-0000-4000-8000-0000000c1e13', 13, '00000000-0000-4000-8000-0000000c1d13', 'uji-kopdes-batik',
   'Batik Kopdes', 'souvenir', 50000, 'published');

create function pg_temp.kopdes_product(p_rw_id smallint, p_slug text) returns jsonb
  language sql immutable
as $$
  select jsonb_build_object('rw_id', p_rw_id, 'vendor_id', '00000000-0000-4000-8000-0000000c1d13', 'slug', p_slug,
    'name', 'Tas Perca', 'category', 'recycled_craft', 'description_md', null, 'price', null, 'unit_label', 'pcs',
    'min_order_qty', 1, 'max_order_qty', null, 'lead_time_days', 0, 'is_addon_eligible', false, 'is_available', true,
    'is_featured', false, 'image_paths', '[]'::jsonb, 'status', 'draft', 'sort_order', 0);
$$;
grant execute on function pg_temp.kopdes_product(smallint, text) to authenticated;


-- ===== The claims and the RW it never has =====

select is(internal.staff_token_claims('00000000-0000-4000-8000-00000000f0c0'),
  jsonb_build_object('app_role', 'admin_kopdes', 'app_rw_id', null, 'claims_version', 1),
  'the access-token hook gives the Kopdes admin its role and no RW');
select throws_ok($$insert into public.profiles (id, email, full_name, role, rw_id)
  values ('00000000-0000-4000-8000-00000000f0c0', 'x@example.test', 'X', 'admin_kopdes', 5)$$, '23514', null,
  'a Kopdes admin never has an RW (profiles_role_rw_ok)');
select throws_ok($$insert into public.staff_invites (email, role, rw_id, invite_code_hash, expires_at, created_by)
  values ('kopdes-rw@example.test', 'admin_kopdes', 5, 'hash-kopdes-rw', now() + interval '72 hours',
          '00000000-0000-4000-8000-00000000f001')$$, '23514', null, 'nor is invited for one (staff_invites_role_rw_ok)');

select pg_temp.act_as('superadmin_aal2');
select lives_ok($$insert into public.staff_invites (email, role, rw_id, invite_code_hash, expires_at, created_by)
  values ('kopdes-baru@example.test', 'admin_kopdes', null, 'hash-kopdes-baru', now() + interval '72 hours',
          '00000000-0000-4000-8000-00000000f001')$$, 'the superadmin invites a Kopdes admin');
reset role;
-- none is an officer without a role yet; it needs its own authenticator before set_staff_role gives it one.
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
values ('00000000-0000-4000-8000-0000000c1f00', '00000000-0000-4000-8000-00000000f000', 'HP Kopdes', 'totp', 'verified',
        now(), now());
select pg_temp.act_as('superadmin_aal2');
select throws_ok($$select public.set_staff_role('00000000-0000-4000-8000-00000000f000', 'admin_kopdes', 5::smallint)$$,
  '22023', null, 'set_staff_role gives the Kopdes role without an RW only');
select is(public.set_staff_role('00000000-0000-4000-8000-00000000f000', 'admin_kopdes', null) ->> 'stage', 'applied',
  'and gives it at once: it is no promotion to superadmin');
reset role;
select is(internal.staff_token_claims('00000000-0000-4000-8000-00000000f000') ->> 'app_role', 'admin_kopdes',
  'the next token of that account carries the role');


-- ===== The helpers =====

select pg_temp.act_as('admin_kopdes');
select is(
  array[public.is_admin_kopdes(), public.manages_umkm(), public.is_staff(), public.is_superadmin(),
        public.is_admin_rw(), public.owns_rw(5::smallint), public.owns_any_rw(array[5, 8, 13]::smallint[]),
        public.aal2()],
  array[true, true, false, false, false, false, false, true],
  'the Kopdes admin manages UMKM, is no edu-wisata staff and owns no RW'
);
select is(public.app_rw_id(), null, 'and has no RW of its own');
reset role;
select pg_temp.act_as('superadmin_aal2');
select ok(public.manages_umkm() and not public.is_admin_kopdes(), 'the superadmin manages UMKM too');
reset role;
select pg_temp.act_as('admin_rw_05');
select ok(not public.manages_umkm() and not public.is_admin_kopdes(), 'an RW admin does not');
reset role;


-- ===== Every table and view =====

-- What the Kopdes admin may read at all: the UMKM catalogue, the RWs, its own profile and three settings. Every other
-- relation of public shows it nothing, the ones a migration adds later included.
select pg_temp.act_as('admin_kopdes');
select is(
  array(
    select c.relname::text from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'v', 'm')
      and c.relname not in ('umkm_vendors', 'products_umkm', 'product_variants', 'rw_units', 'profiles', 'site_settings')
      and pg_temp.rows_seen(format('select 1 from public.%I', c.relname)) > 0
    order by 1
  ),
  array[]::text[],
  'no other table or view shows the Kopdes admin a single row'
);
select is((select count(*)::int from public.profiles), 1, 'of the profiles, its own alone');
select is((select count(*)::int from public.site_settings), 3, 'of the settings, the three catalogue keys alone');
reset role;
select pg_temp.act_as('admin_kopdes_aal1');
select is(
  array(
    select c.relname::text from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'v', 'm')
      and pg_temp.rows_seen(format('select 1 from public.%I', c.relname)) > 0
    order by 1
  ),
  array[]::text[],
  'and at AAL1 none at all, not even its own'
);
reset role;


-- ===== The UMKM catalogue through the RPCs =====

select pg_temp.act_as('admin_kopdes');
select lives_ok($$select public.save_product(pg_temp.kopdes_product(13::smallint, 'uji-kopdes-tas'),
  '[{"label": "Biru", "image_path": null, "is_available": true}]')$$,
  'the Kopdes admin saves a new product for RW 13 with its variant');
reset role;
select is(
  (select p.created_by::text || ':' || count(v.id) from public.products_umkm p
   left join public.product_variants v on v.product_id = p.id where p.slug = 'uji-kopdes-tas' group by p.created_by),
  '00000000-0000-4000-8000-00000000f0c0:1', 'signed with its own id, its variant written');
select is(
  (select string_agg(distinct actor_role, ',') from public.audit_logs
   where entity_type = 'products_umkm' and entity_id = (select id::text from public.products_umkm where slug = 'uji-kopdes-tas')),
  'admin_kopdes', 'and audit_logs names the Kopdes admin as its actor, never anon');
select pg_temp.act_as('admin_kopdes');
select lives_ok($$select public.save_product_variants('00000000-0000-4000-8000-0000000c1e13',
  '[{"label": "Sogan", "image_path": null, "is_available": true}]')$$, 'it replaces an existing product''s variants');
select throws_ok($$select public.save_product_variants('00000000-0000-4000-8000-0000000c1e13', null)$$, '22023', null,
  'a null variant list is refused, never read as empty (review of PR #115, L5)');
select throws_ok($$select public.save_product(pg_temp.kopdes_product(13::smallint, 'uji-kopdes-null') - 'rw_id', null,
  '00000000-0000-4000-8000-0000000c1e13')$$, '22023', null, 'and save_product refuses one on an update as well');
select throws_ok($$select public.save_product(pg_temp.kopdes_product(13::smallint, 'uji-kopdes-x') - 'rw_id', '[]',
  '00000000-0000-4000-8000-0000000c1fff')$$, 'P0002', null,
  'a product that does not exist is P0002, which mapError turns into NOT_FOUND');
reset role;
select is((select count(*)::int from public.product_variants where product_id = '00000000-0000-4000-8000-0000000c1e13'), 1,
  'so the refused saves left the variant list as it was');
select throws_ok($$select public.save_product(pg_temp.kopdes_product(13::smallint, 'uji-kopdes-def'))$$, '42883', null,
  'save_product has no default for its variants any more');

select pg_temp.act_as('admin_kopdes_aal1');
select throws_ok($$select public.save_product_variants('00000000-0000-4000-8000-0000000c1e13', '[]')$$, '42501', null,
  'without AAL2 the Kopdes admin saves no variant');
reset role;
select pg_temp.act_as('admin_rw_13');
select throws_ok($$select public.save_product(pg_temp.kopdes_product(13::smallint, 'uji-kopdes-rw'), '[]')$$, '42501',
  null, 'and an RW admin still saves no product, even of their own RW');
reset role;


-- ===== Sellers' bank accounts =====

select pg_temp.act_as('admin_kopdes');
select lives_ok($$select public.set_vendor_bank_account('00000000-0000-4000-8000-0000000c1d13', 'BRI', '1234567890',
  'Bu Sari')$$, 'the Kopdes admin records a seller''s payout account with a fresh code');
select is(
  (select v ->> 'account_number' is null and v ->> 'account_masked' like '%7890' and v ->> 'account_masked' not like '%123456%'
   from public.get_vendor_bank_account('00000000-0000-4000-8000-0000000c1d13') as v),
  true, 'and reads it masked');
select throws_ok($$select public.get_rw_treasury_account(13::smallint, false, null)$$, '42501', null,
  'but no RW treasury account, which stays the superadmin''s');
reset role;
select is((select count(*)::int from public.security_alerts where rule = 'payout_account_changed'
             and details ->> 'vendor_id' = '00000000-0000-4000-8000-0000000c1d13'), 1,
  'the change still raises the superadmin''s payout_account_changed alert');
select pg_temp.act_as('admin_kopdes_aal1');
select throws_ok($$select public.get_vendor_bank_account('00000000-0000-4000-8000-0000000c1d13')$$, '42501', null,
  'without AAL2 it reads no payout account');
reset role;
select pg_temp.act_as('admin_rw_13');
select throws_ok($$select public.get_vendor_bank_account('00000000-0000-4000-8000-0000000c1d13')$$, '42501', null,
  'nor does an RW admin');
reset role;


-- ===== Every staff RPC outside UMKM =====

select pg_temp.act_as('admin_kopdes');
select throws_ok($$select public.visit_stats(public.today_jkt() - 7, public.today_jkt(), null, 'day')$$, '42501', null,
  'no visit figures');
select throws_ok($$select public.revenue_recap(public.today_jkt() - 7, public.today_jkt(), null)$$, '42501', null,
  'no revenue recap');
select throws_ok($$select public.finance_overview(public.today_jkt() - 7, public.today_jkt())$$, '42501', null,
  'no finance overview');
select throws_ok($$select public.payout_preview('rw:13', public.today_jkt() - 7, public.today_jkt() - 1)$$, '42501', null,
  'no payout preview');
select throws_ok($$select public.rpc_create_export('visits', 'csv', '{"from": "2026-10-01", "to": "2026-10-31"}',
  'Rekap kunjungan bulanan')$$, '42501', null, 'no export');
select throws_ok($$select public.rpc_get_participants('00000000-0000-4000-8000-0000000c1fff')$$, '42501', null,
  'no participant list');
select throws_ok($$select public.cancel_booking('00000000-0000-4000-8000-0000000c1fff', 'Kopdes', 0, 0::smallint,
  'guest_request')$$, '42501', null, 'no booking cancellation');
select throws_ok($$select public.find_manual_ticket('GSK-7F3K9Q2M', '1234')$$, '42501', null, 'no ticket lookup');
select throws_ok($$select public.issue_certificates('00000000-0000-4000-8000-0000000c1fff', null)$$, '42501', null,
  'no certificates');
select throws_ok($$select public.generate_visit_sessions(13::smallint, public.today_jkt(), public.today_jkt() + 7)$$,
  '42501', null, 'no sessions');
select throws_ok($$select public.set_rw_unit_status(13::smallint, false)$$, '42501', null, 'no RW taken offline');
select throws_ok($$select public.set_staff_role('00000000-0000-4000-8000-00000000f005', 'none', null)$$, '42501', null,
  'no role changed');
select throws_ok($$select public.set_staff_status('00000000-0000-4000-8000-00000000f005', false, 'Kopdes')$$, '42501',
  null, 'no account deactivated');
select throws_ok($$select public.reset_staff_mfa('00000000-0000-4000-8000-00000000f005')$$, '42501', null,
  'no authenticator reset');
select throws_ok($$select public.invite_superadmin('kopdes-super@example.test', 'hash-kopdes-super')$$, '42501', null,
  'and no superadmin invited');
reset role;


-- ===== Catalogue settings =====

select pg_temp.act_as('admin_kopdes');
select is(pg_temp.row_count($$update public.site_settings set value = '"Jl. Koperasi 1, Gisikdrono"',
  updated_by = '00000000-0000-4000-8000-00000000f0c0' where key = 'contact.kopdes_address'$$), 1,
  'the Kopdes admin changes the pickup address');
select throws_ok($$update public.site_settings set value = '"081234"',
  updated_by = '00000000-0000-4000-8000-00000000f0c0' where key = 'contact.kopdes_whatsapp_number'$$, '23514', null,
  'whose number still has to be a +62 number (site_settings_kopdes_values)');
select throws_ok($$update public.site_settings set description = 'Diubah',
  updated_by = '00000000-0000-4000-8000-00000000f0c0' where key = 'catalogue.show_product_prices'$$, '42501', null,
  'and changes no description (site_settings_kopdes_guard)');
reset role;
select is((select actor_role from public.audit_logs where entity_type = 'site_settings'
             and entity_id = 'contact.kopdes_address' order by occurred_at desc limit 1),
  'admin_kopdes', 'the settings change is audited under its own role');


-- ===== The price switch takes its turn (review of PR #115, L4) =====

update public.site_settings set value = '"Edu Wisata"' where key = 'seo.default_description';
select ok(
  not exists (select 1 from pg_locks l
              where l.pid = pg_backend_pid() and l.relation = 'public.products_umkm'::regclass
                and l.mode = 'ShareRowExclusiveLock'),
  'a change of any other key locks no product'
);
update public.site_settings set value = 'false' where key = 'catalogue.show_product_prices';
select ok(
  exists (select 1 from pg_locks l
          where l.pid = pg_backend_pid() and l.relation = 'public.products_umkm'::regclass
            and l.mode = 'ShareRowExclusiveLock' and l.granted),
  'flipping catalogue.show_product_prices locks products_umkm against concurrent writes until it commits'
);
select is((select public_price from public.products_umkm where id = '00000000-0000-4000-8000-0000000c1e13'), null,
  'and every price is hidden again');

select * from finish();
rollback;
