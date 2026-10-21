-- Guest OTPs after 20261021100100_guest_otp_functions (Task P3.2.01; docs/Security.md §4.1: GUEST-03, BOOK-12,
-- GUEST-08): only the service role issues or checks a code, the database keeps its keyed hash, a number gets one code
-- a minute and five a day, an IP twenty a day, the soft breaker sends the form to email past 500 WhatsApp codes a day
-- and raises alerts, five wrong codes end a code, and a code opens once.
begin;
select plan(37);

-- ===== Who may call =====
select is(
  has_function_privilege('anon', 'public.svc_issue_phone_otp(uuid, public.otp_purpose, public.notification_channel, text, text, text, text, uuid, inet)', 'execute'),
  false, 'anon cannot issue a code');
select is(
  has_function_privilege('authenticated', 'public.svc_verify_phone_otp(uuid, text)', 'execute'),
  false, 'nor can a signed-in staff member check one');
select is(
  has_function_privilege('service_role', 'public.svc_issue_phone_otp(uuid, public.otp_purpose, public.notification_channel, text, text, text, text, uuid, inet)', 'execute')
  and has_function_privilege('service_role', 'public.svc_verify_phone_otp(uuid, text)', 'execute'),
  true, 'the service role issues and checks through the svc_ wrappers');
select is(
  has_function_privilege('service_role', 'internal.issue_phone_otp(uuid, public.otp_purpose, public.notification_channel, text, text, text, text, uuid, inet)', 'execute'),
  false, 'and holds no right on the internal function itself');

update public.site_settings set value = 'true' where key in ('whatsapp_enabled', 'email_enabled');

-- ===== Issuing =====
select is(public.svc_issue_phone_otp('00000000-0000-4000-9000-00000007a001', 'booking_phone', 'whatsapp',
  repeat('a', 64), '123456', '+6281200000701') ->> 'result', 'sent', 'a first code for a number is issued');
select is((select code_hash from public.guest_otps where id = '00000000-0000-4000-9000-00000007a001'),
  repeat('a', 64), 'guest_otps keeps the keyed hash only');
select is(
  (select format('%s %s %s %s', channel, recipient, params ->> 'code', booking_id is null)
   from public.notifications where dedupe_key = 'otp:00000000-0000-4000-9000-00000007a001'),
  'whatsapp +6281200000701 123456 t',
  'the code waits in one WhatsApp outbox message, tied to no booking');
select is(public.svc_issue_phone_otp('00000000-0000-4000-9000-00000007a002', 'booking_phone', 'whatsapp',
  repeat('a', 64), '123456', '+6281200000701') ->> 'result', 'cooldown', 'a second code within a minute is refused');

update public.guest_otps set created_at = now() - interval '61 seconds' where phone = '+6281200000701';
select is(public.svc_issue_phone_otp('00000000-0000-4000-9000-00000007a003', 'booking_phone', 'whatsapp',
  repeat('a', 64), '123456', '+6281200000701') ->> 'result', 'sent', 'after the minute a new code is issued');
select isnt((select consumed_at from public.guest_otps where id = '00000000-0000-4000-9000-00000007a001'),
  null, 'and the code it replaces is ended');
select is(
  (select status || ' ' || params::text from public.notifications
   where dedupe_key = 'otp:00000000-0000-4000-9000-00000007a001'),
  'cancelled {}', 'with its unsent message cancelled and its code removed');

insert into public.guest_otps (purpose, phone, code_hash, expires_at, created_at)
select 'booking_phone', '+6281200000702', repeat('c', 64), now(), now() - interval '2 hours' from generate_series(1, 5);
select is(public.svc_issue_phone_otp('00000000-0000-4000-9000-00000007a004', 'booking_phone', 'whatsapp',
  repeat('a', 64), '123456', '+6281200000702') ->> 'result', 'limited', 'a sixth code for one number in a day is refused');

insert into public.guest_otps (purpose, phone, code_hash, expires_at, created_at, ip)
select 'booking_phone', '+628120000' || n, repeat('c', 64), now(), now() - interval '2 hours', '198.51.100.7'
from generate_series(1000, 1019) as n;
select is(public.svc_issue_phone_otp('00000000-0000-4000-9000-00000007a005', 'booking_phone', 'whatsapp',
  repeat('a', 64), '123456', '+6281200000703', null, null, '198.51.100.7') ->> 'result', 'limited',
  'a twenty-first code from one IP in a day is refused');
