-- The independent review of PR #27 (the booking wizard, Task P3.5): a contact the code did not prove is refused with
-- a hint of its own (M1), a repeat of a form whose answer was lost opens its booking with a fresh code of that
-- booking's own contact (M1), the reply names the visit days (L3), the guardian's consent is required with a
-- participant list and kept with the booking (L4), and a rate limit can give a hit back (L2).
begin;
select plan(17);

-- ===== Fixtures =====
insert into public.tour_packages (id, rw_id, category, slug, name, pricing_basis, price_per_pax, status) values
  ('00000000-0000-4000-8000-0000000d3001', 5, 'regular', 'uji-tinjau-wizard', 'Paket Uji Tinjau', 'per_pax', 30000,
   'published');
create function pg_temp.visit_day() returns date language sql as $$ select public.today_jkt() + 5 $$;
insert into public.visit_sessions (id, rw_id, session_date, start_time, end_time, label, capacity) values
  ('00000000-0000-4000-8000-0000000d4001', 5, pg_temp.visit_day(), '09:05', '10:05', 'Uji tinjau 1', 40),
  ('00000000-0000-4000-8000-0000000d4002', 5, pg_temp.visit_day(), '10:15', '11:15', 'Uji tinjau 2', 40),
  ('00000000-0000-4000-8000-0000000d4003', 5, pg_temp.visit_day(), '11:25', '12:25', 'Uji tinjau 3', 40);

-- A code verified a minute ago for this number (or, with p_email, this address) in a browser of its own.
create function pg_temp.otp(p_phone text, p_email text default null) returns uuid
  language sql
as $$
  insert into public.guest_otps (purpose, phone, email, code_hash, browser_hash, expires_at, verified_at, created_at)
  values ('booking_phone', case when p_email is null then p_phone end, p_email, repeat('a', 64), repeat('b', 64),
          now() + interval '5 minutes', now() - interval '1 minute', now() - interval '2 minutes')
  returning id;
$$;

create function pg_temp.book(p_otp uuid, p_phone text, p_email text, p_session uuid, p_form_id text default null,
  p_participants jsonb default '[]', p_consent jsonb default '{"version": "2026-10-18"}') returns jsonb
  language sql
as $$
  select internal.create_booking('00000000-0000-4000-8000-0000000d3001', array[p_session], 1,
    jsonb_build_object('booker_type', 'individual', 'institution_name', null, 'pic_name', 'Tamu Uji',
                       'pic_phone', p_phone, 'pic_email', p_email, 'notes', null),
    '[]', p_participants, 'pay', 'web', p_form_id, p_otp, p_consent, null, '{"ip": null, "user_agent": "pgTAP"}',
    internal.booking_quote_hash(internal.booking_quote('00000000-0000-4000-8000-0000000d3001', 1, '[]',
                                                       array[5]::smallint[])));
$$;

-- The hint a statement raises, or null when it passes.
create function pg_temp.hint_of(p_statement text) returns text
  language plpgsql
as $$
declare
  raised_hint text;
begin
  execute p_statement;
  return null;
exception when others then
  get stacked diagnostics raised_hint = pg_exception_hint;
  return raised_hint;
end;
$$;

-- ===== M1: a contact the code did not prove has a hint of its own =====
select is(pg_temp.hint_of($$select pg_temp.book(null, '+6281300000201', 'tamu201@contoh.test',
    '00000000-0000-4000-8000-0000000d4001')$$),
  'CONTACT_UNVERIFIED', 'a booking without a code is refused as an unproven contact, which the wizard asks again for');
select is(pg_temp.hint_of($$select pg_temp.book(pg_temp.otp('+6281300000202', p_email => 'tamu202@contoh.test'),
    '+6281300000202', 'tamu202@contoh.test', '00000000-0000-4000-8000-0000000d4001')$$),
  'CONTACT_UNVERIFIED', 'so is an email code once WhatsApp codes go out again');

-- ===== M1: a form sent again after its answer was lost =====
create temporary table first_code on commit drop as select pg_temp.otp('+6281300000210') as id;
create temporary table first_reply on commit drop as
  select pg_temp.book((select id from first_code), '+6281300000210', 'tamu210@contoh.test',
                      '00000000-0000-4000-8000-0000000d4001', '1f6f3a62-8c1e-4d9b-9a52-6b0e5d1c7a10') as reply;
select is((select reply ->> 'result' from first_reply), 'created', 'a booking with a form key');
select is((pg_temp.book(pg_temp.otp('+6281300000210'), '+6281300000210', 'tamu210@contoh.test',
    '00000000-0000-4000-8000-0000000d4001', '1f6f3a62-8c1e-4d9b-9a52-6b0e5d1c7a10')) ->> 'booking_id',
  (select reply ->> 'booking_id' from first_reply),
  'sent again with a fresh code of the booking''s own number, the form opens the booking it made');
