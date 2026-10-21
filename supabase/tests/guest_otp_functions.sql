-- Guest OTPs after 20261021110100_browser_bound_otps (Task P3.2.01; docs/Security.md §4.1: GUEST-03, BOOK-12,
-- GUEST-08): only the service role issues or checks a code, the database keeps its keyed hash, and each code belongs
-- to the browser that asked for it. One browser gets one code a minute and five a day for a number, a number fifteen a
-- day in all, an IP twenty; a code from another browser replaces nothing and checks nothing; the soft breaker sends
-- the form to email past 500 WhatsApp codes issued in a day and raises alerts; five wrong codes end a code; a code
-- opens once and only for its own purpose.
begin;
select plan(50);

-- ===== Who may call =====
select is(
  has_function_privilege('anon', 'public.svc_issue_phone_otp(uuid, public.otp_purpose, public.notification_channel, text, text, text, text, text, uuid, inet)', 'execute'),
  false, 'anon cannot issue a code');
select is(
  has_function_privilege('authenticated', 'public.svc_verify_phone_otp(public.otp_purpose, public.notification_channel, text, text, text, text)', 'execute'),
  false, 'nor can a signed-in staff member check one');
select is(
  has_function_privilege('service_role', 'public.svc_issue_phone_otp(uuid, public.otp_purpose, public.notification_channel, text, text, text, text, text, uuid, inet)', 'execute')
  and has_function_privilege('service_role', 'public.svc_verify_phone_otp(public.otp_purpose, public.notification_channel, text, text, text, text)', 'execute'),
  true, 'the service role issues and checks through the svc_ wrappers');
select is(
  has_function_privilege('service_role', 'internal.issue_phone_otp(uuid, public.otp_purpose, public.notification_channel, text, text, text, text, text, uuid, inet)', 'execute'),
  false, 'and holds no right on the internal function itself');

update public.site_settings set value = 'true' where key in ('whatsapp_enabled', 'email_enabled');

-- Browser A and browser B are the keyed hashes of two gsk_otp_browser cookies.
-- ===== Issuing =====
select is(public.svc_issue_phone_otp('00000000-0000-4000-9000-00000007a001', 'booking_phone', 'whatsapp',
  repeat('1', 64), repeat('a', 64), '123456', '+6281200000701') ->> 'result', 'sent', 'a first code for a number is issued');
select is((select format('%s %s', code_hash, browser_hash) from public.guest_otps where id = '00000000-0000-4000-9000-00000007a001'),
  repeat('a', 64) || ' ' || repeat('1', 64), 'guest_otps keeps the keyed hash and the browser it belongs to');
select is(
  (select format('%s %s %s %s', channel, recipient, params ->> 'code', booking_id is null)
   from public.notifications where dedupe_key = 'otp:00000000-0000-4000-9000-00000007a001'),
  'whatsapp +6281200000701 123456 t',
  'the code waits in one WhatsApp outbox message, tied to no booking');
select is(public.svc_issue_phone_otp('00000000-0000-4000-9000-00000007a002', 'booking_phone', 'whatsapp',
  repeat('1', 64), repeat('a', 64), '123456', '+6281200000701') ->> 'result', 'cooldown',
  'a second code for the same browser within a minute is refused');
select is(public.svc_issue_phone_otp('00000000-0000-4000-9000-00000007a0b1', 'booking_phone', 'whatsapp',
  repeat('2', 64), repeat('a', 64), '123456', '+6281200000701') ->> 'result', 'sent',
  'another browser asking for the same number within that minute gets its own code');
select is((select consumed_at from public.guest_otps where id = '00000000-0000-4000-9000-00000007a001'),
  null, 'and the first browser''s code stays open, so nobody can cancel a visitor''s code by asking for another');

update public.guest_otps set created_at = now() - interval '61 seconds' where phone = '+6281200000701';
select is(public.svc_issue_phone_otp('00000000-0000-4000-9000-00000007a003', 'booking_phone', 'whatsapp',
  repeat('1', 64), repeat('a', 64), '123456', '+6281200000701') ->> 'result', 'sent', 'after the minute a new code is issued');
select isnt((select consumed_at from public.guest_otps where id = '00000000-0000-4000-9000-00000007a001'),
  null, 'and the same browser''s code it replaces is ended');
select is(
  (select status || ' ' || params::text from public.notifications
   where dedupe_key = 'otp:00000000-0000-4000-9000-00000007a001'),
  'cancelled {}', 'with its unsent message cancelled and its code removed');
