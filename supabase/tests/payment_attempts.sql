-- Task P3.7.03 (docs/PRD.md §9.2, docs/Security.md §3.2; PAY-04, WH-16, BOOK-14): a payment attempt is made only
-- by internal.create_payment_attempt, one open attempt per booking, a replacement only of the attempt the caller has
-- ended at Midtrans, none with less than five minutes of the hold left, and a quoted booking takes its seats with it.
begin;
select plan(26);

-- ===== Fixtures: an RW 05 package and session, and the helpers that make a hold or a quotation booking =====
insert into public.tour_packages (id, rw_id, category, slug, name, pricing_basis, price_per_pax, status) values
  ('00000000-0000-4000-8000-0000000e1001', 5, 'regular', 'uji-bayar-percobaan', 'Paket Uji Bayar', 'per_pax', 30000,
   'published');
insert into public.visit_sessions (id, rw_id, session_date, start_time, end_time, label, capacity) values
  ('00000000-0000-4000-8000-0000000e2001', 5, public.today_jkt() + 5, '09:05', '10:05', 'Uji percobaan bayar', 200);

create function pg_temp.otp(p_phone text) returns uuid
  language sql
as $$
  insert into public.guest_otps (purpose, phone, code_hash, browser_hash, expires_at, verified_at, created_at)
  values ('booking_phone', p_phone, repeat('a', 64), repeat('b', 64), now() + interval '5 minutes',
          now() - interval '1 minute', now() - interval '2 minutes')
  returning id;
$$;

create function pg_temp.booking(p_phone text, p_mode text) returns uuid
  language sql
as $$
  select (internal.create_booking('00000000-0000-4000-8000-0000000e1001',
    array['00000000-0000-4000-8000-0000000e2001']::uuid[], 20,
    jsonb_build_object('booker_type', 'school', 'institution_name', 'SD Negeri Percobaan', 'pic_name', 'Ani Percobaan',
                       'pic_phone', p_phone, 'pic_email', 'percobaan@contoh.test', 'notes', null),
    '[]', '[]', p_mode, 'web', null, pg_temp.otp(p_phone), '{"version": "2026-10-18"}', null,
    '{"ip": null, "user_agent": "pgTAP"}',
    internal.booking_quote_hash(internal.booking_quote('00000000-0000-4000-8000-0000000e1001', 20, '[]',
                                                       array[5]::smallint[]))) ->> 'booking_id')::uuid;
$$;

create temporary table hold on commit drop as select pg_temp.booking('+6281300000601', 'pay') as id;
create temporary table attempts (n integer, reply jsonb) on commit drop;

-- ===== The first attempt =====
insert into attempts select 1, internal.create_payment_attempt((select id from hold), null, null);
select is((select reply ->> 'order_id' from attempts where n = 1),
  (select booking_code || '-01' from public.bookings where id = (select id from hold)),
  'the first attempt is the booking code with -01');
select is((select (reply ->> 'gross_amount')::bigint from attempts where n = 1), 600000::bigint,
  'and asks for the booking''s own total, never an amount from outside');
select is((select (p.status::text, p.expiry_time = b.expires_at, p.provider::text)
           from public.payments p join public.bookings b on b.id = p.booking_id
           where p.id = (select (reply ->> 'payment_id')::uuid from attempts where n = 1))::text,
  ('initiated', true, 'midtrans')::text, 'it starts initiated and closes when the hold does');
select is((select count(*)::int from public.booking_events
           where booking_id = (select id from hold) and reason = 'payment_attempt'), 1,
  'and the booking''s history names it');

select throws_ok($$select internal.create_payment_attempt((select id from hold), null, null)$$, 'P0001', null,
  'a second attempt beside the open one is refused');

select lives_ok($$select internal.attach_snap_token((select (reply ->> 'payment_id')::uuid from attempts where n = 1),
  'token-one', 'https://app.sandbox.midtrans.com/snap/v4/redirection/token-one')$$, 'the Snap page is attached');
select is((select (status::text, snap_redirect_url) from public.payments
           where id = (select (reply ->> 'payment_id')::uuid from attempts where n = 1))::text,
  ('pending', 'https://app.sandbox.midtrans.com/snap/v4/redirection/token-one')::text,
  'and the attempt is pending with its page');
select throws_ok($$select internal.attach_snap_token((select (reply ->> 'payment_id')::uuid from attempts where n = 1),
  'token-two', 'https://app.sandbox.midtrans.com/snap/v4/redirection/token-two')$$, 'P0001', null,
  'a page is attached once');

-- ===== Replacing an attempt the caller ended at Midtrans (WH-16) =====
insert into attempts select 2, internal.create_payment_attempt((select id from hold),
  (select (reply ->> 'payment_id')::uuid from attempts where n = 1), null);
select is((select reply ->> 'order_id' like '%-02' from attempts where n = 2), true, 'the replacement is -02');
select is((select status::text from public.payments where id = (select (reply ->> 'payment_id')::uuid from attempts where n = 1)),
  'expired', 'and the attempt it replaces is closed');

