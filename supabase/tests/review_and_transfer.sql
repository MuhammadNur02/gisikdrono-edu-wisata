-- Task P4.3.08, the rest (20261104220300_review_and_transfer.sql; docs/PRD.md §13.1 A28): the superadmin resolves a
-- booking paid after its seats were gone, by moving it or refunding it in full, and records a bank transfer as a
-- manual_mark_paid adjustment under dual control.
begin;
select plan(27);
\ir helpers/rls_personas.psql
select set_config('app.qr_key_id', 'k1', true);

-- ===== Fixtures: an RW 05 package, a small session, a later one, and the second superadmin =====
insert into public.tour_packages (id, rw_id, category, slug, name, pricing_basis, price_per_pax, status) values
  ('00000000-0000-4000-8000-0000000ae001', 5, 'regular', 'uji-tinjau-paket', 'Paket Tinjau', 'per_pax', 30000,
   'published');
insert into public.visit_sessions (id, rw_id, session_date, start_time, end_time, label, capacity) values
  ('00000000-0000-4000-8000-0000000ae205', 5, public.today_jkt() + 3, '09:00', '10:00', 'Tinjau penuh', 2),
  ('00000000-0000-4000-8000-0000000ae206', 5, public.today_jkt() + 5, '09:00', '10:00', 'Tinjau baru', 20),
  ('00000000-0000-4000-8000-0000000ae208', 8, public.today_jkt() + 5, '09:00', '10:00', 'Tinjau RW 08', 20);

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

create function pg_temp.book(p_session uuid, p_pax integer, p_key text) returns uuid
  language sql