select is(public.svc_issue_phone_otp('00000000-0000-4000-9000-00000007a006', 'booking_phone', 'whatsapp',
  repeat('a', 64), '123456', '+6281200000703', null, null, '198.51.100.8') ->> 'result', 'sent',
  'while the same number from another IP still gets its code');

select is(public.svc_issue_phone_otp('00000000-0000-4000-9000-00000007a007', 'booking_phone', 'email',
  repeat('a', 64), '123456', null, 'ani@example.test') ->> 'result', 'unavailable',
  'an email code is refused while WhatsApp works');

select throws_ok($$select public.svc_issue_phone_otp(gen_random_uuid(), 'booking_phone', 'whatsapp', repeat('a', 64),
  '12345', '+6281200000704')$$, '22023', null, 'a code that is not six digits is refused');
select throws_ok($$select public.svc_issue_phone_otp(gen_random_uuid(), 'booking_phone', 'whatsapp', repeat('a', 64),
  '123456', '+62247612345')$$, '22023', null, 'a landline, which WhatsApp cannot reach, is refused');
select throws_ok($$select public.svc_issue_phone_otp(gen_random_uuid(), 'booking_phone', 'whatsapp', 'not-a-hash',
  '123456', '+6281200000704')$$, '22023', null, 'and so is anything but a keyed hash');

-- ===== WhatsApp off, then the breaker =====
update public.site_settings set value = 'false' where key = 'whatsapp_enabled';
select is(public.svc_issue_phone_otp('00000000-0000-4000-9000-00000007a008', 'booking_phone', 'whatsapp',
  repeat('a', 64), '123456', '+6281200000705') ->> 'result', 'degraded', 'with WhatsApp switched off the form goes to email');
update public.site_settings set value = 'true' where key = 'whatsapp_enabled';

insert into public.notifications (channel, template, recipient, params, dedupe_key, status, sent_at)
select 'whatsapp', 'phone_otp', '+6281200000799', '{}', 'otp:breaker-test:' || n, 'sent', now() - interval '1 hour'
from generate_series(1, 250) as n;
select is(public.svc_issue_phone_otp('00000000-0000-4000-9000-00000007a009', 'booking_phone', 'whatsapp',
  repeat('a', 64), '123456', '+6281200000706') ->> 'result', 'sent', 'at half the daily WhatsApp codes they still go out');
select is((select severity::text from public.security_alerts
           where fingerprint = 'otp_breaker:half:' || public.today_jkt() and acknowledged_at is null),
  'high', 'and the superadmin is alerted at half');

insert into public.notifications (channel, template, recipient, params, dedupe_key, status, sent_at)
select 'whatsapp', 'phone_otp', '+6281200000799', '{}', 'otp:breaker-test:' || n, 'sent', now() - interval '1 hour'
from generate_series(251, 500) as n;
select is(public.svc_issue_phone_otp('00000000-0000-4000-9000-00000007a010', 'booking_phone', 'whatsapp',
  repeat('a', 64), '123456', '+6281200000707') ->> 'result', 'degraded',
  'past 500 WhatsApp codes a day the form is sent to email instead of failing');
select is((select count(*)::int from public.guest_otps where id = '00000000-0000-4000-9000-00000007a010'),
  0, 'and no WhatsApp code is issued');
select is((select severity::text from public.security_alerts
           where fingerprint = 'otp_breaker:tripped:' || public.today_jkt() and acknowledged_at is null),
  'critical', 'the tripped breaker raises a critical alert');
select is(public.svc_issue_phone_otp('00000000-0000-4000-9000-00000007a011', 'booking_phone', 'email',
  repeat('a', 64), '123456', null, ' Ani@Example.test ') ->> 'result', 'sent', 'then an email code goes to the address');
