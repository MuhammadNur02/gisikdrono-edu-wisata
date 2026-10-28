-- Follow-ups of PR #102 (20261105100000_review_waits_for_resolution.sql, 20261105100100_manual_payment_under_lock.sql,
-- 20261105100200_staff_hold_and_link_caps.sql): a booking under review waits for its resolution, a move takes only the
-- sessions a booking of its package could take, a transfer's terms are checked again under the booking's lock and its
-- open-order refusal comes last, an officer's hold without a sent link is flagged after a grace, the pay link and the
-- resends are capped, a web hold is extended at most until an hour before its session, and the staff RPCs write no
-- status column themselves.
begin;
select plan(31);
\ir helpers/rls_personas.psql
select set_config('app.qr_key_id', 'k1', true);

-- ===== Fixtures =====
insert into public.tour_packages (id, rw_id, category, slug, name, pricing_basis, price_per_pax, status, valid_to)
values
  ('00000000-0000-4000-8000-0000000af001', 5, 'regular', 'uji-ikut-paket', 'Paket Ikutan', 'per_pax', 30000,
   'published', null),
  ('00000000-0000-4000-8000-0000000af003', 5, 'regular', 'uji-ikut-singkat', 'Paket Ikutan Singkat', 'per_pax', 30000,
   'published', public.today_jkt() + 4);
insert into public.visit_sessions (id, rw_id, session_date, start_time, end_time, label, capacity) values
  ('00000000-0000-4000-8000-0000000af205', 5, public.today_jkt() + 3, '09:00', '10:00', 'Ikut penuh', 2),
  ('00000000-0000-4000-8000-0000000af206', 5, public.today_jkt() + 5, '09:00', '10:00', 'Ikut lapang', 20),
  ('00000000-0000-4000-8000-0000000af207', 5, public.today_jkt() + 6, '09:00', '10:00', 'Ikut lain', 20),
  ('00000000-0000-4000-8000-0000000af305', 5, public.today_jkt() + 3, '13:00', '14:00', 'Ikut singkat', 1),
  ('00000000-0000-4000-8000-0000000af405', 5, public.today_jkt() + 3, '15:00', '16:00', 'Ikut kembali', 1),
  ('00000000-0000-4000-8000-0000000af307', 5, public.today_jkt() + 4, '09:00', '10:00', 'Ikut singkat lapang', 20);

insert into auth.users (id, email) values ('00000000-0000-4000-8000-00000000f002', 'rls-super-b@example.test');
insert into public.profiles (id, email, full_name, role, rw_id) values
  ('00000000-0000-4000-8000-00000000f002', 'rls-super-b@example.test', 'Super B', 'superadmin', null);
update public.profiles set created_at = now() - interval '40 days'
where id in ('00000000-0000-4000-8000-00000000f001', '00000000-0000-4000-8000-00000000f002');
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at) values
  (gen_random_uuid(), '00000000-0000-4000-8000-00000000f001', 'uji-a', 'totp', 'verified', now() - interval '39 days',
   now()),
  (gen_random_uuid(), '00000000-0000-4000-8000-00000000f002', 'uji-b', 'totp', 'verified', now() - interval '39 days',
   now());

create function pg_temp.act_as_super_b() returns void
  language plpgsql
as $$
declare
  user_id uuid := '00000000-0000-4000-8000-00000000f002';
  verified_at bigint := extract(epoch from now())::bigint - 60;
