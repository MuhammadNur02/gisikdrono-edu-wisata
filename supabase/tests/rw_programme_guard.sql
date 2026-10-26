-- The guard that stops an RW from taking on another programme while it still holds rows of the one it runs
-- (20261022080000, independent review of PR #23, 1), and the check of its default revenue-share rules. Each case gets
-- an RW of its own, so one case's rows never answer for another; everything is rolled back at the end.
begin;
select plan(31);

create function pg_temp.new_rw(p_id smallint) returns void
  language sql
as $$
  insert into public.rw_units (id, code, slug, name, short_name, theme_label, accent_key, icon_key)
  values (p_id, 'RW' || p_id, 'rw-' || p_id || '-uji', 'RW ' || p_id || ' Uji', 'Uji', 'Uji', 'teal', 'users');
$$;
create function pg_temp.blocking_ties(p_id smallint) returns text
  language sql
as $$
  select coalesce(string_agg(kind, ', ' order by kind), '') from internal.rw_programme_ties(p_id) where is_blocking;
$$;
create function pg_temp.reporting_ties(p_id smallint) returns text
  language sql
as $$
  select coalesce(string_agg(kind, ', ' order by kind), '') from internal.rw_programme_ties(p_id) where not is_blocking;
$$;

select pg_temp.new_rw(id::smallint) from generate_series(86, 99) as id;
insert into public.site_settings (key, value) values ('pricing.min_price_per_pax', '5000') on conflict (key) do nothing;
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000c0001', 'guard-super@example.test'),
  ('00000000-0000-4000-8000-0000000c0099', 'guard-admin99@example.test');
insert into public.profiles (id, email, full_name, role, rw_id, is_active) values
  ('00000000-0000-4000-8000-0000000c0001', 'guard-super@example.test', 'Super Uji', 'superadmin', null, true),
  ('00000000-0000-4000-8000-0000000c0099', 'guard-admin99@example.test', 'Admin RW 99 Uji', 'admin_rw', 99, true);

-- ===== An RW with nothing of its programme left =====
select is_empty($$select * from internal.rw_programme_ties(90::smallint)$$, 'a bare RW has no ties');
select lives_ok($$select internal.require_rw_programme_change(90::smallint)$$, 'so the guard lets it change');

-- ===== What stops it =====
insert into public.tour_packages (id, rw_id, category, slug, name, price_per_pax, status) values
  ('00000000-0000-4000-8000-0000000c9100', 91, 'regular', 'jaga-91', 'Draf RW 91', 25000, 'draft');
insert into public.bookings (id, booking_code, status, package_id, package_snapshot, rw_ids, booker_type, pic_name,
  pic_phone, pic_email, pax_count, visit_date, visit_date_end, subtotal_package, total_amount, consent_version,
  consented_at)
values ('00000000-0000-4000-8000-0000000c9101', 'GSK-JAGA0091', 'quoted', '00000000-0000-4000-8000-0000000c9100', '{}',
  '{91}', 'school', 'Budi Santoso', '+6281200009101', 'jaga91@example.test', 4, public.today_jkt(),
  public.today_jkt(), 100000, 100000, 'v1', now());
select is(pg_temp.blocking_ties(91::smallint), 'bookings', 'a booking of the RW is a tie');
select throws_ok($$select internal.require_rw_programme_change(91::smallint)$$, 'P0001',
  'RW 91 still has rows of the programme it runs: bookings (1)', 'and stops the change, naming it');

insert into public.tour_packages (rw_id, category, slug, name, price_per_pax, status)
values (92, 'regular', 'jaga-92', 'Paket RW 92', 25000, 'published');
select is(pg_temp.blocking_ties(92::smallint), 'published packages', 'a published package of the RW');
select throws_ok($$select internal.require_rw_programme_change(92::smallint)$$, 'P0001', null, 'stops the change');

insert into public.tour_packages (id, category, slug, name, pricing_basis, flat_price, status)
values ('00000000-0000-4000-8000-0000000c9300', 'combo', 'jaga-93', 'Kombinasi RW 93', 'flat_group', 1500000, 'draft');
insert into public.tour_package_legs (package_id, rw_id, leg_order) values
  ('00000000-0000-4000-8000-0000000c9300', 5, 1), ('00000000-0000-4000-8000-0000000c9300', 93, 2);
update public.tour_packages set status = 'published' where id = '00000000-0000-4000-8000-0000000c9300';
select is(pg_temp.blocking_ties(93::smallint), 'legs of published combos', 'the RW''s leg of a published combo');
select throws_ok($$select internal.require_rw_programme_change(93::smallint)$$, 'P0001', null, 'stops the change');

insert into public.session_templates (rw_id, weekday, label, start_time, end_time, capacity)
values (94, 2, 'Sesi Pagi', '08:30', '10:30', 40);
select is(pg_temp.blocking_ties(94::smallint), 'active session templates', 'an active session template');
select throws_ok($$select internal.require_rw_programme_change(94::smallint)$$, 'P0001', null, 'stops the change');

insert into public.visit_sessions (rw_id, session_date, start_time, end_time, label, capacity)
values (95, public.today_jkt(), '08:30', '10:30', 'Sesi Pagi', 40);
select is(pg_temp.blocking_ties(95::smallint), 'sessions from today', 'a session from today on');
select throws_ok($$select internal.require_rw_programme_change(95::smallint)$$, 'P0001', null, 'stops the change');

insert into public.umkm_vendors (id, rw_id, slug, name, is_active) values
  ('00000000-0000-4000-8000-0000000c9600', 96, 'jaga-vendor-96', 'Vendor RW 96', true),
  ('00000000-0000-4000-8000-0000000c9700', 97, 'jaga-vendor-97', 'Vendor RW 97', false);
insert into public.products_umkm (rw_id, vendor_id, slug, name, category, price, status)
values (96, '00000000-0000-4000-8000-0000000c9600', 'jaga-produk-96', 'Produk RW 96', 'souvenir', 20000, 'draft');
select is(pg_temp.blocking_ties(96::smallint), 'products, vendors', 'a product, even a draft, and its vendor');
select throws_ok($$select internal.require_rw_programme_change(96::smallint)$$, 'P0001', null, 'stop the change');
select is(pg_temp.blocking_ties(97::smallint), 'vendors', 'a vendor alone, even an inactive one');
select throws_ok($$select internal.require_rw_programme_change(97::smallint)$$, 'P0001', null, 'stops the change');

insert into public.performance_schedules (rw_id, title, schedule_type, starts_at, ends_at, status)
values (98, 'Pentas RW 98', 'dance_performance', now() + interval '3 days', now() + interval '3 days 2 hours', 'draft');
select is(pg_temp.blocking_ties(98::smallint), 'performance schedules', 'a performance schedule');
select throws_ok($$select internal.require_rw_programme_change(98::smallint)$$, 'P0001', null, 'stops the change');

select is(pg_temp.blocking_ties(99::smallint), 'RW admins', 'an admin of the RW keeps rights over it');
select throws_ok($$select internal.require_rw_programme_change(99::smallint)$$, 'P0001', null, 'so it stops the change');

insert into public.staff_invites (email, role, rw_id, invite_code_hash, expires_at, created_by) values
  ('jaga-89@example.test', 'admin_rw', 89, 'jaga-89-hash', now() + interval '1 day',
   '00000000-0000-4000-8000-0000000c0001'),
  ('jaga-89-lama@example.test', 'admin_rw', 88, 'jaga-88-hash', now() - interval '1 day',
   '00000000-0000-4000-8000-0000000c0001');
select is(pg_temp.blocking_ties(89::smallint), 'open admin invitations', 'an open invitation to admin the RW');
select throws_ok($$select internal.require_rw_programme_change(89::smallint)$$, 'P0001', null, 'stops the change');
select is(pg_temp.blocking_ties(88::smallint), '', 'an expired invitation does not');

insert into public.payout_batches (beneficiary_key, period_from, period_to, total_amount, created_by)
values ('rw:87', public.today_jkt() - 30, public.today_jkt(), 0, '00000000-0000-4000-8000-0000000c0001');
select is(pg_temp.blocking_ties(87::smallint), 'payout batches', 'a payout to the RW''s treasury');
select throws_ok($$select internal.require_rw_programme_change(87::smallint)$$, 'P0001', null, 'stops the change');

-- ===== What it only reports =====
insert into public.galleries (rw_id, category, storage_path, alt_text, status)
values (86, 'activity', 'rw-86/gallery/jaga.webp', 'Kegiatan', 'draft');
insert into public.articles (rw_id, slug, title, status) values (86, 'jaga-artikel-86', 'Artikel RW 86', 'draft');
insert into public.activity_points (rw_id, slug, name, point_type, status)
values (86, 'jaga-titik-86', 'Sanggar', 'sanggar', 'draft');
update public.rw_units set description_md = 'Profil lama.' where id = 86;
select is(pg_temp.reporting_ties(86::smallint), 'activity points, articles, gallery items, profile text or photo',
  'photos, articles, points and the profile text are reported');
select is(pg_temp.blocking_ties(86::smallint), '', 'but do not stop the change');
select lives_ok($$select internal.require_rw_programme_change(86::smallint)$$,
  'so the change goes on, with a notice for each');

-- ===== The default revenue-share rules an RW needs to go online =====
select ok(internal.has_current_default_rules(13::smallint), 'RW 13 has its current package and add-on rules');
select ok(not internal.has_current_default_rules(90::smallint), 'a bare RW has none');
insert into public.revenue_share_rules (id, scope, rw_id, name) values
  ('00000000-0000-4000-8000-0000000c9001', 'package_default', 90, 'Bawaan paket RW 90');
insert into public.revenue_share_rule_lines (rule_id, beneficiary, rw_id, pct) values
  ('00000000-0000-4000-8000-0000000c9001', 'kelurahan', null, 20.00),
  ('00000000-0000-4000-8000-0000000c9001', 'rw_treasury', 90, 80.00);
select ok(not internal.has_current_default_rules(90::smallint), 'nor does one with a package rule alone');

select * from finish();
rollback;