select is(
  (select format('%s %s', o.email, n.recipient) from public.guest_otps o
   join public.notifications n on n.dedupe_key = 'otp:' || o.id
   where o.id = '00000000-0000-4000-9000-00000007a011'),
  'ani@example.test ani@example.test', 'kept and sent lower-cased');

-- ===== Checking =====
select is(public.svc_verify_phone_otp('00000000-0000-4000-9000-00000007a003', repeat('b', 64)) ->> 'result',
  'wrong_code', 'a wrong code is refused');
select is((public.svc_verify_phone_otp('00000000-0000-4000-9000-00000007a003', repeat('b', 64)) ->> 'attempts_left')::int,
  3, 'and counts down the tries left');
select public.svc_verify_phone_otp('00000000-0000-4000-9000-00000007a003', repeat('b', 64));
select public.svc_verify_phone_otp('00000000-0000-4000-9000-00000007a003', repeat('b', 64));
select is(public.svc_verify_phone_otp('00000000-0000-4000-9000-00000007a003', repeat('b', 64)) ->> 'result',
  'locked', 'the fifth wrong code ends the code');
select is(public.svc_verify_phone_otp('00000000-0000-4000-9000-00000007a003', repeat('a', 64)) ->> 'result',
  'locked', 'so a sixth attempt fails even with the right code');

select is(
  (select format('%s %s', reply ->> 'result', reply ->> 'phone')
   from (select public.svc_verify_phone_otp('00000000-0000-4000-9000-00000007a006', repeat('a', 64)) as reply) as checked),
  'verified +6281200000703', 'the right code is verified and names the number it proves');
select is(public.svc_verify_phone_otp('00000000-0000-4000-9000-00000007a006', repeat('a', 64)) ->> 'result',
  'invalid', 'a code opens once');

update public.guest_otps set expires_at = now() - interval '1 second' where id = '00000000-0000-4000-9000-00000007a011';
select is(public.svc_verify_phone_otp('00000000-0000-4000-9000-00000007a011', repeat('a', 64)) ->> 'result',
  'expired', 'an expired code is refused');
select is(public.svc_verify_phone_otp(gen_random_uuid(), repeat('a', 64)) ->> 'result',
  'invalid', 'and so is a code that never existed');

-- ===== A code for an existing booking =====
insert into public.tour_packages (id, rw_id, category, slug, name, tagline, duration_minutes, price_per_pax, status)
values ('00000000-0000-4000-9000-00000007b001', 5, 'student', 'uji-otp-paket', 'Paket Uji OTP', 'Uji', 120, 25000, 'published');
insert into public.bookings (id, booking_code, status, package_id, package_snapshot, rw_ids, booker_type, pic_name,
  pic_phone, pic_email, pax_count, visit_date, visit_date_end, subtotal_package, total_amount, consent_version, consented_at)
values ('00000000-0000-4000-9000-00000007b002', 'GSK-7F3K9Q2A', 'quoted', '00000000-0000-4000-9000-00000007b001', '{}',
        '{5}', 'school', 'Ani Lestari', '+6281200000708', 'ani@sekolah.test', 10, public.today_jkt() + 30,
        public.today_jkt() + 30, 250000, 250000, 'v1', now());
select throws_ok($$select public.svc_issue_phone_otp(gen_random_uuid(), 'booking_phone', 'whatsapp', repeat('a', 64),
  '123456', '+6281200000709', null, '00000000-0000-4000-9000-00000007b002')$$, '42501', null,
  'a code about a booking goes only to that booking''s own number');
update public.notifications set status = 'cancelled' where dedupe_key like 'otp:breaker-test:%';
delete from public.notifications where dedupe_key like 'otp:breaker-test:%';
select is(public.svc_issue_phone_otp('00000000-0000-4000-9000-00000007a012', 'booking_phone', 'whatsapp',
  repeat('a', 64), '123456', '+6281200000708', null, '00000000-0000-4000-9000-00000007b002') ->> 'result', 'sent',
  'its own number gets the code');
select public.svc_verify_phone_otp('00000000-0000-4000-9000-00000007a012', repeat('a', 64));
select isnt((select phone_verified_at from public.bookings where id = '00000000-0000-4000-9000-00000007b002'),
  null, 'and verifying it marks the booking''s number verified');

select * from finish();
rollback;
