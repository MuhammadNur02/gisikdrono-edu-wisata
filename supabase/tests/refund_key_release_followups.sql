-- Deferred findings of the review of PR #103 (20261105120200, 20261105120300, 20261105120600; docs/Security.md
-- "Refunds", REC-16):
--   REC-16  a releaser who is no party to the adjustment must meet the dual-control test (approver_is_eligible)
--           against both parties (review of PR #108, L3); a
--           superadmin who does not, a second-mailbox account invited by the proposer included, neither releases while
--           an eligible one is active nor keeps the sole eligible superadmin from releasing, which raises its alert
--   tests   a successful release by the sole superadmin, end to end, and the set_staff_status path: deactivating the
--           last other eligible superadmin restarts the 24 hours; a completed MFA reset counts as such a moment too
--   Lock    the release takes no profile row lock (the audit turn orders it with every profile change); the delivery
--           helper is stable
--   badge   refund_key_blocked_adjustments answers what record_refund refuses: blocked until a release or Midtrans'
--           own figure lifts it, a plainly left alert notwithstanding
begin;
select plan(22);
\ir helpers/rls_personas.psql

-- ===== Fixtures: an RW 05 package, superadmin B (eligible), X (invited by A this week), a booking paid Rp 300.000 =====
insert into public.tour_packages (id, rw_id, category, slug, name, pricing_basis, price_per_pax, status) values
  ('00000000-0000-4000-8000-0000000f8001', 5, 'student', 'uji-lepas-lanjutan', 'Paket Uji Lepas Lanjutan', 'per_pax',
   30000, 'published');
insert into public.visit_sessions (id, rw_id, session_date, start_time, end_time, label, capacity) values
  ('00000000-0000-4000-8000-0000000f8002', 5, public.today_jkt() + 6, '09:00', '10:00', 'Uji lepas lanjutan', 200);

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-00000000f0b2', 'rls-super-b2@example.test'),
  ('00000000-0000-4000-8000-00000000f0c3', 'rls-super-c3@example.test'),
  ('00000000-0000-4000-8000-00000000f0d4', 'rls-super-x4@example.test'),
  ('00000000-0000-4000-8000-00000000f0e6', 'rls-super-y6@example.test');
insert into public.profiles (id, email, full_name, role, rw_id) values
  ('00000000-0000-4000-8000-00000000f0b2', 'rls-super-b2@example.test', 'Super B2', 'superadmin', null);
-- X: a second mailbox of A's, invited by A and onboarded this week, with a factor of today.
insert into public.profiles (id, email, full_name, role, rw_id, created_by) values
  ('00000000-0000-4000-8000-00000000f0d4', 'rls-super-x4@example.test', 'Super X4', 'superadmin', null,
   '00000000-0000-4000-8000-00000000f001');
-- Y: a second mailbox of B's, invited by B ten days ago, its factor enrolled before A proposed anything (review of
-- PR #108, L3).
insert into public.profiles (id, email, full_name, role, rw_id, created_by, created_at) values
  ('00000000-0000-4000-8000-00000000f0e6', 'rls-super-y6@example.test', 'Super Y6', 'superadmin', null,
   '00000000-0000-4000-8000-00000000f0b2', now() - interval '10 days');
update public.profiles set created_at = now() - interval '40 days'
where id in ('00000000-0000-4000-8000-00000000f001', '00000000-0000-4000-8000-00000000f0b2');
update public.profiles set created_at = now() - interval '10 days' where id = '00000000-0000-4000-8000-00000000f0e6';
-- Any other superadmin this database holds (the development seed's) left long ago, beyond any clock this suite reads:
-- the rows change without an audit row of today.
alter table public.profiles disable trigger log_audit;
select set_config('app.privileged_rpc', 'on', true);
update public.profiles set is_active = false
where role = 'superadmin' and is_active
  and id not in ('00000000-0000-4000-8000-00000000f001', '00000000-0000-4000-8000-00000000f0b2',
                 '00000000-0000-4000-8000-00000000f0d4', '00000000-0000-4000-8000-00000000f0e6');
select set_config('app.privileged_rpc', '', true);
alter table public.profiles enable trigger log_audit;
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at) values
  (gen_random_uuid(), '00000000-0000-4000-8000-00000000f001', 'uji-a', 'totp', 'verified', now() - interval '39 days', now()),
  (gen_random_uuid(), '00000000-0000-4000-8000-00000000f0b2', 'uji-b', 'totp', 'verified', now() - interval '39 days', now()),
  (gen_random_uuid(), '00000000-0000-4000-8000-00000000f0d4', 'uji-x', 'totp', 'verified', now(), now()),
  (gen_random_uuid(), '00000000-0000-4000-8000-00000000f0e6', 'uji-y', 'totp', 'verified', now() - interval '9 days', now());

create function pg_temp.act_as_super(p_user uuid) returns void
  language plpgsql
as $$
declare
  verified_at bigint := extract(epoch from now())::bigint - 60;
begin
  perform set_config('request.jwt.claims', (jsonb_build_object(
      'iss', 'supabase', 'aud', 'authenticated', 'sub', p_user, 'role', 'authenticated',
      'email', 'rls-super@example.test', 'session_id', gen_random_uuid(), 'is_anonymous', false, 'aal', 'aal2',
      'amr', jsonb_build_array(jsonb_build_object('method', 'totp', 'timestamp', verified_at),
                               jsonb_build_object('method', 'password', 'timestamp', verified_at - 60)))
    || internal.staff_token_claims(p_user))::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;

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

create function pg_temp.doc(p_path text) returns text
  language plpgsql security definer
as $$
begin
  insert into storage.objects (bucket_id, name) values ('documents', p_path) on conflict do nothing;
  return p_path;
end;
$$;
grant execute on function pg_temp.doc(text) to authenticated;

create function pg_temp.otp(p_phone text) returns uuid
  language sql
as $$
  insert into public.guest_otps (purpose, phone, code_hash, browser_hash, expires_at, verified_at, created_at)
  values ('booking_phone', p_phone, repeat('a', 64), repeat('b', 64), now() + interval '5 minutes',
          now() - interval '1 minute', now() - interval '2 minutes')
  returning id;
$$;

create function pg_temp.paid_booking(p_phone text) returns uuid
  language plpgsql
as $$
declare
  booking_id uuid := (internal.create_booking('00000000-0000-4000-8000-0000000f8001',
    array['00000000-0000-4000-8000-0000000f8002']::uuid[], 10,
    jsonb_build_object('booker_type', 'school', 'institution_name', 'SD Uji Lanjutan', 'pic_name', 'Ani Lanjutan',
                       'pic_phone', p_phone, 'pic_email', 'lanjutan@contoh.test', 'notes', null),
    '[]', '[]', 'pay', 'web', null, pg_temp.otp(p_phone), '{"version": "2026-10-18"}', null,
    '{"ip": null, "user_agent": "pgTAP"}',
    internal.booking_quote_hash(internal.booking_quote('00000000-0000-4000-8000-0000000f8001', 10, '[]',
                                                       array[5]::smallint[]))) ->> 'booking_id')::uuid;
  total bigint := (select b.total_amount from public.bookings b where b.id = booking_id);
  attempt jsonb := internal.create_payment_attempt(booking_id, null, null);
  answer jsonb := jsonb_build_object('order_id', attempt ->> 'order_id', 'status_code', '200',
    'gross_amount', total || '.00', 'signature_key', repeat('a', 128), 'transaction_status', 'settlement',
    'transaction_id', 'txn-' || (attempt ->> 'order_id'), 'payment_type', 'qris', 'currency', 'IDR',
    'fraud_status', 'accept', 'settlement_time', to_char(now() at time zone 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI:SS'));
begin
  perform internal.attach_snap_token((attempt ->> 'payment_id')::uuid, 'token-' || (attempt ->> 'order_id'),
    'https://app.sandbox.midtrans.com/snap/v4/redirection/' || (attempt ->> 'order_id'));
  perform internal.apply_payment_event((internal.record_payment_event('webhook',
    encode(extensions.digest(answer::text || clock_timestamp()::text, 'sha256'), 'hex'), answer) ->> 'event_id')::bigint,
    'webhook', answer, 'k1');
  return booking_id;
end;
$$;

-- A Status API answer listing p_refunds ([{refund_key, refund_amount}]) for the booking's payment, newest of all.
create function pg_temp.listed(p_booking uuid, p_refunds jsonb) returns void
  language sql
as $$
  insert into public.payment_events (payment_id, order_id, source, event_hash, transaction_status, status_code,
    gross_amount_raw, payload, processed_at)
  select p.id, p.order_id, 'status_api', md5(p.id::text || p_refunds::text || clock_timestamp()::text), 'partial_refund',
         '200', p.gross_amount || '.00',
         jsonb_build_object('order_id', p.order_id, 'currency', 'IDR', 'refunds', p_refunds,
                            'refund_amount', coalesce((select sum((r ->> 'refund_amount')::numeric)
                                                       from jsonb_array_elements(p_refunds) r), 0)::bigint || '.00'),
         now()
  from public.payments p where p.booking_id = p_booking and p.status in ('settled', 'partially_refunded');
$$;

create function pg_temp.payment_row(p_booking uuid) returns public.payments
  language sql security definer
as $$ select p.* from public.payments p where p.booking_id = p_booking and p.status <> 'initiated' order by p.attempt_no limit 1; $$;
grant execute on function pg_temp.payment_row(uuid) to authenticated;

-- The open refund_key_mismatch alert of the adjustment, delivered p_ago before now.
create function pg_temp.deliver(p_adjustment uuid, p_ago interval) returns void
  language sql
as $$
  update public.security_alerts set notified_at = now() - p_ago
  where fingerprint = 'refund_key_mismatch:' || p_adjustment and acknowledged_at is null;
$$;

create temporary table booking on commit drop as select pg_temp.paid_booking('+6281300009201') as id;
grant select on booking to authenticated;

-- ===== A: a manual refund of Rp 100.000, proposed by A, approved by B, applied by A =====
create temporary table a on commit drop as select null::uuid as id;
grant select, update on a to authenticated;
select pg_temp.act_as('superadmin_aal2');
update a set id = (public.propose_adjustment('manual_refund', (select id from booking), 100000, 'Transfer bank uji lanjutan',
  pg_temp.doc('bookings/' || (select id from booking) || '/adjustment-' || gen_random_uuid() || '.pdf'), '{}',
  (pg_temp.payment_row((select id from booking))).id) ->> 'id')::uuid;
reset role;
select pg_temp.act_as_super('00000000-0000-4000-8000-00000000f0b2');
select is(public.approve_adjustment((select id from a)) ->> 'status', 'approved', 'B approves A');
reset role;
select pg_temp.act_as('superadmin_aal2');
select is(public.apply_adjustment((select id from a)) ->> 'status', 'applied', 'and A is applied');
reset role;

-- Midtrans lists Rp 80.000 under A's key; the alert went out 30 hours ago.
select pg_temp.listed((select id from booking),
  jsonb_build_array(jsonb_build_object('refund_key', (select id from a)::text, 'refund_amount', '80000.00')));
select internal.note_refund_seen(pg_temp.payment_row((select id from booking)), 'partially_refunded', null);
select pg_temp.deliver((select id from a), interval '30 hours');

-- ===== badge: the database's own blocking state =====
select pg_temp.act_as('superadmin_aal2');
select is(public.refund_key_blocked_adjustments(array[(select id from a)]), array[(select id from a)],
  'the mismatch blocks A, as refund_key_blocked_adjustments says');
reset role;
select pg_temp.act_as('admin_rw_05');
select throws_ok($$select public.refund_key_blocked_adjustments(array[(select id from a)])$$, '42501', null,
  'an RW admin reads no refund block');
reset role;

-- ===== REC-16: an ineligible superadmin is no second superadmin =====
select pg_temp.act_as_super('00000000-0000-4000-8000-00000000f0d4');
select is(pg_temp.hint_of($$select public.release_refund_key_mismatch((select id from a), 'Angka Midtrans sudah dicek')$$),
  'RELEASE_INELIGIBLE', 'X, invited by A this week, does not release it while an eligible superadmin is active');
reset role;
-- Review of PR #108, L3: the test runs against the approver too.
select pg_temp.act_as_super('00000000-0000-4000-8000-00000000f0e6');
select is(pg_temp.hint_of($$select public.release_refund_key_mismatch((select id from a), 'Angka Midtrans sudah dicek')$$),
  'RELEASE_INELIGIBLE', 'nor does Y, invited by the approver B ten days ago, though nothing ties Y to the proposer');
reset role;
select pg_temp.act_as('superadmin_aal2');
select is(pg_temp.hint_of($$select public.release_refund_key_mismatch((select id from a), 'Angka Midtrans sudah dicek')$$),
  'RELEASE_INELIGIBLE', 'nor does A while B, its eligible approver, is active');
reset role;

-- B was deactivated 30 hours ago: the profile row changes now, its audit row is written as it was then.
alter table public.profiles disable trigger log_audit;
select set_config('app.privileged_rpc', 'on', true);
update public.profiles set is_active = false, role = 'none' where id = '00000000-0000-4000-8000-00000000f0b2';
select set_config('app.privileged_rpc', '', true);
alter table public.profiles enable trigger log_audit;
insert into public.audit_logs (occurred_at, actor_id, actor_role, action, entity_type, entity_id, before, after)
values (now() - interval '30 hours', '00000000-0000-4000-8000-00000000f001', 'superadmin', 'profiles.update',
        'profiles', '00000000-0000-4000-8000-00000000f0b2', '{"role": "superadmin", "is_active": true}',
        '{"role": "none", "is_active": false}');

select is(internal.other_eligible_superadmin('00000000-0000-4000-8000-00000000f001',
  (select x from public.payment_adjustments x where x.id = (select id from a))), false,
  'with B gone, X does not count as another eligible superadmin');
select pg_temp.act_as_super('00000000-0000-4000-8000-00000000f0d4');
select is(pg_temp.hint_of($$select public.release_refund_key_mismatch((select id from a), 'Angka Midtrans sudah dicek')$$),
  'RELEASE_INELIGIBLE', 'and X still does not release it while A, who is eligible, is active');
reset role;

-- ===== A successful release by the sole superadmin =====
select pg_temp.act_as('superadmin_aal2');
create temporary table sole_release on commit drop as
  select public.release_refund_key_mismatch((select id from a), 'Hanya saya superadmin yang memenuhi syarat') as reply;
reset role;
select is((select (reply ->> 'result') || ':' || (reply ->> 'released_sum') from sole_release), 'released:80000',
  'A, the sole eligible superadmin, releases it 24 hours after the alert and after B left');
select is((select details ->> 'actor_id' from public.security_alerts
           where rule = 'refund_key_release_by_sole_superadmin'
             and details ->> 'adjustment_id' = (select id from a)::text),
  '00000000-0000-4000-8000-00000000f001', 'which raises the refund_key_release_by_sole_superadmin alert');
select is((select metadata ->> 'sole_superadmin' from public.audit_logs
           where action = 'refund.key_mismatch_released' and entity_id = (select id from a)::text),
  'true', 'and is audited as the sole superadmin''s');
select pg_temp.act_as('superadmin_aal2');
select is(public.refund_key_blocked_adjustments(array[(select id from a)]), '{}'::uuid[],
  'a released figure blocks nothing any more');
reset role;

-- A completed MFA reset of another superadmin is a moment they stopped counting.
insert into public.audit_logs (occurred_at, actor_id, actor_role, action, entity_type, entity_id, metadata)
values (now() - interval '2 hours', '00000000-0000-4000-8000-00000000f001', 'superadmin', 'staff.mfa_reset_completed',
        'profiles', '00000000-0000-4000-8000-00000000f0d4', '{"change": "mfa_reset", "stage": "completed"}');
select is(internal.last_superadmin_drop_at('00000000-0000-4000-8000-00000000f001'), now() - interval '2 hours',
  'a completed MFA reset of another superadmin counts as the last drop');

-- ===== set_staff_status: deactivating the last other eligible superadmin restarts the clock =====
select pg_temp.listed((select id from booking),
  jsonb_build_array(jsonb_build_object('refund_key', (select id from a)::text, 'refund_amount', '90000.00')));
select internal.note_refund_seen(pg_temp.payment_row((select id from booking)), 'partially_refunded', null);
select pg_temp.deliver((select id from a), interval '30 hours');
select pg_temp.act_as('superadmin_aal2');
select is(public.refund_key_blocked_adjustments(array[(select id from a)]), array[(select id from a)],
  'a new figure blocks again');
reset role;
insert into public.profiles (id, email, full_name, role, rw_id) values
  ('00000000-0000-4000-8000-00000000f0c3', 'rls-super-c3@example.test', 'Super C3', 'superadmin', null);
update public.profiles set created_at = now() - interval '40 days' where id = '00000000-0000-4000-8000-00000000f0c3';
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at) values
  (gen_random_uuid(), '00000000-0000-4000-8000-00000000f0c3', 'uji-c', 'totp', 'verified', now() - interval '39 days', now());
select pg_temp.act_as('superadmin_aal2');
select is(pg_temp.hint_of($$select public.release_refund_key_mismatch((select id from a), 'Angka Midtrans baru sudah dicek')$$),
  'RELEASE_INELIGIBLE', 'with C, eligible, active, A does not release it');
select lives_ok($$select public.set_staff_status('00000000-0000-4000-8000-00000000f0c3', false, 'Akun lama dinonaktifkan')$$,
  'A deactivates C through set_staff_status');
select is(pg_temp.hint_of($$select public.release_refund_key_mismatch((select id from a), 'Angka Midtrans baru sudah dicek')$$),
  'RELEASE_TOO_EARLY', 'and then waits 24 hours from that moment, whatever the alert''s age');
reset role;
select is((select internal.sole_release_since(s, '00000000-0000-4000-8000-00000000f001') from public.security_alerts s
           where s.fingerprint = 'refund_key_mismatch:' || (select id from a) and s.acknowledged_at is null),
  now(), 'the clock runs from set_staff_status''s audit row');

-- ===== badge: Midtrans listing exactly the amount booked lifts the block, the alert left as it is =====
select pg_temp.listed((select id from booking),
  jsonb_build_array(jsonb_build_object('refund_key', (select id from a)::text, 'refund_amount', '100000.00')));
select pg_temp.act_as('superadmin_aal2');
select is(public.refund_key_blocked_adjustments(array[(select id from a)]), '{}'::uuid[],
  'Midtrans listing exactly Rp 100.000 under A''s key blocks nothing, its latest alert unreleased notwithstanding');
reset role;

-- ===== Lock and Info =====
select ok(pg_get_functiondef('internal.release_by_sole_superadmin(public.payment_adjustments, public.security_alerts)'::regprocedure)
            !~* 'for\s+(share|update)',
  'the release locks no profile row: the audit turn orders it with every profile change');
select is((select provolatile::text from pg_proc
           where oid = 'internal.alert_first_delivered_at(public.security_alerts)'::regprocedure), 's',
  'alert_first_delivered_at is stable, as its timestamptz cast is');

select * from finish();
rollback;
