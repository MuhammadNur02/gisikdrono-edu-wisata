-- RWs as data (decision of 2026-10-21, Tasks P2.10.01 and P2.10.02, 20261021120000_rw_units_data_driven.sql and
-- 20261021130000_rw_units_products_heading.sql): an RW's row carries its look (palette key, icon, programme name,
-- schedule, product heading), keeps its number, code, slug and name in step, starts offline, and goes online through
-- set_rw_unit_status once its default revenue-share rules exist.
begin;
select plan(45);
\ir helpers/rls_personas.psql

-- ===== Columns =====

select col_type_is('public', 'rw_units', 'accent_key', 'rw_accent', 'the accent is a palette key, never a colour');
select col_type_is('public', 'rw_units', 'icon_key', 'rw_icon', 'the placeholder icon is a key from a fixed list');
select col_not_null('public', 'rw_units', 'short_name', 'every RW names its programme');
select col_not_null('public', 'rw_units', 'accent_key', 'every RW has an accent');
select col_not_null('public', 'rw_units', 'icon_key', 'every RW has a placeholder icon');
select col_default_is('public', 'rw_units', 'schedule_enabled', 'false', 'no RW has a schedule unless given one');
select col_default_is('public', 'rw_units', 'is_active', 'false', 'a new RW starts offline');
select is(
  (select string_agg(id || ':' || short_name || ':' || accent_key || ':' || icon_key || ':' || schedule_enabled, ', '
                     order by id)
   from public.rw_units where id in (5, 8)),
  '5:Ecowastreme:leaf:recycle:false, 8:Kampung Seni Budaya:terracotta:drama:true',
  'RW 05 and RW 08 keep the look src/config/rw.ts gave them'
);
select is(
  (select string_agg(id || ':' || coalesce(products_heading, '-'), ', ' order by id) from public.rw_units where id in (5, 8)),
  '5:-, 8:Suvenir dan produk UMKM',
  'the arts programme names its souvenirs, every other RW keeps the default heading'
);

select ok(
  'products_heading' = any (internal.audit_columns('rw_units')),
  'the audit log keeps the values of the product heading, as of the other look columns'
);

-- ===== Number, code, slug and name stay in step =====

create function pg_temp.insert_rw(p_id smallint, p_code text, p_slug text, p_name text, p_short_name text)
  returns void
  language sql
as $$
  insert into public.rw_units (id, code, slug, name, short_name, theme_label, accent_key, icon_key)
  values (p_id, p_code, p_slug, p_name, p_short_name, 'Uji', 'teal', 'users');
$$;

select throws_ok($$select pg_temp.insert_rw(0::smallint, 'RW00', 'rw-00-uji', 'RW 00 Uji', 'Uji')$$, '23514', null,
  'an RW number is at least 1');
select throws_ok($$select pg_temp.insert_rw(100::smallint, 'RW100', 'rw-100-uji', 'RW 100 Uji', 'Uji')$$, '23514',
  null, 'and has two digits at most, as the ticket code and the media folder need');
select throws_ok($$select pg_temp.insert_rw(96::smallint, 'RW69', 'rw-96-uji', 'RW 96 Uji', 'Uji')$$, '23514', null,
  'the code is the RW''s own number');
select throws_ok($$select pg_temp.insert_rw(96::smallint, 'RW96', 'produk', 'RW 96 Uji', 'Uji')$$, '23514', null,
  'a slug never takes another page''s address');
select throws_ok($$select pg_temp.insert_rw(96::smallint, 'RW96', 'rw-08-uji', 'RW 96 Uji', 'Uji')$$, '23514', null,
  'nor another RW''s number');
select throws_ok($$select pg_temp.insert_rw(96::smallint, 'RW96', 'rw-96', 'RW 96 Uji', 'Uji')$$, '23514', null,
  'and names the programme after the number');
select throws_ok($$select pg_temp.insert_rw(96::smallint, 'RW96', 'rw-96-uji', 'RW 96 Lain', 'Uji')$$, '23514', null,
  'the name is the number followed by the programme name');
select throws_ok($$select pg_temp.insert_rw(96::smallint, 'RW96', 'rw-96-uji', 'RW 96  Uji', ' Uji')$$, '23514',
  null, 'a programme name has no space at either end');
select throws_ok($$insert into public.rw_units (id, code, slug, name, short_name, theme_label, icon_key)
  values (96, 'RW96', 'rw-96-uji', 'RW 96 Uji', 'Uji', 'Uji', 'users')$$, '23502', null,
  'an RW without an accent is refused');
select throws_ok($$insert into public.rw_units (id, code, slug, name, short_name, theme_label, accent_key, icon_key,
  products_heading) values (96, 'RW96', 'rw-96-uji', 'RW 96 Uji', 'Uji', 'Uji', 'teal', 'users', ' Suvenir')$$, '23514', null,
  'a product heading has no space at either end');
select lives_ok($$select pg_temp.insert_rw(96::smallint, 'RW96', 'rw-96-uji', 'RW 96 Uji', 'Uji')$$,
  'a consistent RW is accepted');
