-- Session quota (Task P1.9.04; docs/Security.md BOOK-01, BOOK-02): the counter never passes capacity, a booking's
-- legs are reserved all together or not at all, a release counts once, and a lapsed hold gives its seats back after
-- the grace period. Fifty truly parallel reservations run in tests/integration/quota.test.ts; one session can
-- only show the same rules one call at a time.
begin;
select plan(18);

-- Whether a statement goes through, or the SQLSTATE that stopped it. Each try runs in its own subtransaction, so a
-- failed one leaves nothing behind, as a failed booking transaction would.
create function pg_temp.outcome(p_statement text) returns text
  language plpgsql
as $$
begin
  execute p_statement;
  return 'allowed';
exception when others then
  return sqlstate;
end;
$$;
create function pg_temp.reserved(p_session_id uuid) returns integer
  language sql stable
as $$ select reserved_pax from public.visit_sessions where id = p_session_id; $$;

-- ===== Fixtures =====
insert into public.tour_packages (id, rw_id, category, slug, name, tagline, duration_minutes, price_per_pax, status)
values ('00000000-0000-4000-9000-000000000401', 5, 'student', 'uji-kuota-paket', 'Paket Uji Kuota', 'Uji', 120, 25000,
        'published');
insert into public.visit_sessions (id, rw_id, session_date, start_time, end_time, label, capacity, status) values
  ('00000000-0000-4000-9000-000000000411', 5, public.today_jkt() + 50, '05:21', '06:00', 'Uji Kuota', 10, 'open'),
  ('00000000-0000-4000-9000-000000000412', 5, public.today_jkt() + 51, '05:21', '06:00', 'Uji Kombo 05', 10, 'open'),
  ('00000000-0000-4000-9000-000000000413', 8, public.today_jkt() + 51, '05:21', '06:00', 'Uji Kombo 08', 10, 'open'),
  ('00000000-0000-4000-9000-000000000414', 5, public.today_jkt() + 52, '05:21', '06:00', 'Uji Tutup', 10, 'closed'),
  ('00000000-0000-4000-9000-000000000415', 5, public.today_jkt() + 53, '05:21', '06:00', 'Uji Kedaluwarsa', 10, 'open');

-- ===== One session never passes capacity =====
select is(
  (select count(*)::int from generate_series(1, 50)
   where pg_temp.outcome($$select internal.reserve_session_quota('00000000-0000-4000-9000-000000000411', 1)$$) = 'allowed'),
  10,
  'of 50 one-seat reservations at capacity 10, exactly 10 go through'
);
select is(pg_temp.reserved('00000000-0000-4000-9000-000000000411'), 10, 'and the counter stops at capacity');
select is(
  pg_temp.outcome($$select internal.reserve_session_quota('00000000-0000-4000-9000-000000000411', 1)$$),
  'P0001',
  'a full session refuses the next visitor with QUOTA_UNAVAILABLE'
);
select is(
  (select remaining from public.v_session_availability where id = '00000000-0000-4000-9000-000000000411'),
  0,
  'and shows no seat left'
);
select is(
  pg_temp.outcome($$select internal.reserve_session_quota('00000000-0000-4000-9000-000000000414', 1)$$),
  'P0001',
  'a closed session takes nobody'
);
select is(
  pg_temp.outcome($$select internal.reserve_session_quota('00000000-0000-4000-9000-000000000412', 0)$$),
  '22023',
  'a reservation needs at least one visitor'
);

-- ===== A combo booking reserves both legs or neither =====
-- create_booking (P3) reserves a combo's legs in visit_session_id order inside one transaction. RW 08's leg fills up
-- first, so the second reservation fails after the first went through.
select internal.reserve_session_quota('00000000-0000-4000-9000-000000000413', 8);
select is(
  pg_temp.outcome($$select internal.reserve_session_quota('00000000-0000-4000-9000-000000000412', 4);
                    select internal.reserve_session_quota('00000000-0000-4000-9000-000000000413', 4)$$),
  'P0001',
  'a combo whose second leg has no room is refused'
);
select is(
  pg_temp.reserved('00000000-0000-4000-9000-000000000412') || '/' || pg_temp.reserved('00000000-0000-4000-9000-000000000413'),
  '0/8',
  'and its first leg holds nothing afterwards'
);
select is(
  pg_temp.outcome($$select internal.reserve_session_quota('00000000-0000-4000-9000-000000000412', 2);
                    select internal.reserve_session_quota('00000000-0000-4000-9000-000000000413', 2)$$),
  'allowed',
  'a combo with room on both legs goes through'
);
select is(
  pg_temp.reserved('00000000-0000-4000-9000-000000000412') || '/' || pg_temp.reserved('00000000-0000-4000-9000-000000000413'),
  '2/10',
  'and holds its seats on both'
);

-- ===== A release counts once =====
-- The booking plays create_booking: it starts past its first state and holds the combo's seats taken above.
select set_config('app.in_rpc', '1', true);
insert into public.bookings (id, booking_code, status, package_id, package_snapshot, rw_ids, booker_type, pic_name,
  pic_phone, pic_email, pax_count, visit_date, visit_date_end, subtotal_package, total_amount, consent_version,
  consented_at, expires_at)