select is((select consumed_at from public.guest_otps where id = '00000000-0000-4000-9000-00000007a0b1'),
  null, 'while the other browser''s code is left alone');

-- ===== Daily caps =====
insert into public.guest_otps (purpose, phone, browser_hash, code_hash, expires_at, created_at)
select 'booking_phone', '+6281200000702', repeat('1', 64), repeat('c', 64), now(), now() - interval '2 hours'
from generate_series(1, 5);
select is(public.svc_issue_phone_otp('00000000-0000-4000-9000-00000007a004', 'booking_phone', 'whatsapp',
  repeat('1', 64), repeat('a', 64), '123456', '+6281200000702') ->> 'result', 'limited',
  'a sixth code for one number in one browser in a day is refused');
select is(public.svc_issue_phone_otp('00000000-0000-4000-9000-00000007a0b2', 'booking_phone', 'whatsapp',
  repeat('2', 64), repeat('a', 64), '123456', '+6281200000702') ->> 'result', 'sent',
  'while the visitor''s own browser still gets a code for that number');

insert into public.guest_otps (purpose, phone, browser_hash, code_hash, expires_at, created_at)
select 'booking_phone', '+6281200000710', encode(extensions.digest(n::text, 'sha256'), 'hex'), repeat('c', 64), now(),
       now() - interval '2 hours'
from generate_series(1, 15) as n;
select is(public.svc_issue_phone_otp('00000000-0000-4000-9000-00000007a0c1', 'booking_phone', 'whatsapp',
  repeat('3', 64), repeat('a', 64), '123456', '+6281200000710') ->> 'result', 'limited',
  'past fifteen codes a day for one number, from however many browsers, even a new browser is refused');

insert into public.guest_otps (purpose, phone, browser_hash, code_hash, expires_at, created_at, ip)
select 'booking_phone', '+628120000' || n, repeat('4', 64), repeat('c', 64), now(), now() - interval '2 hours', '198.51.100.7'
from generate_series(1000, 1019) as n;
select is(public.svc_issue_phone_otp('00000000-0000-4000-9000-00000007a005', 'booking_phone', 'whatsapp',
  repeat('1', 64), repeat('a', 64), '123456', '+6281200000703', null, null, '198.51.100.7') ->> 'result', 'limited',
  'a twenty-first code from one IP in a day is refused');
select is(public.svc_issue_phone_otp('00000000-0000-4000-9000-00000007a006', 'booking_phone', 'whatsapp',
  repeat('1', 64), repeat('a', 64), '123456', '+6281200000703', null, null, '198.51.100.8') ->> 'result', 'sent',
  'while the same number from another IP still gets its code');

select is(public.svc_issue_phone_otp('00000000-0000-4000-9000-00000007a007', 'booking_phone', 'email',
  repeat('1', 64), repeat('a', 64), '123456', null, 'ani@example.test') ->> 'result', 'unavailable',
  'an email code is refused while WhatsApp works');

select throws_ok($$select public.svc_issue_phone_otp(gen_random_uuid(), 'booking_phone', 'whatsapp', repeat('1', 64),
  repeat('a', 64), '12345', '+6281200000704')$$, '22023', null, 'a code that is not six digits is refused');
select throws_ok($$select public.svc_issue_phone_otp(gen_random_uuid(), 'booking_phone', 'whatsapp', repeat('1', 64),
  repeat('a', 64), '123456', '+62247612345')$$, '22023', null, 'a landline, which WhatsApp cannot reach, is refused');
select throws_ok($$select public.svc_issue_phone_otp(gen_random_uuid(), 'booking_phone', 'whatsapp', repeat('1', 64),
  'not-a-hash', '123456', '+6281200000704')$$, '22023', null, 'and so is anything but a keyed hash');
select throws_ok($$select public.svc_issue_phone_otp(gen_random_uuid(), 'booking_phone', 'whatsapp', null,
  repeat('a', 64), '123456', '+6281200000704')$$, '22023', null, 'and a code that belongs to no browser');

-- ===== WhatsApp off, then the breaker =====
update public.site_settings set value = 'false' where key = 'whatsapp_enabled';
select is(public.svc_issue_phone_otp('00000000-0000-4000-9000-00000007a008', 'booking_phone', 'whatsapp',
  repeat('1', 64), repeat('a', 64), '123456', '+6281200000705') ->> 'result', 'degraded', 'with WhatsApp switched off the form goes to email');
update public.site_settings set value = 'true' where key = 'whatsapp_enabled';

