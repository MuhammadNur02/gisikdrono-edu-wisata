-- internal.create_quotation (Task P3.6.01; docs/PRD.md FR-B2B-01…03, §9.2 rows 5 and 8): a quoted booking gets its
-- numbered quotation with a verify code, a fortnight's validity and a snapshot in the one document shape, holds no
-- seat, queues quotation_ready, and gets three versions at most.
begin;
select plan(18);
\ir helpers/addons_on.psql

-- ===== Fixtures: an RW 05 package with an add-on, one session, and quoted bookings of a school =====
insert into public.umkm_vendors (id, rw_id, slug, name) values
  ('00000000-0000-4000-8000-0000000e0051', 5, 'uji-sp-vendor', 'Vendor Uji SP');
insert into public.products_umkm (id, rw_id, vendor_id, slug, name, category, price, unit_label, is_addon_eligible,
                                  is_available, status) values
  ('00000000-0000-4000-8000-0000000e0a05', 5, '00000000-0000-4000-8000-0000000e0051', 'uji-sp-kompos', 'Kompos Uji',
   'compost', 15000, 'kantong', true, true, 'published');
insert into public.tour_packages (id, rw_id, category, slug, name, pricing_basis, price_per_pax, status) values
  ('00000000-0000-4000-8000-0000000e1001', 5, 'regular', 'uji-sp-paket', 'Paket Uji SP', 'per_pax', 30000,
   'published');
create function pg_temp.visit_day() returns date language sql as $$ select public.today_jkt() + 5 $$;
insert into public.visit_sessions (id, rw_id, session_date, start_time, end_time, label, capacity) values
  ('00000000-0000-4000-8000-0000000e2001', 5, pg_temp.visit_day(), '09:05', '10:05', 'Uji SP', 40);

create function pg_temp.otp(p_phone text, p_email text default null) returns uuid
  language sql
as $$
  insert into public.guest_otps (purpose, phone, email, code_hash, browser_hash, expires_at, verified_at, created_at)
  values ('booking_phone', case when p_email is null then p_phone end, p_email, repeat('a', 64), repeat('b', 64),
          now() + interval '5 minutes', now() - interval '1 minute', now() - interval '2 minutes')
  returning id;
$$;

-- A school's booking of 20 pupils with 20 bags of compost, quoted unless asked to pay.
create function pg_temp.book(p_otp uuid, p_phone text, p_email text, p_mode text default 'quote') returns uuid
  language sql
as $$
  select (internal.create_booking('00000000-0000-4000-8000-0000000e1001',
    array['00000000-0000-4000-8000-0000000e2001']::uuid[], 20,
    jsonb_build_object('booker_type', 'school', 'institution_name', 'SD Negeri Uji 01', 'pic_name', 'Ani Uji',
                       'pic_phone', p_phone, 'pic_email', p_email, 'notes', null),
    '[{"product_id": "00000000-0000-4000-8000-0000000e0a05", "qty": 20, "notes": null}]', '[]', p_mode, 'web', null,
    p_otp, '{"version": "2026-10-18"}', null, '{"ip": null, "user_agent": "pgTAP"}',
    internal.booking_quote_hash(internal.booking_quote('00000000-0000-4000-8000-0000000e1001', 20,
      '[{"product_id": "00000000-0000-4000-8000-0000000e0a05", "qty": 20, "notes": null}]', array[5]::smallint[])))
    ->> 'booking_id')::uuid;
$$;

create temporary table quoted on commit drop as
  select pg_temp.book(pg_temp.otp('+6281300000301'), '+6281300000301', 'tamu301@contoh.test') as id;

-- ===== The first version =====
create temporary table first on commit drop as
  select internal.create_quotation((select id from quoted), null) as reply;
select matches((select reply ->> 'quotation_number' from first), '^SP/GSK/[0-9]{4}/[0-9]{2}/[0-9]{4}$',
  'the quotation is numbered SP/GSK/YYYY/MM/NNNN by next_document_number');
select is((select (reply ->> 'version')::int from first), 1, 'and is version 1');
select matches((select reply ->> 'verify_code' from first), '^[0-9A-HJKMNP-TV-Z]{10}$',
  'with a ten-symbol Crockford verify code for /verifikasi/[code]');
select is((select (reply ->> 'valid_until')::date from first), public.today_jkt() + 14,
  'valid for booking.quotation_valid_days from today');
