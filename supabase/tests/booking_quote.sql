-- The pure parts of internal.create_booking (Task P3.4.01): the booking code it draws, the quote it recomputes from
-- catalogue rows and the hash it compares with the one the visitor's summary showed (decision of 2026-10-22, Q6), the
-- hold deadline (decision of 2026-10-22, Q5) and whether WhatsApp codes are open, which decides when an email code may
-- stand in for the phone (Q7).
begin;
select plan(44);
\ir helpers/addons_on.psql

-- ===== The booking code: GSK- and 8 Crockford base32 symbols from 40 random bits (BOOK-10, GUEST-01) =====
select is(internal.crockford_base32('\x0000000000', 8), '00000000', 'forty zero bits are eight zeros');
select is(internal.crockford_base32('\xffffffffff', 8), 'ZZZZZZZZ', 'forty one bits are eight Zs');
select is(internal.crockford_base32('\x0842108421', 8), '11111111', 'five bits at a time, most significant first');
select is(internal.crockford_base32('\x00443214c7', 8), '01234567', 'the digits come first in the alphabet');
select is(internal.crockford_base32('\xc675be77df', 8), 'RSTVWXYZ', 'and U is left out, as I, L and O are');
select throws_ok($$select internal.crockford_base32('\x00000000', 8)$$, '22023', null,
  'eight symbols need forty bits');

create temporary table drawn_codes on commit drop as
  select internal.new_booking_code() as code from generate_series(1, 4000);
select is((select count(*)::int from drawn_codes where code !~ '^GSK-[0-9A-HJKMNP-TV-Z]{8}$'), 0,
  'every drawn code matches the bookings.booking_code CHECK');
select is((select count(distinct code)::int from drawn_codes), 4000, 'no code repeats over four thousand draws');
select is(
  (select count(*)::int from generate_series(5, 12) as position(at)
   where (select count(distinct substr(d.code, position.at, 1)) from drawn_codes d) = 32),
  8, 'every one of the 32 symbols appears in every one of the 8 positions');

-- ===== Catalogue fixtures =====
insert into public.umkm_vendors (id, rw_id, slug, name) values
  ('00000000-0000-4000-8000-0000000b0051', 5, 'uji-pesan-vendor-05', 'Vendor Uji 05'),
  ('00000000-0000-4000-8000-0000000b0131', 13, 'uji-pesan-vendor-13', 'Vendor Uji 13');
insert into public.products_umkm (id, rw_id, vendor_id, slug, name, category, price, unit_label, min_order_qty,
  max_order_qty, is_addon_eligible, is_available, status) values
  ('00000000-0000-4000-8000-0000000b0a02', 5, '00000000-0000-4000-8000-0000000b0051', 'uji-pesan-kompos', 'Kompos Uji',
   'compost', 15000, 'kantong', 1, 10, true, true, 'published'),
  ('00000000-0000-4000-8000-0000000b0a01', 5, '00000000-0000-4000-8000-0000000b0051', 'uji-pesan-bibit', 'Bibit Uji',
   'seedling', 20000, 'polybag', 1, null, true, true, 'published'),
  ('00000000-0000-4000-8000-0000000b0a03', 5, '00000000-0000-4000-8000-0000000b0051', 'uji-pesan-bukan-tambahan',
   'Bukan Tambahan', 'other', 9000, 'buah', 1, null, false, true, 'published'),
  ('00000000-0000-4000-8000-0000000b0a13', 13, '00000000-0000-4000-8000-0000000b0131', 'uji-pesan-suvenir-13',
   'Suvenir Uji 13', 'souvenir', 25000, 'buah', 1, null, true, true, 'published');
insert into public.tour_packages (id, rw_id, category, slug, name, pricing_basis, price_per_pax, flat_price, min_pax,
  max_pax, status) values
  ('00000000-0000-4000-8000-0000000b0001', 5, 'regular', 'uji-pesan-per-orang', 'Uji Per Orang', 'per_pax', 30000, null,
   1, 200, 'published'),
  ('00000000-0000-4000-8000-0000000b0002', 5, 'institutional', 'uji-pesan-rombongan', 'Uji Rombongan', 'flat_group',
   null, 1000000, 1, 200, 'published');
