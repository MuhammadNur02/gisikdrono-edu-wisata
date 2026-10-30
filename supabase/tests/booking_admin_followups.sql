-- Task P4.3.02 follow-ups (20261103130100_revoke_ticket.sql, 20261103130200_addon_notes_rpc.sql,
-- 20261103130300_addon_fulfillment_guard.sql):
-- * revoke_ticket: the superadmin at AAL2 revokes an issued ticket with a reason; the booking keeps its status, the
--   step is in booking_events, booking_cancelled goes out only once every ticket is revoked.
-- * rpc_get_addon_notes: the notes of the caller's own RW's lines, inside the booking window, audited.
-- * the fulfilment guard: no API session sets `cancelled` or takes a line out of it.
begin;
select plan(33);
\ir helpers/addons_on.psql
\ir helpers/rls_personas.psql
select set_config('app.qr_key_id', 'k1', true);

-- ===== Fixtures: a combo of RW 05 and RW 13, one add-on of each RW =====
insert into public.umkm_vendors (id, rw_id, slug, name) values
  ('00000000-0000-4000-8000-0000000f5051', 5, 'uji-catatan-vendor-05', 'Vendor Catatan 05'),
  ('00000000-0000-4000-8000-0000000f5131', 13, 'uji-catatan-vendor-13', 'Vendor Catatan 13');
insert into public.products_umkm (id, rw_id, vendor_id, slug, name, category, price, unit_label, is_addon_eligible,
  status) values
  ('00000000-0000-4000-8000-0000000f5a05', 5, '00000000-0000-4000-8000-0000000f5051', 'uji-catatan-kompos',
   'Kompos Catatan', 'compost', 15000, 'kantong', true, 'published'),
  ('00000000-0000-4000-8000-0000000f5a13', 13, '00000000-0000-4000-8000-0000000f5131', 'uji-catatan-batik',
   'Batik Catatan', 'souvenir', 25000, 'lembar', true, 'published');
insert into public.tour_packages (id, category, slug, name, pricing_basis, price_per_pax, status) values
  ('00000000-0000-4000-8000-0000000f5002', 'combo', 'uji-catatan-kombo', 'Kombo Catatan', 'per_pax', 30000, 'draft');
insert into public.tour_package_legs (package_id, rw_id, leg_order) values
  ('00000000-0000-4000-8000-0000000f5002', 5, 1), ('00000000-0000-4000-8000-0000000f5002', 13, 2);
update public.tour_packages set status = 'published' where id = '00000000-0000-4000-8000-0000000f5002';
insert into public.visit_sessions (id, rw_id, session_date, start_time, end_time, label, capacity) values
  ('00000000-0000-4000-8000-0000000f5205', 5, public.today_jkt() + 13, '10:19', '11:19', 'Uji catatan 05', 200),
  ('00000000-0000-4000-8000-0000000f5213', 13, public.today_jkt() + 13, '10:19', '11:19', 'Uji catatan 13', 200);

create function pg_temp.otp(p_phone text) returns uuid
  language sql
as $$
  insert into public.guest_otps (purpose, phone, code_hash, browser_hash, expires_at, verified_at, created_at)
  values ('booking_phone', p_phone, repeat('a', 64), repeat('b', 64), now() + interval '5 minutes',
          now() - interval '1 minute', now() - interval '2 minutes')
  returning id;
$$;

-- A combo held for payment, with these add-ons.
create function pg_temp.held(p_phone text, p_addons jsonb) returns uuid
  language plpgsql
as $$
declare
  package_id constant uuid := '00000000-0000-4000-8000-0000000f5002';
  rws constant smallint[] := array[5, 13];
begin
  return (internal.create_booking(package_id,
    array['00000000-0000-4000-8000-0000000f5205', '00000000-0000-4000-8000-0000000f5213']::uuid[], 4,
    jsonb_build_object('booker_type', 'school', 'institution_name', 'SD Negeri Catatan', 'pic_name', 'Ani Catatan',
                       'pic_phone', p_phone, 'pic_email', 'catatan' || right(p_phone, 4) || '@contoh.test',
                       'notes', null),
    p_addons, '[]', 'pay', 'web', null, pg_temp.otp(p_phone), '{"version": "2026-10-18"}', null,
    '{"ip": null, "user_agent": "pgTAP"}',
    internal.booking_quote_hash(internal.booking_quote(package_id, 4, p_addons, rws))) ->> 'booking_id')::uuid;
end;
$$;

-- The same, paid by a confirmed settlement, so it carries a ticket per leg.
create function pg_temp.paid(p_phone text) returns uuid
  language plpgsql
as $$
declare
  held uuid := pg_temp.held(p_phone, '[]');
  attempt jsonb;
  answer jsonb;
begin
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
  return held;
end;
$$;

