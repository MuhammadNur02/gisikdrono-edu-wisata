-- Three RWs, three admins (decision of 2026-10-21, Task P2.10.03): the admins of RW 05, RW 08 and RW 13 each see and
-- change their own RW's rows and none of the other two RWs'. The fixtures are drafts, inactive vendors and quoted
-- bookings, which no public policy shows, so every row an admin sees came through the staff policies; RW 13's
-- uploads live under rw-13/ like every RW's.
begin;
select plan(32);
\ir helpers/rls_personas.psql

-- One row of each kind per RW, every key ending in the RW's number so a list of them reads as the RWs it holds.
create function pg_temp.fixture_id(p_kind text, p_rw smallint) returns uuid
  language sql immutable
as $$
  select ('00000000-0000-4000-8000-' || p_kind || lpad(p_rw::text, 4, '0'))::uuid;
$$;
grant execute on function pg_temp.fixture_id(text, smallint) to authenticated;
insert into public.tour_packages (id, rw_id, category, slug, name, price_per_pax, status)
select pg_temp.fixture_id('000003c1', rw), rw, 'regular', 'tiga-paket-' || rw, 'Draf RW ' || rw, 25000, 'draft'
from unnest(array[5, 8, 13]::smallint[]) as rw;
insert into public.umkm_vendors (id, rw_id, slug, name, bank_name, is_active)
select pg_temp.fixture_id('000003c2', rw), rw, 'tiga-vendor-' || rw, 'Vendor RW ' || rw, 'BRI', false
from unnest(array[5, 8, 13]::smallint[]) as rw;
insert into public.products_umkm (rw_id, vendor_id, slug, name, category, price, status)
select rw, pg_temp.fixture_id('000003c2', rw), 'tiga-produk-' || rw, 'Produk RW ' || rw, 'souvenir', 20000, 'draft'
from unnest(array[5, 8, 13]::smallint[]) as rw;
insert into public.articles (rw_id, slug, title, status)
select rw, 'tiga-artikel-' || rw, 'Draf RW ' || rw, 'draft' from unnest(array[5, 8, 13]::smallint[]) as rw;
-- RW 08's two new point types, and an arts point for RW 13 and a waste point for RW 05.
insert into public.activity_points (rw_id, slug, name, point_type, status) values
  (5, 'tiga-titik-5', 'Komposter', 'composter', 'draft'),
  (8, 'tiga-titik-8', 'Rumah Pemberdayaan', 'inclusion_center', 'draft'),
  (8, 'tiga-titik-8b', 'Balai Ramah Anak', 'child_friendly_space', 'draft'),
  (13, 'tiga-titik-13', 'Sanggar', 'sanggar', 'draft');
insert into public.galleries (rw_id, category, storage_path, alt_text, caption, status)
select rw, 'activity', 'rw-' || lpad(rw::text, 2, '0') || '/gallery/tiga.webp', 'Kegiatan', 'tiga-galeri-' || rw, 'draft'
from unnest(array[5, 8, 13]::smallint[]) as rw;
insert into public.performance_schedules (rw_id, title, schedule_type, starts_at, ends_at, status)
select rw, 'tiga-jadwal-' || rw, 'workshop', now() + interval '3 days', now() + interval '3 days 2 hours', 'draft'
from unnest(array[5, 8, 13]::smallint[]) as rw;
insert into public.bookings (id, booking_code, status, package_id, package_snapshot, rw_ids, booker_type, pic_name,
  pic_phone, pic_email, pax_count, visit_date, visit_date_end, subtotal_package, total_amount, consent_version,
  consented_at)
select pg_temp.fixture_id('000003c3', rw), 'GSK-T3RW' || lpad(rw::text, 4, '0'), 'quoted',
  pg_temp.fixture_id('000003c1', rw), '{}', array[rw], 'school', 'Budi Santoso', '+62812000013' || lpad(rw::text, 2, '0'),
  'tiga-' || rw || '@example.test', 4, public.today_jkt(), public.today_jkt(), 100000, 100000, 'v1', now()
from unnest(array[5, 8, 13]::smallint[]) as rw;

-- anon reads no vendor at all since 20261105160300 and has its own check below, so for anon the vendor part is
-- left out; plpgsql plans the query only when it runs, so anon never touches the table here.
create function pg_temp.visible_vendor_rws() returns text
  language plpgsql
as $$
begin
  if not has_any_column_privilege('public.umkm_vendors', 'select') then
    return null;
  end if;
  return 'vendor ' || (select string_agg(rw_id::text, ',' order by rw_id) from public.umkm_vendors
                       where slug like 'tiga-vendor-%');
