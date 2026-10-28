-- Task P4.3.08 (20261104220200_staff_booking_rpcs.sql): the booking screen's staff steps. cancel_booking (unpaid by
-- staff in scope, paid by the superadmin with a fresh code on the visit terms' refund), extend_booking_hold,
-- reactivate_booking and request_notification_resend, each from the staff member's own session at AAL2.
begin;
select plan(39);
\ir helpers/rls_personas.psql
-- The hint a statement is refused with, or null when it runs.
create function pg_temp.hint_of(p_sql text) returns text
  language plpgsql
as $$
declare
  raised_hint text;
begin
  execute p_sql;
  return null;
exception when others then
  get stacked diagnostics raised_hint = pg_exception_hint;
  return raised_hint;
end;
$$;
grant execute on function pg_temp.hint_of(text) to authenticated;
select set_config('app.qr_key_id', 'k1', true);

-- ===== Fixtures: an RW 05 package and a combo of RW 05 and RW 13, their sessions, and officers' bookings =====
insert into public.tour_packages (id, rw_id, category, slug, name, pricing_basis, price_per_pax, status) values
  ('00000000-0000-4000-8000-0000000ad001', 5, 'regular', 'uji-staf-paket', 'Paket Staf', 'per_pax', 30000,
   'published');
insert into public.tour_packages (id, category, slug, name, pricing_basis, price_per_pax, status) values
  ('00000000-0000-4000-8000-0000000ad002', 'combo', 'uji-staf-kombo', 'Kombo Staf', 'per_pax', 40000, 'draft');
insert into public.tour_package_legs (package_id, rw_id, leg_order) values
  ('00000000-0000-4000-8000-0000000ad002', 5, 1), ('00000000-0000-4000-8000-0000000ad002', 13, 2);
update public.tour_packages set status = 'published' where id = '00000000-0000-4000-8000-0000000ad002';
insert into public.visit_sessions (id, rw_id, session_date, start_time, end_time, label, capacity) values
  ('00000000-0000-4000-8000-0000000ad205', 5, public.today_jkt() + 3, '09:00', '10:00', 'Staf 05', 40),
  ('00000000-0000-4000-8000-0000000ad213', 13, public.today_jkt() + 3, '11:00', '12:00', 'Staf 13', 40),
  ('00000000-0000-4000-8000-0000000ad206', 5, public.today_jkt() + 4, '09:00', '10:00', 'Staf kecil', 2);

-- An officer's booking as create_admin_booking makes it, for the officer p_actor.
create function pg_temp.book(p_package uuid, p_sessions uuid[], p_pax integer, p_actor uuid, p_key text)
  returns uuid
  language sql
as $$
  select (internal.create_booking(p_package, p_sessions, p_pax,
    jsonb_build_object('booker_type', 'individual', 'institution_name', null, 'pic_name', 'Sari Staf',
                       'pic_phone', '+6281300009' || right(p_key, 3), 'pic_email', 'staf-' || p_key || '@example.test',
                       'notes', null, 'admin', jsonb_build_object('phone_confirmed', true, 'cash_on_the_spot', false)),
    '[]', '[]', 'pay', 'admin', p_key, null,
    jsonb_build_object('version', '2026-10-18', 'attested_by', p_actor::text), p_actor, '{}',
    internal.booking_quote_hash(internal.booking_quote(p_package, p_pax, '[]',
      (select array_agg(l.rw_id order by l.leg_order) from public.tour_package_legs l where l.package_id = p_package))))
    ->> 'booking_id')::uuid;
$$;
-- A hold moved back and expired, as expire_stale_bookings finds it.
create function pg_temp.expire(p_booking uuid) returns void
  language sql
as $$
  select set_config('app.hold_extension', '1', true), set_config('app.in_rpc', '1', true);
  update public.bookings set expires_at = now() - interval '10 minutes' where id = p_booking;
  select set_config('app.hold_extension', '', true), set_config('app.in_rpc', '', true);
  select internal.expire_stale_bookings();
$$;

create temporary table booking (name text primary key, id uuid) on commit drop;
insert into booking values
  ('unpaid', pg_temp.book('00000000-0000-4000-8000-0000000ad001', array['00000000-0000-4000-8000-0000000ad205']::uuid[],
                          2, '00000000-0000-4000-8000-00000000f005', 'staf-001')),
  ('paid', pg_temp.book('00000000-0000-4000-8000-0000000ad001', array['00000000-0000-4000-8000-0000000ad205']::uuid[],
                        1, '00000000-0000-4000-8000-00000000f005', 'staf-002')),
  ('combo', pg_temp.book('00000000-0000-4000-8000-0000000ad002',
                         array['00000000-0000-4000-8000-0000000ad205', '00000000-0000-4000-8000-0000000ad213']::uuid[],
                         1, '00000000-0000-4000-8000-00000000f001', 'staf-003')),
  ('again', pg_temp.book('00000000-0000-4000-8000-0000000ad001', array['00000000-0000-4000-8000-0000000ad205']::uuid[],
                         1, '00000000-0000-4000-8000-00000000f005', 'staf-004')),
  ('crowded', pg_temp.book('00000000-0000-4000-8000-0000000ad001', array['00000000-0000-4000-8000-0000000ad206']::uuid[],
                           2, '00000000-0000-4000-8000-00000000f005', 'staf-005'));
