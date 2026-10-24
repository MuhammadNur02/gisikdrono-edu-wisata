-- Task P3.11.08 (docs/Security.md OPS-06, MON-03): the out-of-band claim of high and critical alerts. Only the service
-- role claims; a claim takes open, unsent high and critical alerts only and stamps them sent, so a second run takes
-- none; a release gives one back; an alert raised again is sent again.
begin;
select plan(7);

select is(
  has_function_privilege('anon', 'public.svc_claim_security_alerts(integer)', 'execute')
  or has_function_privilege('authenticated', 'public.svc_release_security_alert(uuid)', 'execute'),
  false, 'no API role claims or releases alerts');

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
             and notified_at is not null), 2, 'and stamps them sent');
select is((select count(*)::int from public.svc_claim_security_alerts(10)), 0, 'so a second run takes none');

select public.svc_release_security_alert('00000000-0000-4000-9000-00000009a001');
select is(array(select id::text from public.svc_claim_security_alerts(10)),
  array['00000000-0000-4000-9000-00000009a001'], 'a released alert is claimed by the next run');

update public.security_alerts set notified_at = null, occurrences = occurrences + 1
where id = '00000000-0000-4000-9000-00000009a002';
select is(array(select id::text from public.svc_claim_security_alerts(10)),
  array['00000000-0000-4000-9000-00000009a002'], 'an alert raised again is sent again');
select throws_ok('select public.svc_claim_security_alerts(0)', '22023', null, 'a claim takes 1 to 50 alerts');

select * from finish();
rollback;