-- Codes issued count whether or not WhatsApp has sent them yet: these rows have no outbox message at all. The codes
-- above leave the breaker's day first, so the count is exactly what this section adds.
update public.guest_otps set created_at = created_at - interval '2 days';
insert into public.guest_otps (purpose, phone, code_hash, expires_at, created_at)
select 'booking_phone', '+6281200000799', repeat('c', 64), now(), now() - interval '1 hour' from generate_series(1, 240);
select is(public.svc_issue_phone_otp('00000000-0000-4000-9000-00000007a009', 'booking_phone', 'whatsapp',
  repeat('1', 64), repeat('a', 64), '123456', '+6281200000706') ->> 'result', 'sent', 'below half the daily WhatsApp codes they still go out');
insert into public.guest_otps (purpose, phone, code_hash, expires_at, created_at)
select 'booking_phone', '+6281200000799', repeat('c', 64), now(), now() - interval '1 hour' from generate_series(1, 10);
select is((select count(*)::int from public.security_alerts
           where fingerprint = 'otp_breaker:half:' || public.today_jkt() and acknowledged_at is null),
  0, 'without an alert');
select is(public.svc_issue_phone_otp('00000000-0000-4000-9000-00000007a00a', 'booking_phone', 'whatsapp',
  repeat('1', 64), repeat('a', 64), '123456', '+6281200000711') ->> 'result', 'sent', 'at half the issued codes they still go out');
select is((select severity::text from public.security_alerts
           where fingerprint = 'otp_breaker:half:' || public.today_jkt() and acknowledged_at is null),
  'high', 'and the superadmin is alerted at half');

insert into public.guest_otps (purpose, phone, code_hash, expires_at, created_at)
select 'booking_phone', '+6281200000799', repeat('c', 64), now(), now() - interval '1 hour' from generate_series(1, 250);
select is(public.svc_issue_phone_otp('00000000-0000-4000-9000-00000007a010', 'booking_phone', 'whatsapp',
  repeat('1', 64), repeat('a', 64), '123456', '+6281200000707') ->> 'result', 'degraded',
  'past 500 WhatsApp codes issued in a day the form is sent to email instead of failing');
select is((select count(*)::int from public.guest_otps where id = '00000000-0000-4000-9000-00000007a010'),
  0, 'and no WhatsApp code is issued');
select is((select severity::text from public.security_alerts
           where fingerprint = 'otp_breaker:tripped:' || public.today_jkt() and acknowledged_at is null),
  'critical', 'the tripped breaker raises a critical alert');
select is(public.svc_issue_phone_otp('00000000-0000-4000-9000-00000007a011', 'booking_phone', 'email',
  repeat('1', 64), repeat('a', 64), '123456', null, ' Ani@Example.test ') ->> 'result', 'sent', 'then an email code goes to the address');
select is(
  (select format('%s %s', o.email, n.recipient) from public.guest_otps o
   join public.notifications n on n.dedupe_key = 'otp:' || o.id
   where o.id = '00000000-0000-4000-9000-00000007a011'),
  'ani@example.test ani@example.test', 'kept and sent lower-cased');
-- The breaker's rows go, so WhatsApp codes are issued again below.
delete from public.guest_otps where phone = '+6281200000799';

-- ===== Checking =====
select is(public.svc_verify_phone_otp('booking_phone', 'whatsapp', repeat('1', 64), repeat('b', 64), '+6281200000701') ->> 'result',
  'wrong_code', 'a wrong code is refused');
select is((public.svc_verify_phone_otp('booking_phone', 'whatsapp', repeat('1', 64), repeat('b', 64), '+6281200000701') ->> 'attempts_left')::int,
  3, 'and counts down the tries left');
select public.svc_verify_phone_otp('booking_phone', 'whatsapp', repeat('1', 64), repeat('b', 64), '+6281200000701');
select public.svc_verify_phone_otp('booking_phone', 'whatsapp', repeat('1', 64), repeat('b', 64), '+6281200000701');
select is(public.svc_verify_phone_otp('booking_phone', 'whatsapp', repeat('1', 64), repeat('b', 64), '+6281200000701') ->> 'result',
  'locked', 'the fifth wrong code ends the code');
select is(public.svc_verify_phone_otp('booking_phone', 'whatsapp', repeat('1', 64), repeat('a', 64), '+6281200000701') ->> 'result',
  'locked', 'so a sixth attempt fails even with the right code');