insert into public.tour_package_price_tiers (package_id, min_pax, max_pax, price_per_pax) values
  ('00000000-0000-4000-8000-0000000b0001', 21, 60, 25000);

-- ===== internal.booking_quote: the same lines computeBookingQuote prices (src/lib/pricing) =====
select is(internal.booking_quote('00000000-0000-4000-8000-0000000b0001', 10, '[]', array[5]::smallint[]) -> 'lines',
  '[{"kind": "package", "id": "00000000-0000-4000-8000-0000000b0001", "unit_price": 30000, "quantity": 10,
     "line_total": 300000}]'::jsonb, 'ten visitors pay the package price each');
select is((internal.booking_quote('00000000-0000-4000-8000-0000000b0001', 30, '[]', array[5]::smallint[])
  #>> '{lines,0,unit_price}')::bigint, 25000::bigint, 'thirty visitors fall in the 21–60 tier');
select is((internal.booking_quote('00000000-0000-4000-8000-0000000b0001', 61, '[]', array[5]::smallint[])
  #>> '{lines,0,unit_price}')::bigint, 30000::bigint, 'and sixty-one fall out of it again');
select is(internal.booking_quote('00000000-0000-4000-8000-0000000b0002', 50, '[]', array[5]::smallint[]) -> 'lines',
  '[{"kind": "package", "id": "00000000-0000-4000-8000-0000000b0002", "unit_price": 1000000, "quantity": 1,
     "line_total": 1000000}]'::jsonb, 'a flat price buys the whole group as one unit');
select is(
  internal.booking_quote('00000000-0000-4000-8000-0000000b0001', 30,
    '[{"product_id": "00000000-0000-4000-8000-0000000b0a02", "qty": 2},
      {"product_id": "00000000-0000-4000-8000-0000000b0a01", "qty": 1}]', array[5]::smallint[]),
  '{"lines": [
      {"kind": "package", "id": "00000000-0000-4000-8000-0000000b0001", "unit_price": 25000, "quantity": 30,
       "line_total": 750000},
      {"kind": "addon", "id": "00000000-0000-4000-8000-0000000b0a01", "unit_price": 20000, "quantity": 1,
       "line_total": 20000},
      {"kind": "addon", "id": "00000000-0000-4000-8000-0000000b0a02", "unit_price": 15000, "quantity": 2,
       "line_total": 30000}],
    "tier": {"min_pax": 21, "max_pax": 60, "price_per_pax": 25000},
    "subtotal_package": 750000, "subtotal_addons": 50000, "total": 800000}'::jsonb,
  'add-on lines follow the package line in product order, and the total is their sum');
select throws_ok(
  $$select internal.booking_quote('00000000-0000-4000-8000-0000000b0001', 201, '[]', array[5]::smallint[])$$,
  'P0001', 'the package takes 1 to 200 visitors', 'more visitors than the package takes are refused');
select throws_ok(
  $$select internal.booking_quote('00000000-0000-4000-8000-0000000b0001', 10,
    '[{"product_id": "00000000-0000-4000-8000-0000000b0a03", "qty": 1}]', array[5]::smallint[])$$,
  'P0001', 'product 00000000-0000-4000-8000-0000000b0a03 is not on sale as an add-on for this package',
  'a product that is not an add-on is refused');
select throws_ok(
  $$select internal.booking_quote('00000000-0000-4000-8000-0000000b0001', 10,
    '[{"product_id": "00000000-0000-4000-8000-0000000b0a13", "qty": 1}]', array[5]::smallint[])$$,
  'P0001', 'product 00000000-0000-4000-8000-0000000b0a13 is not on sale as an add-on for this package',
  'and so is an add-on of an RW the package does not visit');
select throws_ok(
  $$select internal.booking_quote('00000000-0000-4000-8000-0000000b0001', 10,
    '[{"product_id": "00000000-0000-4000-8000-0000000b0a02", "qty": 11}]', array[5]::smallint[])$$,
  'P0001', 'product 00000000-0000-4000-8000-0000000b0a02 is ordered 1 to 10 at a time',
  'more of a product than its vendor takes at once is refused');
select throws_ok(
  $$select internal.booking_quote('00000000-0000-4000-8000-0000000b0001', 10,
    '[{"product_id": "00000000-0000-4000-8000-0000000b0a02", "qty": 1},
      {"product_id": "00000000-0000-4000-8000-0000000b0a02", "qty": 1}]', array[5]::smallint[])$$,
  'P0001', 'an add-on is listed once', 'and so is a product listed twice');
update public.products_umkm set is_available = false where id = '00000000-0000-4000-8000-0000000b0a01';
select throws_ok(
  $$select internal.booking_quote('00000000-0000-4000-8000-0000000b0001', 10,
    '[{"product_id": "00000000-0000-4000-8000-0000000b0a01", "qty": 1}]', array[5]::smallint[])$$,
  'P0001', 'product 00000000-0000-4000-8000-0000000b0a01 is not on sale as an add-on for this package',
  'a product that is out of stock is not on sale');
update public.products_umkm set is_available = true where id = '00000000-0000-4000-8000-0000000b0a01';
-- Independent review of PR #26, L5: a vendor that stopped selling sells no add-on.
update public.umkm_vendors set is_active = false where id = '00000000-0000-4000-8000-0000000b0051';
select throws_ok(
  $$select internal.booking_quote('00000000-0000-4000-8000-0000000b0001', 10,
    '[{"product_id": "00000000-0000-4000-8000-0000000b0a02", "qty": 1}]', array[5]::smallint[])$$,
  'P0001', 'product 00000000-0000-4000-8000-0000000b0a02 is not on sale as an add-on for this package',
  'nor is the product of a vendor that is no longer active');
update public.umkm_vendors set is_active = true where id = '00000000-0000-4000-8000-0000000b0051';

-- ===== internal.booking_quote_hash: pinned to the same hex as src/lib/pricing/quote-hash.test.ts =====
select is(internal.booking_quote_hash(
  '{"lines": [
      {"kind": "package", "id": "aaaaaaaa-0000-4000-8000-000000000001", "unit_price": 25000, "quantity": 30,
       "line_total": 750000},
      {"kind": "addon", "id": "bbbbbbbb-0000-4000-8000-000000000002", "unit_price": 15000, "quantity": 2,
       "line_total": 30000},
      {"kind": "addon", "id": "bbbbbbbb-0000-4000-8000-000000000001", "unit_price": 20000, "quantity": 1,
       "line_total": 20000}],
    "total": 800000}'),
  '0f7e523b88cecafeceb9f1a3cfe4a75104b7fc26b81c5d01c07f827e02261e5e',
  'the hash of a quote with add-ons is the one TypeScript computes, add-ons in product order');