end;
$$;
grant execute on function pg_temp.visible_vendor_rws() to anon, authenticated;

-- The RWs whose fixture rows the current role sees, table by table; anon may not read bookings at all.
create function pg_temp.visible_content_rws() returns text
  language sql
as $$
  select concat_ws(' | ',
    'paket ' || (select string_agg(rw_id::text, ',' order by rw_id) from public.tour_packages where slug like 'tiga-paket-%'),
    pg_temp.visible_vendor_rws(),
    'produk ' || (select string_agg(rw_id::text, ',' order by rw_id) from public.products_umkm where slug like 'tiga-produk-%'),
    'artikel ' || (select string_agg(rw_id::text, ',' order by rw_id) from public.articles where slug like 'tiga-artikel-%'),
    'titik ' || (select string_agg(rw_id::text, ',' order by rw_id, slug) from public.activity_points where slug like 'tiga-titik-%'),
    'galeri ' || (select string_agg(rw_id::text, ',' order by rw_id) from public.galleries where caption like 'tiga-galeri-%'),
    'jadwal ' || (select string_agg(rw_id::text, ',' order by rw_id) from public.performance_schedules where title like 'tiga-jadwal-%'));
$$;
grant execute on function pg_temp.visible_content_rws() to anon, authenticated;
create function pg_temp.visible_rws() returns text
  language sql
as $$
  select concat_ws(' | ', pg_temp.visible_content_rws(),
    'pemesanan ' || (select string_agg(ltrim(right(booking_code, 4), '0'), ',' order by booking_code)
                     from public.bookings where booking_code like 'GSK-T3RW%'));
$$;
grant execute on function pg_temp.visible_rws() to authenticated;

-- A package for another RW, signed with the caller's own id so a refusal is about the RW alone.
create function pg_temp.insert_package_for(p_rw smallint) returns void
  language sql
as $$
  insert into public.tour_packages (rw_id, category, slug, name, price_per_pax, created_by, updated_by)
  values (p_rw, 'regular', 'tiga-curang-' || p_rw, 'Paket Curang', 25000, auth.uid(), auth.uid());
$$;
grant execute on function pg_temp.insert_package_for(smallint) to authenticated;