select is((select is_active from public.rw_units where id = 96), false, 'and is offline');

-- ===== The RW's admin edits the programme name, never the look =====

reset role;
select pg_temp.act_as('admin_rw_05');
select is(pg_temp.row_count($$update public.rw_units set name = 'RW 05 Ecowastreme Baru',
  short_name = 'Ecowastreme Baru' where id = 5$$), 1, 'an RW admin renames their programme with the name');
select throws_ok($$update public.rw_units set name = 'RW 05 Lain' where id = 5$$, '23514', null,
  'but never one without the other');
select throws_ok($$update public.rw_units set accent_key = 'violet' where id = 5$$, '42501', null,
  'and changes no accent');
select throws_ok($$update public.rw_units set schedule_enabled = true where id = 5$$, '42501', null,
  'nor gives their RW the schedule');
select throws_ok($$update public.rw_units set products_heading = 'Suvenir' where id = 5$$, '42501', null,
  'nor renames its product section before the page form has the field');

-- ===== set_rw_unit_status =====

reset role;
select pg_temp.act_as('anon');
select lives_ok(
  $$select short_name, accent_key, icon_key, schedule_enabled, products_heading from public.rw_units$$,
  'a visitor reads every column the public pages and the layout need'
);
select throws_ok($$select public.set_rw_unit_status(96::smallint, true)$$, '42501', null,
  'a visitor cannot call it');
reset role;
select pg_temp.act_as('admin_rw_05');
select throws_ok($$select public.set_rw_unit_status(5::smallint, false)$$, '42501',
  'only the superadmin takes an RW online or offline', 'nor can an RW admin, not even for their own RW');
reset role;
select pg_temp.act_as('superadmin_aal1');
select throws_ok($$select public.set_rw_unit_status(96::smallint, true)$$, '42501',
  'confirm with a fresh authenticator code first', 'a superadmin without AAL2 is refused');
reset role;
select pg_temp.act_as('superadmin_stale_totp');
select throws_ok($$select public.set_rw_unit_status(96::smallint, true)$$, '42501',
  'confirm with a fresh authenticator code first', 'and so is one whose code is two hours old');

reset role;
select pg_temp.act_as('superadmin_aal2');
select throws_ok($$select public.set_rw_unit_status(95::smallint, true)$$, 'P0002', 'no RW 95',
  'an RW that does not exist is reported');
select throws_ok($$select public.set_rw_unit_status(96::smallint, null)$$, '22023', null,
  'the call says which way');
select throws_ok($$select public.set_rw_unit_status(96::smallint, true)$$, 'P0001',
  'RW 96 needs its default revenue-share rules for packages and add-ons first',
  'an RW without default revenue-share rules stays offline');

reset role;
insert into public.revenue_share_rules (scope, rw_id, name) values ('package_default', 96, 'Bawaan paket RW 96');
insert into public.revenue_share_rules (scope, rw_id, name, effective_from, effective_to)
values ('addon_default', 96, 'Bawaan produk tambahan RW 96 lama', '2020-01-01', '2020-12-31');
select pg_temp.act_as('superadmin_aal2');
select throws_ok($$select public.set_rw_unit_status(96::smallint, true)$$, 'P0001', null,
  'a package rule alone is not enough, nor an add-on rule that has ended');

reset role;
insert into public.revenue_share_rules (scope, rw_id, name, is_active)
values ('addon_default', 96, 'Bawaan produk tambahan RW 96 nonaktif', false);
select pg_temp.act_as('superadmin_aal2');
select throws_ok($$select public.set_rw_unit_status(96::smallint, true)$$, 'P0001', null,
  'nor a switched-off one');

reset role;
insert into public.revenue_share_rules (scope, rw_id, name) values ('addon_default', 96, 'Bawaan produk tambahan RW 96');
select pg_temp.act_as('superadmin_aal2');
select lives_ok($$select public.set_rw_unit_status(96::smallint, true)$$, 'with both rules the RW goes online');
select is((select is_active from public.rw_units where id = 96), true, 'and is active');
reset role;
select is(
  (select actor_id::text from public.audit_logs where action = 'rw_unit.activated' and entity_id = '96'),
  '00000000-0000-4000-8000-00000000f001',
  'the audit log names the superadmin who did it'
);
select pg_temp.act_as('anon');
select is((select count(*)::int from public.rw_units where id = 96), 1, 'visitors now see the RW');

reset role;
select pg_temp.act_as('superadmin_aal2');
select lives_ok($$select public.set_rw_unit_status(96::smallint, false)$$, 'the superadmin takes it offline again');
reset role;
select is((select is_active from public.rw_units where id = 96), false, 'it is inactive');
select is(
  (select count(*)::int from public.audit_logs where action = 'rw_unit.deactivated' and entity_id = '96'),
  1,
  'and the audit log says so'
);
select pg_temp.act_as('anon');
select is((select count(*)::int from public.rw_units where id = 96), 0, 'visitors no longer see it');

select * from finish();
rollback;