select is(internal.booking_quote_hash(
  '{"lines": [{"kind": "package", "id": "aaaaaaaa-0000-4000-8000-000000000003", "unit_price": 1000000, "quantity": 1,
                "line_total": 1000000}], "total": 1000000}'),
  'e40581641e2900b01230647883a867fc587086fe77371aa8636bafb351ad0523', 'and so is the hash of a package line alone');
select isnt(
  internal.booking_quote_hash(internal.booking_quote('00000000-0000-4000-8000-0000000b0001', 10, '[]',
                                                     array[5]::smallint[])),
  internal.booking_quote_hash(internal.booking_quote('00000000-0000-4000-8000-0000000b0001', 11, '[]',
                                                     array[5]::smallint[])),
  'another number of visitors gives another hash');
update public.tour_packages set price_per_pax = 31000 where id = '00000000-0000-4000-8000-0000000b0001';
select isnt(
  internal.booking_quote_hash(internal.booking_quote('00000000-0000-4000-8000-0000000b0001', 10, '[]',
                                                     array[5]::smallint[])),
  internal.booking_quote_hash('{"lines": [{"kind": "package", "id": "00000000-0000-4000-8000-0000000b0001",
    "unit_price": 30000, "quantity": 10, "line_total": 300000}], "total": 300000}'),
  'and so does a changed price');