grant select on booking to authenticated;

-- The paid booking takes its cash; the crowded one lapses and its two seats go to another group.
select pg_temp.act_as('admin_rw_05');
select public.mark_booking_paid_manually((select id from booking where name = 'paid'), 'cash', 30000, 'k1');
reset role;
select set_config('request.jwt.claims', '', true);
select pg_temp.expire((select id from booking where name = 'crowded'));
select pg_temp.expire((select id from booking where name = 'again'));
insert into booking values
  ('taker', pg_temp.book('00000000-0000-4000-8000-0000000ad001', array['00000000-0000-4000-8000-0000000ad206']::uuid[],
                         2, '00000000-0000-4000-8000-00000000f005', 'staf-006'));

-- ===== cancel_booking =====
select pg_temp.act_as('admin_rw_08');
select throws_ok($$select public.cancel_booking((select id from booking where name = 'unpaid'), 'Rombongan batal', 0)$$,
  'P0002', null, 'an RW 08 officer cancels no RW 05 booking');
reset role;
select pg_temp.act_as('admin_rw_05_aal1');
select throws_ok($$select public.cancel_booking((select id from booking where name = 'unpaid'), 'Rombongan batal', 0)$$,
  '42501', 'only staff at AAL2 take this step', 'nor does their own officer before AAL2');
reset role;
select pg_temp.act_as('admin_rw_05');
select throws_ok($$select public.cancel_booking((select id from booking where name = 'unpaid'), 'ok', 0)$$,
  '22023', null, 'a cancellation names its reason');
select is((public.cancel_booking((select id from booking where name = 'unpaid'), 'Rombongan batal datang', 0))
            ->> 'result', 'cancelled', 'the RW 05 officer cancels an unpaid booking of their RW');
select throws_ok($$select public.cancel_booking((select id from booking where name = 'unpaid'), 'Rombongan batal', 0)$$,
  'P0001', null, 'once');
select throws_ok($$select public.cancellation_preview((select id from booking where name = 'paid'))$$,
  '42501', 'a paid booking is cancelled by the superadmin', 'a paid booking''s refund is not the RW officer''s to see');
select throws_ok($$select public.cancel_booking((select id from booking where name = 'paid'), 'Rombongan batal', 27000,
    90::smallint, 'guest_request')$$,
  '42501', 'a paid booking is cancelled by the superadmin', 'nor to cancel');
reset role;
select set_config('request.jwt.claims', '', true);
select is((select (status, cancelled_by)::text from public.bookings where id = (select id from booking where name = 'unpaid')),
  '(cancelled,00000000-0000-4000-8000-00000000f005)', 'the booking is cancelled, by the officer');
select ok(exists (select 1 from public.notifications where booking_id = (select id from booking where name = 'unpaid')
                  and template = 'booking_cancelled'), 'and the PIC hears of it');

select pg_temp.act_as('superadmin_stale_totp');
select throws_ok($$select public.cancel_booking((select id from booking where name = 'paid'), 'Tamu minta batal',
    27000, 90::smallint, 'guest_request')$$,
  '42501', 'confirm with a fresh authenticator code first', 'the superadmin cancels a paid booking with a fresh code');
reset role;
select pg_temp.act_as('superadmin_aal2');
select is((select (p ->> 'amount', p ->> 'refund_pct')::text
           from public.cancellation_preview((select id from booking where name = 'paid'), 'guest_request') as p),
  '(27000,90)', 'the preview at the guest''s request is the visit terms'' refund three days ahead');
select is((select (p ->> 'amount', p ->> 'refund_pct')::text
           from public.cancellation_preview((select id from booking where name = 'paid'), 'kelurahan') as p),
  '(30000,100)', 'A28: from the kelurahan or RW it is the whole payment');
select throws_ok($$select public.cancel_booking((select id from booking where name = 'paid'), 'Tamu minta batal',
    27000, 90::smallint)$$,
  '22023', null, 'A28: a paid booking''s cancellation names its reason category');
