-- Task P3.11.08 (docs/Security.md OPS-06, MON-03): the out-of-band claim of high and critical alerts. Only the service
-- role claims; a claim takes open, unsent high and critical alerts only and leases them for five minutes; an alert is
-- sent only once marked so after its email, and not if it was raised again meanwhile; a run killed between the claim
-- and the send leaves it to the next run when the lease ends; a failed send waits out a fresh lease; an alert raised
-- again is sent again.
begin;
select plan(12);

select is(
  has_function_privilege('anon', 'public.svc_claim_security_alerts(integer)', 'execute')
  or has_function_privilege('authenticated', 'public.svc_mark_security_alert_sent(uuid, timestamptz)', 'execute')
  or has_function_privilege('authenticated', 'public.svc_release_security_alert(uuid)', 'execute'),
  false, 'no API role claims, marks or releases alerts');

-- Every alert already waiting is set aside, so the claims below see only these.
update public.security_alerts set notified_at = now() where notified_at is null;
insert into public.security_alerts (id, rule, severity, fingerprint, title) values
  ('00000000-0000-4000-9000-00000009a001', 'uji_tinggi', 'high', 'uji:tinggi', 'Uji tinggi'),
  ('00000000-0000-4000-9000-00000009a002', 'uji_kritis', 'critical', 'uji:kritis', 'Uji kritis'),
  ('00000000-0000-4000-9000-00000009a003', 'uji_sedang', 'medium', 'uji:sedang', 'Uji sedang');
insert into public.security_alerts (id, rule, severity, fingerprint, title, acknowledged_at) values
  ('00000000-0000-4000-9000-00000009a004', 'uji_selesai', 'critical', 'uji:selesai', 'Uji selesai', now());

select is(array(select id::text from public.svc_claim_security_alerts(10) order by 1),
  array['00000000-0000-4000-9000-00000009a001', '00000000-0000-4000-9000-00000009a002'],
  'a claim takes the open high and critical alerts not yet sent, never a medium or acknowledged one');
select is((select count(*)::int from public.security_alerts
           where id in ('00000000-0000-4000-9000-00000009a001', '00000000-0000-4000-9000-00000009a002')
             and delivery_claimed_at is not null and notified_at is null), 2,
  'and leases them, still unsent');
select is((select count(*)::int from public.svc_claim_security_alerts(10)), 0,
  'so a run while the lease holds takes none');

select public.svc_mark_security_alert_sent('00000000-0000-4000-9000-00000009a001',
  (select last_seen_at from public.security_alerts where id = '00000000-0000-4000-9000-00000009a001'));
select is((select (notified_at is not null, delivery_claimed_at is null)::text from public.security_alerts
           where id = '00000000-0000-4000-9000-00000009a001'), '(t,t)', 'an alert whose email went out is sent');

-- The run that claimed the critical one was killed before it sent; five minutes later its lease has ended.
update public.security_alerts set delivery_claimed_at = now() - interval '6 minutes'
where id = '00000000-0000-4000-9000-00000009a002';
select is(array(select id::text from public.svc_claim_security_alerts(10)),
  array['00000000-0000-4000-9000-00000009a002'], 'an alert a killed run left is claimed again once its lease ends');
-- Raised again while its email was on the way: the email told of the older raise.
create temporary table claimed_seen on commit drop as
  select last_seen_at from public.security_alerts where id = '00000000-0000-4000-9000-00000009a002';
update public.security_alerts set last_seen_at = last_seen_at + interval '1 second', occurrences = occurrences + 1
where id = '00000000-0000-4000-9000-00000009a002';
select public.svc_mark_security_alert_sent('00000000-0000-4000-9000-00000009a002', (select last_seen_at from claimed_seen));
select is((select (notified_at is null, delivery_claimed_at is null)::text from public.security_alerts
           where id = '00000000-0000-4000-9000-00000009a002'), '(t,t)',
  'an alert raised again during its send is not taken as sent');
select is(array(select id::text from public.svc_claim_security_alerts(10)),
  array['00000000-0000-4000-9000-00000009a002'], 'so the next run sends it again');

select public.svc_release_security_alert('00000000-0000-4000-9000-00000009a002');
select is((select count(*)::int from public.svc_claim_security_alerts(10)), 0,
  'one whose email failed waits out a fresh lease instead of being tried every minute');
update public.security_alerts set delivery_claimed_at = now() - interval '6 minutes'
where id = '00000000-0000-4000-9000-00000009a002';
select is(array(select id::text from public.svc_claim_security_alerts(10)),
  array['00000000-0000-4000-9000-00000009a002'], 'and is tried again when it ends');

update public.security_alerts set notified_at = null, occurrences = occurrences + 1
where id = '00000000-0000-4000-9000-00000009a001';
select is(array(select id::text from public.svc_claim_security_alerts(10)),
  array['00000000-0000-4000-9000-00000009a001'], 'an alert raised again is sent again');
select throws_ok('select public.svc_claim_security_alerts(0)', '22023', null, 'a claim takes 1 to 50 alerts');

select * from finish();
rollback;
