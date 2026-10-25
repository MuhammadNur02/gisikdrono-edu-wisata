-- Task P3.11.05 (20261101120100): the e-ticket file of a booking is recorded by internal.record_ticket_pdf: only for a
-- booking with tickets, only under its own name, with the fingerprint of the tickets it shows, replaced when they change.
begin;
select plan(8);
\ir helpers/rls_personas.psql
select set_config('app.qr_key_id', 'k1', true);

insert into public.tour_packages (id, rw_id, category, slug, name, pricing_basis, price_per_pax, status) values
  ('00000000-0000-4000-8000-0000000d7001', 5, 'regular', 'uji-tiket-pdf', 'Paket Uji Tiket', 'per_pax', 250000,
   'published');
insert into public.visit_sessions (id, rw_id, session_date, start_time, end_time, label, capacity) values
  ('00000000-0000-4000-8000-0000000d7101', 5, public.today_jkt() + 12, '07:41', '08:41', 'Uji tiket PDF', 100);

create function pg_temp.hold(p_phone text) returns uuid
  language plpgsql
as $$
declare
  otp_id uuid;
begin
  insert into public.guest_otps (purpose, phone, code_hash, browser_hash, expires_at, verified_at, created_at)
  values ('booking_phone', p_phone, repeat('a', 64), repeat('b', 64), now() + interval '5 minutes',
          now() - interval '1 minute', now() - interval '2 minutes')
  returning id into otp_id;
  return (internal.create_booking('00000000-0000-4000-8000-0000000d7001',
    array['00000000-0000-4000-8000-0000000d7101'::uuid], 4,
    jsonb_build_object('booker_type', 'school', 'institution_name', 'SD Negeri Tiket', 'pic_name', 'Tia Tiket',
                       'pic_phone', p_phone, 'pic_email', 'tiket' || right(p_phone, 4) || '@contoh.test',
                       'notes', null),
    '[]', '[]', 'pay', 'web', null, otp_id, '{"version": "2026-10-18"}', null, '{"ip": null, "user_agent": "pgTAP"}',
    internal.booking_quote_hash(internal.booking_quote('00000000-0000-4000-8000-0000000d7001', 4, '[]',
                                                       array[5]::smallint[]))) ->> 'booking_id')::uuid;
end;
$$;

create function pg_temp.pay(p_booking uuid) returns void
  language plpgsql
as $$
declare
  attempt jsonb := internal.create_payment_attempt(p_booking, null, null);
  answer jsonb;
begin
  perform internal.attach_snap_token((attempt ->> 'payment_id')::uuid, 'token-' || (attempt ->> 'order_id'),
    'https://app.sandbox.midtrans.com/snap/v4/redirection/' || (attempt ->> 'order_id'));
  answer := jsonb_build_object('order_id', attempt ->> 'order_id', 'status_code', '200',
    'gross_amount', (select b.total_amount from public.bookings b where b.id = p_booking) || '.00',
    'signature_key', repeat('a', 128), 'transaction_status', 'settlement',
    'transaction_id', 'txn-' || (attempt ->> 'order_id'), 'payment_type', 'qris', 'currency', 'IDR',
    'fraud_status', 'accept', 'settlement_time', to_char(now() at time zone 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI:SS'));
  perform internal.apply_payment_event((internal.record_payment_event('webhook',
    encode(sha256(convert_to(answer::text, 'UTF8')), 'hex'), answer) ->> 'event_id')::bigint, 'webhook', answer, 'k1');
end;
$$;

create temporary table cases on commit drop as
select pg_temp.hold('+6281300007001') as paid, pg_temp.hold('+6281300007002') as unpaid;
select pg_temp.pay((select paid from cases));
create temporary table files on commit drop as
select b.id, 'bookings/' || b.id || '/ticket-' || b.booking_code || '.pdf' as path
from public.bookings b where b.id in (select paid from cases union select unpaid from cases);

select throws_ok(
  format($$select internal.record_ticket_pdf(%L, %L, %L, null)$$, (select paid from cases), (select path from files where id = (select paid from cases)) || '.x', repeat('a', 64)),
  '22023', null, 'a ticket file is named after its own booking code');
select throws_ok(
  format($$select internal.record_ticket_pdf(%L, %L, %L, null)$$, (select paid from cases), (select path from files where id = (select paid from cases)), 'not-a-fingerprint'),
  '22023', null, 'and kept with the fingerprint of its tickets');
select lives_ok(
  format($$select internal.record_ticket_pdf(%L, %L, %L, null)$$, (select paid from cases), (select path from files where id = (select paid from cases)), repeat('a', 64)),
  'a paid booking records its ticket file');
select is((select (b.ticket_pdf_path = (select path from files where id = (select paid from cases)), b.ticket_pdf_fingerprint = repeat('a', 64))::text
           from public.bookings b where b.id = (select paid from cases)),
  '(t,t)', 'under bookings.ticket_pdf_path, with its fingerprint');
select lives_ok(
  format($$select internal.record_ticket_pdf(%L, %L, %L, null)$$, (select paid from cases), (select path from files where id = (select paid from cases)), repeat('b', 64)),
  'a fresh file of changed tickets replaces it');
select is((select b.ticket_pdf_fingerprint from public.bookings b where b.id = (select paid from cases)), repeat('b', 64),
  'and records their fingerprint');
select throws_ok(
  format($$select internal.record_ticket_pdf(%L, %L, %L, null)$$, (select unpaid from cases),
         (select path from files where id = (select unpaid from cases)), repeat('a', 64)),
  'P0002', null, 'a booking without tickets has no ticket file');
select ok(not has_function_privilege('authenticated', 'public.svc_record_ticket_pdf(uuid, text, text, uuid)', 'execute')
          and has_function_privilege('service_role', 'public.svc_record_ticket_pdf(uuid, text, text, uuid)', 'execute'),
  'only the server records a ticket file');

select * from finish();
rollback;