select lives_ok($$select internal.record_payment_failure((select (reply ->> 'payment_id')::uuid from attempts where n = 2),
  'failed', null)$$, 'an attempt Midtrans made no page for closes as failed');
select is((select (p.status::text, b.status::text) from public.payments p join public.bookings b on b.id = p.booking_id
           where p.id = (select (reply ->> 'payment_id')::uuid from attempts where n = 2))::text,
  ('failed', 'pending_payment')::text, 'and the booking still waits for its payment');
select throws_ok($$select internal.record_payment_failure((select (reply ->> 'payment_id')::uuid from attempts where n = 2),
  'settled', null)$$, '22023', null, 'a failure never settles anything');

insert into attempts select 3, internal.create_payment_attempt((select id from hold), null, null);
select is((select reply ->> 'order_id' like '%-03' from attempts where n = 3), true,
  'with no attempt open, the next one needs no replacement');

-- ===== What p_replaces may name (review of PR #39, M2) =====
create temporary table other_hold on commit drop as select pg_temp.booking('+6281300000603', 'pay') as id;
create temporary table other_attempt on commit drop as
  select (internal.create_payment_attempt((select id from other_hold), null, null) ->> 'payment_id')::uuid as id;
select throws_ok($$select internal.create_payment_attempt((select id from hold), (select id from other_attempt), null)$$,
  'P0001', null, 'another booking''s attempt is no replacement for this one''s');
select set_config('app.in_rpc', '1', true);
update public.payments set status = 'needs_review' where id = (select (reply ->> 'payment_id')::uuid from attempts where n = 3);
select set_config('app.in_rpc', '', true);
select throws_ok($$select internal.create_payment_attempt((select id from hold),
  (select (reply ->> 'payment_id')::uuid from attempts where n = 3), null)$$, 'P0001', null,
  'and an attempt under review is replaced by nobody');

-- ===== One open attempt, whoever writes it (payments_one_open_per_booking) =====
select set_config('app.in_rpc', '1', true);
select throws_ok($$
  insert into public.payments (booking_id, attempt_no, provider, status, order_id, gross_amount)
  select id, 9, 'midtrans', 'pending', booking_code || '-09', total_amount from public.bookings
  where id = (select id from hold)$$, '23505', null,
  'two open attempts for one booking are refused even inside a transition function');
select set_config('app.in_rpc', '', true);

-- ===== The five minutes, and a booking under review =====
select set_config('app.hold_extension', '1', true);
select lives_ok($$update public.bookings set expires_at = now() + interval '3 minutes' where id = (select id from hold)$$,
  'the hold is moved to three minutes before its end');
select set_config('app.hold_extension', '', true);
select throws_ok($$select internal.create_payment_attempt((select id from hold),
  (select (reply ->> 'payment_id')::uuid from attempts where n = 3), null)$$, 'P0001', null,
  'no attempt is made with less than five minutes of the hold left');
update public.bookings set needs_review = true where id = (select id from hold);
select throws_ok($$select internal.create_payment_attempt((select id from hold),
  (select (reply ->> 'payment_id')::uuid from attempts where n = 3), null)$$, 'P0001', null,
  'and none for a booking under review');

-- ===== A quoted booking takes its seats with its first attempt (docs/PRD.md §9.2) =====
create temporary table quoted on commit drop as select pg_temp.booking('+6281300000602', 'quote') as id;
create temporary table seats_before on commit drop as
  select reserved_pax from public.visit_sessions where id = '00000000-0000-4000-8000-0000000e2001';
select internal.issue_first_quotation((select id from quoted));
select lives_ok($$select internal.create_payment_attempt((select id from quoted), null, null)$$,
  'Konfirmasi & Bayar on a quotation makes its first attempt');
select is((select (b.status::text, b.expires_at is not null) from public.bookings b where b.id = (select id from quoted))::text,
  ('pending_payment', true)::text, 'the booking becomes a hold with its one deadline');
select is((select reserved_pax - (select reserved_pax from seats_before) from public.visit_sessions
           where id = '00000000-0000-4000-8000-0000000e2001'), 20, 'and its seats are reserved');
select is((select status::text from public.quotations where booking_id = (select id from quoted)), 'accepted',
  'its quotation is accepted');

-- ===== Callers =====
set local role authenticated;
select throws_ok($$select internal.create_payment_attempt('00000000-0000-4000-8000-000000000000', null, null)$$,
  '42501', null, 'a signed-in session cannot make an attempt');
reset role;
select ok(has_function_privilege('service_role', 'public.svc_create_payment_attempt(uuid, uuid, uuid)', 'execute')
          and not has_function_privilege('authenticated', 'public.svc_attach_snap_token(uuid, text, text)', 'execute')
          and not has_function_privilege('anon', 'public.svc_record_payment_failure(uuid, public.payment_status, jsonb)',
                                         'execute'),
  'only the service role reaches the attempt wrappers');

select * from finish();
rollback;
