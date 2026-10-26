-- The claim functions take at most the number of rows they are asked for, whatever plan the planner picks (review of
-- the payments_poll flake on PR #82): internal.payments_to_poll (each of its two kinds), internal.claim_notifications
-- and internal.claim_security_alerts. Each claim runs under the default planner and under settings that force a nested
-- loop whose inner side is the locking sub-select, rescanned for every outer row: a rescan meets the rows this very
-- statement already updated, LockRows skips them, and LIMIT hands out the next ones. Before 20261104150000 the
-- nested_no_unique planner made payments_to_poll(1) ask about 8 open attempts and claim_notifications(1) claim 38 of
-- 40 messages (CI run 40329134693). The controls below run that old shape, UPDATE ... WHERE id IN (SELECT ... LIMIT 1
-- FOR UPDATE SKIP LOCKED), on this file's own fixtures for the alerts and the paid bookings, under the
-- nested_indexed planner, whose indexes let the locking sub-select keep its order without a sort; each must take
-- more than one row, so the planners here are shown to reach the plan that over-claims (review of PR #87, L-1).
begin;
select plan(35);
-- Every call is planned again with the settings of its planner, never from a plan cached under another one (L-2).
set local plan_cache_mode = force_custom_plan;
select set_config('app.qr_key_id', 'k1', true);

-- ===== Planner settings =====
create function pg_temp.planner(p_name text) returns text
  language plpgsql
as $$
declare
  setting text;
begin
  -- 'default' is the server's own setting of each, whatever it is (review of PR #87, I-1).
  foreach setting in array array['enable_hashjoin', 'enable_mergejoin', 'enable_material', 'enable_hashagg',
                                 'enable_sort', 'enable_indexscan', 'enable_bitmapscan'] loop
    execute format('set local %I to default', setting);
  end loop;
  if p_name in ('nested', 'nested_no_unique', 'nested_seq', 'nested_indexed') then
    perform set_config('enable_hashjoin', 'off', true);
    perform set_config('enable_mergejoin', 'off', true);
    perform set_config('enable_material', 'off', true);
  end if;
  if p_name in ('nested_no_unique', 'nested_seq', 'nested_indexed') then
    perform set_config('enable_hashagg', 'off', true);
    perform set_config('enable_sort', 'off', true);
  end if;
  if p_name = 'nested_seq' then
    perform set_config('enable_indexscan', 'off', true);
    perform set_config('enable_bitmapscan', 'off', true);
  end if;
  return p_name;
end;
$$;
create temporary table planners (name text primary key) on commit drop;
insert into planners values ('default'), ('nested'), ('nested_no_unique'), ('nested_seq'), ('nested_indexed');
-- What nested_indexed reads in order without a sort: the alerts by last_seen_at and the paid bookings by their last
-- poll, as the claims order them. Rolled back with the rest.
create index claim_limits_alerts_seen_idx on public.security_alerts (last_seen_at);
create index claim_limits_payments_polled_idx on public.payments
  (last_polled_at nulls first, (coalesce(settlement_time, updated_at)));

-- ===== Fixtures: open attempts and paid bookings without a ticket =====
update public.site_settings set value = 'true' where key in ('whatsapp_enabled', 'email_enabled');
insert into public.tour_packages (id, rw_id, category, slug, name, pricing_basis, price_per_pax, status) values
  ('00000000-0000-4000-8000-0000000ca001', 5, 'regular', 'uji-klaim-paket', 'Paket Uji Klaim', 'per_pax', 30000,
   'published');
insert into public.visit_sessions (id, rw_id, session_date, start_time, end_time, label, capacity) values
  ('00000000-0000-4000-8000-0000000ca002', 5, public.today_jkt() + 5, '09:05', '10:05', 'Uji klaim', 1000);

create function pg_temp.otp(p_phone text) returns uuid
  language sql
as $$
  insert into public.guest_otps (purpose, phone, code_hash, browser_hash, expires_at, verified_at, created_at)
  values ('booking_phone', p_phone, repeat('a', 64), repeat('b', 64), now() + interval '5 minutes',
          now() - interval '1 minute', now() - interval '2 minutes')
  returning id;
$$;
create function pg_temp.attempt(p_phone text) returns text
  language plpgsql
as $$
declare
  booking_id uuid := (internal.create_booking('00000000-0000-4000-8000-0000000ca001',
    array['00000000-0000-4000-8000-0000000ca002']::uuid[], 20,
    jsonb_build_object('booker_type', 'school', 'institution_name', 'SD Negeri Klaim', 'pic_name', 'Ani Klaim',
                       'pic_phone', p_phone, 'pic_email', 'klaim-' || right(p_phone, 4) || '@contoh.test',
                       'notes', null),
    '[]', '[]', 'pay', 'web', null, pg_temp.otp(p_phone), '{"version": "2026-10-18"}', null,
    '{"ip": null, "user_agent": "pgTAP"}',
    internal.booking_quote_hash(internal.booking_quote('00000000-0000-4000-8000-0000000ca001', 20, '[]',
                                                       array[5]::smallint[]))) ->> 'booking_id')::uuid;
  reply jsonb := internal.create_payment_attempt(booking_id, null, null);
begin
  perform internal.attach_snap_token((reply ->> 'payment_id')::uuid, 'token-' || (reply ->> 'order_id'),
                                     'https://app.sandbox.midtrans.com/snap/v4/redirection/' || (reply ->> 'order_id'));
  return reply ->> 'order_id';
end;
$$;
create function pg_temp.paid_without_ticket(p_phone text) returns text
  language plpgsql
as $$
declare
  settled_order text := pg_temp.attempt(p_phone);
  answer jsonb := jsonb_build_object('order_id', settled_order, 'status_code', '200', 'gross_amount', '600000.00',
    'signature_key', repeat('a', 128), 'transaction_status', 'settlement', 'transaction_id', 'txn-' || settled_order,
    'payment_type', 'qris', 'currency', 'IDR', 'fraud_status', 'accept',
    'settlement_time', to_char((now() - interval '10 minutes') at time zone 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI:SS'));
begin
  perform internal.apply_payment_event((internal.record_payment_event('webhook',
    encode(extensions.digest(answer::text, 'sha256'), 'hex'), answer) ->> 'event_id')::bigint, 'webhook', answer);
  delete from public.tickets_qr where booking_id = (select p.booking_id from public.payments p where p.order_id = settled_order);
  return settled_order;
end;
$$;
select pg_temp.attempt('+62813000021' || lpad(n::text, 2, '0')) from generate_series(1, 8) n;
update public.payments set created_at = now() - interval '10 minutes' where status = 'pending';
select pg_temp.paid_without_ticket('+62813000022' || lpad(n::text, 2, '0')) from generate_series(1, 8) n;
analyze public.payments;
analyze public.bookings;

-- ===== The old shape over-claims here =====
-- The old asked_paid claim of 20261024120100, run once and rolled back, so the fixtures stay as they are.
create function pg_temp.old_paid_claim() returns integer
  language plpgsql
as $$
declare
  claimed integer;
begin
  perform pg_temp.planner('nested_indexed');
  begin
    update public.payments p set last_polled_at = now()
    where p.id in (
      select s.id from public.payments s join public.bookings b on b.id = s.booking_id
      where s.provider = 'midtrans' and s.status = 'settled' and b.status in ('paid', 'checked_in')
        and (not b.needs_review or b.review_reason = 'REVENUE_RULE_REFUSED')
        and coalesce(s.settlement_time, s.updated_at) < now() - interval '2 minutes'
        and (exists (select 1 from public.booking_legs l
                     where l.booking_id = b.id and l.status in ('reserved', 'checked_in')
                       and not exists (select 1 from public.tickets_qr t where t.booking_leg_id = l.id))
             or not exists (select 1 from public.revenue_share_entries e
                            where e.booking_id = b.id and e.entry_type = 'settlement'))
      order by s.last_polled_at nulls first, coalesce(s.settlement_time, s.updated_at)
      limit 1
      for update of s skip locked);
    get diagnostics claimed = row_count;
    raise exception using errcode = 'P0001', message = 'roll the control back';
  exception when sqlstate 'P0001' then
    null;
  end;
  perform pg_temp.planner('default');
  return claimed;
end;
$$;
select cmp_ok(pg_temp.old_paid_claim(), '>', 1,
  'control: the old IN (... LIMIT 1 ... SKIP LOCKED) claim of paid bookings takes more than one here');

-- ===== payments_to_poll =====
create function pg_temp.poll(p_planner text, p_limit integer) returns table (open_count integer, paid_count integer)
  language plpgsql
as $$
begin
  perform pg_temp.planner(p_planner);
  return query
  select (count(*) filter (where reason = 'open'))::int, (count(*) filter (where reason = 'paid_incomplete'))::int
  from internal.payments_to_poll(p_limit);
end;
$$;
select is((select (open_count, paid_count)::text from pg_temp.poll(name, 1)), '(1,1)',
          format('payments_to_poll(1) takes one of each kind under the %s planner', name))
from planners order by name;
select is((select (open_count, paid_count)::text from pg_temp.poll(name, 3)), '(3,3)',
          format('payments_to_poll(3) takes three of each kind under the %s planner', name))
from planners order by name;
select pg_temp.planner('default');

-- ===== claim_notifications =====
insert into public.notifications (booking_id, channel, template, recipient, params, dedupe_key, next_attempt_at)
select null, 'whatsapp', 'phone_otp', '+62813000023' || lpad(n::text, 2, '0'), '{"code": "123456"}',
       'klaim:otp:' || n, now() - interval '1 minute'
from generate_series(1, 40) n;
analyze public.notifications;
create function pg_temp.claim_messages(p_planner text, p_limit integer) returns integer
  language plpgsql
as $$
declare
  claimed integer;
begin
  perform pg_temp.planner(p_planner);
  select count(*)::int into claimed
  from internal.claim_notifications(p_limit, array['phone_otp']::public.notification_template[]);
  return claimed;
end;
$$;
select is(pg_temp.claim_messages(name, 1), 1, format('claim_notifications(1) claims one under the %s planner', name))
from planners order by name;
select is(pg_temp.claim_messages(name, 3), 3, format('claim_notifications(3) claims three under the %s planner', name))
from planners order by name;
select pg_temp.planner('default');
select is((select count(*)::int from public.notifications where dedupe_key like 'klaim:otp:%' and status = 'sending'),
  20, 'and exactly the messages it answered are marked sending');

-- ===== claim_security_alerts =====
update public.security_alerts set notified_at = now() where notified_at is null;
insert into public.security_alerts (rule, severity, fingerprint, title, last_seen_at)
select 'uji_klaim', 'high', 'uji:klaim:' || n, 'Uji klaim', now() - n * interval '1 second'
from generate_series(1, 40) n;
analyze public.security_alerts;
-- The old claim of 20261024120200, run once and rolled back, as above.
create function pg_temp.old_alert_claim() returns integer
  language plpgsql
as $$
declare
  claimed integer;
begin
  perform pg_temp.planner('nested_indexed');
  begin
    update public.security_alerts a set delivery_claimed_at = now()
    where a.id in (
      select due.id from public.security_alerts due
      where due.severity in ('high', 'critical') and due.acknowledged_at is null and due.notified_at is null
        and (due.delivery_claimed_at is null or due.delivery_claimed_at < now() - interval '5 minutes')
      order by due.last_seen_at
      limit 1
      for update skip locked);
    get diagnostics claimed = row_count;
    raise exception using errcode = 'P0001', message = 'roll the control back';
  exception when sqlstate 'P0001' then
    null;
  end;
  perform pg_temp.planner('default');
  return claimed;
end;
$$;
select cmp_ok(pg_temp.old_alert_claim(), '>', 1,
  'control: the old IN (... LIMIT 1 ... SKIP LOCKED) claim of alerts takes more than one here');
create function pg_temp.claim_alerts(p_planner text, p_limit integer) returns integer
  language plpgsql
as $$
declare
  claimed integer;
begin
  perform pg_temp.planner(p_planner);
  select count(*)::int into claimed from internal.claim_security_alerts(p_limit);
  return claimed;
end;
$$;
select is(pg_temp.claim_alerts(name, 1), 1, format('claim_security_alerts(1) claims one under the %s planner', name))
from planners order by name;
select is(pg_temp.claim_alerts(name, 3), 3, format('claim_security_alerts(3) claims three under the %s planner', name))
from planners order by name;
select pg_temp.planner('default');
select is((select count(*)::int from public.security_alerts
           where fingerprint like 'uji:klaim:%' and delivery_claimed_at is not null),
  20, 'and exactly the alerts it answered are leased');

-- ===== Every planner answered =====
select is((select count(*)::int from planners), 5, 'five planners were tried');
select * from finish();
rollback;