select is((select count(*)::int from public.bookings where pic_phone = '+6281300000210'), 1, 'and no second one');
select is(pg_temp.hint_of($$select pg_temp.book(null, '+6281300000210', 'tamu210@contoh.test',
    '00000000-0000-4000-8000-0000000d4001', '1f6f3a62-8c1e-4d9b-9a52-6b0e5d1c7a10')$$),
  'CONTACT_UNVERIFIED', 'without a code, the key alone still opens nothing (review of PR #26, L1)');

-- A booking an email code made names the address; the number beside it was only typed.
update public.site_settings set value = 'false' where key = 'whatsapp_enabled';
create temporary table email_reply on commit drop as
  select pg_temp.book(pg_temp.otp('+6281300000220', p_email => 'tamu220@contoh.test'), '+6281300000220',
                      'tamu220@contoh.test', '00000000-0000-4000-8000-0000000d4002',
                      '2a7e4b73-9d2f-4eac-8b63-7c1f6e2d8b21') as reply;
update public.site_settings set value = 'true' where key = 'whatsapp_enabled';
select is((select reply ->> 'result' from email_reply), 'created', 'a hold made with an email code');
select is(pg_temp.hint_of($$select pg_temp.book(pg_temp.otp('+6281300000220'), '+6281300000220',
    'tamu220@contoh.test', '00000000-0000-4000-8000-0000000d4002', '2a7e4b73-9d2f-4eac-8b63-7c1f6e2d8b21')$$),
  'CONTACT_UNVERIFIED', 'a code of the number it only typed opens nothing (review of PR #26, M2)');

-- ===== L3: the reply names the visit days, for the sessions to revalidate =====
select is((select (reply ->> 'visit_date', reply ->> 'visit_date_end') from first_reply),
  (pg_temp.visit_day()::text, pg_temp.visit_day()::text), 'the reply carries the first and last visit day');

-- ===== L4: the guardian's consent goes with a participant list and stays with the booking =====
select throws_ok($$select pg_temp.book(pg_temp.otp('+6281300000230'), '+6281300000230', 'tamu230@contoh.test',
    '00000000-0000-4000-8000-0000000d4003', null, '[{"full_name": "Anak Satu"}]')$$,
  'P0001', 'a participant list needs the guardian''s consent', 'a list without the consent is refused');
select lives_ok($$select pg_temp.book(pg_temp.otp('+6281300000231'), '+6281300000231', 'tamu231@contoh.test',
    '00000000-0000-4000-8000-0000000d4003', null, '[{"full_name": "Anak Satu"}]',
    '{"version": "2026-10-18", "guardian_consent": true}')$$, 'a list with it is taken');
select ok((select guardian_consented_at is not null from public.bookings where pic_phone = '+6281300000231'),
  'and the booking keeps when the guardian''s consent was given');
select ok((select guardian_consented_at is null from public.bookings where pic_phone = '+6281300000210'),
  'a booking without a list records no consent');
select pg_temp.book(pg_temp.otp('+6281300000232'), '+6281300000232', 'tamu232@contoh.test',
  '00000000-0000-4000-8000-0000000d4003', null, '[]', '{"version": "2026-10-18", "guardian_consent": true}');
select ok((select guardian_consented_at is null from public.bookings where pic_phone = '+6281300000232'),
  'not even when the consent was ticked, since no participant was listed');

-- ===== L2: a rate limit gives a hit back for a refusal the visitor could not avoid =====
select internal.rate_limit_hit('test:refund:a', 5, 3600);
select internal.rate_limit_hit('test:refund:a', 5, 3600);
select internal.rate_limit_refund('test:refund:a', 3600);
select is((select count from public.rate_limit_buckets where key = 'test:refund:a'), 1, 'a refund gives one hit back');
select internal.rate_limit_refund('test:refund:a', 3600);
select internal.rate_limit_refund('test:refund:a', 3600);
select is((select count from public.rate_limit_buckets where key = 'test:refund:a'), 0,
  'and never counts below nothing');
select ok(has_function_privilege('service_role', 'public.svc_rate_limit_refund(text, integer)', 'execute')
          and not has_function_privilege('anon', 'public.svc_rate_limit_refund(text, integer)', 'execute')
          and not has_function_privilege('authenticated', 'public.svc_rate_limit_refund(text, integer)', 'execute'),
  'only the service role gives hits back, through svc_rate_limit_refund');

select * from finish();
rollback;