update public.tour_packages set price_per_pax = 30000 where id = '00000000-0000-4000-8000-0000000b0001';

-- ===== internal.hold_deadline (decision of 2026-10-22, Q5) =====
select is(internal.hold_deadline('individual', 10, now() + interval '3 days'), now() + interval '120 minutes',
  'an individual holds for booking.hold_minutes_individual');
select is(internal.hold_deadline('individual', 21, now() + interval '3 days'), now() + interval '30 minutes',
  'more than twenty visitors hold for thirty minutes');
select is(internal.hold_deadline('community', 21, now() + interval '3 days'), now() + interval '30 minutes',
  'a community group too');
select is(internal.hold_deadline('other', 21, now() + interval '3 days'), now() + interval '30 minutes',
  'and any other booker');
select is(internal.hold_deadline('individual', 20, now() + interval '3 days'), now() + interval '120 minutes',
  'twenty visitors are not more than twenty');
select is(internal.hold_deadline('school', 10, now() + interval '3 days'), now() + interval '24 hours',
  'a school holds for booking.hold_hours_institution');
select is(internal.hold_deadline('school', 40, now() + interval '3 days'), now() + interval '24 hours',
  'and the institution''s hold wins over the shortening for large groups');
select is(internal.hold_deadline('university', 61, now() + interval '3 days'), now() + interval '24 hours',
  'for a university');
select is(internal.hold_deadline('government', 30, now() + interval '3 days'), now() + interval '24 hours',
  'a government office');
select is(internal.hold_deadline('company', 30, now() + interval '3 days'), now() + interval '24 hours',
  'and a company');
select is(internal.hold_deadline('school', 40, now() + interval '20 hours'), now() + interval '19 hours',
  'no hold runs past an hour before the first session starts');
select is(internal.hold_deadline('individual', 10, now() + interval '90 minutes'), now() + interval '30 minutes',
  'not even an individual''s');
update public.site_settings set value = '90' where key = 'booking.hold_minutes_individual';
select is(internal.hold_deadline('individual', 10, now() + interval '3 days'), now() + interval '90 minutes',
  'the hold follows site_settings');
update public.site_settings set value = '120' where key = 'booking.hold_minutes_individual';

-- ===== internal.whatsapp_otp_open: the breaker of internal.issue_phone_otp, without its alerts =====
delete from public.guest_otps;
select ok(internal.whatsapp_otp_open(), 'WhatsApp codes are open on a quiet day');
insert into public.guest_otps (purpose, phone, code_hash, browser_hash, expires_at, created_at)
select 'booking_phone', '+6281200000' || lpad(n::text, 3, '0'), repeat('a', 64), repeat('b', 64),
       now() + interval '5 minutes', now() - interval '1 hour'
from generate_series(1, 499) as n;
select ok(internal.whatsapp_otp_open(), '499 codes today keep WhatsApp open');
select isnt(
  internal.issue_phone_otp(gen_random_uuid(), 'booking_phone', 'whatsapp', repeat('c', 64), repeat('d', 64), '123456',
                           '+6281299999001', null, null, null) ->> 'result',
  'degraded', 'and issue_phone_otp agrees: it still sends the 500th code');
select ok(not internal.whatsapp_otp_open(), 'the 500th code trips the breaker');
select is(
  internal.issue_phone_otp(gen_random_uuid(), 'booking_phone', 'whatsapp', repeat('e', 64), repeat('f', 64), '123456',
                           '+6281299999002', null, null, null) ->> 'result',
  'degraded', 'and issue_phone_otp degrades at the same count');
delete from public.guest_otps;
update public.site_settings set value = 'false' where key = 'whatsapp_enabled';
select ok(not internal.whatsapp_otp_open(), 'WhatsApp switched off counts as degraded too');
update public.site_settings set value = 'true' where key = 'whatsapp_enabled';

select * from finish();
rollback;
