-- Re-review of PR #58 at fb759d9 (20261029080400), N2: a high alert seen again an hour after it went out of band goes
-- out again; a sole superadmin acknowledges an alert that names them only 24 hours after it went out, with a reason,
-- and that raises an alert of its own, though acknowledging that one raises no further alert (20261030080200); and
-- the project owner's break-glass reset reaches only the sole superadmin.
begin;
select plan(21);
\ir helpers/rls_personas.psql

-- The kelurahan's only active superadmin is the persona, whatever else this database holds.
select set_config('app.privileged_rpc', 'on', true);
update public.profiles set is_active = false
where role = 'superadmin' and is_active and id <> '00000000-0000-4000-8000-00000000f001';
select set_config('app.privileged_rpc', '', true);

-- ===== A repeat sighting goes out again =====
select internal.raise_anomaly('uji_ulang', 'high', 'satu', 'Uji ulang', '{}');
select internal.raise_anomaly('uji_ulang', 'medium', 'dua', 'Uji ulang sedang', '{}');
update public.security_alerts set notified_at = now() - interval '2 hours' where fingerprint like 'uji_ulang:%';
select internal.raise_anomaly('uji_ulang', 'high', 'satu', 'Uji ulang', '{}');
select internal.raise_anomaly('uji_ulang', 'medium', 'dua', 'Uji ulang sedang', '{}');
select is((select notified_at is null from public.security_alerts where fingerprint = 'uji_ulang:satu'), true,
  'a high alert seen again an hour after it went out is queued for the out-of-band sender again');
select is((select notified_at is null from public.security_alerts where fingerprint = 'uji_ulang:dua'), false,
  'a medium one, which never goes out of band, is only counted');
update public.security_alerts set notified_at = now() - interval '10 minutes' where fingerprint = 'uji_ulang:satu';
select internal.raise_anomaly('uji_ulang', 'high', 'satu', 'Uji ulang', '{}');
select is((select notified_at is not null from public.security_alerts where fingerprint = 'uji_ulang:satu'), true,
  'within the hour after a delivery, a sighting is only counted');

-- ===== A sole superadmin's acknowledgement =====
insert into public.security_alerts (id, rule, severity, fingerprint, title, details, notified_at) values
  ('00000000-0000-4000-8000-0000000fa001', 'mfa_reset', 'critical', 'uji:tentang-saya', 'Uji',
   jsonb_build_object('by', '00000000-0000-4000-8000-00000000f005', 'user_id', '00000000-0000-4000-8000-00000000f001'),
   now() - interval '25 hours'),
  ('00000000-0000-4000-8000-0000000fa002', 'mfa_reset', 'critical', 'uji:baru-terkirim', 'Uji',
   jsonb_build_object('user_id', '00000000-0000-4000-8000-00000000f001'), now() - interval '2 hours'),
  ('00000000-0000-4000-8000-0000000fa003', 'manual_checkin', 'high', 'uji:orang-lain', 'Uji',
   jsonb_build_object('actor_id', '00000000-0000-4000-8000-00000000f005'), now() - interval '25 hours');
select pg_temp.act_as('superadmin_aal2');
select throws_ok($$select public.acknowledge_alert_as_sole_superadmin('00000000-0000-4000-8000-0000000fa001', 'singkat')$$,
  '22023', null, 'it needs a reason of at least ten characters');
select lives_ok($$select public.acknowledge_alert_as_sole_superadmin('00000000-0000-4000-8000-0000000fa001',
                    'Sudah dicek bersama Lurah, reset atas permintaan saya')$$,
  'the sole superadmin acknowledges an alert about themselves a day after it went out');
select throws_ok($$select public.acknowledge_alert_as_sole_superadmin('00000000-0000-4000-8000-0000000fa002',
                     'Sudah dicek bersama Lurah')$$,
  'P0001', null, 'not within 24 hours of its delivery');
select throws_ok($$select public.acknowledge_alert_as_sole_superadmin('00000000-0000-4000-8000-0000000fa003',
                     'Sudah dicek bersama Lurah')$$,
  'P0001', null, 'and an alert that does not name them takes the ordinary path');
reset role;
select is((select (acknowledged_by, acknowledged_at is not null)::text from public.security_alerts
           where id = '00000000-0000-4000-8000-0000000fa001'),
  ('00000000-0000-4000-8000-00000000f001'::uuid, true)::text, 'the alert is acknowledged in their name');
select is((select details ->> 'reason' from public.security_events
           where event_type = 'alert_self_ack_sole_superadmin' and entity_id = '00000000-0000-4000-8000-0000000fa001'),
  'Sudah dicek bersama Lurah, reset atas permintaan saya', 'the step is a security event with its reason');