select is(
  (select format('%s %s', reply ->> 'result', reply ->> 'otp_id')
   from (select public.svc_verify_phone_otp('booking_phone', 'whatsapp', repeat('2', 64), repeat('a', 64), '+6281200000701') as reply) as checked),
  'verified 00000000-0000-4000-9000-00000007a0b1',
  'while the other browser''s code for that number, untouched by those tries, still opens');

select is(public.svc_verify_phone_otp('booking_phone', 'whatsapp', repeat('2', 64), repeat('a', 64), '+6281200000703') ->> 'result',
  'invalid', 'the right code typed in another browser opens nothing');
select is(
  (select format('%s %s %s', reply ->> 'result', reply ->> 'purpose', reply ->> 'phone')
   from (select public.svc_verify_phone_otp('booking_phone', 'whatsapp', repeat('1', 64), repeat('a', 64), '+6281200000703') as reply) as checked),
  'verified booking_phone +6281200000703', 'in its own browser it is verified and names its purpose and number');
select is(public.svc_verify_phone_otp('booking_phone', 'whatsapp', repeat('1', 64), repeat('a', 64), '+6281200000703') ->> 'result',
  'invalid', 'a code opens once');

update public.guest_otps set created_at = now() - interval '61 seconds' where phone = '+6281200000703';
select is(public.svc_issue_phone_otp('00000000-0000-4000-9000-00000007a0d1', 'dsr_identity', 'whatsapp',
  repeat('1', 64), repeat('a', 64), '123456', '+6281200000703') ->> 'result', 'sent', 'a code to prove a data request is issued');
select is(public.svc_verify_phone_otp('booking_phone', 'whatsapp', repeat('1', 64), repeat('a', 64), '+6281200000703') ->> 'result',
  'invalid', 'and never opens as a booking''s phone proof');
select is(
  (select format('%s %s', reply ->> 'result', reply ->> 'purpose')
   from (select public.svc_verify_phone_otp('dsr_identity', 'whatsapp', repeat('1', 64), repeat('a', 64), '+6281200000703') as reply) as checked),
  'verified dsr_identity', 'only for the purpose it was issued for');

update public.guest_otps set expires_at = now() - interval '1 second' where id = '00000000-0000-4000-9000-00000007a011';
select is(public.svc_verify_phone_otp('booking_phone', 'email', repeat('1', 64), repeat('a', 64), null, 'ani@example.test') ->> 'result',
  'expired', 'an expired code is refused');
select is(public.svc_verify_phone_otp('booking_phone', 'whatsapp', repeat('1', 64), repeat('a', 64), '+6281200000798') ->> 'result',
  'invalid', 'and so is a code that never existed');

-- ===== A code for an existing booking =====
insert into public.tour_packages (id, rw_id, category, slug, name, tagline, duration_minutes, price_per_pax, status)
values ('00000000-0000-4000-9000-00000007b001', 5, 'student', 'uji-otp-paket', 'Paket Uji OTP', 'Uji', 120, 25000, 'published');
insert into public.bookings (id, booking_code, status, package_id, package_snapshot, rw_ids, booker_type, pic_name,
  pic_phone, pic_email, pax_count, visit_date, visit_date_end, subtotal_package, total_amount, consent_version, consented_at)
values ('00000000-0000-4000-9000-00000007b002', 'GSK-7F3K9Q2A', 'quoted', '00000000-0000-4000-9000-00000007b001', '{}',
        '{5}', 'school', 'Ani Lestari', '+6281200000708', 'ani@sekolah.test', 10, public.today_jkt() + 30,
        public.today_jkt() + 30, 250000, 250000, 'v1', now());
select throws_ok($$select public.svc_issue_phone_otp(gen_random_uuid(), 'booking_phone', 'whatsapp', repeat('1', 64),
  repeat('a', 64), '123456', '+6281200000709', null, '00000000-0000-4000-9000-00000007b002')$$, '42501', null,
  'a code about a booking goes only to that booking''s own number');
select is(public.svc_issue_phone_otp('00000000-0000-4000-9000-00000007a012', 'booking_phone', 'whatsapp',
  repeat('1', 64), repeat('a', 64), '123456', '+6281200000708', null, '00000000-0000-4000-9000-00000007b002') ->> 'result', 'sent',
  'its own number gets the code');
select public.svc_verify_phone_otp('booking_phone', 'whatsapp', repeat('1', 64), repeat('a', 64), '+6281200000708');
select isnt((select phone_verified_at from public.bookings where id = '00000000-0000-4000-9000-00000007b002'),
  null, 'and verifying it marks the booking''s number verified');

select * from finish();
rollback;