select is((select (q.status::text, q.issued_by, q.valid_until) from public.quotations q
           where q.id = (select (reply ->> 'quotation_id')::uuid from first)),
  ('issued'::text, null::uuid, public.today_jkt() + 14), 'the row is issued by the visitor, valid for the same days');

-- ===== The snapshot: the document shape of docs/PRD.md §8.4.5, the money of the booking, no contact =====
create temporary table snap on commit drop as
  select q.snapshot from public.quotations q where q.id = (select (reply ->> 'quotation_id')::uuid from first);
select is((select (snapshot ->> 'booking_code', snapshot ->> 'institution_name', snapshot ->> 'package_name',
                   snapshot ->> 'pricing_basis', (snapshot ->> 'pax_count')::int, snapshot ->> 'valid_until',
                   snapshot ->> 'template_version') from snap),
  ((select booking_code from public.bookings where id = (select id from quoted)), 'SD Negeri Uji 01'::text,
   'Paket Uji SP'::text, 'per_pax'::text, 20, (public.today_jkt() + 14)::text, 'quotation-v1'::text),
  'the snapshot names the booking, the school, the package, the group and its validity');
select is((select (snapshot -> 'rw_names', snapshot -> 'sessions' -> 0 ->> 'rw_name',
                   snapshot -> 'sessions' -> 0 ->> 'start_time', snapshot ->> 'signatory_title') from snap),
  ('["RW 05 Ecowastreme"]'::jsonb, 'RW 05 Ecowastreme'::text, '09:05:00'::text, 'Lurah Gisikdrono'::text),
  'the RW, its session and the signatory of site_settings');
select is((select jsonb_agg(jsonb_build_object('kind', l ->> 'kind', 'qty', (l ->> 'qty')::int,
                                               'unit_price', (l ->> 'unit_price')::bigint,
                                               'line_total', (l ->> 'line_total')::bigint))
           from snap, jsonb_array_elements(snapshot -> 'lines') as l),
  '[{"kind": "package", "qty": 20, "unit_price": 30000, "line_total": 600000},
    {"kind": "addon", "qty": 20, "unit_price": 15000, "line_total": 300000}]'::jsonb,
  'one line for the package and one per add-on, priced as the booking was');
select is((select ((snapshot ->> 'subtotal_package')::bigint, (snapshot ->> 'subtotal_addons')::bigint,
                   (snapshot ->> 'total_amount')::bigint, snapshot ->> 'currency') from snap),
  (600000::bigint, 300000::bigint, 900000::bigint, 'IDR'::text), 'and the totals of the booking');
select ok((select snapshot::text !~ '6281300000301' and snapshot::text !~ 'contoh.test' from snap),
  'the PIC''s number and address are nowhere in it');

-- ===== No seat, and the message queued =====
select is((select reserved_pax from public.visit_sessions where id = '00000000-0000-4000-8000-0000000e2001'), 0,
  'a quotation holds no seat');
select is((select array_agg(n.channel::text order by n.channel::text) from public.notifications n
           where n.booking_id = (select id from quoted) and n.template = 'quotation_ready'
             and n.params ->> 'quotation_number' = (select reply ->> 'quotation_number' from first)),
  array['email', 'whatsapp'], 'quotation_ready is queued on both channels with the number');
select is((select count(*)::int from public.booking_events e
           where e.booking_id = (select id from quoted) and e.payload ->> 'reason' = 'quotation_issued'),
  1, 'and the booking''s history notes the issue');

-- ===== Versions: the previous one superseded, three at most =====
create temporary table second on commit drop as
  select internal.create_quotation((select id from quoted), null) as reply;
select is((select (reply ->> 'version')::int from second), 2, 'the next call issues version 2');
select is((select array_agg(q.status::text order by q.version) from public.quotations q
           where q.booking_id = (select id from quoted)),
  array['superseded', 'issued'], 'and supersedes the first');
select internal.create_quotation((select id from quoted), null);
select throws_ok($$select internal.create_quotation((select id from quoted), null)$$,
  'P0001', 'a booking gets at most three quotation versions', 'a fourth version is refused');

-- ===== Only a quoted booking with a verified number =====
select throws_ok(
  $$select internal.create_quotation(pg_temp.book(pg_temp.otp('+6281300000302'), '+6281300000302',
    'tamu302@contoh.test', 'pay'), null)$$,
  'P0001', 'a quotation is issued for a quoted booking only', 'a hold gets no quotation');
select throws_ok($$select internal.create_quotation('00000000-0000-4000-8000-0000000e9999', null)$$,
  'P0002', null, 'nor does a booking that does not exist');

select * from finish();
rollback;