as $$
  select (internal.create_booking('00000000-0000-4000-8000-0000000ae001', array[p_session], p_pax,
    jsonb_build_object('booker_type', 'individual', 'institution_name', null, 'pic_name', 'Sari Tinjau',
                       'pic_phone', '+6281300008' || right(p_key, 3), 'pic_email', 'tinjau-' || p_key || '@example.test',
                       'notes', null, 'admin', jsonb_build_object('phone_confirmed', false, 'cash_on_the_spot', false)),
    '[]', '[]', 'pay', 'admin', p_key, null,
    jsonb_build_object('version', '2026-10-18', 'attested_by', '00000000-0000-4000-8000-00000000f005'),
    '00000000-0000-4000-8000-00000000f005', '{}',
    internal.booking_quote_hash(internal.booking_quote('00000000-0000-4000-8000-0000000ae001', p_pax, '[]', '{5}')))
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
  insert into public.payments (booking_id, attempt_no, provider, method, status, order_id, gross_amount)
  select b.id, 1, 'midtrans', 'qris', 'pending', b.booking_code || '-01', b.total_amount
  from public.bookings b where b.id = p_booking
  returning * into payment;
  -- As apply_payment_event calls it: inside a transition, so the status columns may move.
  answer := internal.settle_payment((select b from public.bookings b where b.id = p_booking), payment,
                                    '{"transaction_status": "settlement"}', 'webhook');
  perform set_config('app.in_rpc', '', true);
  return answer;
end;
$$;

create temporary table booking (name text primary key, id uuid) on commit drop;
-- Each lapses in turn, its two seats free for the next; the last group keeps them.
insert into booking values ('moved', pg_temp.book('00000000-0000-4000-8000-0000000ae205', 2, 'tin-001'));
grant select on booking to authenticated;
select pg_temp.expire((select id from booking where name = 'moved'));
insert into booking values ('refunded', pg_temp.book('00000000-0000-4000-8000-0000000ae205', 2, 'tin-002'));
select pg_temp.expire((select id from booking where name = 'refunded'));
insert into booking values ('filler', pg_temp.book('00000000-0000-4000-8000-0000000ae205', 2, 'tin-003'));
select pg_temp.settle_late((select id from booking where name = 'moved'));
select pg_temp.settle_late((select id from booking where name = 'refunded'));

-- ===== resolve_booking_review =====
select is((select string_agg(review_reason, ',' order by review_reason) from public.bookings
           where id in (select id from booking where name in ('moved', 'refunded'))),
  'PAID_AFTER_EXPIRY_NO_QUOTA,PAID_AFTER_EXPIRY_NO_QUOTA', 'both bookings were paid after their seats were gone');

select pg_temp.act_as('admin_rw_05');
select throws_ok($$select public.resolve_booking_review((select id from booking where name = 'moved'), 'move',
    'Pindah ke sesi lain', array['00000000-0000-4000-8000-0000000ae206']::uuid[], 'k1')$$,
  '42501', null, 'an RW admin resolves no review');
reset role;
select pg_temp.act_as('superadmin_stale_totp');
select throws_ok($$select public.resolve_booking_review((select id from booking where name = 'moved'), 'move',
    'Pindah ke sesi lain', array['00000000-0000-4000-8000-0000000ae206']::uuid[], 'k1')$$,
  '42501', 'confirm with a fresh authenticator code first', 'nor the superadmin without a fresh code');
reset role;
select pg_temp.act_as('superadmin_aal2');
select throws_ok($$select public.resolve_booking_review((select id from booking where name = 'moved'), 'later',
    'Pindah ke sesi lain', null, null)$$,
  '22023', null, 'a resolution is a move or a refund');
select is(pg_temp.hint_of($$select public.resolve_booking_review((select id from booking where name = 'moved'),
    'move', 'Pindah ke sesi lain', array['00000000-0000-4000-8000-0000000ae206']::uuid[], 'k9')$$),
  'QR_KEY_UNKNOWN', 'a move signs its tickets with a listed key id');
select is(pg_temp.hint_of($$select public.resolve_booking_review((select id from booking where name = 'moved'),
    'move', 'Pindah ke sesi lain', array['00000000-0000-4000-8000-0000000ae208']::uuid[], 'k1')$$),
  'STATE_INVALID', 'a leg moves to a session of its own RW');
select is(pg_temp.hint_of($$select public.resolve_booking_review((select id from booking where name = 'moved'),
    'move', 'Pindah ke sesi lain', array['00000000-0000-4000-8000-0000000ae205']::uuid[], 'k1')$$),
  'QUOTA_UNAVAILABLE', 'and to one with room, or nothing moves');
select is((public.resolve_booking_review((select id from booking where name = 'moved'), 'move',
    'Pindah ke sesi lain yang masih kosong', array['00000000-0000-4000-8000-0000000ae206']::uuid[], 'k1'))
    ->> 'result', 'moved', 'A28 (a): the superadmin moves the booking and keeps the money');
select is((public.resolve_booking_review((select id from booking where name = 'refunded'), 'refund',
    'Sesi penuh, uang dikembalikan utuh', null, null)) ->> 'result', 'cancelled',
  'A28 (b): or gives the whole payment back');
select is(pg_temp.hint_of($$select public.resolve_booking_review((select id from booking where name = 'moved'),
    'refund', 'Sesi penuh, uang dikembalikan utuh', null, null)$$),
  'STATE_INVALID', 'once');
reset role;
select set_config('request.jwt.claims', '', true);

select is((select (status, needs_review, visit_date - public.today_jkt())::text from public.bookings
           where id = (select id from booking where name = 'moved')),
  '(paid,f,5)', 'the moved booking is paid, out of review, on its new day');
select is((select (l.status, l.visit_session_id)::text from public.booking_legs l
           where l.booking_id = (select id from booking where name = 'moved')),
  '(reserved,00000000-0000-4000-8000-0000000ae206)', 'its leg holds seats in the new session');
select is((select reserved_pax from public.visit_sessions where id = '00000000-0000-4000-8000-0000000ae206'), 2,
  'which counts them');
select is((select count(*)::int from public.tickets_qr
           where booking_id = (select id from booking where name = 'moved') and status = 'issued'), 1,
  'its ticket is issued');
select ok(exists (select 1 from public.notifications where booking_id = (select id from booking where name = 'moved')
                  and template = 'payment_received_ticket'), 'and goes to the PIC');
select is((select (amount, refund_pct)::text from public.refund_requests
           where booking_id = (select id from booking where name = 'refunded')),
  '(60000,100)', 'the refunded booking''s whole payment is to go back, with no visit-terms schedule');
select is((select status::text from public.bookings where id = (select id from booking where name = 'refunded')),
  'cancelled', 'and the booking is cancelled');
select is((select count(*)::int from public.audit_logs where action = 'bookings.review_resolved'
           and entity_id in (select id::text from booking where name in ('moved', 'refunded'))
           and actor_id = '00000000-0000-4000-8000-00000000f001'), 2, 'each resolution is audited');

-- ===== The manual transfer: propose, approve by another superadmin, apply =====
insert into booking values ('transfer', pg_temp.book('00000000-0000-4000-8000-0000000ae206', 1, 'tin-004'));
create temporary table proof on commit drop as
  select pg_temp.doc(format('bookings/%s/adjustment-%s.pdf', (select id from booking where name = 'transfer'),
                            gen_random_uuid())) as path;
grant select on proof to authenticated;

select pg_temp.act_as('superadmin_aal2');
select is(pg_temp.hint_of($$select public.propose_adjustment('manual_mark_paid',
    (select id from booking where name = 'transfer'), 1000, 'Transfer BCA dari bendahara sekolah',
    (select path from proof), '{"key_id": "k1"}')$$),
  'PRICE_MISMATCH', 'a manual transfer is the booking''s whole total');
select is(pg_temp.hint_of($$select public.propose_adjustment('manual_mark_paid',
    (select id from booking where name = 'transfer'), 30000, 'Transfer BCA dari bendahara sekolah',
    (select path from proof), '{"key_id": "k9"}')$$),
  'QR_KEY_UNKNOWN', 'with a listed key id for its tickets');
create temporary table transfer on commit drop as
  select (public.propose_adjustment('manual_mark_paid', (select id from booking where name = 'transfer'), 30000,
          'Transfer BCA dari bendahara sekolah', (select path from proof), '{"key_id": "k1"}') ->> 'id')::uuid as id;
grant select on transfer to authenticated;
select is((select (status, payment_id is null)::text from public.payment_adjustments where id = (select id from transfer)),
  '(proposed,t)', 'A28: the transfer is proposed, never settled at once');
select is((select status::text from public.bookings where id = (select id from booking where name = 'transfer')),
  'pending_payment', 'so the booking is still unpaid');
reset role;
select pg_temp.act_as_super_b();
select is((public.approve_adjustment((select id from transfer)) ->> 'status'), 'approved',
  'a second superadmin approves it');
reset role;
select pg_temp.act_as('superadmin_aal2');
select is((public.apply_adjustment((select id from transfer)) -> 'transfer' ->> 'result'), 'applied',
  'and on apply the payment settles');
reset role;
select set_config('request.jwt.claims', '', true);
select is((select (b.status, p.provider, p.method, p.status)::text
           from public.bookings b join public.payments p on p.booking_id = b.id
           where b.id = (select id from booking where name = 'transfer')),
  '(paid,manual,manual_transfer,settled)', 'the booking is paid by a manual transfer payment');
select is((select count(*)::int from public.tickets_qr
           where booking_id = (select id from booking where name = 'transfer') and status = 'issued'), 1,
  'with its ticket, as a Midtrans settlement would issue it');
select pg_temp.act_as('superadmin_aal2');
select is(pg_temp.hint_of($$select public.propose_adjustment('manual_mark_paid',
    (select id from booking where name = 'transfer'), 30000, 'Transfer BCA dari bendahara sekolah',
    pg_temp.doc(format('bookings/%s/adjustment-%s.pdf', (select id from booking where name = 'transfer'),
                       gen_random_uuid())), '{"key_id": "k1"}')$$),
  'STATE_INVALID', 'a paid booking takes no second transfer');
reset role;

select * from finish();
rollback;
