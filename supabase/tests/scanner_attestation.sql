-- Independent review of PR #54, M1 (CLAUDE.md §7.4; docs/Security.md §9.2): scan_ticket is the gate's one entry point
-- and scans a ticket only under the route's attestation, HMAC-SHA256(K, officer | ticket | attempt | mode | source |
-- expires_at) with K = HMAC-SHA256(CRON_SECRET, 'gsk-scanner-attest-v1') from Vault. A call around the route without
-- one, with a wrong one, an expired one, one of another officer or one made for the preview is scanned as a QR whose
-- signature failed: refused, recorded, counted toward the slow-down and a security event. validate_ticket,
-- check_in_ticket and the turn are no longer anyone's to call. A refused turn answers before anything is read.
begin;
select plan(19);
\ir helpers/rls_personas.psql
select set_config('app.qr_key_id', 'k1', true);

-- The key this suite attests with: the local seed's cron_secret, or one of its own inside this transaction.
select vault.create_secret('pgtap-cron-secret', 'cron_secret')
where not exists (select 1 from vault.secrets where name = 'cron_secret');

-- ===== Fixtures: a paid booking of RW 05 whose gate opens now =====
insert into public.tour_packages (id, rw_id, category, slug, name, pricing_basis, price_per_pax, status) values
  ('00000000-0000-4000-8000-0000000a1001', 5, 'regular', 'uji-atestasi-05', 'Paket Uji Atestasi', 'per_pax', 25000,
   'published');
insert into public.visit_sessions (id, rw_id, session_date, start_time, end_time, label, capacity) values
  ('00000000-0000-4000-8000-0000000a2051', 5, public.today_jkt() + 11, '07:41', '08:41', 'Uji atestasi 05', 200);

create function pg_temp.paid(p_pax integer, p_phone text) returns uuid
  language plpgsql
as $$
declare
  otp_id uuid;
  held uuid;
  attempt jsonb;
  answer jsonb;
