-- Guest link functions after 20261021100300_guest_link_functions (Task P3.3.02, P3.3.03; docs/Security.md GUEST-01,
-- GUEST-02, BOOK-15): a lookup sends a link again only for a matching code and contact, to the contact on file and
-- never anywhere else, once per quarter hour and three times a day at most, and audits it; revoking bumps
-- token_version.
begin;
select plan(21);

select is(
  has_function_privilege('anon', 'public.svc_resend_booking_link(text, text, text)', 'execute')
  or has_function_privilege('authenticated', 'public.svc_revoke_guest_links(uuid)', 'execute'),
  false, 'no API role reaches the lookup or the revocation');
select is(
  has_function_privilege('service_role', 'public.svc_resend_booking_link(text, text, text)', 'execute')
  and has_function_privilege('service_role', 'public.svc_revoke_guest_links(uuid)', 'execute'),
  true, 'the service role does, through the svc_ wrappers');

update public.site_settings set value = 'true' where key in ('whatsapp_enabled', 'email_enabled');
insert into public.tour_packages (id, rw_id, category, slug, name, tagline, duration_minutes, price_per_pax, status)
values ('00000000-0000-4000-9000-00000009b001', 5, 'student', 'uji-tautan-paket', 'Paket Uji Tautan', 'Uji', 120, 25000,
        'published');
insert into public.bookings (id, booking_code, status, package_id, package_snapshot, rw_ids, booker_type, pic_name,
  pic_phone, pic_email, phone_verified_at, pii_purged_at, pax_count, visit_date, visit_date_end, subtotal_package,
  total_amount, consent_version, consented_at)
select ('00000000-0000-4000-9000-00000009c00' || n)::uuid, 'GSK-7F3K9Q2' || n, 'quoted', '00000000-0000-4000-9000-00000009b001',
       '{}', '{5}', 'school', 'Ani Lestari', phone, email, verified, purged, 10, public.today_jkt() + 30,
       public.today_jkt() + 30, 250000, 250000, 'v1', now()
from (values
  ('A', '+6281200000901', 'ani@sekolah.test', now(), null::timestamptz),
  ('B', '+6281200000902', 'budi@sekolah.test', null, null),
  ('C', null, null, null, now()),
  ('D', '+6281200000904', 'dewi@sekolah.test', now(), null),
  ('E', null, 'eka@sekolah.test', null, now())
) as fixture(n, phone, email, verified, purged);

select is(public.svc_resend_booking_link('GSK-7F3K9Q2Z', '+6281200000901'), 'no_match', 'an unknown code matches nothing');
select is(public.svc_resend_booking_link('GSK-7F3K9Q2A', '+6281200000999'), 'no_match',
  'nor does a known code with another number');
select is(public.svc_resend_booking_link('GSK-7F3K9Q2A', null, 'orang@lain.test'), 'no_match',
  'or another address');
select is((select count(*)::int from public.notifications where template = 'booking_link'), 0,
  'and nothing is sent for a miss');

select is(public.svc_resend_booking_link('GSK-7F3K9Q2A', '+6281200000901'), 'queued', 'a matching code and number queue a link');
select is(
  (select format('%s %s %s', channel, recipient, params ->> 'link_scope') from public.notifications
   where booking_id = '00000000-0000-4000-9000-00000009c00A' and template = 'booking_link'),
  'whatsapp +6281200000901 manage', 'a manage link to the verified WhatsApp number on file');
select is(public.svc_resend_booking_link('GSK-7F3K9Q2A', null, ' ANI@sekolah.test '), 'queued',
  'the address on file matches too, written any way');
select is((select count(*)::int from public.notifications where booking_id = '00000000-0000-4000-9000-00000009c00A'), 1,
  'but within a quarter hour the message already queued stands for both');
select is(
  (select format('%s %s', actor_role, metadata ->> 'channel') from public.audit_logs
   where action = 'booking.access_link_resent' and entity_id = '00000000-0000-4000-9000-00000009c00a' limit 1),
  'visitor whatsapp', 'each link sent again is audited as the visitor''s doing');

insert into public.notifications (booking_id, channel, template, recipient, recipient_name, params, dedupe_key)
select '00000000-0000-4000-9000-00000009c00A', 'whatsapp', 'booking_link', '+6281200000901', 'Ani', '{"link_scope": "manage"}',
       'booking-link-test:' || n
from generate_series(1, 2) as n;
select is(public.svc_resend_booking_link('GSK-7F3K9Q2A', '+6281200000901'), 'capped',
  'a fourth link in a day is not sent, so the form cannot flood a group''s WhatsApp');

select is(public.svc_resend_booking_link('GSK-7F3K9Q2B', '+6281200000902'), 'queued', 'a booking whose number is unverified');
select is(
  (select format('%s %s %s', channel, recipient, params ->> 'link_scope') from public.notifications
   where booking_id = '00000000-0000-4000-9000-00000009c00B'),
  'email budi@sekolah.test view', 'gets a view link by email instead');

update public.site_settings set value = 'false' where key = 'whatsapp_enabled';
select public.svc_resend_booking_link('GSK-7F3K9Q2D', '+6281200000904');
select is((select channel::text from public.notifications where booking_id = '00000000-0000-4000-9000-00000009c00D'),
  'email', 'with WhatsApp switched off the link goes by email');

select is(public.svc_resend_booking_link('GSK-7F3K9Q2C', '+6281200000903'), 'no_match',
  'a booking whose contact was anonymised matches nothing');
select is(public.svc_resend_booking_link('GSK-7F3K9Q2E', '+6281200000999'), 'no_match',
  'nor does any number for a purged booking whose number is gone');
select is(public.svc_resend_booking_link('GSK-7F3K9Q2E', null, 'eka@sekolah.test'), 'no_match',
  'nor its own address, if one was left on file: a purged booking gets no link at all');

select is(public.svc_revoke_guest_links('00000000-0000-4000-9000-00000009c00A'), 2, 'revoking bumps token_version');
select is(
  (select count(*)::int from public.audit_logs
   where action = 'booking.links_revoked' and entity_id = '00000000-0000-4000-9000-00000009c00a'),
  1, 'and is audited');
select throws_ok($$select public.svc_revoke_guest_links('00000000-0000-4000-9000-00000009c0ff')$$, 'P0002', null,
  'revoking the links of a booking that does not exist fails');

select * from finish();
rollback;