select is((select (severity, notified_at is null)::text from public.security_alerts
           where fingerprint = 'alert_self_ack_sole_superadmin:00000000-0000-4000-8000-0000000fa001'),
  '(high,t)', 'and a high alert of its own, queued for the out-of-band contacts');
update public.security_alerts set notified_at = now() - interval '25 hours'
where fingerprint = 'alert_self_ack_sole_superadmin:00000000-0000-4000-8000-0000000fa001';
select pg_temp.act_as('superadmin_aal2');
select lives_ok(
  format($$select public.acknowledge_alert_as_sole_superadmin(%L, 'Penutupan sendiri sudah dilaporkan ke Lurah')$$,
         (select id from public.security_alerts
          where fingerprint = 'alert_self_ack_sole_superadmin:00000000-0000-4000-8000-0000000fa001')),
  'the self-acknowledgement alert is acknowledged the same way a day after it went out');
reset role;
select is((select count(*)::int from public.security_alerts a
           where a.rule = 'alert_self_ack_sole_superadmin' and a.acknowledged_at is null),
  0, 'and raises no further alert, so the chain stops there');
select pg_temp.act_as('admin_rw_05');
select throws_ok($$select public.acknowledge_alert_as_sole_superadmin('00000000-0000-4000-8000-0000000fa003',
                     'Sudah dicek bersama Lurah')$$,
  '42501', null, 'an RW admin acknowledges nothing this way');
reset role;

-- ===== Break-glass =====
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
values ('00000000-0000-4000-8000-0000000fb001', '00000000-0000-4000-8000-00000000f001', 'HP Hilang', 'totp',
        'verified', now(), now());
select pg_temp.act_as('superadmin_aal2');
reset role;
select throws_ok($$select internal.break_glass_reset_mfa('00000000-0000-4000-8000-00000000f001', 'HP superadmin hilang')$$,
  '42501', null, 'break-glass is refused with a signed-in user, as from the API');
select set_config('request.jwt.claims', '', true);
select is(internal.break_glass_reset_mfa('00000000-0000-4000-8000-00000000f001', 'HP superadmin hilang, dikonfirmasi Lurah'),
  now() + interval '30 minutes', 'the project owner opens a 30-minute window for the sole superadmin');
select is((select ((select count(*) from auth.mfa_factors f where f.user_id = p.id), p.reenrolment_required,
                   p.reenrolment_window_until > now())::text
           from public.profiles p where p.id = '00000000-0000-4000-8000-00000000f001'),
  '(0,t,t)', 'their factors are gone and the account waits inside its window');
select is((select (severity, details ->> 'stage', notified_at is null)::text from public.security_alerts
           where fingerprint = 'mfa_reset:00000000-0000-4000-8000-00000000f001' and acknowledged_at is null),
  '(critical,break_glass,t)', 'and a critical alert goes out of band');
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
values ('00000000-0000-4000-8000-0000000fb002', '00000000-0000-4000-8000-00000000f001', 'HP Baru', 'totp',
        'verified', now(), now());
select is((select (reenrolment_required, reenrolment_window_until is null)::text from public.profiles
           where id = '00000000-0000-4000-8000-00000000f001'),
  '(f,t)', 'the new authenticator enrolled inside the window ends the wait');
select ok(not has_function_privilege('authenticated', 'internal.break_glass_reset_mfa(uuid, text)', 'execute')
          and not has_function_privilege('service_role', 'internal.break_glass_reset_mfa(uuid, text)', 'execute'),
  'no API role may call break-glass');

-- With a second active superadmin, neither the sole path nor break-glass applies.
insert into auth.users (id, email) values ('00000000-0000-4000-8000-00000000f00a', 'rls-super-dua@example.test');
insert into public.profiles (id, email, full_name, role, rw_id) values
  ('00000000-0000-4000-8000-00000000f00a', 'rls-super-dua@example.test', 'Super Dua', 'superadmin', null);
select throws_ok($$select internal.break_glass_reset_mfa('00000000-0000-4000-8000-00000000f001', 'HP superadmin hilang lagi')$$,
  'P0001', null, 'break-glass is refused while another superadmin can reset');
update public.security_alerts set acknowledged_by = null where id = '00000000-0000-4000-8000-0000000fa001';
select pg_temp.act_as('superadmin_aal2');
select throws_ok($$select public.acknowledge_alert_as_sole_superadmin('00000000-0000-4000-8000-0000000fa001',
                     'Sudah dicek bersama Lurah')$$,
  'P0001', null, 'and so is the sole path, since another superadmin can acknowledge');
reset role;

select * from finish();
rollback;
