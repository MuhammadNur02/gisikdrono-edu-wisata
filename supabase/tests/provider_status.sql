-- Task P3.11.06 and P3.11.09 (20261101120000): what Meta and Resend report after a send moves a message forward only,
-- a failure after sending dead-letters it once, a report for an unknown, dead or further message changes nothing (so
-- a replay is a no-op), and only the server records reports or signature failures. Re-review of PR #66, L-G
-- (20261103080000): a complaint dead-letters too, a message still queued or sending is left alone, the function checks
-- its caller, and a signature failure is an event naming its provider.
begin;
select plan(23);

insert into public.notifications (id, channel, template, recipient, dedupe_key, status, provider_message_id, sent_at)
values
  ('00000000-0000-4000-8000-0000000c1001', 'whatsapp', 'booking_created', '+6281300001001', 'uji:wa:1', 'sent',
   'wamid.UJI1', now()),
  ('00000000-0000-4000-8000-0000000c1002', 'whatsapp', 'booking_created', '+6281300001002', 'uji:wa:2', 'sent',
   'wamid.UJI2', now()),
  ('00000000-0000-4000-8000-0000000c1003', 'email', 'booking_created', 'uji@contoh.test', 'uji:email:1', 'sent',
   're_UJI3', now()),
  ('00000000-0000-4000-8000-0000000c1004', 'email', 'booking_created', 'dua@contoh.test', 'uji:email:2', 'delivered',
   're_UJI4', now());
insert into public.notifications (id, channel, template, recipient, dedupe_key, status, provider_message_id) values
  ('00000000-0000-4000-8000-0000000c1005', 'whatsapp', 'booking_created', '+6281300001005', 'uji:wa:5', 'queued',
   'wamid.UJI5'),
  ('00000000-0000-4000-8000-0000000c1006', 'whatsapp', 'booking_created', '+6281300001006', 'uji:wa:6', 'sending',
   'wamid.UJI6');

select is(public.svc_record_provider_status('whatsapp', 'wamid.UJI1', 'delivered', null, now() - interval '1 minute'),
  'updated', 'a delivery report moves the message forward');
select is((select (status, provider_status, delivered_at is not null)::text from public.notifications
           where id = '00000000-0000-4000-8000-0000000c1001'),
  '(delivered,delivered,t)', 'to delivered, with its time');
select is(public.svc_record_provider_status('whatsapp', 'wamid.UJI1', 'delivered', null, now()), 'unchanged',
  'the same report again is a no-op');
select is(public.svc_record_provider_status('whatsapp', 'wamid.UJI1', 'sent', null, now()), 'unchanged',
  'and an older one never moves it back');
select is(public.svc_record_provider_status('whatsapp', 'wamid.UJI1', 'read', null, now()), 'updated',
  'a read report moves it on');
select is((select (status, read_at is not null)::text from public.notifications
           where id = '00000000-0000-4000-8000-0000000c1001'), '(read,t)', 'to read');
select is(public.svc_record_provider_status('whatsapp', 'wamid.TIDAK-ADA', 'delivered', null, now()), 'unknown',
  'a report for an id the outbox never sent is unknown');
select is(public.svc_record_provider_status('email', 'wamid.UJI2', 'bounced', null, now()), 'unknown',
  'and an id is looked up on its own channel only');

select is(public.svc_record_provider_status('whatsapp', 'wamid.UJI2', 'failed', 'meta_131026', now()), 'updated',
  'a failure after sending is recorded');
select is((select (status, dead_at is not null, last_error_code)::text from public.notifications
           where id = '00000000-0000-4000-8000-0000000c1002'),
  '(failed,t,meta_131026)', 'and dead-letters the message');
select is(public.svc_record_provider_status('email', 're_UJI3', 'bounced', null, now()), 'updated',
  'a bounce dead-letters an email');
select is(public.svc_record_provider_status('email', 're_UJI3', 'bounced', null, now()), 'unchanged',
  'once: a replayed bounce changes nothing');
select is((select count(*)::int from public.security_events
           where event_type = 'notification_dead'
             and entity_id in ('00000000-0000-4000-8000-0000000c1002', '00000000-0000-4000-8000-0000000c1003')),
  2, 'each dead letter is one notification_dead event');

select is(public.svc_record_provider_status('email', 're_UJI4', 'complained', 'resend_complained', now()), 'updated',
  'a complaint dead-letters a delivered email');
select is((select (status, dead_at is not null, last_error_code)::text from public.notifications
           where id = '00000000-0000-4000-8000-0000000c1004'),
  '(failed,t,resend_complained)', 'with its own error code');
select is(public.svc_record_provider_status('whatsapp', 'wamid.UJI5', 'delivered', null, now()), 'unchanged',
  'a message still queued is left alone');
select is(public.svc_record_provider_status('whatsapp', 'wamid.UJI6', 'failed', 'meta_131026', now()), 'unchanged',
  'and so is one still sending, whose own attempt records its outcome');

select lives_ok($$select public.svc_record_webhook_signature_failure('whatsapp', '203.0.113.9')$$,
  'a signature failure is recorded');
select is((select (event_type, severity, details ->> 'provider', details ->> 'ip_bucket')::text
           from public.security_events where event_type = 'webhook_signature_invalid'
             and details ->> 'ip_bucket' = '203.0.113.9'),
  '(webhook_signature_invalid,medium,whatsapp,203.0.113.9)', 'as a medium event naming the provider and the sender');
select throws_ok($$select public.svc_record_webhook_signature_failure('meta', '203.0.113.9')$$, '22023', null,
  'an unknown provider is refused');

-- Granted for this transaction only, so the call gets past the schema and reaches the function's own first check.
grant usage on schema internal to authenticated;
grant execute on function internal.record_provider_status(public.notification_channel, text, text, text, timestamptz)
  to authenticated;
set local role authenticated;
select throws_ok($$select internal.record_provider_status('whatsapp', 'wamid.UJI1', 'read', null, now())$$,
  '42501', 'record_provider_status is reserved for the server',
  'even with execute, a signed-in session is no server caller');
reset role;

select ok(not has_function_privilege('anon',
            'public.svc_record_provider_status(public.notification_channel, text, text, text, timestamptz)', 'execute')
          and not has_function_privilege('authenticated', 'public.svc_record_webhook_signature_failure(text, text)',
                                         'execute'),
  'anon and authenticated execute neither svc_ function');
select ok(not has_function_privilege('authenticated',
            'public.svc_record_provider_status(public.notification_channel, text, text, text, timestamptz)', 'execute')
          and not has_function_privilege('anon', 'public.svc_record_webhook_signature_failure(text, text)', 'execute')
          and has_function_privilege('service_role',
            'public.svc_record_provider_status(public.notification_channel, text, text, text, timestamptz)', 'execute'),
  'only the server records reports and signature failures');

select * from finish();
rollback;