values ('00000000-0000-4000-9000-000000000421', 'GSK-K0TA0021', 'pending_payment', '00000000-0000-4000-9000-000000000401',
        '{}', '{5,8}', 'school', 'Bu Wati', '+6281234560421', 'wati@example.test', 2, public.today_jkt() + 51,
        public.today_jkt() + 51, 50000, 50000, 'v1', now(), now() + interval '2 hours');
insert into public.booking_legs (booking_id, rw_id, visit_session_id, leg_order, pax_count, status, quota_reserved_at) values
  ('00000000-0000-4000-9000-000000000421', 5, '00000000-0000-4000-9000-000000000412', 1, 2, 'reserved', now()),
  ('00000000-0000-4000-9000-000000000421', 8, '00000000-0000-4000-9000-000000000413', 2, 2, 'reserved', now());
select set_config('app.in_rpc', '', true);

select internal.release_booking_quota('00000000-0000-4000-9000-000000000421');
select is(
  pg_temp.reserved('00000000-0000-4000-9000-000000000412') || '/' || pg_temp.reserved('00000000-0000-4000-9000-000000000413'),
  '0/8',
  'releasing a combo gives back the seats of both legs'
);
select internal.release_booking_quota('00000000-0000-4000-9000-000000000421');
select internal.release_booking_quota('00000000-0000-4000-9000-000000000421');
select is(
  pg_temp.reserved('00000000-0000-4000-9000-000000000412') || '/' || pg_temp.reserved('00000000-0000-4000-9000-000000000413'),
  '0/8',
  'and releasing it again, by a late webhook or a retried job, changes nothing'
);
select is(
  (select string_agg(status::text || ':' || (quota_released_at is not null), ' ' order by leg_order)
   from public.booking_legs where booking_id = '00000000-0000-4000-9000-000000000421'),
  'released:true released:true',
  'each leg is stamped released once'
);

-- ===== A lapsed hold gives its seats back after the grace period =====
select set_config('app.in_rpc', '1', true);
insert into public.bookings (id, booking_code, status, package_id, package_snapshot, rw_ids, booker_type, pic_name,
  pic_phone, pic_email, pax_count, visit_date, visit_date_end, subtotal_package, total_amount, consent_version,
  consented_at, expires_at)
select id::uuid, code, 'pending_payment', '00000000-0000-4000-9000-000000000401', '{}', '{5}', 'school', 'Guru Uji',
       phone, code || '@example.test', 3, public.today_jkt() + 53, public.today_jkt() + 53, 75000, 75000, 'v1', now(),
       expires
from (values
  ('00000000-0000-4000-9000-000000000431', 'GSK-K0TA0031', '+6281234560431', now() - interval '4 minutes'),
  ('00000000-0000-4000-9000-000000000432', 'GSK-K0TA0032', '+6281234560432', now() - interval '6 minutes')
) as hold(id, code, phone, expires);
insert into public.booking_legs (booking_id, rw_id, visit_session_id, leg_order, pax_count, status, quota_reserved_at)
select id, 5, '00000000-0000-4000-9000-000000000415', 1, 3, 'reserved', now()
from (values ('00000000-0000-4000-9000-000000000431'::uuid), ('00000000-0000-4000-9000-000000000432'::uuid)) as hold(id);
select set_config('app.in_rpc', '', true);
select internal.reserve_session_quota('00000000-0000-4000-9000-000000000415', 3);
select internal.reserve_session_quota('00000000-0000-4000-9000-000000000415', 3);

select internal.expire_stale_bookings();
select set_config('app.in_rpc', '', true), set_config('app.actor_role', '', true);
select is(
  (select string_agg(booking_code || '=' || status, ' ' order by booking_code) from public.bookings
   where id in ('00000000-0000-4000-9000-000000000431', '00000000-0000-4000-9000-000000000432')),
  'GSK-K0TA0031=pending_payment GSK-K0TA0032=expired',
  'a hold six minutes past its deadline expires; one four minutes past still has its five-minute grace'
);
select is(
  pg_temp.reserved('00000000-0000-4000-9000-000000000415'),
  3,
  'the expired hold gives its three seats back, the other keeps its own'
);
select is(
  (select reason from public.booking_events
   where booking_id = '00000000-0000-4000-9000-000000000432' and to_status = 'expired'),
  'hold_lapsed',
  'and the expiry lands in the booking timeline'
);

-- Once its grace has passed too, the second hold goes the same way. A deadline is written once
-- (bookings_hold_deadline_guard), so moving it back in time takes the flag a hold extension sets.
select set_config('app.hold_extension', '1', true);
update public.bookings set expires_at = now() - interval '6 minutes' where id = '00000000-0000-4000-9000-000000000431';
select set_config('app.hold_extension', '', true);
select internal.expire_stale_bookings();
select set_config('app.in_rpc', '', true), set_config('app.actor_role', '', true);
select is(
  pg_temp.reserved('00000000-0000-4000-9000-000000000415'),
  0,
  'after its grace the last hold expires and the session is whole again'
);
select is(
  (select remaining from public.v_session_availability where id = '00000000-0000-4000-9000-000000000415'),
  10,
  'so the calendar offers all ten seats again'
);

select * from finish();
rollback;
