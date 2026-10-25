-- Task P3.11.06 and P3.11.09 (20261101120000): what Meta and Resend report after a send moves a message forward only,
-- a failure after sending dead-letters it once, a report for an unknown, dead or further message changes nothing (so
-- a replay is a no-op), and only the server records reports or signature failures.
begin;
select plan(14);

insert into public.notifications (id, channel, template, recipient, dedupe_key, status, provider_message_id, sent_at)
values
  ('00000000-0000-4000-8000-0000000c1001', 'whatsapp', 'booking_created', '+6281300001001', 'uji:wa:1', 'sent',
   'wamid.UJI1', now()),
  ('00000000-0000-4000-8000-0000000c1002', 'whatsapp', 'booking_created', '+6281300001002', 'uji:wa:2', 'sent',
   'wamid.UJI2', now()),
  ('00000000-0000-4000-8000-0000000c1003', 'email', 'booking_created', 'uji@contoh.test', 'uji:email:1', 'sent',
   're_UJI3', now());

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

select ok(not has_function_privilege('authenticated',
            'public.svc_record_provider_status(public.notification_channel, text, text, text, timestamptz)', 'execute')
          and not has_function_privilege('anon', 'public.svc_record_webhook_signature_failure(text, text)', 'execute')
          and has_function_privilege('service_role',
            'public.svc_record_provider_status(public.notification_channel, text, text, text, timestamptz)', 'execute'),
  'only the server records reports and signature failures');

select * from finish();
rollback;