select throws_ok($$select public.cancel_booking((select id from booking where name = 'paid'), 'Tamu minta batal',
    30000, 100::smallint, 'guest_request')$$,
  'P0001', null, 'a refund other than the preview changes nothing (PRICE_MISMATCH)');
select is((public.cancel_booking((select id from booking where name = 'paid'), 'Tamu minta batal', 27000,
            90::smallint, 'guest_request')) ->> 'result', 'cancelled', 'and on the preview the paid booking is cancelled');
select ok(exists (select 1 from public.audit_logs where action = 'bookings.staff_cancelled'
                  and entity_id = (select id::text from booking where name = 'paid')
                  and metadata ->> 'reason_category' = 'guest_request'), 'A28: audited with its reason category');
reset role;
select set_config('request.jwt.claims', '', true);
select is((select (amount, method, requested_by)::text from public.refund_requests
           where booking_id = (select id from booking where name = 'paid')),
  '(27000,cash,00000000-0000-4000-8000-00000000f001)', 'with its refund to be paid back');

-- ===== extend_booking_hold =====
create temporary table first_start on commit drop as
  select ((public.today_jkt() + 3) + time '09:00') at time zone 'Asia/Jakarta' as at;
grant select on first_start to authenticated;
select pg_temp.act_as('admin_rw_08');
select throws_ok($$select public.extend_booking_hold((select id from booking where name = 'again'), now() + interval '1 day')$$,
  'P0002', null, 'an RW 08 officer extends no RW 05 hold');
reset role;
select pg_temp.act_as('admin_rw_05');
select throws_ok($$select public.extend_booking_hold((select id from booking where name = 'combo'),
    (select at from first_start) - interval '1 hour')$$,
  'P0002', null, 'review of PR #102, L6: a combo is not one RW''s officer''s, as the action says too');
reset role;
select pg_temp.act_as('superadmin_aal2');
select throws_ok($$select public.extend_booking_hold((select id from booking where name = 'combo'),
    (select at from first_start) + interval '1 minute')$$,
  '22023', null, 'a hold never runs past the first session''s start');
select throws_ok($$select public.extend_booking_hold((select id from booking where name = 'combo'), now() + interval '1 hour')$$,
  '22023', null, 'and only moves later');
select lives_ok($$select public.extend_booking_hold((select id from booking where name = 'combo'),
    (select at from first_start) - interval '1 hour')$$,
  'the superadmin extends the combo''s hold up to an hour before it starts');
reset role;
select set_config('request.jwt.claims', '', true);
select is((select expires_at from public.bookings where id = (select id from booking where name = 'combo')),
  (select at from first_start) - interval '1 hour', 'the hold runs until then');
select ok(exists (select 1 from public.booking_events where booking_id = (select id from booking where name = 'combo')
                  and reason = 'hold_extended' and actor_id = '00000000-0000-4000-8000-00000000f001'),
  'and the timeline says who moved it');
-- Review of PR #102, L10: a hold whose PIC has a pay page open keeps its deadline (PAYMENT_OPEN).
select set_config('app.in_rpc', '1', true);
insert into public.payments (booking_id, attempt_no, provider, method, status, order_id, gross_amount)
select b.id, 1, 'midtrans', 'qris', 'pending', b.booking_code || '-01', b.total_amount
from public.bookings b where b.id = (select id from booking where name = 'combo');
select set_config('app.in_rpc', '', true);
select pg_temp.act_as('superadmin_aal2');
select is(pg_temp.hint_of($$select public.extend_booking_hold((select id from booking where name = 'combo'),
    (select at from first_start) - interval '30 minutes')$$),
  'PAYMENT_OPEN', 'a hold is not extended while the PIC has a pay page open');
reset role;
select set_config('request.jwt.claims', '', true);

-- Review of PR #102, HIGH 1: a quotation that lapsed (its leg unreserved) and a lapsed hold of an unproven phone.
select set_config('app.in_rpc', '1', true);
insert into public.bookings (booking_code, status, channel, package_id, package_snapshot, rw_ids, booker_type,
  pic_name, pic_phone, pic_email, pax_count, visit_date, visit_date_end, subtotal_package, total_amount,
  consent_version, consented_at, phone_verified_at, created_by)
values
  ('GSK-STF0KWTA', 'expired', 'admin', '00000000-0000-4000-8000-0000000ad001', '{}', '{5}', 'individual', 'Kuota',
   '+6281300009801', 'kwta@example.test', 1, public.today_jkt() + 3, public.today_jkt() + 3, 30000, 30000, 'v1',
   now(), now(), '00000000-0000-4000-8000-00000000f005'),
  ('GSK-STF0TNPA', 'expired', 'admin', '00000000-0000-4000-8000-0000000ad001', '{}', '{5}', 'individual', 'Tanpa',
   '+6281300009802', 'tnpa@example.test', 1, public.today_jkt() + 3, public.today_jkt() + 3, 30000, 30000, 'v1',
   now(), null, '00000000-0000-4000-8000-00000000f005'),
  ('GSK-STF0WEBA', 'expired', 'web', '00000000-0000-4000-8000-0000000ad001', '{}', '{5}', 'individual', 'Web',
   '+6281300009803', 'weba@example.test', 1, public.today_jkt() + 3, public.today_jkt() + 3, 30000, 30000, 'v1',
   now(), null, null);