create temporary table cases on commit drop as select
  pg_temp.held('+6281300005001', '[{"product_id": "00000000-0000-4000-8000-0000000f5a05", "qty": 1,
                                    "notes": "Tolong dibungkus kertas"},
                                   {"product_id": "00000000-0000-4000-8000-0000000f5a13", "qty": 1,
                                    "notes": "Ukuran anak"}]') as with_notes,
  pg_temp.paid('+6281300005002') as paid_combo;
grant select on cases to authenticated;

create function pg_temp.line(p_rw smallint) returns uuid
  language sql stable security definer
as $$ select a.id from public.booking_addons a where a.booking_id = (select with_notes from cases) and a.rw_id = p_rw; $$;
create function pg_temp.ticket(p_rw smallint) returns uuid
  language sql stable security definer
as $$ select t.id from public.tickets_qr t where t.booking_id = (select paid_combo from cases) and t.rw_id = p_rw; $$;
grant execute on function pg_temp.line(smallint), pg_temp.ticket(smallint) to authenticated;

-- The hint of the error a statement raises, or null when it raises none.
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
grant execute on function pg_temp.hint_of(text) to authenticated;

-- ===== rpc_get_addon_notes =====
select pg_temp.act_as('admin_rw_05');
select is((select array_agg(n.notes) from public.rpc_get_addon_notes((select with_notes from cases)) n),
  array['Tolong dibungkus kertas'], 'an RW 05 officer reads the note of their own RW''s line only');
reset role;
select pg_temp.act_as('admin_rw_13');
select is((select array_agg(n.notes) from public.rpc_get_addon_notes((select with_notes from cases)) n),
  array['Ukuran anak'], 'and the RW 13 officer the note of theirs');
reset role;
select pg_temp.act_as('superadmin_aal2');
select is((select count(*)::int from public.rpc_get_addon_notes((select with_notes from cases))), 2,
  'the superadmin reads every note');
reset role;
select is((select count(*)::int from public.audit_logs a
           where a.action = 'addon_notes.read' and a.entity_id = (select with_notes from cases)::text), 3,
  'every read is audited');
select pg_temp.act_as('admin_rw_08');
select throws_ok($$select * from public.rpc_get_addon_notes((select with_notes from cases))$$, '42501', null,
  'an officer of an RW the booking does not visit reads nothing');
reset role;
select pg_temp.act_as('superadmin_aal1');
select throws_ok($$select * from public.rpc_get_addon_notes((select with_notes from cases))$$, '42501', null,
  'nor does a session without its authenticator');
reset role;
update public.bookings set visit_date = public.today_jkt() - 9, visit_date_end = public.today_jkt() - 9
where id = (select with_notes from cases);
select pg_temp.act_as('admin_rw_05');
select throws_ok($$select * from public.rpc_get_addon_notes((select with_notes from cases))$$, '42501', null,
  'and nobody reads a note more than seven days after the visit');
select is(pg_temp.hint_of('select * from public.rpc_get_addon_notes(' || quote_literal((select with_notes from cases)) || ')'),
  'OUTSIDE_WINDOW', 'a refusal the window makes says so in its hint (F-76-7)');
reset role;
update public.bookings set visit_date = public.today_jkt() + 13, visit_date_end = public.today_jkt() + 13
where id = (select with_notes from cases);
select ok(not has_function_privilege('anon', 'public.rpc_get_addon_notes(uuid)', 'execute'),
  'anon may not call it');

-- ===== The fulfilment guard =====
select pg_temp.act_as('admin_rw_05');
select is(pg_temp.row_count(format($$update public.booking_addons set fulfillment_status = 'prepared' where id = %L$$,
  pg_temp.line(5::smallint))), 1, 'the kitchen marks its own line prepared');
select throws_ok(format($$update public.booking_addons set fulfillment_status = 'cancelled' where id = %L$$,
  pg_temp.line(5::smallint)), 'P0001', null, 'but cannot cancel it');
reset role;
update public.booking_addons set fulfillment_status = 'cancelled' where id = pg_temp.line(13::smallint);
select pg_temp.act_as('admin_rw_13');
select throws_ok(format($$update public.booking_addons set fulfillment_status = 'pending' where id = %L$$,
  pg_temp.line(13::smallint)), 'P0001', null, 'nor bring a cancelled line back');
reset role;
select is((select a.fulfillment_status::text from public.booking_addons a where a.id = pg_temp.line(13::smallint)),
  'cancelled', 'which stays cancelled');
select pg_temp.act_as('admin_rw_13');
select set_config('app.in_rpc', '1', true);
select is(pg_temp.row_count(format($$update public.booking_addons set fulfillment_status = 'pending' where id = %L$$,
  pg_temp.line(13::smallint))), 1, 'a function writing under app.in_rpc may bring it back, as an adjustment will');
