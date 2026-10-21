-- The outbox worker's functions after 20261021100200_notification_worker_functions (Task P3.11.01; docs/Security.md
-- EP-02, GUEST-03): only the service role claims and settles messages, a claim takes only the templates asked for, a
-- worker that died gives its messages back, a failure waits 1, 5, 15, 60 then 240 minutes, a dead message raises an
-- event and an alert, and an OTP's code leaves the outbox as soon as it is sent, given up or too old to use.
begin;
select plan(19);

select is(
  has_function_privilege('anon', 'public.svc_claim_notifications(integer, public.notification_template[])', 'execute')
  or has_function_privilege('authenticated', 'public.svc_complete_notification(uuid, text)', 'execute')
  or has_function_privilege('authenticated', 'public.svc_fail_notification(uuid, text, text, boolean)', 'execute'),
  false, 'no API role claims or settles outbox messages');
select is(
  has_function_privilege('service_role', 'public.svc_claim_notifications(integer, public.notification_template[])', 'execute'),
  true, 'the service role claims through svc_claim_notifications');

insert into public.notifications (id, channel, template, recipient, params, dedupe_key, created_at)
values
  ('00000000-0000-4000-9000-00000008a001', 'whatsapp', 'phone_otp', '+6281200000801', '{"code": "123456"}', 'otp:w1', now()),
  ('00000000-0000-4000-9000-00000008a002', 'email', 'security_alert', 'keamanan@example.test', '{}', 'alert:w2', now()),
  ('00000000-0000-4000-9000-00000008a003', 'whatsapp', 'phone_otp', '+6281200000802', '{"code": "654321"}', 'otp:w3',
   now() - interval '6 minutes');

select is(
  array(select id::text from public.svc_claim_notifications(10, array['phone_otp']::public.notification_template[])),
  array['00000000-0000-4000-9000-00000008a001'],
  'a claim takes due messages of the templates asked for only');
select is(
  (select format('%s %s', status, attempts) from public.notifications where id = '00000000-0000-4000-9000-00000008a001'),
  'sending 1', 'and marks them sending, counting the try');
select is(
  (select format('%s %s %s', status, params, last_error_code) from public.notifications
   where id = '00000000-0000-4000-9000-00000008a003'),
  'cancelled {} otp_expired', 'an OTP older than its five minutes is cancelled, not sent, and loses its code');
select is(
  (select count(*)::int from public.svc_claim_notifications(10, array['phone_otp']::public.notification_template[])),
  0, 'a message being sent is not claimed twice');

select public.svc_complete_notification('00000000-0000-4000-9000-00000008a001', 'wamid.1');
select is(
  (select format('%s %s %s %s', status, params, provider_message_id, sent_at is not null)
   from public.notifications where id = '00000000-0000-4000-9000-00000008a001'),
  'sent {} wamid.1 t', 'a sent OTP keeps its provider id and loses its code');

insert into public.notifications (id, channel, template, recipient, params, dedupe_key, status, locked_at, attempts)
values ('00000000-0000-4000-9000-00000008a004', 'email', 'security_alert', 'keamanan@example.test', '{"rule": "x"}',
        'alert:w4', 'sending', now() - interval '11 minutes', 1);
select is(
  array(select id::text from public.svc_claim_notifications(10, array['security_alert']::public.notification_template[]) order by 1),
  array['00000000-0000-4000-9000-00000008a002', '00000000-0000-4000-9000-00000008a004'],
  'a message left sending by a worker that died is given back and claimed again');

select public.svc_fail_notification('00000000-0000-4000-9000-00000008a002', 'network', 'Resend was not reached', false);
select is(
  (select format('%s %s', status, dead_at is null) from public.notifications where id = '00000000-0000-4000-9000-00000008a002'),
  'failed t', 'a passing failure leaves the message to be tried again');
select ok(
  (select next_attempt_at between now() + interval '59 seconds' and now() + interval '61 seconds'
   from public.notifications where id = '00000000-0000-4000-9000-00000008a002'),
  'one minute after the first try');
select is(
  (select count(*)::int from public.svc_claim_notifications(10, array['security_alert']::public.notification_template[])),
  0, 'and not before');
update public.notifications set next_attempt_at = now() - interval '1 second' where id = '00000000-0000-4000-9000-00000008a002';
select is(
  array(select id::text from public.svc_claim_notifications(10, array['security_alert']::public.notification_template[])),
  array['00000000-0000-4000-9000-00000008a002'], 'once due it is claimed again');
select public.svc_fail_notification('00000000-0000-4000-9000-00000008a002', 'http_503', 'Resend is down', false);
select ok(
  (select next_attempt_at between now() + interval '299 seconds' and now() + interval '301 seconds'
   from public.notifications where id = '00000000-0000-4000-9000-00000008a002'),
  'five minutes after the second');

update public.notifications set attempts = 8 where id = '00000000-0000-4000-9000-00000008a004';
select public.svc_fail_notification('00000000-0000-4000-9000-00000008a004', 'network', 'Resend was not reached', false);
select is(
  (select format('%s %s', status, dead_at is not null) from public.notifications where id = '00000000-0000-4000-9000-00000008a004'),
  'failed t', 'after eight tries the message is dead');

insert into public.notifications (id, channel, template, recipient, params, dedupe_key)
values ('00000000-0000-4000-9000-00000008a005', 'whatsapp', 'phone_otp', '+6281200000805', '{"code": "111111"}', 'otp:w5');
select public.svc_claim_notifications(10, array['phone_otp']::public.notification_template[]);
select public.svc_fail_notification('00000000-0000-4000-9000-00000008a005', 'meta_131026', 'not a WhatsApp number', true);
select is(
  (select format('%s %s %s', status, dead_at is not null, params) from public.notifications
   where id = '00000000-0000-4000-9000-00000008a005'),
  'failed t {}', 'a permanent refusal kills the message at once, and an OTP loses its code');
select is(
  (select count(*)::int from public.security_events
   where event_type = 'notification_dead' and entity_id in ('00000000-0000-4000-9000-00000008a004', '00000000-0000-4000-9000-00000008a005')),
  2, 'each dead message is a notification_dead event');
select is(
  (select occurrences from public.security_alerts
   where fingerprint = 'notification_dead:phone_otp:whatsapp' and acknowledged_at is null),
  1, 'and raises an alert per template and channel');

select throws_ok($$select * from public.svc_claim_notifications(0, array['phone_otp']::public.notification_template[])$$,
  '22023', null, 'a claim of no messages is refused');
select throws_ok($$select * from public.svc_claim_notifications(5, array[]::public.notification_template[])$$,
  '22023', null, 'and so is a claim of no template');

select * from finish();
rollback;