begin
  insert into public.guest_otps (purpose, phone, code_hash, browser_hash, expires_at, verified_at, created_at)
  values ('booking_phone', p_phone, repeat('a', 64), repeat('b', 64), now() + interval '5 minutes',
          now() - interval '1 minute', now() - interval '2 minutes')
  returning id into otp_id;
  held := (internal.create_booking('00000000-0000-4000-8000-0000000a1001',
    array['00000000-0000-4000-8000-0000000a2051']::uuid[], p_pax,
    jsonb_build_object('booker_type', 'school', 'institution_name', 'SD Negeri Atestasi', 'pic_name', 'Ani Atestasi',
                       'pic_phone', p_phone, 'pic_email', 'atestasi' || right(p_phone, 4) || '@contoh.test',
                       'notes', null),
    '[]', '[]', 'pay', 'web', null, otp_id, '{"version": "2026-10-18"}', null, '{"ip": null, "user_agent": "pgTAP"}',
    internal.booking_quote_hash(internal.booking_quote('00000000-0000-4000-8000-0000000a1001', p_pax, '[]',
                                                       array[5]::smallint[]))) ->> 'booking_id')::uuid;
  attempt := internal.create_payment_attempt(held, null, null);
  perform internal.attach_snap_token((attempt ->> 'payment_id')::uuid, 'token-' || (attempt ->> 'order_id'),
    'https://app.sandbox.midtrans.com/snap/v4/redirection/' || (attempt ->> 'order_id'));
  answer := jsonb_build_object('order_id', attempt ->> 'order_id', 'status_code', '200',
    'gross_amount', (select b.total_amount from public.bookings b where b.id = held) || '.00',
    'signature_key', repeat('a', 128), 'transaction_status', 'settlement',
    'transaction_id', 'txn-' || (attempt ->> 'order_id'), 'payment_type', 'qris', 'currency', 'IDR',
    'fraud_status', 'accept', 'settlement_time', to_char(now() at time zone 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI:SS'));
  perform internal.apply_payment_event((internal.record_payment_event('webhook',
    encode(sha256(convert_to(answer::text, 'UTF8')), 'hex'), answer) ->> 'event_id')::bigint, 'webhook', answer, 'k1');
  update public.tickets_qr
  set valid_on = public.today_jkt(), valid_from = now() - interval '1 hour', valid_until = now() + interval '1 hour'
  where booking_id = held;
  return held;
end;
$$;

create temporary table fixture on commit drop as select pg_temp.paid(5, '+6281300006001') as booking_id;
alter table fixture add column ticket_id uuid;
update fixture set ticket_id = (select t.id from public.tickets_qr t where t.booking_id = fixture.booking_id);
grant select on fixture to authenticated;

-- An attestation as the route makes it, made here as postgres; and a minute from now.
create function pg_temp.soon() returns bigint
  language sql stable
as $$ select floor(extract(epoch from now()))::bigint + 60; $$;
create function pg_temp.attest(p_persona text, p_attempt uuid, p_mode text, p_expires_at bigint default null)
  returns text
  language sql stable security definer
as $$
  select internal.scanner_attestation(pg_temp.persona_id(p_persona), (select ticket_id from fixture), p_attempt,
                                      p_mode, 'qr', coalesce(p_expires_at, pg_temp.soon()));
$$;
grant execute on function pg_temp.soon(), pg_temp.attest(text, uuid, text, bigint) to authenticated;

-- One scan of the fixture's ticket by the current officer.
create function pg_temp.scan(p_mode text, p_attempt uuid, p_attestation text, p_expires_at bigint default null)
  returns jsonb
  language sql
as $$
  select public.scan_ticket(p_mode, p_attempt, 'qr', 'GSK.k1.atestasi', '{}', (select ticket_id from fixture),
                            case when p_mode = 'commit' then 5 end, null, p_attestation,
                            coalesce(p_expires_at, pg_temp.soon()));
$$;
grant execute on function pg_temp.scan(text, uuid, text, bigint) to authenticated;

-- ===== Nobody calls the gate's own functions =====
select ok(not has_function_privilege('authenticated', 'public.validate_ticket(uuid, uuid, text, jsonb, text)',
                                     'execute')
          and not has_function_privilege('authenticated',
                'public.check_in_ticket(uuid, uuid, integer, text, jsonb, boolean, text, text, text)', 'execute')
          and not has_function_privilege('authenticated', 'internal.claim_scanner_turn()', 'execute'),
  'validate_ticket, check_in_ticket and the turn are scan_ticket''s alone');
select ok(has_function_privilege('authenticated',
            'public.scan_ticket(text, uuid, text, text, jsonb, uuid, integer, text, text, bigint)', 'execute'),
  'scan_ticket is the gate''s one entry point');

-- ===== The route's attestation =====
select pg_temp.act_as('admin_rw_05');
select is(pg_temp.scan('preview', '00000000-0000-4000-8000-0000000ae001',
                       pg_temp.attest('admin_rw_05', '00000000-0000-4000-8000-0000000ae001', 'preview')) ->> 'result',
  'ok', 'an attested preview shows the group');
select is(pg_temp.scan('preview', '00000000-0000-4000-8000-0000000ae002', null),
  '{"result": "invalid_signature", "ticket": null, "used_at": null, "used_by": null, "checked_in_pax": null, "unpaid_pax": null}',
  'a ticket named without an attestation reads invalid_signature and shows nothing');
select is(pg_temp.scan('preview', '00000000-0000-4000-8000-0000000ae003', repeat('0', 64)) ->> 'result',
  'invalid_signature', 'so does a wrong attestation');
select is(pg_temp.scan('preview', '00000000-0000-4000-8000-0000000ae004',
                       pg_temp.attest('admin_rw_05', '00000000-0000-4000-8000-0000000ae004', 'preview',
                                      pg_temp.soon() - 61), pg_temp.soon() - 61) ->> 'result',
  'invalid_signature', 'an expired one');
select is(pg_temp.scan('preview', '00000000-0000-4000-8000-0000000ae005',
                       pg_temp.attest('admin_rw_05', '00000000-0000-4000-8000-0000000ae005', 'preview',
                                      pg_temp.soon() + 3600), pg_temp.soon() + 3600) ->> 'result',
  'invalid_signature', 'one that claims to live an hour');
select is(pg_temp.scan('preview', '00000000-0000-4000-8000-0000000ae006',
                       pg_temp.attest('admin_rw_13', '00000000-0000-4000-8000-0000000ae006', 'preview')) ->> 'result',
  'invalid_signature', 'and one made for another officer');
select is(pg_temp.scan('commit', '00000000-0000-4000-8000-0000000ae009',
                       pg_temp.attest('admin_rw_05', '00000000-0000-4000-8000-0000000ae009', 'preview')) ->> 'result',
  'invalid_signature', 'a preview''s attestation does not commit');
reset role;
select is((select t.status::text from public.tickets_qr t where t.id = (select ticket_id from fixture)), 'issued',
  'so nothing was checked in around the route');
select is((select array_agg(e.details ->> 'reason' order by e.id) from public.security_events e
           where e.event_type = 'scanner_invalid_signature' and e.actor_id = pg_temp.persona_id('admin_rw_05')),
  array['attestation_missing', 'attestation_mismatch', 'attestation_expired', 'attestation_expired',
        'attestation_mismatch', 'attestation_mismatch'],
  'each refusal is a security event with its reason');
select is((select (count(*), count(distinct s.raw_payload))::text from public.ticket_scans s
           where s.scanned_by = pg_temp.persona_id('admin_rw_05') and s.result = 'invalid_signature'
             and s.source = 'qr'),
  '(6,6)', 'and a distinct bad QR payload, which the slow-down counts');

select pg_temp.act_as('admin_rw_05');
select is(pg_temp.scan('commit', '00000000-0000-4000-8000-0000000ae001',
                       pg_temp.attest('admin_rw_05', '00000000-0000-4000-8000-0000000ae001', 'commit'))
          - 'ticket' - 'used_at' - 'used_by',
  '{"result": "ok", "checked_in_pax": 5, "unpaid_pax": 0}', 'an attested commit lets the group in');
select throws_ok($$select public.scan_ticket('peek', gen_random_uuid(), 'qr', 'GSK.k1.x')$$, '22023', null,
  'a scan is a preview or a commit');
reset role;

-- ===== Without a key nothing verifies =====
delete from vault.secrets where name = 'cron_secret';
select pg_temp.act_as('admin_rw_05');
select is(public.scan_ticket('preview', '00000000-0000-4000-8000-0000000ae007', 'qr', 'GSK.k1.atestasi', '{}',
                             (select ticket_id from fixture), null, null, repeat('0', 64), pg_temp.soon())
          ->> 'result',
  'invalid_signature', 'a database without cron_secret in Vault refuses every attestation');
reset role;
select is((select e.details ->> 'reason' from public.security_events e
           where e.event_type = 'scanner_invalid_signature' order by e.id desc limit 1),
  'attestation_no_key', 'and says why');

-- ===== The turn comes first =====
select count(*) from generate_series(1, 120)
where internal.rate_limit_hit('scanner:user:' || pg_temp.persona_id('admin_rw_13'), 120, 60);
select pg_temp.act_as('admin_rw_13');
select ok((select (t ->> 'slowed')::boolean and (t ->> 'retry_after_seconds')::int between 1 and 60
           from (select public.scan_ticket('preview', '00000000-0000-4000-8000-0000000ae008', 'qr', 'GSK.k1.x')
                 as t) as turn),
  'past 120 requests a minute scan_ticket answers the wait');
reset role;
select is((select count(*)::int from public.ticket_scans s
           where s.attempt_id = '00000000-0000-4000-8000-0000000ae008'),
  0, 'and records nothing');
select pg_temp.act_as('none');
select throws_ok($$select public.scan_ticket('preview', gen_random_uuid(), 'qr', 'GSK.k1.x')$$, '42501', null,
  'an account without a role scans nothing');
reset role;

select * from finish();
rollback;