select set_config('app.in_rpc', '', true);
reset role;

-- ===== booking_events.payload =====
select pg_temp.act_as('admin_rw_05');
select throws_ok($$select e.payload from public.booking_events e limit 1$$, '42501', null,
  'no staff session reads a booking event''s payload, which may carry another RW''s money');
select lives_ok($$select e.reason, e.to_status from public.booking_events e limit 1$$,
  'while the timeline''s own columns stay readable');
reset role;

-- ===== revoke_ticket =====
select pg_temp.act_as('admin_rw_05');
select throws_ok(format($$select public.revoke_ticket(%L, 'Salah cetak')$$, pg_temp.ticket(5::smallint)), '42501',
  null, 'an RW officer cannot revoke a ticket');
reset role;
select pg_temp.act_as('superadmin_aal1');
select throws_ok(format($$select public.revoke_ticket(%L, 'Salah cetak')$$, pg_temp.ticket(5::smallint)), '42501',
  null, 'nor a superadmin without the authenticator');
reset role;
select pg_temp.act_as('superadmin_stale_totp');
select throws_ok(format($$select public.revoke_ticket(%L, 'Salah cetak')$$, pg_temp.ticket(5::smallint)), '42501',
  null, 'nor one whose authenticator code is older than five minutes (F-76-2)');
select throws_ok($$select public.revoke_certificate('00000000-0000-4000-8000-0000000f5998', 'Salah cetak')$$, '42501',
  null, 'and the same holds for revoking a certificate');
select throws_ok($$select public.undo_check_in('00000000-0000-4000-8000-0000000f5998', 'Salah cetak')$$, '42501',
  null, 'and for undoing a check-in');
reset role;
select pg_temp.act_as('superadmin_aal2');
select throws_ok(format($$select public.revoke_ticket(%L, 'ab')$$, pg_temp.ticket(5::smallint)), '22023', null,
  'a revocation needs a reason of three characters at least');
select throws_ok(format($$select public.revoke_ticket(%L, %L)$$, pg_temp.ticket(5::smallint), repeat('x', 301)),
  '22023', null, 'and of 300 at most');
select throws_ok($$select public.revoke_ticket('00000000-0000-4000-8000-0000000f5999', 'Salah cetak')$$, 'P0002',
  null, 'an unknown ticket is not found');
select lives_ok(format($$select public.revoke_ticket(%L, 'Salah cetak')$$, pg_temp.ticket(5::smallint)),
  'the superadmin revokes the RW 05 ticket');
reset role;
select is((select (t.status::text, t.revoke_reason, t.revoked_by = pg_temp.persona_id('superadmin_aal2'))::text
           from public.tickets_qr t where t.id = pg_temp.ticket(5::smallint)),
  ('revoked', 'Salah cetak', true)::text, 'which is revoked with its reason, under their name');
select is((select count(*)::int from public.audit_logs a
           where a.entity_type = 'tickets_qr' and a.entity_id = pg_temp.ticket(5::smallint)::text
             and a.action = 'tickets_qr.update' and a.actor_id = pg_temp.persona_id('superadmin_aal2')), 1,
  'and the ticket''s audit row names them');
select is((select b.status::text from public.bookings b where b.id = (select paid_combo from cases)), 'paid',
  'the booking keeps its status');
select is((select (e.from_status, e.to_status, e.payload ->> 'step')::text from public.booking_events e
           where e.booking_id = (select paid_combo from cases) and e.payload ->> 'step' = 'ticket_revoked'),
  ('paid', 'paid', 'ticket_revoked')::text, 'and booking_events keeps the step');
select is((select count(*)::int from public.notifications n
           where n.booking_id = (select paid_combo from cases) and n.template = 'booking_cancelled'), 0,
  'while the RW 13 ticket stands, nobody is told the booking is off');
select pg_temp.act_as('superadmin_aal2');
select throws_ok(format($$select public.revoke_ticket(%L, 'Salah cetak')$$, pg_temp.ticket(5::smallint)), 'P0001',
  null, 'a ticket is revoked once');
reset role;
select set_config('app.in_rpc', '1', true);
update public.tickets_qr set status = 'suspended', suspended_at = now(), suspend_reason = 'Uji'
where id = pg_temp.ticket(13::smallint);
select set_config('app.in_rpc', '', true);
select pg_temp.act_as('superadmin_aal2');
select lives_ok(format($$select public.revoke_ticket(%L, 'Rombongan batal')$$, pg_temp.ticket(13::smallint)),
  'the superadmin revokes the RW 13 ticket too, suspended as it was');
reset role;
select is((select count(*)::int from public.notifications n
           where n.booking_id = (select paid_combo from cases) and n.template = 'booking_cancelled'), 2,
  'and once every ticket is revoked, booking_cancelled goes out on both channels');

select * from finish();
rollback;