insert into public.booking_legs (booking_id, rw_id, visit_session_id, leg_order, pax_count, status, quota_released_at)
select b.id, 5, '00000000-0000-4000-8000-0000000ad205', 1, 1,
       case when b.booking_code = 'GSK-STF0KWTA' then 'unreserved' else 'released' end::public.booking_leg_status,
       case when b.booking_code = 'GSK-STF0KWTA' then null else now() end
from public.bookings b where b.booking_code in ('GSK-STF0KWTA', 'GSK-STF0TNPA', 'GSK-STF0WEBA');
select set_config('app.in_rpc', '', true);
insert into booking select 'lapsed_quote', id from public.bookings where booking_code = 'GSK-STF0KWTA';
insert into booking select 'unproven', id from public.bookings where booking_code = 'GSK-STF0TNPA';
insert into booking select 'unproven_web', id from public.bookings where booking_code = 'GSK-STF0WEBA';

-- ===== reactivate_booking =====
select pg_temp.act_as('superadmin_aal2');
select throws_ok($$select public.reactivate_booking((select id from booking where name = 'combo'))$$,
  'P0001', null, 'a running hold is not reactivated');
reset role;
select pg_temp.act_as('admin_rw_05');
select throws_ok($$select public.reactivate_booking((select id from booking where name = 'crowded'))$$,
  'P0001', null, 'nor an expired one whose seats another group took (QUOTA_UNAVAILABLE)');
select is(pg_temp.hint_of($$select public.reactivate_booking((select id from booking where name = 'lapsed_quote'))$$),
  'STATE_INVALID', 'HIGH 1: a lapsed quotation, which never reserved its seats, is not held again');
select is(pg_temp.hint_of($$select public.reactivate_booking((select id from booking where name = 'unproven_web'))$$),
  'STATE_INVALID', 'nor a lapsed web hold of a phone nobody proved');
select lives_ok($$select public.reactivate_booking((select id from booking where name = 'unproven'))$$,
  'A28: an officer''s lapsed hold is held again without a proven phone, the officer having checked the contact');
select is((public.reactivate_booking((select id from booking where name = 'again'))) ->> 'expires_at',
  to_jsonb(((public.today_jkt() + 3) + time '23:59') at time zone 'Asia/Jakarta') #>> '{}',
  'an expired officer''s booking is held again until 23:59 WIB of its visit day (A23)');
reset role;
select set_config('request.jwt.claims', '', true);
select is((select status::text from public.bookings where id = (select id from booking where name = 'again')),
  'pending_payment', 'it is unpaid and held again');
select is((select count(*)::int from public.notifications where booking_id = (select id from booking where name = 'again')
           and template = 'booking_created' and channel = 'email'), 2, 'and the PIC gets a new pay link');

-- ===== request_notification_resend =====
select pg_temp.act_as('admin_rw_05');
select throws_ok($$select public.request_notification_resend((select id from booking where name = 'again'), 'phone_otp',
    'whatsapp')$$,
  '22023', null, 'a code is never sent again');
select throws_ok($$select public.request_notification_resend((select id from booking where name = 'again'),
    'visit_reminder_d1', 'email')$$,
  'P0001', null, 'nor a message the booking never had');
select throws_ok($$select public.request_notification_resend((select id from booking where name = 'again'),
    'booking_created', 'email')$$,
  'P0001', 'this message cannot go to the PIC now',
  'the cap on emails before payment holds for a message sent again too');
select is(pg_temp.hint_of($$select public.request_notification_resend((select id from booking where name = 'unpaid'),
    'booking_created', 'email')$$),
  'STATE_INVALID', 'L7: a cancelled booking gets no pay link again');
select isnt(public.request_notification_resend((select id from booking where name = 'paid'), 'booking_cancelled',
    'email'),
  null, 'a message it had goes again, as a new row');
reset role;
select set_config('request.jwt.claims', '', true);
select is((select count(*)::int from public.audit_logs where action = 'notifications.resend'
           and entity_id = (select id::text from booking where name = 'paid')
           and actor_id = '00000000-0000-4000-8000-00000000f005'), 1, 'audited, with who asked');

select * from finish();
rollback;
