-- Follow-ups of PR #91 (c), on times pinned to now() rather than the hour of the run: the 24-hour page expiry of an
-- officer's long hold, cash taken after a session's check-in window (an audited cash_after_session override), and a
-- Midtrans settlement arriving after the cash, which is a duplicate.
begin;
select plan(6);
\ir helpers/rls_personas.psql
select set_config('app.qr_key_id', 'k1', true);

-- ===== Fixtures: an RW 05 package, a session that ended a minute ago, and two officer holds =====
insert into public.tour_packages (id, rw_id, category, slug, name, pricing_basis, price_per_pax, status) values
  ('00000000-0000-4000-8000-0000000af001', 5, 'regular', 'uji-tunai-lanjut', 'Paket Tunai', 'per_pax', 30000,
   'published');
create temporary table just_ended on commit drop as
  select (now() - interval '3 minutes') at time zone 'Asia/Jakarta' as starts_local,
         (now() - interval '1 minute') at time zone 'Asia/Jakarta' as ends_local;
-- The window closes as the session ends, so the cash comes after it.
update public.site_settings set value = to_jsonb(0) where key = 'checkin.grace_after_minutes';
insert into public.visit_sessions (id, rw_id, session_date, start_time, end_time, label, capacity)
select '00000000-0000-4000-8000-0000000af205', 5, starts_local::date, starts_local::time(0), ends_local::time(0),
       'Baru selesai', 10
from just_ended where starts_local::date = ends_local::date and ends_local::date = public.today_jkt();

select set_config('app.in_rpc', '1', true);
insert into public.bookings (booking_code, status, channel, package_id, package_snapshot, rw_ids, booker_type,
  pic_name, pic_phone, pic_email, pax_count, visit_date, visit_date_end, subtotal_package, total_amount,
  consent_version, consented_at, phone_verified_at, expires_at, created_by)
values
  ('GSK-TNA0PNJG', 'pending_payment', 'admin', '00000000-0000-4000-8000-0000000af001', '{}', '{5}', 'individual',
   'Panjang', '+6281300006601', 'tna-pnjg@example.test', 1, public.today_jkt() + 5, public.today_jkt() + 5, 30000,
   30000, 'v1', now(), now(), now() + interval '3 days', '00000000-0000-4000-8000-00000000f005'),
  ('GSK-TNA0TEKT', 'pending_payment', 'admin', '00000000-0000-4000-8000-0000000af001', '{}', '{5}', 'individual',
   'Telat', '+6281300006602', 'tna-telt@example.test', 2, public.today_jkt(), public.today_jkt(), 60000, 60000, 'v1',
   now(), now(), now() + interval '2 hours', '00000000-0000-4000-8000-00000000f005');
insert into public.booking_legs (booking_id, rw_id, visit_session_id, leg_order, pax_count, status, quota_reserved_at)
select b.id, 5, '00000000-0000-4000-8000-0000000af205', 1, 2, 'reserved', now()
from public.bookings b
where b.booking_code = 'GSK-TNA0TEKT'
  and exists (select 1 from public.visit_sessions where id = '00000000-0000-4000-8000-0000000af205');
select set_config('app.in_rpc', '', true);

-- ===== M-A: an officer's hold of three days opens a Snap page of 24 hours =====
select internal.create_payment_attempt((select id from public.bookings where booking_code = 'GSK-TNA0PNJG'), null,
                                       '00000000-0000-4000-8000-00000000f005');
select ok((select expiry_time between now() + interval '24 hours' - interval '1 minute'
                                  and now() + interval '24 hours' + interval '1 minute'
           from public.payments p join public.bookings b on b.id = p.booking_id
           where b.booking_code = 'GSK-TNA0PNJG'),
  'the attempt''s page expires in 24 hours, not when the three-day hold does');

-- ===== L-A: cash after the session's window is an audited override =====
select pg_temp.act_as('admin_rw_05');
create temporary table late_cash on commit drop as
  select public.mark_booking_paid_manually(b.id, 'cash', 60000, 'k1', 'Kuitansi 009', null, 2) as answer
  from public.bookings b
  where b.booking_code = 'GSK-TNA0TEKT'
    and exists (select 1 from public.booking_legs l where l.booking_id = b.id);
reset role;
select set_config('request.jwt.claims', '', true);
select case when exists (select 1 from late_cash)
  then is((select answer ->> 'result' from late_cash), 'applied',
          'cash after the check-in window, before 23:59 WIB, is taken and the group checked in')
  else skip('the Jakarta day is a minute old, so no session of today has ended yet', 1) end;
select case when exists (select 1 from late_cash)
  then is((select (t.status, t.checked_in_pax)::text from public.tickets_qr t join public.bookings b on b.id = t.booking_id
           where b.booking_code = 'GSK-TNA0TEKT'), '(used,2)', 'its ticket is used, with the count')
  else skip('the Jakarta day is a minute old, so no session of today has ended yet', 1) end;
select case when exists (select 1 from late_cash)
  then ok(exists (select 1 from public.audit_logs a join public.tickets_qr t on a.entity_id = t.id::text
                  join public.bookings b on b.id = t.booking_id
                  where b.booking_code = 'GSK-TNA0TEKT' and a.action = 'check_in_override'
                    and a.metadata ->> 'overridden' = 'outside_window'
                    and a.metadata ->> 'reason' = 'cash_after_session'),
          'audited as a check_in_override outside the window, with the reason cash_after_session')
  else skip('the Jakarta day is a minute old, so no session of today has ended yet', 1) end;
select case when exists (select 1 from late_cash)
  then is((select s.override_reason from public.ticket_scans s join public.tickets_qr t on t.id = s.ticket_id
           join public.bookings b on b.id = t.booking_id
           where b.booking_code = 'GSK-TNA0TEKT' and s.phase = 'check_in'), 'cash_after_session',
          'and the scan row says so')
  else skip('the Jakarta day is a minute old, so no session of today has ended yet', 1) end;

-- ===== A Midtrans settlement after the cash is a duplicate =====
create temporary table late_midtrans on commit drop as select null::jsonb as answer;
do $$
declare
  payment public.payments;
begin
  if not exists (select 1 from late_cash) then
    return;
  end if;
  perform set_config('app.in_rpc', '1', true);
  insert into public.payments (booking_id, attempt_no, provider, method, status, order_id, gross_amount)
  select b.id, 9, 'midtrans', 'qris', 'pending', b.booking_code || '-09', b.total_amount
  from public.bookings b where b.booking_code = 'GSK-TNA0TEKT'
  returning * into payment;
  update late_midtrans set answer = internal.settle_payment(
    (select b from public.bookings b where b.booking_code = 'GSK-TNA0TEKT'), payment,
    '{"transaction_status": "settlement"}', 'webhook');
  perform set_config('app.in_rpc', '', true);
end;
$$;
select case when exists (select 1 from late_cash)
  then is((select answer ->> 'result' from late_midtrans), 'duplicate',
          'a Midtrans settlement after the cash is a duplicate, refunded rather than paid twice')
  else skip('the Jakarta day is a minute old, so no session of today has ended yet', 1) end;

select * from finish();
rollback;