begin
  perform set_config('request.jwt.claims', (jsonb_build_object(
      'iss', 'supabase', 'aud', 'authenticated', 'sub', user_id, 'role', 'authenticated',
      'email', 'rls-super-b@example.test', 'session_id', gen_random_uuid(), 'is_anonymous', false, 'aal', 'aal2',
      'amr', jsonb_build_array(jsonb_build_object('method', 'totp', 'timestamp', verified_at),
                               jsonb_build_object('method', 'password', 'timestamp', verified_at - 60)))
    || internal.staff_token_claims(user_id))::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;

create function pg_temp.doc(p_path text) returns text
  language plpgsql security definer
as $$
begin
  insert into storage.objects (bucket_id, name) values ('documents', p_path) on conflict do nothing;
  return p_path;
end;
$$;
grant execute on function pg_temp.doc(text) to authenticated;

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

-- The hint of the last of p_times runs of a statement, or null when every run went through.
create function pg_temp.hint_after(p_sql text, p_times integer) returns text
  language plpgsql
as $$
declare
  last_hint text;
begin
  for run in 1..p_times loop
    last_hint := pg_temp.hint_of(p_sql);
  end loop;
  return last_hint;
end;
$$;
grant execute on function pg_temp.hint_after(text, integer) to authenticated;

-- An officer's booking of RW 05, as create_admin_booking makes it.
create function pg_temp.book(p_package uuid, p_session uuid, p_pax integer, p_key text) returns uuid
  language sql
as $$
  select (internal.create_booking(p_package, array[p_session], p_pax,
    jsonb_build_object('booker_type', 'individual', 'institution_name', null, 'pic_name', 'Sari Ikut',
                       'pic_phone', '+6281300006' || right(p_key, 3), 'pic_email', 'ikut-' || p_key || '@example.test',
                       'notes', null, 'admin', jsonb_build_object('phone_confirmed', true, 'cash_on_the_spot', false)),
    '[]', '[]', 'pay', 'admin', p_key, null,
    jsonb_build_object('version', '2026-10-18', 'attested_by', '00000000-0000-4000-8000-00000000f005'),
    '00000000-0000-4000-8000-00000000f005', '{}',
    internal.booking_quote_hash(internal.booking_quote(p_package, p_pax, '[]', '{5}')))
    ->> 'booking_id')::uuid;
$$;

create function pg_temp.expire(p_booking uuid) returns void
  language sql
as $$
  select set_config('app.hold_extension', '1', true), set_config('app.in_rpc', '1', true);
  update public.bookings set expires_at = now() - interval '10 minutes' where id = p_booking;
  select set_config('app.hold_extension', '', true), set_config('app.in_rpc', '', true);
  select internal.expire_stale_bookings();
$$;

-- A Midtrans settlement arriving after the hold lapsed and its seats went to another group.
create function pg_temp.settle_late(p_booking uuid) returns jsonb
  language plpgsql
as $$
declare
  payment public.payments;
  answer jsonb;
begin
  perform set_config('app.in_rpc', '1', true);
  insert into public.payments (booking_id, attempt_no, provider, method, status, order_id, gross_amount,
    transaction_time)
  select b.id, attempt.next, 'midtrans', 'qris', 'pending', b.booking_code || '-' || lpad(attempt.next::text, 2, '0'),
         b.total_amount, now()
  from public.bookings b
  cross join lateral (select coalesce(max(p.attempt_no), 0) + 1 as next from public.payments p
                      where p.booking_id = b.id) as attempt
  where b.id = p_booking
  returning * into payment;
  answer := internal.settle_payment((select b from public.bookings b where b.id = p_booking), payment,
                                    '{"transaction_status": "settlement"}', 'webhook');
  perform set_config('app.in_rpc', '', true);
  return answer;
end;
$$;

-- A transfer the superadmin proposes and the second superadmin approves, its id answered.
create function pg_temp.approved_transfer(p_booking uuid) returns uuid
  language plpgsql
as $$
declare
  adjustment_id uuid;
begin
  perform pg_temp.act_as('superadmin_aal2');
  adjustment_id := (public.propose_adjustment('manual_mark_paid', p_booking, 30000,
    'Transfer BCA dari bendahara sekolah',
    pg_temp.doc(format('bookings/%s/adjustment-%s.pdf', p_booking, gen_random_uuid())), '{"key_id": "k1"}')
    ->> 'id')::uuid;
  reset role;
  perform pg_temp.act_as_super_b();
  perform public.approve_adjustment(adjustment_id);
  reset role;
  perform set_config('request.jwt.claims', '', true);
  return adjustment_id;
end;
$$;

create temporary table booking (name text primary key, id uuid) on commit drop;
grant select on booking to authenticated;
insert into booking values ('waiting', pg_temp.book('00000000-0000-4000-8000-0000000af001',
                                                    '00000000-0000-4000-8000-0000000af205', 2, 'iku-001'));
select pg_temp.expire((select id from booking where name = 'waiting'));
insert into booking values ('filler', pg_temp.book('00000000-0000-4000-8000-0000000af001',
                                                   '00000000-0000-4000-8000-0000000af205', 2, 'iku-002'));
select pg_temp.settle_late((select id from booking where name = 'waiting'));
insert into booking values ('short', pg_temp.book('00000000-0000-4000-8000-0000000af003',
                                                  '00000000-0000-4000-8000-0000000af305', 1, 'iku-003'));
select pg_temp.expire((select id from booking where name = 'short'));
insert into booking values ('short_filler', pg_temp.book('00000000-0000-4000-8000-0000000af003',
                                                         '00000000-0000-4000-8000-0000000af305', 1, 'iku-004'));
select pg_temp.settle_late((select id from booking where name = 'short'));
insert into booking values ('late_refund', pg_temp.book('00000000-0000-4000-8000-0000000af001',
                                                        '00000000-0000-4000-8000-0000000af405', 1, 'iku-008'));
select pg_temp.expire((select id from booking where name = 'late_refund'));
insert into booking values ('late_filler', pg_temp.book('00000000-0000-4000-8000-0000000af001',
                                                        '00000000-0000-4000-8000-0000000af405', 1, 'iku-009'));
select pg_temp.settle_late((select id from booking where name = 'late_refund'));
insert into booking values
  ('no_show', pg_temp.book('00000000-0000-4000-8000-0000000af001', '00000000-0000-4000-8000-0000000af206', 1,
                           'iku-005')),
  ('paid_past', pg_temp.book('00000000-0000-4000-8000-0000000af001', '00000000-0000-4000-8000-0000000af206', 1,
                             'iku-010')),
  ('raced', pg_temp.book('00000000-0000-4000-8000-0000000af001', '00000000-0000-4000-8000-0000000af206', 1,
                         'iku-006')),
  ('under_review', pg_temp.book('00000000-0000-4000-8000-0000000af001', '00000000-0000-4000-8000-0000000af206', 1,
                                'iku-007'));
select is((select string_agg(review_reason, ',' order by review_reason) from public.bookings
           where id in (select id from booking where name in ('waiting', 'short'))),
  'PAID_AFTER_EXPIRY_NO_QUOTA,PAID_AFTER_EXPIRY_NO_QUOTA', 'two bookings were paid after their seats were gone');

-- ===== 1: close_past_bookings leaves a booking under review for its resolution =====
select pg_temp.act_as('admin_rw_05');
select public.mark_booking_paid_manually((select id from booking where name = 'no_show'), 'cash', 30000, 'k1');
select public.mark_booking_paid_manually((select id from booking where name = 'paid_past'), 'cash', 30000, 'k1');
reset role;
select set_config('request.jwt.claims', '', true);
select set_config('app.in_rpc', '1', true);
update public.bookings set visit_date = public.today_jkt() - 1, visit_date_end = public.today_jkt() - 1
where id in (select id from booking where name in ('waiting', 'no_show', 'late_refund'));
select set_config('app.in_rpc', '', true);
select internal.close_past_bookings();
select is((select (status, needs_review)::text from public.bookings where id = (select id from booking where name = 'waiting')),
  '(paid,t)', 'a booking paid after its seats were gone is no no_show when its old day passes: it waits for review');
select is((select status::text from public.bookings where id = (select id from booking where name = 'no_show')),
  'no_show', 'a paid booking nobody came for still closes as no_show');
select pg_temp.act_as('superadmin_aal2');
select is((public.resolve_booking_review((select id from booking where name = 'waiting'), 'move',
    'Pindah ke sesi lain yang masih kosong', array['00000000-0000-4000-8000-0000000af207']::uuid[], 'k1'))
    ->> 'result', 'moved', 'and the superadmin can still move it');
reset role;
select set_config('request.jwt.claims', '', true);
select is((select (status, needs_review, visit_date - public.today_jkt())::text from public.bookings
           where id = (select id from booking where name = 'waiting')),
  '(paid,f,6)', 'to its new day, out of review');
-- Decision of 2026-10-29: such a booking never held a seat, so L8 (no refund once the visit date passed) does not
-- hold for it; a normal paid booking past its day keeps L8.
select set_config('app.in_rpc', '1', true);
update public.bookings set visit_date = public.today_jkt() - 1, visit_date_end = public.today_jkt() - 1
where id = (select id from booking where name = 'paid_past');
select set_config('app.in_rpc', '', true);
select pg_temp.act_as('superadmin_aal2');
select is((public.resolve_booking_review((select id from booking where name = 'late_refund'), 'refund',
    'Sesi penuh, uang dikembalikan utuh', null, null)) ->> 'result', 'cancelled',
  '1: a booking paid after its seats were gone is refunded after its old day too');
select is(pg_temp.hint_of($$select public.cancellation_preview((select id from booking where name = 'paid_past'),
    'kelurahan')$$), 'STATE_INVALID', 'L8: a normal paid booking past its visit date gets no full refund preview');
select is(pg_temp.hint_of($$select public.cancel_booking((select id from booking where name = 'paid_past'),
    'Dibatalkan kelurahan', 30000, 100::smallint, 'kelurahan')$$), 'STATE_INVALID',
  'nor a full refund through cancel_booking');
reset role;
select set_config('request.jwt.claims', '', true);
select is((select (amount, refund_pct)::text from public.refund_requests
           where booking_id = (select id from booking where name = 'late_refund')),
  '(30000,100)', 'the whole payment is to go back, as before the date');

-- ===== 4: a move takes only the sessions a booking of its package could take =====
select pg_temp.act_as('superadmin_aal2');
select is(pg_temp.hint_of($$select public.resolve_booking_review((select id from booking where name = 'short'), 'move',
    'Pindah ke sesi lain yang masih kosong', array['00000000-0000-4000-8000-0000000af206']::uuid[], 'k1')$$),
  'STATE_INVALID', 'a leg moves to no day after the package''s valid_to');
reset role;
select set_config('request.jwt.claims', '', true);
update public.rw_units set is_active = false where id = 5;
select pg_temp.act_as('superadmin_aal2');
select is(pg_temp.hint_of($$select public.resolve_booking_review((select id from booking where name = 'short'), 'move',
    'Pindah ke sesi lain yang masih kosong', array['00000000-0000-4000-8000-0000000af307']::uuid[], 'k1')$$),
  'STATE_INVALID', 'nor to a session of an RW that is not online');
reset role;
select set_config('request.jwt.claims', '', true);
update public.rw_units set is_active = true where id = 5;
select is((select reserved_pax from public.visit_sessions where id = '00000000-0000-4000-8000-0000000af307'), 0,
  'a refused move reserves nothing');
select pg_temp.act_as('superadmin_aal2');
select is((public.resolve_booking_review((select id from booking where name = 'short'), 'move',
    'Pindah ke sesi lain yang masih kosong', array['00000000-0000-4000-8000-0000000af307']::uuid[], 'k1'))
    ->> 'result', 'moved', 'inside the package''s days and with the RW online, it moves');
reset role;
select set_config('request.jwt.claims', '', true);

-- ===== 3 and 2: a transfer's terms under the booking's lock, and its open-order refusal last =====
create temporary table transfer (name text primary key, id uuid) on commit drop;
grant select on transfer to authenticated;
insert into transfer values ('raced', pg_temp.approved_transfer((select id from booking where name = 'raced'))),
  ('under_review', pg_temp.approved_transfer((select id from booking where name = 'under_review')));
-- The cash comes in between the transfer's approval and its apply.
select pg_temp.act_as('admin_rw_05');
select public.mark_booking_paid_manually((select id from booking where name = 'raced'), 'cash', 30000, 'k1');
reset role;
select set_config('request.jwt.claims', '', true);
select is(pg_temp.hint_of($$select internal.apply_manual_transfer((select a from public.payment_adjustments a
    where a.id = (select id from transfer where name = 'raced')))$$),
  'STATE_INVALID', '3: the transfer checks the booking again under its lock, which a payment settled meanwhile');
select is((select count(*)::int from public.payments where booking_id = (select id from booking where name = 'raced')),
  1, 'so no second payment is opened');
select set_config('app.in_rpc', '1', true);
insert into public.payments (booking_id, attempt_no, provider, method, status, order_id, gross_amount)
select b.id, 1, 'midtrans', 'qris', 'pending', b.booking_code || '-01', b.total_amount
from public.bookings b where b.id = (select id from booking where name = 'under_review');
update public.bookings set needs_review = true, review_reason = 'AMOUNT_MISMATCH'
where id = (select id from booking where name = 'under_review');
select set_config('app.in_rpc', '', true);
select pg_temp.act_as('superadmin_aal2');
select is(pg_temp.hint_of($$select public.apply_adjustment((select id from transfer where name = 'under_review'))$$),
  'STATE_INVALID', '2: a transfer refused on its terms says so before the open order, which the server then leaves open');
reset role;
select set_config('app.in_rpc', '1', true);
update public.bookings set needs_review = false, review_reason = null
where id = (select id from booking where name = 'under_review');
select set_config('app.in_rpc', '', true);
select pg_temp.act_as('superadmin_aal2');
select is(pg_temp.hint_of($$select public.apply_adjustment((select id from transfer where name = 'under_review'))$$),
  'PAYMENT_OPEN', 'with nothing else in the way, the open order is what refuses it');
reset role;
select set_config('request.jwt.claims', '', true);

-- ===== 5: admin_hold_without_link after its grace, until a link message was sent =====
select set_config('app.in_rpc', '1', true);
insert into public.bookings (booking_code, status, channel, package_id, package_snapshot, rw_ids, booker_type,
  pic_name, pic_phone, pic_email, pax_count, visit_date, visit_date_end, subtotal_package, total_amount,
  consent_version, consented_at, expires_at, created_by, created_at)
values
  ('GSK-FWP0BARA', 'pending_payment', 'admin', '00000000-0000-4000-8000-0000000af001', '{}', '{5}', 'individual',
   'Baru', '+447700900141', 'iku-baru@example.test', 1, public.today_jkt() + 1, public.today_jkt() + 1, 30000, 30000,
   'v1', now(), now() + interval '1 day', '00000000-0000-4000-8000-00000000f005', now() - interval '10 minutes'),
  ('GSK-FWP0ANTR', 'pending_payment', 'admin', '00000000-0000-4000-8000-0000000af001', '{}', '{5}', 'individual',
   'Antre', '+447700900142', 'iku-antr@example.test', 1, public.today_jkt() + 1, public.today_jkt() + 1, 30000, 30000,
   'v1', now(), now() + interval '1 day', '00000000-0000-4000-8000-00000000f005', now() - interval '40 minutes'),
  ('GSK-FWP0GAGA', 'pending_payment', 'admin', '00000000-0000-4000-8000-0000000af001', '{}', '{5}', 'individual',
   'Gagal', '+447700900143', 'iku-gagl@example.test', 1, public.today_jkt() + 5, public.today_jkt() + 5, 30000, 30000,
   'v1', now(), now() + interval '1 day', '00000000-0000-4000-8000-00000000f005', now() - interval '4 hours');
insert into public.notifications (booking_id, channel, template, recipient, dedupe_key, status, last_error_code)
select b.id, 'email', 'booking_created', b.pic_email, 'booking:' || b.id || ':booking_created:email:',
       case when b.booking_code = 'GSK-FWP0ANTR' then 'queued' else 'failed' end::public.notification_status,
       case when b.booking_code = 'GSK-FWP0GAGA' then 'provider_rejected' end
from public.bookings b where b.booking_code in ('GSK-FWP0ANTR', 'GSK-FWP0GAGA');
select set_config('app.in_rpc', '', true);
select internal.payments_housekeeping();
select ok(not exists (select 1 from public.security_alerts a join public.bookings b
                      on a.fingerprint = 'admin_hold_without_link:' || b.id
                      where b.booking_code = 'GSK-FWP0BARA'),
  '5: an officer''s hold made ten minutes ago for tomorrow is not flagged yet, the officer may still take the cash');
select ok(exists (select 1 from public.security_alerts a join public.bookings b
                  on a.fingerprint = 'admin_hold_without_link:' || b.id
                  where b.booking_code = 'GSK-FWP0ANTR' and a.acknowledged_at is null),
  'past the grace, a link still queued is no link sent: the hold is flagged');
select ok(exists (select 1 from public.security_alerts a join public.bookings b
                  on a.fingerprint = 'admin_hold_without_link:' || b.id
                  where b.booking_code = 'GSK-FWP0GAGA' and a.acknowledged_at is null),
  'nor is a link whose message failed');
select set_config('app.in_rpc', '1', true);
insert into public.notifications (booking_id, channel, template, recipient, dedupe_key, status, sent_at)
select b.id, 'email', 'booking_created', b.pic_email, 'booking:' || b.id || ':booking_created:email:sent', 'sent',
       now()
from public.bookings b where b.booking_code = 'GSK-FWP0ANTR';
select set_config('app.in_rpc', '', true);
select internal.payments_housekeeping();
select is((select a.details ->> 'closed' from public.security_alerts a join public.bookings b
           on a.fingerprint = 'admin_hold_without_link:' || b.id
           where b.booking_code = 'GSK-FWP0ANTR' and a.acknowledged_at is not null),
  'link_sent_or_settled', 'the alert closes once the link''s message was sent');
select ok(exists (select 1 from public.security_alerts a join public.bookings b
                  on a.fingerprint = 'admin_hold_without_link:' || b.id
                  where b.booking_code = 'GSK-FWP0GAGA' and a.acknowledged_at is null),
  'while the one whose link failed stays open');

-- ===== 6: the pay link and the resends are capped =====
create temporary table capped on commit drop as
  select id from public.bookings where booking_code = 'GSK-FWP0BARA';
grant select on capped to authenticated;
select pg_temp.act_as('admin_rw_05');
select is(pg_temp.hint_after($$select public.send_admin_booking_link((select id from capped))$$, 5), null,
  '6: an officer asks for a booking''s pay link five times an hour');
select is(pg_temp.hint_of($$select public.send_admin_booking_link((select id from capped))$$), 'RATE_LIMITED',
  'and the sixth is refused as too many');
select is(pg_temp.hint_after($$select public.request_notification_resend((select id from booking where name = 'raced'),
    'payment_received_ticket', 'email')$$, 10), null, 'a booking''s message is sent again ten times a day');
select is(pg_temp.hint_of($$select public.request_notification_resend((select id from booking where name = 'raced'),
    'payment_received_ticket', 'email')$$), 'RATE_LIMITED', 'and the eleventh resend is refused');
reset role;
select set_config('request.jwt.claims', '', true);
select is((select count(*)::int from public.audit_logs where action = 'notifications.resend'
           and entity_id = (select id::text from booking where name = 'raced')), 10,
  'only the resends that went out are audited');

-- ===== 7: a web hold is extended until an hour before its first session at the latest =====
select set_config('app.in_rpc', '1', true);
insert into public.bookings (booking_code, status, channel, package_id, package_snapshot, rw_ids, booker_type,
  pic_name, pic_phone, pic_email, pax_count, visit_date, visit_date_end, subtotal_package, total_amount,
  consent_version, consented_at, phone_verified_at, expires_at)
values ('GSK-FWP0WEBB', 'pending_payment', 'web', '00000000-0000-4000-8000-0000000af001', '{}', '{5}', 'individual',
        'Web', '+6281300006901', 'iku-webb@example.test', 1, public.today_jkt() + 5, public.today_jkt() + 5, 30000,
        30000, 'v1', now(), now(), now() + interval '1 hour');
insert into public.booking_legs (booking_id, rw_id, visit_session_id, leg_order, pax_count, status, quota_reserved_at)
select b.id, 5, '00000000-0000-4000-8000-0000000af206', 1, 1, 'reserved', now()
from public.bookings b where b.booking_code = 'GSK-FWP0WEBB';
select set_config('app.in_rpc', '', true);
create temporary table web_hold on commit drop as
  select b.id, ((public.today_jkt() + 5) + time '09:00') at time zone 'Asia/Jakarta' as first_start
  from public.bookings b where b.booking_code = 'GSK-FWP0WEBB';
grant select on web_hold to authenticated;
select pg_temp.act_as('admin_rw_05');
select throws_ok($$select public.extend_booking_hold((select id from web_hold),
    (select first_start from web_hold) - interval '30 minutes')$$,
  '22023', null, '7: a web hold runs no later than an hour before its first session');
select lives_ok($$select public.extend_booking_hold((select id from web_hold),
    (select first_start from web_hold) - interval '1 hour')$$, 'up to that hour, as a new web hold would');
reset role;
select set_config('request.jwt.claims', '', true);

-- ===== 8: the staff RPCs of PR #102 write no status column themselves =====
select is(array(
    select p.proname::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('cancel_booking', 'extend_booking_hold', 'reactivate_booking', 'request_notification_resend',
                        'resolve_booking_review', 'send_admin_booking_link', 'mark_booking_paid_manually',
                        'propose_adjustment', 'approve_adjustment', 'apply_adjustment', 'create_admin_booking')
      and (p.prosrc ~* 'update\s+public\.(bookings|payments|tickets_qr|certificates)\s+(\w+\s+)?set[^;]*\mstatus\M'
           or p.prosrc ~* 'insert\s+into\s+public\.(payments|tickets_qr|certificates)\M')
    order by 1),
  array[]::text[], '8: status columns move only inside internal.* functions');
select ok(not has_function_privilege('authenticated',
            'internal.open_manual_payment(public.bookings, public.payment_method, text, text, uuid)', 'execute')
          and not has_function_privilege('authenticated',
            'internal.reactivate_hold(public.bookings, timestamptz, uuid)', 'execute')
          and not has_function_privilege('authenticated',
            'internal.move_booking_under_review(public.bookings, uuid[])', 'execute')
          and not has_function_privilege('authenticated',
            'internal.refund_booking_under_review(public.bookings, uuid, text)', 'execute'),
  'and those functions are no API role''s');

select * from finish();
rollback;
