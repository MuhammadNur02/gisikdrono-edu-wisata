-- Task P3.11.02 to P3.11.04 (docs/Security.md EP-02, EP-03, GUEST-07): a channel switched off in site_settings queues
-- nothing, and what it had queued is cancelled before the worker claims, so its provider is never called; before a
-- booking is paid, an address gets at most three of the site's emails a day, and a paid booking's are never held back.
begin;
select plan(10);

-- ===== Fixtures: an unpaid and a paid booking of one address =====
insert into public.tour_packages (id, rw_id, category, slug, name, tagline, duration_minutes, price_per_pax, status)
values ('00000000-0000-4000-9000-000000000701', 5, 'student', 'uji-saluran-paket', 'Paket Uji Saluran', 'Uji', 120,
        25000, 'published');
select set_config('app.in_rpc', '1', true);
insert into public.bookings (id, booking_code, status, package_id, package_snapshot, rw_ids, booker_type, pic_name,
  pic_phone, pic_email, phone_verified_at, pax_count, visit_date, visit_date_end, subtotal_package, total_amount,
  amount_paid, consent_version, consented_at, paid_at)
values
  ('00000000-0000-4000-9000-000000000721', 'GSK-SA1VRAN1', 'quoted', '00000000-0000-4000-9000-000000000701', '{}',
   '{5}', 'school', 'Bu Sari', '+6281234560721', 'saluran@example.test', now(), 4, public.today_jkt() + 30,
   public.today_jkt() + 30, 100000, 100000, 0, 'v1', now(), null),
  ('00000000-0000-4000-9000-000000000722', 'GSK-SA1VRAN2', 'paid', '00000000-0000-4000-9000-000000000701', '{}',
   '{5}', 'school', 'Bu Sari', '+6281234560722', 'saluran@example.test', now(), 4, public.today_jkt() + 30,
   public.today_jkt() + 30, 100000, 100000, 100000, 'v1', now(), now());
select set_config('app.in_rpc', '', true);

create function pg_temp.switch(p_key text, p_on boolean) returns void
  language sql
as $$ update public.site_settings set value = to_jsonb(p_on) where key = p_key; $$;

-- ===== WhatsApp switched off =====
insert into public.notifications (id, booking_id, channel, template, recipient, params, dedupe_key) values
  ('00000000-0000-4000-9000-00000007a001', '00000000-0000-4000-9000-000000000722', 'whatsapp', 'payment_received_ticket',
   '+6281234560722', '{"link_scope": "view"}', 'saluran:w1'),
  ('00000000-0000-4000-9000-00000007a002', null, 'whatsapp', 'phone_otp', '+6281234560723', '{"code": "123456"}',
   'saluran:w2'),
  ('00000000-0000-4000-9000-00000007a003', '00000000-0000-4000-9000-000000000722', 'email', 'payment_received_ticket',
   'saluran@example.test', '{"link_scope": "view"}', 'saluran:e1');
select pg_temp.switch('whatsapp_enabled', false);
select is(internal.enqueue_notification('00000000-0000-4000-9000-000000000722', 'visit_reminder_d1', 'whatsapp',
  '{"link_scope": "view"}'), null, 'with WhatsApp off, nothing is queued for it');
select is(array(select id::text from public.svc_claim_notifications(50,
            array['payment_received_ticket', 'phone_otp']::public.notification_template[])
          where channel = 'whatsapp' or id = '00000000-0000-4000-9000-00000007a003' order by id),
  array['00000000-0000-4000-9000-00000007a003'],
  'and what it had queued is not claimed, while the email goes on');
select is((select array_agg(status::text || ' ' || last_error_code order by id) from public.notifications
           where id in ('00000000-0000-4000-9000-00000007a001', '00000000-0000-4000-9000-00000007a002')),
  array['cancelled channel_disabled', 'cancelled channel_disabled'],
  'it is cancelled, so the WhatsApp provider is never called');
select is((select params from public.notifications where id = '00000000-0000-4000-9000-00000007a002'), '{}'::jsonb,
  'an OTP cancelled this way loses its code');
select pg_temp.switch('whatsapp_enabled', true);
select isnt(internal.enqueue_notification('00000000-0000-4000-9000-000000000722', 'visit_reminder_d1', 'whatsapp',
  '{"link_scope": "view"}'), null, 'switched on again, WhatsApp messages are queued');

-- ===== At most three emails a day before payment =====
select isnt(internal.enqueue_notification('00000000-0000-4000-9000-000000000721', 'booking_created', 'email',
  '{"link_scope": "manage"}'), null, 'an unpaid booking''s first email is queued');
select internal.enqueue_notification('00000000-0000-4000-9000-000000000721', 'quotation_ready', 'email',
  '{"link_scope": "manage"}');
select is(internal.enqueue_notification('00000000-0000-4000-9000-000000000721', 'payment_reminder', 'email',
  '{"link_scope": "pay"}'), null,
  'the fourth within a day to the same address is not, the paid booking''s ticket email counting among the three');
select isnt(internal.enqueue_notification('00000000-0000-4000-9000-000000000722', 'visit_reminder_d1', 'email',
  '{"link_scope": "view"}'), null, 'a paid booking''s email is never held back');
select is((select count(*)::int from public.notifications where recipient = 'saluran@example.test'), 4,
  'so the address holds the three it was allowed and the paid booking''s reminder');

-- ===== Email switched off =====
select pg_temp.switch('email_enabled', false);
select is(internal.enqueue_notification('00000000-0000-4000-9000-000000000722', 'certificate_ready', 'email',
  '{"link_scope": "certificate"}'), null, 'with email off, nothing is queued for it');

select * from finish();
rollback;
