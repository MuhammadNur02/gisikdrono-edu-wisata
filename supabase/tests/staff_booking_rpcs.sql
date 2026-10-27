-- Task P4.3.08 (20261104200200_staff_booking_rpcs.sql): the booking screen's staff steps. cancel_booking (unpaid by
-- staff in scope, paid by the superadmin with a fresh code on the visit terms' refund), extend_booking_hold,
-- reactivate_booking and request_notification_resend, each from the staff member's own session at AAL2.
begin;
select plan(29);
\ir helpers/rls_personas.psql
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
                       'notes', null, 'admin', jsonb_build_object('phone_confirmed', false, 'cash_on_the_spot', false)),
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
    90::smallint)$$,
  '42501', 'a paid booking is cancelled by the superadmin', 'nor to cancel');
reset role;
select set_config('request.jwt.claims', '', true);
select is((select (status, cancelled_by)::text from public.bookings where id = (select id from booking where name = 'unpaid')),
  '(cancelled,00000000-0000-4000-8000-00000000f005)', 'the booking is cancelled, by the officer');
select ok(exists (select 1 from public.notifications where booking_id = (select id from booking where name = 'unpaid')
                  and template = 'booking_cancelled'), 'and the PIC hears of it');

select pg_temp.act_as('superadmin_stale_totp');
select throws_ok($$select public.cancel_booking((select id from booking where name = 'paid'), 'Kelurahan membatalkan',
    27000, 90::smallint)$$,
  '42501', 'confirm with a fresh authenticator code first', 'the superadmin cancels a paid booking with a fresh code');
reset role;
select pg_temp.act_as('superadmin_aal2');
select is((select (p ->> 'amount', p ->> 'refund_pct')::text
           from public.cancellation_preview((select id from booking where name = 'paid')) as p),
  '(27000,90)', 'the preview is the visit terms'' refund three days ahead');
select throws_ok($$select public.cancel_booking((select id from booking where name = 'paid'), 'Kelurahan membatalkan',
    30000, 100::smallint)$$,
  'P0001', null, 'a refund other than the preview changes nothing (PRICE_MISMATCH)');
select is((public.cancel_booking((select id from booking where name = 'paid'), 'Kelurahan membatalkan', 27000,
            90::smallint)) ->> 'result', 'cancelled', 'and on the preview the paid booking is cancelled');
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
    (select at from first_start) + interval '1 minute')$$,
  '22023', null, 'a hold never runs past the first session''s start');
select throws_ok($$select public.extend_booking_hold((select id from booking where name = 'combo'), now() + interval '1 hour')$$,
  '22023', null, 'and only moves later');
select lives_ok($$select public.extend_booking_hold((select id from booking where name = 'combo'),
    (select at from first_start) - interval '1 hour')$$,
  'an officer of one of the combo''s RWs extends its hold up to an hour before it starts');
reset role;
select set_config('request.jwt.claims', '', true);
select is((select expires_at from public.bookings where id = (select id from booking where name = 'combo')),
  (select at from first_start) - interval '1 hour', 'the hold runs until then');
select ok(exists (select 1 from public.booking_events where booking_id = (select id from booking where name = 'combo')
                  and reason = 'hold_extended' and actor_id = '00000000-0000-4000-8000-00000000f005'),
  'and the timeline says who moved it');

-- ===== reactivate_booking =====
select pg_temp.act_as('admin_rw_05');
select throws_ok($$select public.reactivate_booking((select id from booking where name = 'combo'))$$,
  'P0001', null, 'a running hold is not reactivated');
select throws_ok($$select public.reactivate_booking((select id from booking where name = 'crowded'))$$,
  'P0001', null, 'nor an expired one whose seats another group took (QUOTA_UNAVAILABLE)');
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
select isnt(public.request_notification_resend((select id from booking where name = 'again'), 'booking_created', 'email'),
  null, 'a message it had goes again, as a new row');
reset role;
select set_config('request.jwt.claims', '', true);
select is((select count(*)::int from public.audit_logs where action = 'notifications.resend'
           and entity_id = (select id::text from booking where name = 'again')
           and actor_id = '00000000-0000-4000-8000-00000000f005'), 1, 'audited, with who asked');

select * from finish();
rollback;