-- One new row of each content and catalogue kind for an RW, signed with the caller's own id as each insert policy
-- requires, so a refusal is about the RW alone (independent review of PR #23, 4).
create function pg_temp.insert_for(p_kind text, p_rw smallint) returns void
  language plpgsql
as $$
declare
  marker text := 'tiga-baru-' || p_kind || '-' || p_rw || '-' || auth.uid();
begin
  case p_kind
    when 'vendor' then
      insert into public.umkm_vendors (rw_id, slug, name, created_by) values (p_rw, marker, 'Vendor Baru', auth.uid());
    when 'produk' then
      insert into public.products_umkm (rw_id, vendor_id, slug, name, category, price, created_by)
      values (p_rw, pg_temp.fixture_id('000003c2', p_rw), marker, 'Produk Baru', 'souvenir', 20000, auth.uid());
    when 'artikel' then
      insert into public.articles (rw_id, slug, title, author_id) values (p_rw, marker, 'Artikel Baru', auth.uid());
    when 'titik' then
      insert into public.activity_points (rw_id, slug, name, point_type) values (p_rw, marker, 'Titik Baru', 'other');
    when 'galeri' then
      insert into public.galleries (rw_id, category, storage_path, alt_text, uploaded_by)
      values (p_rw, 'activity', 'rw-' || lpad(p_rw::text, 2, '0') || '/gallery/' || marker || '.webp', 'Kegiatan',
              auth.uid());
    when 'jadwal' then
      insert into public.performance_schedules (rw_id, title, schedule_type, starts_at, ends_at, created_by)
      values (p_rw, marker, 'workshop', now() + interval '4 days', now() + interval '4 days 1 hour', auth.uid());
  end case;
end;
$$;
grant execute on function pg_temp.insert_for(text, smallint) to authenticated;

-- Vendors and products are the superadmin's to add since 20261028080100, so an RW admin adds the other kinds.
create function pg_temp.insert_every_kind_for(p_rw smallint) returns void
  language plpgsql
as $$
declare
  kind text;
begin
  foreach kind in array array['artikel', 'titik', 'galeri', 'jadwal'] loop
    perform pg_temp.insert_for(kind, p_rw);
  end loop;
end;
$$;
grant execute on function pg_temp.insert_every_kind_for(smallint) to authenticated;

-- The kinds the caller may not add for an RW: refused by the row-level policy (42501). Any other error stops the
-- suite, so a refusal is never mistaken for a broken fixture.
create function pg_temp.refused_kinds(p_rw smallint) returns text
  language plpgsql
as $$
declare
  kind text;
  refused text[] := '{}';
begin
  foreach kind in array array['vendor', 'produk', 'artikel', 'titik', 'galeri', 'jadwal'] loop
    begin
      perform pg_temp.insert_for(kind, p_rw);
    exception when insufficient_privilege then
      refused := refused || kind;
    end;
  end loop;
  return array_to_string(refused, ',');
end;
$$;
grant execute on function pg_temp.refused_kinds(smallint) to authenticated;

-- Renames every fixture row of every RW; the row-level policies let each admin's statement reach their own RW only.
create function pg_temp.rename_every_fixture(p_name text) returns void
  language sql
as $$
  update public.umkm_vendors set name = p_name where slug like 'tiga-vendor-%';
  update public.products_umkm set name = p_name where slug like 'tiga-produk-%';
  update public.articles set title = p_name where slug like 'tiga-artikel-%';
  update public.activity_points set name = p_name where slug like 'tiga-titik-%';
  update public.galleries set alt_text = p_name where caption like 'tiga-galeri-%';
  update public.performance_schedules set description_md = p_name where title like 'tiga-jadwal-%';
$$;
grant execute on function pg_temp.rename_every_fixture(text) to authenticated;

-- ===== anon and the superadmin =====
select pg_temp.act_as('anon');
select is(pg_temp.visible_content_rws(), '', 'anon sees no draft content of any RW');
select throws_ok($$select rw_id from public.umkm_vendors$$, '42501', null, 'and no vendor of any RW at all');
reset role;
select pg_temp.act_as('superadmin_aal2');
select is(pg_temp.visible_rws(),
  'paket 5,8,13 | vendor 5,8,13 | produk 5,8,13 | artikel 5,8,13 | titik 5,8,8,13 | galeri 5,8,13 | jadwal 5,8,13 | '
  || 'pemesanan 5,8,13',
  'the superadmin sees all three RWs');

-- ===== each RW admin: their own RW, never the other two =====
reset role;
select pg_temp.act_as('admin_rw_05');
select is(pg_temp.visible_rws(),
  'paket 5 | vendor 5 | produk 5 | artikel 5 | titik 5 | galeri 5 | jadwal 5 | pemesanan 5',
  'admin RW 05 sees RW 05 only');
select throws_ok($$select pg_temp.insert_package_for(8::smallint)$$, '42501', null, 'and adds nothing for RW 08');
select throws_ok($$select pg_temp.insert_package_for(13::smallint)$$, '42501', null, 'or for RW 13');
update public.tour_packages set name = 'Diubah RW 05', updated_by = auth.uid() where slug like 'tiga-paket-%';
select lives_ok($$select pg_temp.insert_every_kind_for(5::smallint)$$,
  'RW 05''s admin adds an article, point, photo and schedule for RW 05');
select is(pg_temp.refused_kinds(8::smallint), 'vendor,produk,artikel,titik,galeri,jadwal', 'but none of them for RW 08');
select is(pg_temp.refused_kinds(13::smallint), 'vendor,produk,artikel,titik,galeri,jadwal', 'nor for RW 13');
select lives_ok($$select pg_temp.rename_every_fixture('Diubah RW 05')$$, 'and renames what the policies let it reach');

reset role;
select pg_temp.act_as('admin_rw_08');
select is(pg_temp.visible_rws(),
  'paket 8 | vendor 8 | produk 8 | artikel 8 | titik 8,8 | galeri 8 | jadwal 8 | pemesanan 8',
  'admin RW 08 sees RW 08 only, its two new kinds of point included');
select throws_ok($$select pg_temp.insert_package_for(5::smallint)$$, '42501', null, 'and adds nothing for RW 05');
select throws_ok($$select pg_temp.insert_package_for(13::smallint)$$, '42501', null, 'or for RW 13');
update public.tour_packages set name = 'Diubah RW 08', updated_by = auth.uid() where slug like 'tiga-paket-%';
select lives_ok($$select pg_temp.insert_every_kind_for(8::smallint)$$,
  'RW 08''s admin adds an article, point, photo and schedule for RW 08');
select is(pg_temp.refused_kinds(5::smallint), 'vendor,produk,artikel,titik,galeri,jadwal', 'but none of them for RW 05');
select is(pg_temp.refused_kinds(13::smallint), 'vendor,produk,artikel,titik,galeri,jadwal', 'nor for RW 13');
select lives_ok($$select pg_temp.rename_every_fixture('Diubah RW 08')$$, 'and renames what the policies let it reach');

reset role;
select pg_temp.act_as('admin_rw_13');
select is(pg_temp.visible_rws(),
  'paket 13 | vendor 13 | produk 13 | artikel 13 | titik 13 | galeri 13 | jadwal 13 | pemesanan 13',
  'admin RW 13 sees RW 13 only');
select throws_ok($$select pg_temp.insert_package_for(5::smallint)$$, '42501', null, 'and adds nothing for RW 05');
select throws_ok($$select pg_temp.insert_package_for(8::smallint)$$, '42501', null, 'or for RW 08');
update public.tour_packages set name = 'Diubah RW 13', updated_by = auth.uid() where slug like 'tiga-paket-%';
select lives_ok($$select pg_temp.insert_every_kind_for(13::smallint)$$,
  'RW 13''s admin adds an article, point, photo and schedule for RW 13');
select is(pg_temp.refused_kinds(5::smallint), 'vendor,produk,artikel,titik,galeri,jadwal', 'but none of them for RW 05');
select is(pg_temp.refused_kinds(8::smallint), 'vendor,produk,artikel,titik,galeri,jadwal', 'nor for RW 08');
select lives_ok($$select pg_temp.rename_every_fixture('Diubah RW 13')$$, 'and renames what the policies let it reach');
select lives_ok($$select pg_temp.insert_package_for(13::smallint)$$, 'but adds a package for RW 13 itself');

reset role;
select is(
  (select string_agg(rw_id || '=' || name, ', ' order by rw_id) from public.tour_packages where slug like 'tiga-paket-%'),
  '5=Diubah RW 05, 8=Diubah RW 08, 13=Diubah RW 13',
  'each admin''s update over all three drafts changed their own RW''s draft and nothing else'
);
select is(
  (select count(*)::int from public.umkm_vendors where slug like 'tiga-%' and name like 'Diubah%')
  + (select count(*)::int from public.products_umkm where slug like 'tiga-%' and name like 'Diubah%')
  + (select count(*)::int from public.umkm_vendors where slug like 'tiga-baru-%')
  + (select count(*)::int from public.products_umkm where slug like 'tiga-baru-%'),
  0, 'no RW admin added or renamed a vendor or product, the superadmin''s since 20261028080100');
select is(
  concat_ws(' | ',
    (select string_agg(rw_id || '=' || title, ', ' order by rw_id) from public.articles where slug like 'tiga-artikel-%'),
    (select string_agg(rw_id || '=' || name, ', ' order by rw_id)
     from (select distinct rw_id, name from public.activity_points where slug like 'tiga-titik-%') as points),
    (select string_agg(rw_id || '=' || alt_text, ', ' order by rw_id) from public.galleries where caption like 'tiga-galeri-%'),
    (select string_agg(rw_id || '=' || description_md, ', ' order by rw_id) from public.performance_schedules
     where title like 'tiga-jadwal-%')),
  concat_ws(' | ', variadic array_fill('5=Diubah RW 05, 8=Diubah RW 08, 13=Diubah RW 13'::text, array[4])),
  'and so did their updates of articles, points, photos and schedules'
);

-- ===== RW 13's file paths =====
-- The media-path CHECK of the content triggers, not who may upload: that is checkUploadAccess (upload-service).
select is(internal.media_owner(13::smallint), 'rw-13', 'RW 13''s files live under rw-13/');
select lives_ok(
  $$insert into public.galleries (rw_id, category, storage_path, alt_text, status)
    values (13, 'activity', 'rw-13/gallery/tiga-milik-13.webp', 'Kegiatan', 'draft')$$,
  'the path check lets an RW 13 photo point at a file under rw-13/');
select throws_ok(
  $$insert into public.galleries (rw_id, category, storage_path, alt_text, status)
    values (5, 'activity', 'rw-13/gallery/tiga-bukan-milik-05.webp', 'Kegiatan', 'draft')$$,
  '23514', null, 'and refuses it to an RW 05 photo');
select throws_ok(
  $$insert into public.galleries (rw_id, category, storage_path, alt_text, status)
    values (13, 'activity', 'rw-08/gallery/tiga-bukan-milik-13.webp', 'Kegiatan', 'draft')$$,
  '23514', null, 'and an RW 13 photo a file of RW 08');

select * from finish();
rollback;
